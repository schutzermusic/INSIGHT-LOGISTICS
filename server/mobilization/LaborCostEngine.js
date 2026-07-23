/**
 * LaborCostEngine (§15) — deterministic, explainable, minute-accurate.
 *
 * Classifies every counted minute of a mobilization timeline into labor bands
 * (regular / OT50 / OT100 / Sunday-holiday) with an overlapping night premium,
 * and prices it in integer centavos. NO generative AI, NO floating-point money
 * (§32). Fully reproducible from the emitted LaborCostBlock[] (§30).
 *
 * Approach: minute-level classification (§15 permits this) with adjacent minutes
 * merged into event-boundary blocks. A trip is at most ~48h (2880 minutes), so
 * the walk is trivially fast.
 *
 * Key domain rules honored:
 * - The daily 8h counter is NOT reset when travel starts; it continues from the
 *   hours already worked that day (§7). It accumulates across a CONTINUOUS
 *   journey (even across midnight), which is what makes multi-day bus trips
 *   correctly rack up overtime. It resets only after a real inter-journey rest
 *   (a gap >= policy.interJourneyRestMinutes, default 11h — CLT rest). This is
 *   what the §7 worked-example (2 regular + 2×50% + 3×100%) requires.
 * - Only minutes whose segment counts as labor (per the TravelTimePolicy, §8)
 *   advance the daily counter — meal/hotel time neither pays nor consumes the
 *   regular-hours band, and a long rest additionally resets it.
 * - Night premium (22:00–05:00) overlaps the base band and is never a separate
 *   duplicated bucket (§5). Stacking is multiplicative or additive per policy.
 * - Saturday/Sunday/holiday and midnight boundaries are handled via local time
 *   (§14); the segment's local timezone drives classification.
 *
 * @module server/mobilization/LaborCostEngine
 */

import { mulC } from '../../src/domain/money.js';
import { RULE_TO_TRAVEL_FLAG } from './laborPolicyDefaults.js';

const MS_PER_MINUTE = 60000;
const WEEKDAY_SHORT = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * @typedef {Object} LaborInput
 * @property {import('../../src/domain/types.js').ItinerarySegment[]} segments
 * @property {number} hourlyRateC — base (regular) hourly rate in centavos
 * @property {import('../../src/domain/types.js').LaborPolicyVersion} policy
 * @property {import('../../src/domain/types.js').TravelTimePolicy} travelTimePolicy
 * @property {number} [priorWorkedMinutes] — minutes already worked on the departure day (§7)
 * @property {string[]} [holidays] — 'YYYY-MM-DD' local dates treated as holidays
 */

/**
 * Local wall-clock parts of a UTC instant in a given IANA timezone.
 * @param {number} utcMs
 * @param {string} timeZone
 */
function localParts(utcMs, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  // 'en-CA' renders hour 24 as '24' at midnight in some engines; normalize.
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: Number(parts.minute),
    weekday: WEEKDAY_SHORT[parts.weekday],
  };
}

/** True when the local time falls in the night window (default 22:00–05:00). */
function isNight(hour, minute, policy) {
  const [ns] = policy.nightStartLocalTime.split(':').map(Number);
  const [ne] = policy.nightEndLocalTime.split(':').map(Number);
  // Window wraps midnight: hour >= start OR hour < end.
  if (ns <= ne) return hour >= ns && hour < ne; // non-wrapping (defensive)
  return hour >= ns || hour < ne;
}

/**
 * Classify a single counted minute given the running daily counter (minutes
 * already counted that local day, BEFORE this minute).
 * @returns {{ baseClassification: string, baseMult: number, holiday: boolean }}
 */
function classifyBase(dayType, counterBefore, policy) {
  if (dayType === 'sunday' || dayType === 'holiday') {
    return {
      baseClassification: 'overtime_150',
      baseMult: policy.sundayMultiplier,
      holiday: dayType === 'holiday',
    };
  }
  if (dayType === 'saturday') {
    if (counterBefore < policy.saturdayRegularMinutes) {
      return { baseClassification: 'regular', baseMult: 1.0, holiday: false };
    }
    return { baseClassification: 'overtime_100', baseMult: policy.saturdayExcessMultiplier, holiday: false };
  }
  // weekday
  if (counterBefore < policy.regularDailyMinutes) {
    return { baseClassification: 'regular', baseMult: 1.0, holiday: false };
  }
  if (counterBefore < policy.regularDailyMinutes + policy.weekdayFirstOvertimeMinutes) {
    return { baseClassification: 'overtime_50', baseMult: policy.weekdayFirstOvertimeMultiplier, holiday: false };
  }
  return { baseClassification: 'overtime_100', baseMult: policy.weekdayExcessMultiplier, holiday: false };
}

/** Effective multiplier combining base band with an overlapping night premium (§5). */
function effectiveMultiplier(baseMult, nightApplied, policy) {
  if (!nightApplied) return baseMult;
  if (policy.premiumStackingMode === 'multiplicative') {
    return baseMult * policy.nightMultiplier;
  }
  // additive: base*(1 + otPremium + nightPremium) = baseMult + (nightMult - 1)
  return baseMult + (policy.nightMultiplier - 1);
}

function dayTypeFor(weekday, dateKey, holidaySet) {
  if (holidaySet.has(dateKey)) return 'holiday';
  if (weekday === 0) return 'sunday';
  if (weekday === 6) return 'saturday';
  return 'weekday';
}

