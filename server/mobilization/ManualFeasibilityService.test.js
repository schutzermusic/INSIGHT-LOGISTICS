import { describe, it, expect } from 'vitest';
import { buildManualItinerary } from './ManualItineraryAdapter.js';
import { evaluateManualFeasibility, evaluateRest } from './ManualFeasibilityService.js';

const TZ = 'America/Cuiaba';

function bus(o) {
  return {
    segmentType: 'bus', originLocationId: 'A', destinationLocationId: 'B',
    originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
    originTimezone: TZ, destinationTimezone: TZ,
    priceAmountMinor: 25000, priceAllocation: 'per_person', passengerIds: ['e1'],
    ...o,
  };
}

function feas(segments, extra = {}) {
  const { itinerary, continuityIssues } = buildManualItinerary({ scenarioId: 't', passengerIds: ['e1'], segments, ...extra });
  return evaluateManualFeasibility({ itinerary, continuityIssues, employeeIds: ['e1'], ...extra });
}

describe('ManualFeasibilityService (§15, §22)', () => {
  it('valid direct bus passes', () => {
    const r = feas([bus({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z' })]);
    expect(r.status).toBe('valid');
  });

  it('arrival before departure is invalid', () => {
    const r = feas([bus({ departureAtUtc: '2026-01-05T15:00:00Z', arrivalAtUtc: '2026-01-05T09:00:00Z' })]);
    expect(r.status).toBe('invalid');
    expect(r.checks.find((c) => c.code === 'arrival_after_departure').passed).toBe(false);
  });

  it('overlapping legs for the same employee is invalid', () => {
    const r = feas([
      bus({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z' }),
      bus({ originLocationId: 'B', destinationLocationId: 'C', departureAtUtc: '2026-01-05T14:00:00Z', arrivalAtUtc: '2026-01-05T18:00:00Z' }),
    ]);
    expect(r.checks.find((c) => c.code === 'chronological_order').passed).toBe(false);
    expect(r.status).toBe('invalid');
  });

  it('past the deadline is invalid', () => {
    const r = feas([bus({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T15:00:00Z' })], { deadlineUtc: '2026-01-05T12:00:00Z' });
    expect(r.checks.find((c) => c.code === 'within_deadline').passed).toBe(false);
  });

  it('11h hotel rest qualifies and permits a reset', () => {
    const it = buildManualItinerary({
      scenarioId: 'r', passengerIds: ['e1'],
      segments: [
        bus({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T17:00:00Z' }),
        { segmentType: 'hotel_rest', originLocationId: 'B', destinationLocationId: 'B', originLocationType: 'hotel', destinationLocationType: 'hotel',
          originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-05T17:00:00Z', arrivalAtUtc: '2026-01-06T05:00:00Z',
          priceAllocation: 'per_room', priceAmountMinor: 15000 },
      ],
    }).itinerary;
    const rest = evaluateRest(it, 660);
    expect(rest.journeyResetCount).toBe(1);
    expect(rest.restDeficitMinutes).toBe(0);
  });

  it('7h hotel rest does not reset and registers a deficit (§4.5)', () => {
    const it = buildManualItinerary({
      scenarioId: 'r2', passengerIds: ['e1'],
      segments: [
        bus({ departureAtUtc: '2026-01-05T09:00:00Z', arrivalAtUtc: '2026-01-05T17:00:00Z' }),
        { segmentType: 'hotel_rest', originLocationId: 'B', destinationLocationId: 'B', originLocationType: 'hotel', destinationLocationType: 'hotel',
          originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-05T22:00:00Z', arrivalAtUtc: '2026-01-06T05:00:00Z',
          priceAllocation: 'per_room', priceAmountMinor: 15000 },
      ],
    }).itinerary;
    const rest = evaluateRest(it, 660);
    expect(rest.journeyResetCount).toBe(0);
    expect(rest.restDeficitMinutes).toBe(240); // 11h - 7h
    expect(rest.critical).toBe(true);
  });

  it('effective release (not hotel arrival) starts the rest window', () => {
    const it = buildManualItinerary({
      scenarioId: 'r3', passengerIds: ['e1'],
      segments: [
        { segmentType: 'hotel_rest', originLocationId: 'B', destinationLocationId: 'B', originLocationType: 'hotel', destinationLocationType: 'hotel',
          originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-05T04:00:00Z', arrivalAtUtc: '2026-01-05T16:00:00Z',
          releaseAtUtc: '2026-01-05T05:00:00Z', priceAllocation: 'per_room', priceAmountMinor: 15000 },
      ],
    }).itinerary;
    // window = 05:00 → 16:00 = 11h exactly → qualifies.
    const rest = evaluateRest(it, 660);
    expect(rest.rests[0].restMinutes).toBe(660);
    expect(rest.journeyResetCount).toBe(1);
  });
});
