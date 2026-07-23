import { describe, it, expect } from 'vitest';
import {
  runManualSimulation,
  computeScenario,
  validateManualSimulationInput,
} from './ManualSimulationService.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';

const TZ = 'UTC'; // clean-arithmetic assertions; timezone/night behaviour is covered in LaborCostEngine.test.js
const POLICY = DEFAULT_LABOR_POLICY;
const TTP = DEFAULT_TRAVEL_TIME_POLICY;

// Two employees with DIFFERENT hourly rates (§14/§24).
const EMP = [
  { id: 'e1', name: 'Ana', hourlyRateC: 6000 },   // R$60/h
  { id: 'e2', name: 'Bruno', hourlyRateC: 9000 },  // R$90/h
];

function bus(o) {
  return {
    segmentType: 'bus', originLocationId: 'A', destinationLocationId: 'B',
    originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
    originTimezone: TZ, destinationTimezone: TZ,
    priceAmountMinor: 25000, priceAllocation: 'per_person', passengerIds: ['e1', 'e2'],
    ...o,
  };
}

describe('ManualSimulationService — individual labor & consolidation (§11, §14)', () => {
  it('computes labor per employee with their own rate, not a team average', () => {
    // Wednesday 08:00–16:00 UTC = 8h regular for both.
    const sc = computeScenario({
      scenario: { id: 's', name: 'Ônibus direto', segments: [bus({ departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T16:00:00Z' })] },
      employees: EMP, policy: POLICY, travelTimePolicy: TTP,
    });
    const ana = sc.laborByEmployee.find((l) => l.employeeId === 'e1');
    const bruno = sc.laborByEmployee.find((l) => l.employeeId === 'e2');
    expect(ana.totalCostC).toBe(48000);   // 8h × 6000
    expect(bruno.totalCostC).toBe(72000);  // 8h × 9000
    expect(ana.summary.regularMinutes).toBe(480);
    expect(sc.laborCostC).toBe(120000);    // consolidated
    // Commercial: per-person 250,00 × 2 passengers.
    expect(sc.commercialCostC).toBe(50000);
    expect(sc.totalMobilizationCostC).toBe(50000 + 120000);
  });

  it('Saturday travel is all +100% from the first minute for each employee (§4.2)', () => {
    const sc = computeScenario({
      scenario: { id: 'sat', name: 'Sábado', segments: [bus({ departureAtUtc: '2026-01-10T08:00:00Z', arrivalAtUtc: '2026-01-10T14:00:00Z' })] },
      employees: [EMP[0]], policy: POLICY, travelTimePolicy: TTP,
    });
    const ana = sc.laborByEmployee[0];
    expect(ana.summary.saturdayOvertime100Minutes).toBe(360);
    expect(ana.summary.regularMinutes).toBe(0);
    expect(ana.totalCostC).toBe(72000); // 6h × 6000 × 2.0
  });

  it('per-segment passengers: an employee is only charged for segments they travel', () => {
    // e1 flies (expensive), e2 takes the bus; a final transfer for both.
    const sc = computeScenario({
      scenario: {
        id: 'split', name: 'Split',
        segments: [
          { segmentType: 'flight', originLocationId: 'A', destinationLocationId: 'B', originLocationType: 'airport', destinationLocationType: 'airport',
            originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T10:00:00Z',
            priceAllocation: 'per_person', priceAmountMinor: 120000, passengerIds: ['e1'] },
          { segmentType: 'bus', originLocationId: 'A', destinationLocationId: 'B', originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
            originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T18:00:00Z',
            priceAllocation: 'per_person', priceAmountMinor: 25000, passengerIds: ['e2'] },
        ],
      },
      employees: EMP, policy: POLICY, travelTimePolicy: TTP,
    });
    const ana = sc.laborByEmployee.find((l) => l.employeeId === 'e1');
    const bruno = sc.laborByEmployee.find((l) => l.employeeId === 'e2');
    expect(ana.summary.totalCountedMinutes).toBe(120);  // 2h flight
    expect(bruno.summary.totalCountedMinutes).toBe(600); // 10h bus → 8 reg + 2 @50%
    expect(bruno.summary.weekdayOvertime50Minutes).toBe(120);
  });
});

describe('ManualSimulationService — cross-scenario recommendation (§16)', () => {
  it('recommends the lowest total mobilization cost among valid scenarios', () => {
    const result = runManualSimulation({
      employees: EMP, deadlineUtc: '2026-01-09T00:00:00Z',
      scenarios: [
        { id: 'bus', name: 'Só ônibus', segments: [bus({ departureAtUtc: '2026-01-07T06:00:00Z', arrivalAtUtc: '2026-01-08T06:00:00Z' })] }, // 24h → huge labor
        { id: 'air', name: 'Aéreo', segments: [
          { segmentType: 'flight', originLocationId: 'A', destinationLocationId: 'B', originLocationType: 'airport', destinationLocationType: 'airport',
            originTimezone: TZ, destinationTimezone: TZ, departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T11:00:00Z',
            priceAllocation: 'per_person', priceAmountMinor: 130000, passengerIds: ['e1', 'e2'] },
        ] },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.recommended).toBeTruthy();
    expect(result.recommended.scenarioName).toBe('Aéreo'); // cheaper ticket loses to labor? no — air is faster & cheaper total
    expect(result.scenarios).toHaveLength(2);
    expect(result.policySummary.lines.some((l) => l.includes('SÁBADO: todas as horas'))).toBe(true);
  });

  it('keeps outbound and return segments in one continuous shared calculation', () => {
    const result = runManualSimulation({
      simulation: { tripType: 'roundtrip' },
      employees: [EMP[0]],
      scenarios: [{
        id: 'rt', name: 'Ida e volta', segments: [
          bus({
            sequence: 0, direction: 'outbound',
            departureAtUtc: '2026-01-07T08:00:00Z', arrivalAtUtc: '2026-01-07T16:00:00Z',
          }),
          {
            segmentType: 'hotel_rest', direction: 'outbound', sequence: 1,
            originLocationId: 'B', destinationLocationId: 'B',
            originLocationType: 'hotel', destinationLocationType: 'hotel',
            originTimezone: TZ, destinationTimezone: TZ,
            departureAtUtc: '2026-01-07T16:00:00Z', arrivalAtUtc: '2026-01-08T08:00:00Z',
            priceAmountMinor: 18000, priceAllocation: 'selected_passengers_total',
            passengerIds: ['e1'], qualifiesAsRest: true,
          },
          bus({
            sequence: 2, direction: 'return', originLocationId: 'B', destinationLocationId: 'A',
            departureAtUtc: '2026-01-08T08:00:00Z', arrivalAtUtc: '2026-01-08T10:00:00Z',
          }),
        ],
      }],
    });
    expect(result.scenarios[0].tripType).toBe('roundtrip');
    expect(result.scenarios[0].timelines.outbound.length).toBe(2);
    expect(result.scenarios[0].timelines.return.length).toBe(1);
    expect(result.scenarios[0].laborByEmployee[0].summary.regularMinutes).toBe(600);
  });
});

describe('ManualSimulationService — server validation', () => {
  it('rejects an incomplete segment instead of returning a zero-cost calculation', () => {
    const errors = validateManualSimulationInput({
      employees: EMP,
      scenarios: [{
        id: 'incomplete',
        segments: [bus({ departureAtUtc: null, arrivalAtUtc: null })],
      }],
    });
    expect(errors.some((error) => error.includes('data e hora'))).toBe(true);
  });
});
