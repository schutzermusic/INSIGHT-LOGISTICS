import { describe, it, expect } from 'vitest';
import { buildManualItinerary, resolveSegmentCostC } from './ManualItineraryAdapter.js';

const CBA = 'America/Cuiaba';
const BEL = 'America/Belem';

function seg(o) {
  return {
    segmentType: 'bus',
    originLocationId: 'A', destinationLocationId: 'B',
    originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
    departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z',
    originTimezone: CBA, destinationTimezone: CBA,
    priceAmountMinor: 25000, priceAllocation: 'per_person', currency: 'BRL',
    passengerIds: ['e1', 'e2'],
    ...o,
  };
}

describe('ManualItineraryAdapter — price allocation (§7.2)', () => {
  it('per_person multiplies by passenger count', () => {
    expect(resolveSegmentCostC({ priceAmountMinor: 25000, priceAllocation: 'per_person' }, 2)).toBe(50000);
  });
  it('scenario_total / per_vehicle stay as a total (no re-multiply)', () => {
    expect(resolveSegmentCostC({ priceAmountMinor: 80000, priceAllocation: 'per_vehicle' }, 3)).toBe(80000);
    expect(resolveSegmentCostC({ priceAmountMinor: 80000, priceAllocation: 'scenario_total' }, 3)).toBe(80000);
  });
  it('per_day multiplies by units', () => {
    expect(resolveSegmentCostC({ priceAmountMinor: 15000, priceAllocation: 'per_day', priceUnits: 3 }, 2)).toBe(45000);
  });
  it('none yields zero', () => {
    expect(resolveSegmentCostC({ priceAmountMinor: 15000, priceAllocation: 'none' }, 2)).toBe(0);
  });
});

describe('ManualItineraryAdapter — normalization (§10)', () => {
  it('1. direct bus: duration from timestamps, per-person cost, single mode', () => {
    const { itinerary } = buildManualItinerary({
      scenarioId: 's1', passengerIds: ['e1', 'e2'],
      segments: [seg({})],
    });
    expect(itinerary.segments).toHaveLength(1);
    expect(itinerary.durationMinutes).toBe(360);
    expect(itinerary.segments[0].durationMinutes).toBe(360);
    expect(itinerary.segments[0].mode).toBe('bus');
    expect(itinerary.segments[0].laborCountingRuleId).toBe('bus_time');
    expect(itinerary.commercialCostC).toBe(50000); // 250,00 × 2
    expect(itinerary.commercialResolved).toBe(true);
    expect(itinerary.modeSequence).toEqual(['bus']);
  });

  it('2. derives a waiting gap between two legs at the same terminal', () => {
    const { itinerary, derivedGaps } = buildManualItinerary({
      scenarioId: 's2', passengerIds: ['e1'],
      segments: [
        seg({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T12:00:00Z', destinationLocationId: 'B' }),
        seg({ originLocationId: 'B', destinationLocationId: 'C', departureAtUtc: '2026-01-05T14:00:00Z', arrivalAtUtc: '2026-01-05T18:00:00Z' }),
      ],
    });
    expect(derivedGaps).toHaveLength(1);
    expect(derivedGaps[0].minutes).toBe(120);
    const waiting = itinerary.segments.find((s) => s.mode === 'waiting');
    expect(waiting).toBeTruthy();
    expect(waiting.source).toBe('derived');
    expect(waiting.durationMinutes).toBe(120);
  });

  it('3. flags a missing transfer between bus terminal and airport (§9)', () => {
    const { continuityIssues } = buildManualItinerary({
      scenarioId: 's3', passengerIds: ['e1'],
      segments: [
        seg({ destinationLocationId: 'GYN', destinationLocationType: 'bus_terminal',
          departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T11:00:00Z' }),
        seg({ segmentType: 'flight', originLocationId: 'GYN', originLocationType: 'airport', destinationLocationId: 'BEL',
          destinationLocationType: 'airport', originTimezone: CBA, destinationTimezone: BEL,
          departureAtUtc: '2026-01-05T13:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z', priceAllocation: 'per_person', priceAmountMinor: 120000 }),
      ],
    });
    expect(continuityIssues.some((c) => c.code === 'missing_transfer')).toBe(true);
  });

  it('4. an explicit transfer between terminals clears the continuity issue', () => {
    const { continuityIssues } = buildManualItinerary({
      scenarioId: 's4', passengerIds: ['e1'],
      segments: [
        seg({ destinationLocationId: 'GYN', destinationLocationType: 'bus_terminal',
          departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T11:00:00Z' }),
        seg({ segmentType: 'transfer', originLocationId: 'GYN', originLocationType: 'bus_terminal',
          destinationLocationId: 'GYN', destinationLocationType: 'airport',
          departureAtUtc: '2026-01-05T11:00:00Z', arrivalAtUtc: '2026-01-05T11:45:00Z',
          priceAllocation: 'scenario_total', priceAmountMinor: 6000 }),
        seg({ segmentType: 'flight', originLocationId: 'GYN', originLocationType: 'airport', destinationLocationId: 'BEL',
          destinationLocationType: 'airport', departureAtUtc: '2026-01-05T13:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z',
          priceAllocation: 'per_person', priceAmountMinor: 120000 }),
      ],
    });
    expect(continuityIssues.some((c) => c.code === 'missing_transfer')).toBe(false);
  });

  it('5. marks misses_arrival_deadline when arrival is past the deadline', () => {
    const { itinerary } = buildManualItinerary({
      scenarioId: 's5', passengerIds: ['e1'], deadlineUtc: '2026-01-05T12:00:00Z',
      segments: [seg({ arrivalAtUtc: '2026-01-05T15:00:00Z' })],
    });
    expect(itinerary.feasibilityStatus).toBe('invalid');
    expect(itinerary.feasibilityReasons).toContain('misses_arrival_deadline');
  });

  it('6. preserves independent outbound and return timelines', () => {
    const { itinerary } = buildManualItinerary({
      scenarioId: 'roundtrip',
      passengerIds: ['e1'],
      segments: [
        seg({
          sequence: 0, direction: 'outbound',
          departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z',
        }),
        seg({
          sequence: 1, direction: 'return',
          originLocationId: 'B', destinationLocationId: 'A',
          departureAtUtc: '2026-01-12T09:00:00Z', arrivalAtUtc: '2026-01-12T15:00:00Z',
        }),
      ],
    });
    expect(itinerary.tripType).toBe('roundtrip');
    expect(itinerary.timelines.outbound).toHaveLength(1);
    expect(itinerary.timelines.return).toHaveLength(1);
    expect(itinerary.segments.find((segment) => segment.direction === 'return')).toBeTruthy();
  });
});
