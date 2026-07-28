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
 * @property {boolean} [holidayCalendarAvailable] — false emits an audit warning
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
  const [startHour, startMinute = 0] = policy.nightStartLocalTime.split(':').map(Number);
  const [endHour, endMinute = 0] = policy.nightEndLocalTime.split(':').map(Number);
  const current = hour * 60 + minute;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  // Window wraps midnight: current >= start OR current < end.
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
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
    if (policy.saturdayAllHoursOvertime) {
      return {
        baseClassification: 'overtime_100',
        baseMult: policy.compensatedSaturdayMultiplier ?? 2.0,
        holiday: false,
      };
    }
    if (counterBefore < policy.saturdayRegularMinutes) {
      return { baseClassification: 'regular', baseMult: 1.0, holiday: false };
    }
    return {
      baseClassification: 'overtime_50',
      baseMult: policy.saturdayExcessMultiplier ?? policy.weekdayFirstOvertimeMultiplier,
      holiday: false,
    };
  }
  // Weekday overtime remains +50% after the contractual limit. More than two
  // overtime hours is a compliance alert, never an automatic rate change.
  if (counterBefore < policy.regularDailyMinutes) {
    return { baseClassification: 'regular', baseMult: 1.0, holiday: false };
  }
  return {
    baseClassification: 'overtime_50',
    baseMult: policy.weekdayFirstOvertimeMultiplier,
    holiday: false,
  };
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

function segmentCountsAsLabor(segment, travelTimePolicy) {
  const flag = RULE_TO_TRAVEL_FLAG[segment.laborCountingRuleId];
  return typeof segment.countsAsLabor === 'boolean'
    ? segment.countsAsLabor
    : (flag ? travelTimePolicy[flag] === true : false);
}

/**
 * Preselects one unpaid interval for every complete 8h of local operation.
 * Explicit released meal breaks offset the automatic requirement.
 */
