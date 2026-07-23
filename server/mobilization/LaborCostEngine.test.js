import { describe, it, expect } from 'vitest';
import { classifyLabor } from './LaborCostEngine.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';

// R$60,00/hour so 1h regular = 6000 centavos. Weekday=Wed 2026-01-07.
const RATE = 6000;
const POLICY = DEFAULT_LABOR_POLICY;
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

  it('3. twelve weekday hours → 8 + 2@50% + 2@100%', () => {
    const { totalCostC, blocks } = run([seg('2026-01-07T08:00:00Z', '2026-01-07T20:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 480, overtime_50: 120, overtime_100: 120 });
    expect(totalCostC).toBe(48000 + 18000 + 24000);
  });
});

describe('LaborCostEngine — Saturday / Sunday', () => {
  it('4. Saturday below eight hours = all regular', () => {
    const { totalCostC, blocks } = run([seg('2026-01-10T08:00:00Z', '2026-01-10T14:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 360 });
    expect(totalCostC).toBe(36000);
  });

  it('5. Saturday above eight hours → 8 regular + excess at 100%', () => {
    const { totalCostC, blocks } = run([seg('2026-01-10T08:00:00Z', '2026-01-10T18:00:00Z')]);
    expect(minutesByClass(blocks)).toEqual({ regular: 480, overtime_100: 120 });
    expect(totalCostC).toBe(48000 + 24000);
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

  it('8. overtime + night premium (spec example: OT100 at 23:00 + 20%)', () => {
    const { totalCostC, blocks } = run(
      [seg('2026-01-07T22:00:00Z', '2026-01-08T00:00:00Z')],
      { priorWorkedMinutes: 600 } // already 10h → next hours are OT100
    );
    expect(minutesByClass(blocks)).toEqual({ overtime_100: 120 });
    expect(totalCostC).toBe(26400); // 2h × 6000 × 2.2 (additive: 2.0 + 0.2)
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

  it('10. trip crossing Friday into Saturday', () => {
    const { blocks } = run([seg('2026-01-09T20:00:00Z', '2026-01-10T02:00:00Z')]);
    const days = blocks.map(b => b.startAtUtc.slice(0, 10));
    expect(days).toContain('2026-01-09');
    expect(days).toContain('2026-01-10');
    expect(minutesByClass(blocks)).toEqual({ regular: 360 }); // 6h total, still under 8h
  });

  it('11. trip crossing Saturday into Sunday flips the band to Sunday', () => {
    const { blocks } = run([seg('2026-01-10T22:00:00Z', '2026-01-11T02:00:00Z')]);
    const cls = minutesByClass(blocks);
    expect(cls.regular).toBe(120);       // Saturday portion
    expect(cls.overtime_150).toBe(120);  // Sunday portion
    expect(blocks.find(b => b.baseClassification === 'overtime_150')).toBeTruthy();
  });

  it('12. existing worked hours before departure (§7 worked example)', () => {
    // Worked 6h, travel begins 18:00 for 7h → 2 normal + 2@50% + 3@100%.
    const { blocks } = run(
      [seg('2026-01-07T18:00:00Z', '2026-01-08T01:00:00Z')],
      { priorWorkedMinutes: 360 }
    );
    const cls = minutesByClass(blocks);
    expect(cls.regular).toBe(120);      // 2h
    expect(cls.overtime_50).toBe(120);  // 2h
    expect(cls.overtime_100).toBe(180); // 3h
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
    const opts = { priorWorkedMinutes: 600 }; // OT100 band
    const additive = classifyLabor({ segments: s, hourlyRateC: RATE, policy: POLICY, travelTimePolicy: TTP, ...opts });
    const multiplicative = classifyLabor({
      segments: s, hourlyRateC: RATE, travelTimePolicy: TTP, ...opts,
      policy: { ...POLICY, premiumStackingMode: 'multiplicative' },
    });
    expect(additive.totalCostC).toBe(26400);       // 2h × 6000 × (2.0 + 0.2)
    expect(multiplicative.totalCostC).toBe(28800); // 2h × 6000 × (2.0 × 1.2)
    expect(additive.totalCostC).toBeLessThan(multiplicative.totalCostC);
  });
});
