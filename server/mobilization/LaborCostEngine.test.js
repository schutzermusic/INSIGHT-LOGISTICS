import { describe, it, expect } from 'vitest';
import { classifyLabor } from './LaborCostEngine.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';

// R$60,00/hour so 1h regular = 6000 centavos. Weekday=Wed 2026-01-07.
const RATE = 6000;
// Most band tests isolate percentages from the reduced-night-hour conversion.
// The default-enabled 52m30s conversion has dedicated coverage below.
const POLICY = {
  ...DEFAULT_LABOR_POLICY,
  reducedNightHourEnabled: false,
  automaticJourneyIntervalEnabled: false,
};
const TTP = DEFAULT_TRAVEL_TIME_POLICY;

/** Build a counted bus segment (bus_time counts by default). */
function seg(startUtc, endUtc, { rule = 'bus_time', tz = 'UTC' } = {}) {
  return {
    id: `${startUtc}-${endUtc}`,
    sequence: 0,
    mode: 'bus',
    originLocationId: 'A',
    destinationLocationId: 'B',
    departureAtUtc: startUtc,
    arrivalAtUtc: endUtc,
    originTimezone: tz,
    destinationTimezone: tz,
    commercialCostC: 0,
    currency: 'BRL',
    availabilityStatus: 'available',
    laborCountingRuleId: rule,
    qualifiesAsRest: rule === 'hotel_rest',
    metadata: {},
  };
}

const run = (segments, extra = {}) =>
  classifyLabor({ segments, hourlyRateC: RATE, policy: POLICY, travelTimePolicy: TTP, ...extra });

/** Sum counted minutes by base classification. */
function minutesByClass(blocks) {
  const acc = {};
  for (const b of blocks) acc[b.baseClassification] = (acc[b.baseClassification] || 0) + b.countedMinutes;
  return acc;
}