function buildJourneyIntervalDeductions(segments, travelTimePolicy, policy) {
  if (policy.automaticJourneyIntervalEnabled === false) {
    return { excludedKeys: new Set(), deductions: [] };
  }
  const periodMinutes = policy.journeyIntervalEveryMinutes ?? 480;
  const deductionMinutes = policy.journeyIntervalDeductionMinutes ?? 60;
  const activeByDate = new Map();
  const explicitByDate = new Map();

  for (const segment of segments) {
    const startMs = Date.parse(segment.departureAtUtc);
    const endMs = Date.parse(segment.arrivalAtUtc);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const tz = segment.originTimezone || segment.destinationTimezone || 'UTC';
    const totalMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
    const explicitMeal = segment.laborCountingRuleId === 'meal_break'
      && segment.metadata?.releasedFromDuty !== false;
    const counts = segmentCountsAsLabor(segment, travelTimePolicy);
    if (!counts && !explicitMeal) continue;

    for (let minuteIndex = 0; minuteIndex < totalMinutes; minuteIndex++) {
      const startAtMs = startMs + minuteIndex * MS_PER_MINUTE;
      const local = localParts(startAtMs, tz);
      if (explicitMeal) {
        explicitByDate.set(local.dateKey, (explicitByDate.get(local.dateKey) || 0) + 1);
      } else {
        const records = activeByDate.get(local.dateKey) || [];
        records.push({
          key: `${segment.id}:${startAtMs}`,
          segmentId: segment.id,
          startAtMs,
          tz,
          minuteOfDay: local.hour * 60 + local.minute,
        });
        activeByDate.set(local.dateKey, records);
      }
    }
  }

  const excludedKeys = new Set();
  const deductions = [];
  for (const [date, records] of activeByDate) {
    const explicitMinutes = explicitByDate.get(date) || 0;
    const grossOperationalMinutes = records.length + explicitMinutes;
    const requiredIntervals = Math.floor(grossOperationalMinutes / periodMinutes);
    const missingDeductionMinutes = Math.max(
      0,
      requiredIntervals * deductionMinutes - explicitMinutes,
    );
    const chronological = [...records].sort((a, b) => a.startAtMs - b.startAtMs);
    const missingIntervals = Math.ceil(missingDeductionMinutes / deductionMinutes);

    for (let intervalIndex = 0; intervalIndex < missingIntervals; intervalIndex++) {
      const minutesToDeduct = Math.min(
        deductionMinutes,
        missingDeductionMinutes - intervalIndex * deductionMinutes,
      );
      const expectedMinuteIndex = Math.min(
        chronological.length - 1,
        (intervalIndex + 1) * periodMinutes - Math.ceil(deductionMinutes / 2),
      );
      const targetStartMs = chronological[Math.max(0, expectedMinuteIndex)]?.startAtMs || 0;
      const candidates = records
        .filter((record) => !excludedKeys.has(record.key))
        .sort((a, b) => (
          Math.abs(a.startAtMs - targetStartMs) - Math.abs(b.startAtMs - targetStartMs)
          || a.startAtMs - b.startAtMs
        ))
        .slice(0, minutesToDeduct);
      for (const candidate of candidates) excludedKeys.add(candidate.key);
      if (candidates.length) {
        deductions.push({
          localDate: date,
          intervalSequence: intervalIndex + 1,
          intervalType: 'meal_rest',
          realMinutes: candidates.length,
          source: 'system',
          reason: 'uma hora de intervalo por jornada completa de oito horas',
          startAtUtc: new Date(Math.min(...candidates.map((candidate) => candidate.startAtMs))).toISOString(),
          endAtUtc: new Date(Math.max(...candidates.map((candidate) => candidate.startAtMs)) + MS_PER_MINUTE).toISOString(),
          localTimezone: candidates[0].tz,
        });
      }
    }
  }
  return { excludedKeys, deductions };
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
    holidayCalendarAvailable = true,
  } = input;

  if (!Number.isInteger(hourlyRateC) || hourlyRateC <= 0) {
    throw new Error('classifyLabor: hourlyRateC must be a positive integer (centavos).');
  }
  if (!policy || !travelTimePolicy) {
    throw new Error('classifyLabor: policy and travelTimePolicy are required (§5/§8).');
  }

  const holidaySet = new Set(holidays);
  const restThresholdMs = (policy.interJourneyRestMinutes ?? 660) * MS_PER_MINUTE;
  const minimumIntervalMs = (policy.minimumRegisteredIntervalMinutes ?? 30) * MS_PER_MINUTE;

  const orderedSegments = [...segments].sort(
    (a, b) => Date.parse(a.departureAtUtc) - Date.parse(b.departureAtUtc)
  );
  const automaticIntervals = buildJourneyIntervalDeductions(
    orderedSegments,
    travelTimePolicy,
    policy,
  );
  const automaticIntervalDates = new Set(
    automaticIntervals.deductions.map((deduction) => deduction.localDate),
  );

  /** @type {Array<{descriptor: object, startMs: number}>} */
  const minuteRecords = [];

  // Continuous journey counter (§7): seeded with the hours already worked today,
  // accumulates across counted minutes, and resets only after an EXPLICIT,
  // qualifying uninterrupted rest segment. An empty time gap is not evidence
  // that the employee was released from duty (§4.5).
  let counter = priorWorkedMinutes;
  let pendingQualifiedRestEndMs = null;
  let journeyIndex = 0;
  let lastCountedEndMs = null;
  let lastCountedDateKey = null;
  const journeysWithInterval = new Set();
  const alerts = [];
  const alertKeys = new Set();
  const addAlert = (code, message, metadata = {}) => {
    const key = `${code}:${JSON.stringify(metadata)}`;
    if (alertKeys.has(key)) return;
    alertKeys.add(key);
    alerts.push({ code, severity: 'warning', message, metadata });
  };
  if (holidayCalendarAvailable === false) {
    addAlert(
      'holiday_calendar_unavailable',
      'Calendário de feriados indisponível; revise a classificação dos dias.',
    );
  }

  for (const seg of orderedSegments) {
    // A manual segment may carry an explicit countsAsLabor override (§8/§12 —
    // manual waiting/meal/custom rules); otherwise fall back to the versioned
    // travel-time policy lookup for its LaborCountingRuleId. Never hardcoded.
    const counts = segmentCountsAsLabor(seg, travelTimePolicy);

    const tz = seg.originTimezone || seg.destinationTimezone || 'UTC';
    const startMs = Date.parse(seg.departureAtUtc);
    const endMs = Date.parse(seg.arrivalAtUtc);
    const totalMinutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
    if (typeof seg.countsAsLabor === 'boolean') {
      addAlert(
        'manual_travel_classification',
        'Período de viagem possui classificação manual de jornada.',
        { segmentId: seg.id, countsAsLabor: seg.countsAsLabor },
      );
    }

    if (!counts) {
      const releaseMs = Date.parse(seg.metadata?.releaseAtUtc || seg.departureAtUtc);
      const restEndMs = Date.parse(seg.metadata?.restEndAtUtc || seg.arrivalAtUtc);
      const explicitRest = seg.qualifiesAsRest === true;
      if (
        explicitRest &&
        Number.isFinite(releaseMs) &&
        Number.isFinite(restEndMs) &&
        restEndMs - releaseMs >= restThresholdMs
      ) {
        pendingQualifiedRestEndMs = restEndMs;
      }
      // Only an explicit released meal/interval block satisfies the intraday
      // break requirement. Waiting, connections and idle gaps remain on duty.
      const explicitReleasedInterval = seg.laborCountingRuleId === 'meal_break'
        && seg.metadata?.releasedFromDuty !== false;
      if (
        explicitReleasedInterval &&
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        endMs - startMs >= minimumIntervalMs
      ) {
        journeysWithInterval.add(journeyIndex);
      }
      continue; // non-paid time neither costs nor advances the counter (§8)
    }

    // Only a completed qualifying rest can reset the journey. Midnight, a long
    // unmodelled gap, waiting, or a hotel arrival before effective release cannot.
    if (pendingQualifiedRestEndMs !== null && startMs >= pendingQualifiedRestEndMs) {
      counter = 0;
      pendingQualifiedRestEndMs = null;
      journeyIndex += 1;
    } else if (pendingQualifiedRestEndMs !== null) {
      // A counted activity before the explicit rest finishes interrupts it.
      pendingQualifiedRestEndMs = null;
    }

    const segmentStartLocal = localParts(startMs, tz);
    const declaredDayType = seg.metadata?.scheduledDayType;
    const actualStartDayType = dayTypeFor(
      segmentStartLocal.weekday,
      segmentStartLocal.dateKey,
      holidaySet,
    );
    if (declaredDayType && declaredDayType !== actualStartDayType) {
      addAlert(
        'schedule_day_type_mismatch',
        'Classificação do dia diverge da escala registrada.',
        {
          segmentId: seg.id,
          date: segmentStartLocal.dateKey,
          declaredDayType,
          actualDayType: actualStartDayType,
        },
      );
    }
    if (
      lastCountedEndMs !== null &&
      startMs > lastCountedEndMs &&
      segmentStartLocal.dateKey !== lastCountedDateKey &&
      startMs - lastCountedEndMs < restThresholdMs
    ) {
      addAlert(
        'insufficient_interjourney_rest',
        `Descanso interjornada inferior a ${(policy.interJourneyRestMinutes ?? 660) / 60} horas.`,
        { segmentId: seg.id, actualRestMinutes: Math.round((startMs - lastCountedEndMs) / MS_PER_MINUTE) },
      );
    }

    for (let m = 0; m < totalMinutes; m++) {
      const t = startMs + m * MS_PER_MINUTE;
      if (automaticIntervals.excludedKeys.has(`${seg.id}:${t}`)) continue;
      const { dateKey, hour, minute, weekday } = localParts(t, tz);

      const dayType = dayTypeFor(weekday, dateKey, holidaySet);
      const { baseClassification, baseMult, holiday } = classifyBase(dayType, counter, policy);
      const nightApplied = isNight(hour, minute, policy);
      const computedFactor = nightApplied && policy.reducedNightHourEnabled !== false
        ? 60 / (policy.reducedNightHourMinutes || 52.5)
        : 1;

      minuteRecords.push({
        startMs: t,
        computedMinutes: computedFactor,
        descriptor: {
          tz, dateKey, dayType, baseClassification, baseMult, nightApplied, holiday, journeyIndex,
        },
      });

      counter += computedFactor;
    }
    lastCountedEndMs = Math.max(lastCountedEndMs || 0, endMs);
    lastCountedDateKey = localParts(Math.max(startMs, endMs - MS_PER_MINUTE), tz).dateKey;
  }

  // Merge consecutive minutes sharing the same classification into blocks.
  const blocks = [];
  let cur = null;
  const sameGroup = (a, b) =>
    a.tz === b.tz &&
    a.dateKey === b.dateKey &&
    a.dayType === b.dayType &&
    a.baseClassification === b.baseClassification &&
    a.nightApplied === b.nightApplied &&
    a.holiday === b.holiday &&
    a.journeyIndex === b.journeyIndex;

  for (const rec of minuteRecords) {
    if (cur && sameGroup(cur.d, rec.descriptor) && rec.startMs === cur.endMs) {
      cur.endMs = rec.startMs + MS_PER_MINUTE;
      cur.realMinutes += 1;
      cur.computedMinutes += rec.computedMinutes;
    } else {
      if (cur) blocks.push(finalizeBlock(cur, hourlyRateC, policy));
      cur = {
        d: rec.descriptor,
        startMs: rec.startMs,
        endMs: rec.startMs + MS_PER_MINUTE,
        realMinutes: 1,
        computedMinutes: rec.computedMinutes,
      };
    }
  }
  if (cur) blocks.push(finalizeBlock(cur, hourlyRateC, policy));

  const overtimeByDate = new Map();
  const journeyDates = new Map();
  const journeyRealMinutes = new Map();
  for (const block of blocks) {
    if (block.baseClassification !== 'regular') {
      overtimeByDate.set(
        block.localDate,
        (overtimeByDate.get(block.localDate) || 0) + block.computedMinutes,
      );
    }
    const dates = journeyDates.get(block.journeyIndex) || new Set();
    dates.add(block.localDate);
    journeyDates.set(block.journeyIndex, dates);
    journeyRealMinutes.set(
      block.journeyIndex,
      (journeyRealMinutes.get(block.journeyIndex) || 0) + block.realMinutes,
    );
  }
  for (const [date, minutes] of overtimeByDate) {
    if (minutes > (policy.maxDailyOvertimeMinutes ?? 120)) {
      addAlert(
        'daily_overtime_limit_exceeded',
        'Mais de duas horas extras no dia; percentual mantido conforme a escala.',
        { date, overtimeMinutes: Math.round(minutes) },
      );
    }
  }
  for (const deduction of automaticIntervals.deductions) {
    addAlert(
      'automatic_eight_hour_interval_deduction',
      'Intervalo de 1 hora abatido automaticamente para jornada completa de 8 horas.',
      {
        date: deduction.localDate,
        intervalSequence: deduction.intervalSequence,
        deductedMinutes: deduction.realMinutes,
      },
    );
  }
  for (const [index, dates] of journeyDates) {
    if (dates.size > 1) {
      addAlert(
        'continuous_multiday_journey',
        'Jornada contínua atravessou mais de uma data sem reinício automático.',
        { journeyIndex: index, dates: [...dates] },
      );
    }
    if (
      (journeyRealMinutes.get(index) || 0) > (policy.intervalRequiredAfterMinutes ?? 360) &&
      !journeysWithInterval.has(index) &&
      ![...dates].some((date) => automaticIntervalDates.has(date))
    ) {
      addAlert(
        'missing_registered_interval',
        'Jornada prolongada sem intervalo real registrado.',
        { journeyIndex: index, realMinutes: journeyRealMinutes.get(index) },
      );
    }
  }

  const totalCostC = blocks.reduce((s, b) => s + b.calculatedCostC, 0);
  const totalCountedMinutes = blocks.reduce((s, b) => s + b.countedMinutes, 0);
  const totalRealMinutes = blocks.reduce((s, b) => s + b.realMinutes, 0);
  return {
    blocks,
    deductions: automaticIntervals.deductions,
    totalCostC,
    totalCountedMinutes,
    totalRealMinutes,
    alerts,
  };
}

