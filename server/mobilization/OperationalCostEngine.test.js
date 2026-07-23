import { describe, it, expect } from 'vitest';
import { computeItineraryCost } from './OperationalCostEngine.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';

const laborContext = { policy: DEFAULT_LABOR_POLICY, travelTimePolicy: DEFAULT_TRAVEL_TIME_POLICY, holidays: [] };

// One 12h weekday bus leg (per-person fare R$100), tz UTC.
function busItinerary() {
  return {
    id: 'it1',
    durationMinutes: 720,
    segments: [{
      sequence: 0, mode: 'bus',
      originLocationId: 'A', destinationLocationId: 'B',
      departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T20:00:00Z',
      originTimezone: 'UTC', destinationTimezone: 'UTC',
      commercialCostC: 10000, currency: 'BRL', laborCountingRuleId: 'bus_time',
    }],
    modeSequence: ['bus'],
    connectionCount: 0,
    feasibilityStatus: 'valid',
  };
}

describe('computeItineraryCost', () => {
  it('splits commercial per-person, sums labor across the team, adds transit meals', () => {
    const employees = [
      { id: 'e1', hourlyRateC: 6000 },
      { id: 'e2', hourlyRateC: 6000 },
    ];
    const { itinerary, breakdown } = computeItineraryCost({ itinerary: busItinerary(), employees, laborContext });

    // Commercial: R$100 × 2 people.
    expect(breakdown.ticket_c).toBe(20000);
    // Labor: 12h weekday each = 8h reg + 2h@50% + 2h@100% = 90000, × 2 = 180000.
    expect(breakdown.labor_c).toBe(180000);
    // Meals: floor(12h / 5h) = 2 meals × round(8000/3) × 2 people = 2 × 2667 × 2.
    expect(breakdown.transit_meals_c).toBe(2 * 2667 * 2);
    expect(breakdown.transit_hotel_c).toBe(0); // no overnight wait
    expect(itinerary.totalMobilizationCostC).toBe(20000 + 180000 + 2 * 2667 * 2);
    expect(itinerary.laborCostC).toBe(180000);
  });

  it('treats rental vehicle as a shared (not per-person) cost', () => {
    const it = busItinerary();
    it.segments[0] = { ...it.segments[0], mode: 'rental_car', laborCountingRuleId: 'driver_vehicle_time', commercialCostC: 30000 };
    it.modeSequence = ['rental_car'];
    const { breakdown } = computeItineraryCost({
      itinerary: it,
      employees: [{ id: 'e1', hourlyRateC: 6000 }, { id: 'e2', hourlyRateC: 6000 }],
      laborContext,
    });
    expect(breakdown.shared_vehicle_c).toBe(30000); // once, not × 2
    expect(breakdown.ticket_c).toBe(0);
  });

  it('adds destination field permanence when provided', () => {
    const { breakdown } = computeItineraryCost({
      itinerary: busItinerary(),
      employees: [{ id: 'e1', hourlyRateC: 6000 }],
      laborContext,
      fieldContext: { daysInField: 5 },
    });
    expect(breakdown.field_hotel_c).toBe(5 * 15000 * 1);
    expect(breakdown.field_meals_c).toBe(5 * 8000 * 1);
    expect(breakdown.field_local_c).toBe(5 * 4000 * 1);
  });
});