/**
 * Classify a full mobilization timeline into priced labor blocks.
 * @param {LaborInput} input
 * @returns {{ blocks: import('../../src/domain/types.js').LaborCostBlock[], totalCostC: number, totalCountedMinutes: number }}
 */
export function classifyLabor(input) {
  const {
    segments = [],
    hourlyRateC,
    policy,
    travelTimePolicy,
    priorWorkedMinutes = 0,
    holidays = [],
  } = input;

  if (!Number.isInteger(hourlyRateC) || hourlyRateC <= 0) {
    throw new Error('classifyLabor: hourlyRateC must be a positive integer (centavos).');
  }
  if (!policy || !travelTimePolicy) {
    throw new Error('classifyLabor: policy and travelTimePolicy are required (§5/§8).');
  }

  const holidaySet = new Set(holidays);
  const restThresholdMs = (policy.interJourneyRestMinutes ?? 660) * MS_PER_MINUTE;

  const orderedSegments = [...segments].sort(
    (a, b) => Date.parse(a.departureAtUtc) - Date.parse(b.departureAtUtc)
  );

  /** @type {Array<{descriptor: object, startMs: number}>} */
  const minuteRecords = [];

  // Continuous journey counter (§7): seeded with the hours already worked today,
  // accumulates across counted minutes, and resets only after a long rest gap.
  let counter = priorWorkedMinutes;
  let lastCountedEndMs = null;

  for (const seg of orderedSegments) {
    const flag = RULE_TO_TRAVEL_FLAG[seg.laborCountingRuleId];
    const counts = flag ? travelTimePolicy[flag] === true : false;
    if (!counts) continue; // non-paid time: neither costs nor advances the counter (§8)

    const tz = seg.originTimezone || seg.destinationTimezone || 'UTC';
    const startMs = Date.parse(seg.departureAtUtc);
    const endMs = Date.parse(seg.arrivalAtUtc);
    const totalMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);

    // A real inter-journey rest (e.g. overnight hotel) resets the daily counter.
    if (lastCountedEndMs !== null && startMs - lastCountedEndMs >= restThresholdMs) {
      counter = 0;
    }

    for (let m = 0; m < totalMinutes; m++) {
      const t = startMs + m * MS_PER_MINUTE;
      const { dateKey, hour, minute, weekday } = localParts(t, tz);

      const dayType = dayTypeFor(weekday, dateKey, holidaySet);
      const { baseClassification, baseMult, holiday } = classifyBase(dayType, counter, policy);
      const nightApplied = isNight(hour, minute, policy);

      minuteRecords.push({
        startMs: t,
        descriptor: { tz, dateKey, baseClassification, baseMult, nightApplied, holiday },
      });

      counter += 1;
    }

    lastCountedEndMs = startMs + totalMinutes * MS_PER_MINUTE;
  }

  // Merge consecutive minutes sharing the same classification into blocks.
  const blocks = [];
  let cur = null;
  const sameGroup = (a, b) =>
    a.tz === b.tz &&
    a.dateKey === b.dateKey &&
    a.baseClassification === b.baseClassification &&
    a.nightApplied === b.nightApplied &&
    a.holiday === b.holiday;

  for (const rec of minuteRecords) {
    if (cur && sameGroup(cur.d, rec.descriptor) && rec.startMs === cur.endMs) {
      cur.endMs = rec.startMs + MS_PER_MINUTE;
      cur.minutes += 1;
    } else {
      if (cur) blocks.push(finalizeBlock(cur, hourlyRateC, policy));
      cur = {
        d: rec.descriptor,
        startMs: rec.startMs,
        endMs: rec.startMs + MS_PER_MINUTE,
        minutes: 1,
      };
    }
  }
  if (cur) blocks.push(finalizeBlock(cur, hourlyRateC, policy));

  const totalCostC = blocks.reduce((s, b) => s + b.calculatedCostC, 0);
  const totalCountedMinutes = blocks.reduce((s, b) => s + b.countedMinutes, 0);
  return { blocks, totalCostC, totalCountedMinutes };
}

function finalizeBlock(cur, hourlyRateC, policy) {
  const { d, startMs, endMs, minutes } = cur;
  const effMult = effectiveMultiplier(d.baseMult, d.nightApplied, policy);
  // Single rounding point: price minutes at the base hourly rate × effective mult.
  const calculatedCostC = mulC(hourlyRateC, (minutes / 60) * effMult);
  const appliedMultipliers = d.nightApplied ? [d.baseMult, policy.nightMultiplier] : [d.baseMult];

  const nightNote = d.nightApplied ? ` +noturno (${policy.premiumStackingMode})` : '';
  const explanation =
    `${minutes}min ${d.baseClassification}${nightNote} @ x${effMult.toFixed(2)} ` +
    `(${d.dateKey}, ${d.tz})`;

  return {
    startAtUtc: new Date(startMs).toISOString(),
    endAtUtc: new Date(endMs).toISOString(),
    localTimezone: d.tz,
    countedMinutes: minutes,
    baseClassification: d.baseClassification,
    nightPremiumApplied: d.nightApplied,
    holidayPremiumApplied: d.holiday,
    hourlyRateC,
    appliedMultipliers,
    calculatedCostC,
    policyVersionId: policy.id,
    explanation,
  };
}