describe('LaborCostEngine — weekday bands', () => {
  it('1. eight regular weekday hours', () => {
    const { totalCostC, totalCountedMinutes, blocks } = run([seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z')]);
    expect(totalCountedMinutes).toBe(480);
    expect(minutesByClass(blocks)).toEqual({ regular: 480 });
    expect(totalCostC).toBe(48000); // 8h × 6000
  });

  it('2. ten weekday hours → 8 regular + 2 at 50%', () => {
    const { totalCostC, blocks } = run([seg('2026-01-07T08:00:00Z', '2026-01-07T18:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 480, overtime_50: 120 });
    expect(totalCostC).toBe(48000 + 18000); // 8h×1.0 + 2h×1.5
  });

  it('3. twelve weekday hours → 8 regular + 4 at 50%, with compliance alert', () => {
    const { totalCostC, blocks, alerts } = run([seg('2026-01-07T08:00:00Z', '2026-01-07T20:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 480, overtime_50: 240 });
    expect(totalCostC).toBe(48000 + 36000);
    expect(alerts.some((alert) => alert.code === 'daily_overtime_limit_exceeded')).toBe(true);
  });
});

describe('LaborCostEngine — Saturday / Sunday', () => {
  it('4. Saturday: every counted minute at +100% from the first minute (§4.2)', () => {
    const { totalCostC, blocks } = run([seg('2026-01-10T08:00:00Z', '2026-01-10T14:00:00Z')]);
    // No regular band, no 50% band — all 6h at 2.0×.
    expect(minutesByClass(blocks)).toEqual({ overtime_100: 360 });
    expect(blocks.every((b) => b.dayType === 'saturday')).toBe(true);
    expect(totalCostC).toBe(72000); // 6h × 6000 × 2.0
  });

  it('5. Saturday above eight hours → still all at 100% (no regular consumed)', () => {
    const { totalCostC, blocks } = run([seg('2026-01-10T08:00:00Z', '2026-01-10T18:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ overtime_100: 600 });
    expect(totalCostC).toBe(600 / 60 * 6000 * 2.0); // 10h × 6000 × 2.0
  });

  it('5b. Saturday all-overtime flag can be disabled by a policy version (legacy band)', () => {
    const legacy = { ...POLICY, saturdayAllHoursOvertime: false };
    const { blocks } = classifyLabor({
      segments: [seg('2026-01-10T08:00:00Z', '2026-01-10T18:00:00Z')],
      hourlyRateC: RATE, policy: legacy, travelTimePolicy: TTP,
    });
    expect(minutesByClass(blocks)).toEqual({ regular: 480, overtime_50: 120 });
  });

  it('6. Sunday hours at the 150% premium (2.5x)', () => {
    const { totalCostC, blocks } = run([seg('2026-01-11T08:00:00Z', '2026-01-11T14:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ overtime_150: 360 });
    expect(totalCostC).toBe(90000); // 6h × 6000 × 2.5
    expect(blocks.every(b => !b.nightPremiumApplied)).toBe(true);
  });
});

describe('LaborCostEngine — night premium (overlapping, §5)', () => {
  it('7. night regular hours (22:00–24:00) get +20% on top of the base band', () => {
    const { totalCostC, blocks } = run([seg('2026-01-07T22:00:00Z', '2026-01-08T00:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 120 });
    expect(blocks.every(b => b.nightPremiumApplied)).toBe(true);
    expect(totalCostC).toBe(14400); // 2h × 6000 × 1.2 (additive: 1.0 + 0.2)
  });

  it('8. overtime + night premium stacks multiplicatively (1.5 × 1.2)', () => {
    const { totalCostC, blocks } = run(
      [seg('2026-01-07T22:00:00Z', '2026-01-08T00:00:00Z')],
      { priorWorkedMinutes: 600 }
    );
    expect(minutesByClass(blocks)).toEqual({ overtime_50: 120 });
    expect(blocks.every((block) => Math.abs(block.finalMultiplier - 1.8) < 0.000001)).toBe(true);
    expect(totalCostC).toBe(21600);
  });
});

describe('LaborCostEngine — boundary crossings (§14)', () => {
  it('9. trip crossing midnight (continuous journey keeps one 8h band)', () => {
    const { totalCostC, totalCountedMinutes, blocks } = run([seg('2026-01-07T20:00:00Z', '2026-01-08T04:00:00Z')]);
    expect(totalCountedMinutes).toBe(480);
    expect(minutesByClass(blocks)).toEqual({ regular: 480 });
    // 2h day (no night) + 6h night: 12000 + 6×6000×1.2
    expect(totalCostC).toBe(12000 + 43200);
    expect(new Set(blocks.map(b => b.startAtUtc.slice(0, 10))).size).toBe(2); // spans two dates
  });

  it('10. trip crossing Friday into Saturday flips the band at midnight', () => {
    const { blocks } = run([seg('2026-01-09T20:00:00Z', '2026-01-10T02:00:00Z')]);
    const days = blocks.map(b => b.startAtUtc.slice(0, 10));
    expect(days).toContain('2026-01-09');
    expect(days).toContain('2026-01-10');
    // Friday 20:00–24:00 = 4h weekday regular; Saturday 00:00–02:00 = 2h at 100%.
    expect(minutesByClass(blocks)).toEqual({ regular: 240, overtime_100: 120 });
  });

  it('11. trip crossing Saturday into Sunday flips Saturday-100 → Sunday-150', () => {
    const { blocks } = run([seg('2026-01-10T22:00:00Z', '2026-01-11T02:00:00Z')]);
    const cls = minutesByClass(blocks);
    expect(cls.overtime_100).toBe(120);  // Saturday portion, all at 100%
    expect(cls.overtime_150).toBe(120);  // Sunday portion at 2.5×
    const sat = blocks.filter((b) => b.dayType === 'saturday');
    expect(sat.every((b) => b.nightPremiumApplied)).toBe(true); // 22:00–24:00 is night
  });

  it('12. existing worked hours before departure (§7 worked example)', () => {
    // Worked 6h, travel begins 18:00 for 7h → 2 normal + 5@50%.
    const { blocks } = run(
      [seg('2026-01-07T18:00:00Z', '2026-01-08T01:00:00Z')],
      { priorWorkedMinutes: 360 }
    );
    const cls = minutesByClass(blocks);
    expect(cls.regular).toBe(120);      // 2h
    expect(cls.overtime_50).toBe(300);
    expect(cls.overtime_100).toBeUndefined();
  });
});

describe('LaborCostEngine — travel-time policy (§8)', () => {
  it('13. meal breaks are excluded and do not advance the counter', () => {
    const segments = [
      seg('2026-01-07T08:00:00Z', '2026-01-07T12:00:00Z'),                 // 4h bus (counts)
      seg('2026-01-07T12:00:00Z', '2026-01-07T13:00:00Z', { rule: 'meal_break' }), // 1h meal (excluded)
      seg('2026-01-07T13:00:00Z', '2026-01-07T15:00:00Z'),                 // 2h bus (counts)
    ];
    const { totalCountedMinutes, blocks } = run(segments);
    expect(totalCountedMinutes).toBe(360); // meal excluded
    expect(minutesByClass(blocks)).toEqual({ regular: 360 }); // still under 8h → meal didn't consume band
    expect(blocks.some(b => b.startAtUtc.includes('T12:'))).toBe(false); // no block during the meal
  });

  it('14. waiting time is included or excluded per policy', () => {
    const waiting = [seg('2026-01-07T08:00:00Z', '2026-01-07T10:00:00Z', { rule: 'airport_waiting' })];
    const included = run(waiting);
    expect(included.totalCountedMinutes).toBe(120);

    const excluded = classifyLabor({
      segments: waiting,
      hourlyRateC: RATE,
      policy: POLICY,
      travelTimePolicy: { ...TTP, airportWaitingCounts: false },
    });
    expect(excluded.totalCountedMinutes).toBe(0);
    expect(excluded.totalCostC).toBe(0);
  });

  it('15. hotel rest is excluded AND a long rest resets the daily counter', () => {
    const segments = [
      seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z'),                 // 8h work → counter 480
      seg('2026-01-07T16:00:00Z', '2026-01-08T08:00:00Z', { rule: 'hotel_rest' }), // 16h rest (excluded, resets)
      seg('2026-01-08T08:00:00Z', '2026-01-08T10:00:00Z'),                 // 2h next day
    ];
    const { blocks } = run(segments);
    const day2 = blocks.filter(b => b.startAtUtc.startsWith('2026-01-08'));
    expect(day2.every(b => b.baseClassification === 'regular')).toBe(true); // reset → regular, not OT
  });

  it('15b. a long unmodelled gap does not reset the journey', () => {
    const segments = [
      seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z'),
      // 16h elapsed, but no explicit qualifying rest segment.
      seg('2026-01-08T08:00:00Z', '2026-01-08T10:00:00Z'),
    ];
    const { blocks } = run(segments);
    const day2 = blocks.filter((block) => block.startAtUtc.startsWith('2026-01-08'));
    expect(day2.every((block) => block.baseClassification === 'overtime_50')).toBe(true);
  });

  it('15c. hotel arrival does not start rest before effective release', () => {
    const rest = seg('2026-01-07T16:00:00Z', '2026-01-08T08:00:00Z', { rule: 'hotel_rest' });
    rest.metadata.releaseAtUtc = '2026-01-07T22:00:00Z'; // only 10h released
    const { blocks } = run([
      seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z'),
      rest,
      seg('2026-01-08T08:00:00Z', '2026-01-08T10:00:00Z'),
    ]);
    const day2 = blocks.filter((block) => block.startAtUtc.startsWith('2026-01-08'));
    expect(day2.every((block) => block.baseClassification === 'overtime_50')).toBe(true);
  });
});

describe('LaborCostEngine — timezones, versions, holidays (§14, §17, §18)', () => {
  it('16. local timezone drives night classification', () => {
    // 23:00Z–01:00Z. In UTC that is night; in America/Sao_Paulo (UTC-3) it is 20:00–22:00 (not night).
    const utc = run([seg('2026-01-07T23:00:00Z', '2026-01-08T01:00:00Z')]);
    const sp = run([seg('2026-01-07T23:00:00Z', '2026-01-08T01:00:00Z', { tz: 'America/Sao_Paulo' })]);
    expect(utc.totalCostC).toBe(14400); // 2h × 6000 × 1.2 (night)
    expect(sp.totalCostC).toBe(12000);  // 2h × 6000 × 1.0 (not night)
  });

  it('17. policy version change yields different cost and is recorded on blocks', () => {
    const s = [seg('2026-01-11T08:00:00Z', '2026-01-11T10:00:00Z')]; // Sunday, 2h
    const a = classifyLabor({ segments: s, hourlyRateC: RATE, policy: POLICY, travelTimePolicy: TTP });
    const policyB = { ...POLICY, id: 'policy-b', sundayMultiplier: 3.0, version: 2 };
    const b = classifyLabor({ segments: s, hourlyRateC: RATE, policy: policyB, travelTimePolicy: TTP });
    expect(a.totalCostC).toBe(30000); // 2h × 6000 × 2.5
    expect(b.totalCostC).toBe(36000); // 2h × 6000 × 3.0
    expect(b.blocks.every(bl => bl.policyVersionId === 'policy-b')).toBe(true);
  });

  it('18. holiday override treats a weekday as a premium day', () => {
    const { blocks, totalCostC } = run(
      [seg('2026-01-07T08:00:00Z', '2026-01-07T10:00:00Z')], // Wed
      { holidays: ['2026-01-07'] }
    );
    expect(blocks.every(b => b.baseClassification === 'overtime_150')).toBe(true);
    expect(blocks.every(b => b.holidayPremiumApplied)).toBe(true);
    expect(totalCostC).toBe(30000); // 2h × 6000 × 2.5
  });
});

describe('LaborCostEngine — rounding & stacking modes (§15, §5)', () => {
  it('19. decimal-minute durations round to whole minutes deterministically', () => {
    // 08:00:00 → 09:30:20 = 90.33 min → rounds to 90.
    const { totalCountedMinutes, totalCostC } = run([seg('2026-01-07T08:00:00Z', '2026-01-07T09:30:20Z')]);
    expect(totalCountedMinutes).toBe(90);
    expect(totalCostC).toBe(9000); // 1.5h × 6000
  });

  it('20. additive vs multiplicative night stacking', () => {
    const s = [seg('2026-01-07T22:00:00Z', '2026-01-08T00:00:00Z')]; // 2h night
    const opts = { priorWorkedMinutes: 600 }; // OT50 band
    const additive = classifyLabor({
      segments: s, hourlyRateC: RATE,
      policy: { ...POLICY, premiumStackingMode: 'additive' },
      travelTimePolicy: TTP, ...opts,
    });
    const multiplicative = classifyLabor({
      segments: s, hourlyRateC: RATE, travelTimePolicy: TTP, ...opts,
      policy: { ...POLICY, premiumStackingMode: 'multiplicative' },
    });
    expect(additive.totalCostC).toBe(20400);       // 2h × 6000 × (1.5 + 0.2)
    expect(multiplicative.totalCostC).toBe(21600); // 2h × 6000 × (1.5 × 1.2)
    expect(additive.totalCostC).toBeLessThan(multiplicative.totalCostC);
  });
});

describe('LaborCostEngine — corrected contractual rules', () => {
  it('converts the complete 22:00–05:00 window from 420 real to 480 computed minutes', () => {
    const result = classifyLabor({
      segments: [seg('2026-01-07T22:00:00Z', '2026-01-08T05:00:00Z')],
      hourlyRateC: RATE,
      policy: DEFAULT_LABOR_POLICY,
      travelTimePolicy: TTP,
    });
    expect(result.totalRealMinutes).toBe(420);
    expect(result.totalCountedMinutes).toBe(480);
    expect(result.blocks.reduce((sum, block) => sum + block.computedMinutes, 0)).toBeCloseTo(480, 8);
    expect(result.blocks.every((block) => block.nightPremiumPercent === 20)).toBe(true);
  });

  it('never emits a 25% night premium or a 1.25 night multiplier', () => {
    const { blocks } = classifyLabor({
      segments: [seg('2026-01-07T22:00:00Z', '2026-01-08T01:00:00Z')],
      hourlyRateC: RATE,
      policy: DEFAULT_LABOR_POLICY,
      travelTimePolicy: TTP,
    });
    expect(DEFAULT_LABOR_POLICY.nightMultiplier).toBe(1.2);
    expect(blocks.every((block) => block.nightPremiumPercent !== 25)).toBe(true);
    expect(blocks.flatMap((block) => block.appliedMultipliers).includes(1.25)).toBe(false);
  });

  it('supports an individual 8h48 schedule before weekday overtime starts', () => {
    const { blocks } = classifyLabor({
      segments: [seg('2026-01-07T08:00:00Z', '2026-01-07T17:48:00Z')],
      hourlyRateC: RATE,
      policy: { ...POLICY, regularDailyMinutes: 528 },
      travelTimePolicy: TTP,
    });
    expect(minutesByClass(blocks)).toEqual({ regular: 528, overtime_50: 60 });
  });

  it('distinguishes normal Saturday from compensated Saturday', () => {
    const trip = [seg('2026-01-10T08:00:00Z', '2026-01-10T18:00:00Z')];
    const normal = classifyLabor({
      segments: trip,
      hourlyRateC: RATE,
      policy: { ...POLICY, saturdayAllHoursOvertime: false },
      travelTimePolicy: TTP,
    });
    const compensated = run(trip);
    expect(minutesByClass(normal.blocks)).toEqual({ regular: 480, overtime_50: 120 });
    expect(minutesByClass(compensated.blocks)).toEqual({ overtime_100: 600 });
  });

  it('applies Sunday 2.5× and stacks the 20% night premium at 3.0×', () => {
    const { blocks, totalCostC } = run([seg('2026-01-11T22:00:00Z', '2026-01-12T00:00:00Z')]);
    expect(blocks.every((block) => block.dayType === 'sunday')).toBe(true);
    expect(blocks.every((block) => block.finalMultiplier === 3)).toBe(true);
    expect(totalCostC).toBe(36000);
  });

  it('keeps the journey across days without rest and resets after explicit 11h rest', () => {
    const noRest = run([
      seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z'),
      seg('2026-01-08T02:00:00Z', '2026-01-08T04:00:00Z'),
    ]);
    expect(noRest.blocks.filter((block) => block.localDate === '2026-01-08')
      .every((block) => block.baseClassification === 'overtime_50')).toBe(true);

    const rest = seg('2026-01-07T16:00:00Z', '2026-01-08T03:00:00Z', { rule: 'hotel_rest' });
    const reset = run([
      seg('2026-01-07T08:00:00Z', '2026-01-07T16:00:00Z'),
      rest,
      seg('2026-01-08T03:00:00Z', '2026-01-08T05:00:00Z'),
    ]);
    expect(reset.blocks.filter((block) => block.localDate === '2026-01-08')
      .every((block) => block.baseClassification === 'regular')).toBe(true);
  });

  it('changes the percentage exactly at a Saturday/Sunday midnight boundary', () => {
    const { blocks } = run([seg('2026-01-10T23:30:00Z', '2026-01-11T00:30:00Z')]);
    expect(blocks.find((block) => block.dayType === 'saturday')?.overtimePercent).toBe(100);
    expect(blocks.find((block) => block.dayType === 'sunday')?.overtimePercent).toBe(150);
  });

  it('classifies Friday 12:00 through Saturday 05:00 by every applicable boundary', () => {
    const { blocks, totalCostC } = run([seg('2026-01-09T12:00:00Z', '2026-01-10T05:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({
      regular: 480,
      overtime_50: 240,
      overtime_100: 300,
    });
    expect(blocks.some((block) => (
      block.dayType === 'weekday' &&
      block.baseClassification === 'overtime_50' &&
      block.nightPremiumApplied
    ))).toBe(true);
    expect(blocks.filter((block) => block.dayType === 'saturday')
      .every((block) => block.finalMultiplier === 2.4)).toBe(true);
    expect(totalCostC).toBe(159600);
  });

  it('keeps one continuous counter over three consecutive travel dates', () => {
    const { blocks, alerts } = run([seg('2026-01-09T20:00:00Z', '2026-01-12T02:00:00Z')]);
    expect(new Set(blocks.map((block) => block.localDate)).size).toBe(4);
    expect(alerts.some((alert) => alert.code === 'continuous_multiday_journey')).toBe(true);
    expect(blocks.filter((block) => block.localDate === '2026-01-12')
      .every((block) => block.baseClassification === 'overtime_50')).toBe(true);
  });

  it('recognizes only an explicit released interval, never waiting, as the break', () => {
    const travelPolicyWithoutWaiting = { ...TTP, airportWaitingCounts: false };
    const waitingResult = classifyLabor({
      segments: [
        seg('2026-01-07T08:00:00Z', '2026-01-07T12:00:00Z'),
        seg('2026-01-07T12:00:00Z', '2026-01-07T13:00:00Z', { rule: 'airport_waiting' }),
        seg('2026-01-07T13:00:00Z', '2026-01-07T16:00:00Z'),
      ],
      hourlyRateC: RATE,
      policy: POLICY,
      travelTimePolicy: travelPolicyWithoutWaiting,
    });
    expect(waitingResult.alerts.some((alert) => alert.code === 'missing_registered_interval')).toBe(true);

    const intervalResult = run([
      seg('2026-01-07T08:00:00Z', '2026-01-07T12:00:00Z'),
      seg('2026-01-07T12:00:00Z', '2026-01-07T12:30:00Z', { rule: 'meal_break' }),
      seg('2026-01-07T12:30:00Z', '2026-01-07T15:30:00Z'),
    ]);
    expect(intervalResult.alerts.some((alert) => alert.code === 'missing_registered_interval')).toBe(false);
  });

  it('automatically deducts one hour of interval for every complete 8h in a local day', () => {
    const intervalPolicy = { ...POLICY, automaticJourneyIntervalEnabled: true };
    const result = classifyLabor({
      segments: [seg('2026-01-07T00:00:00Z', '2026-01-07T16:00:00Z')],
      hourlyRateC: RATE,
      policy: intervalPolicy,
      travelTimePolicy: TTP,
    });
    expect(result.totalRealMinutes).toBe(14 * 60);
    expect(result.deductions).toEqual([
      expect.objectContaining({ localDate: '2026-01-07', intervalSequence: 1, realMinutes: 60, source: 'system' }),
      expect.objectContaining({ localDate: '2026-01-07', intervalSequence: 2, realMinutes: 60, source: 'system' }),
    ]);
    expect(result.alerts.filter((alert) => alert.code === 'automatic_eight_hour_interval_deduction')).toHaveLength(2);
  });

  it('does not apply the automatic interval before completing 8h', () => {
    const result = classifyLabor({
      segments: [seg('2026-01-07T00:00:00Z', '2026-01-07T07:59:00Z')],
      hourlyRateC: RATE,
      policy: { ...POLICY, automaticJourneyIntervalEnabled: true },
      travelTimePolicy: TTP,
    });
    expect(result.totalRealMinutes).toBe(479);
    expect(result.deductions).toHaveLength(0);
  });

  it('credits an explicit released interval and does not deduct it twice', () => {
    const result = classifyLabor({
      segments: [
        seg('2026-01-07T00:00:00Z', '2026-01-07T04:00:00Z'),
        seg('2026-01-07T04:00:00Z', '2026-01-07T05:00:00Z', { rule: 'meal_break' }),
        seg('2026-01-07T05:00:00Z', '2026-01-07T09:00:00Z'),
      ],
      hourlyRateC: RATE,
      policy: { ...POLICY, automaticJourneyIntervalEnabled: true },
      travelTimePolicy: TTP,
    });
    expect(result.deductions).toHaveLength(0);
    expect(result.totalRealMinutes).toBe(8 * 60);
  });
});