function finalizeBlock(cur, hourlyRateC, policy) {
  const { d, startMs, endMs, realMinutes, computedMinutes } = cur;
  const effMult = effectiveMultiplier(d.baseMult, d.nightApplied, policy);
  const calculatedCostC = mulC(hourlyRateC, (computedMinutes / 60) * effMult);
  const appliedMultipliers = d.nightApplied ? [d.baseMult, policy.nightMultiplier] : [d.baseMult];

  const nightNote = d.nightApplied
    ? ` +noturno ${Math.round((policy.nightMultiplier - 1) * 100)}% (${policy.premiumStackingMode})`
    : '';
  const explanation =
    `${realMinutes}min reais / ${computedMinutes.toFixed(2)}min computados ` +
    `${d.baseClassification}${nightNote} @ x${effMult.toFixed(2)} ` +
    `(${d.dateKey}, ${d.tz})`;

  return {
    startAtUtc: new Date(startMs).toISOString(),
    endAtUtc: new Date(endMs).toISOString(),
    localTimezone: d.tz,
    localDate: d.dateKey,
    realMinutes,
    computedMinutes,
    countedMinutes: Math.round(computedMinutes),
    dayType: d.dayType,
    baseClassification: d.baseClassification,
    nightPremiumApplied: d.nightApplied,
    holidayPremiumApplied: d.holiday,
    hourlyRateC,
    appliedMultipliers,
    overtimePercent: Math.round((d.baseMult - 1) * 100),
    nightPremiumPercent: d.nightApplied ? Math.round((policy.nightMultiplier - 1) * 100) : 0,
    finalMultiplier: effMult,
    ruleUsed: d.dayType === 'saturday'
      ? policy.saturdayAllHoursOvertime
        ? 'sábado compensado'
        : d.baseClassification === 'regular'
          ? 'jornada de sábado normal'
          : 'hora extra em sábado normal'
      : d.dayType === 'sunday' || d.dayType === 'holiday'
        ? 'domingo/feriado de repouso'
        : d.baseClassification === 'regular'
          ? 'jornada contratual'
          : 'hora extra em dia útil',
    journeyIndex: d.journeyIndex,
    calculatedCostC,
    policyVersionId: policy.id,
    explanation,
  };
}
