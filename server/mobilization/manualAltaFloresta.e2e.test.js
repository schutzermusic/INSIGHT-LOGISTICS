/**
 * E2E (§25.4) — Manual Mobilization Simulator: Alta Floresta → Tucuruí.
 *
 * Team of 2 with DIFFERENT hourly rates. Multimodal manual itinerary:
 *   Alta Floresta → Cuiabá (bus, overnight into Saturday)
 *   Cuiabá → Goiânia (bus)
 *   Rodoviária de Goiânia → Aeroporto de Goiânia (transfer)
 *   Goiânia → Belém (flight, into Sunday + night)
 *   Aeroporto de Belém → Rodoviária de Belém (transfer)
 *   Belém → Tucuruí (bus, Sunday)
 *
 * Validates: manual entry of every leg, duration from timestamps, derived
 * waiting gaps, required transfers present, Saturday +100% from the first
 * minute, Sunday 2.5×, overlapping night premium, individual per-employee
 * calculation, per-person + total prices, total cost, a 2nd alternative, and a
 * recommendation — all via the shared engines.
 */
import { describe, it, expect } from 'vitest';
import { runManualSimulation } from './ManualSimulationService.js';
import { zonedLocalToUtcIso } from '../../src/lib/datetime.js';

const MT = 'America/Cuiaba';    // UTC-4
const GO = 'America/Sao_Paulo'; // UTC-3 (Goiás)
const PA = 'America/Belem';     // UTC-3

const EMP = [
  { id: 'e1', nome: 'Ana', cargo: 'Técnica', salarioBase: 6600, cargaHoraria: 110 },   // 60,00/h
  { id: 'e2', nome: 'Bruno', cargo: 'Supervisor', salarioBase: 9900, cargaHoraria: 110 }, // 90,00/h
];
const PAX = ['e1', 'e2'];

function leg(o) {
  return {
    priceAllocation: 'per_person', currency: 'BRL', passengerIds: PAX,
    departureAtUtc: zonedLocalToUtcIso(o.dep, o.depTz),
    arrivalAtUtc: zonedLocalToUtcIso(o.arr, o.arrTz),
    originTimezone: o.depTz, destinationTimezone: o.arrTz,
    ...o,
  };
}

// Full multimodal scenario, departing Friday evening and arriving Sunday.
const SCENARIO_A = {
  id: 'A', name: 'Ônibus + Aéreo + Ônibus',
  segments: [
    leg({ segmentType: 'bus', originLocationId: 'Alta Floresta', destinationLocationId: 'Cuiabá',
      originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
      dep: '2026-01-09T18:00', depTz: MT, arr: '2026-01-10T06:00', arrTz: MT, priceAmountMinor: 25000 }),
    leg({ segmentType: 'bus', originLocationId: 'Cuiabá', destinationLocationId: 'Goiânia',
      originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
      dep: '2026-01-10T08:00', depTz: MT, arr: '2026-01-10T20:00', arrTz: GO, priceAmountMinor: 30000 }),
    leg({ segmentType: 'transfer', originLocationId: 'Rodoviária de Goiânia', destinationLocationId: 'Aeroporto de Goiânia',
      originLocationType: 'bus_terminal', destinationLocationType: 'airport',
      dep: '2026-01-10T20:30', depTz: GO, arr: '2026-01-10T21:15', arrTz: GO, priceAmountMinor: 6000, priceAllocation: 'scenario_total' }),
    leg({ segmentType: 'flight', originLocationId: 'Aeroporto de Goiânia', destinationLocationId: 'Aeroporto de Belém',
      originLocationType: 'airport', destinationLocationType: 'airport',
      dep: '2026-01-10T22:00', depTz: GO, arr: '2026-01-11T00:30', arrTz: PA, priceAmountMinor: 90000 }),
    leg({ segmentType: 'transfer', originLocationId: 'Aeroporto de Belém', destinationLocationId: 'Rodoviária de Belém',
      originLocationType: 'airport', destinationLocationType: 'bus_terminal',
      dep: '2026-01-11T01:00', depTz: PA, arr: '2026-01-11T01:45', arrTz: PA, priceAmountMinor: 6000, priceAllocation: 'scenario_total' }),
    leg({ segmentType: 'bus', originLocationId: 'Rodoviária de Belém', destinationLocationId: 'Tucuruí',
      originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
      dep: '2026-01-11T03:00', depTz: PA, arr: '2026-01-11T10:00', arrTz: PA, priceAmountMinor: 15000 }),
  ],
};

// A cheaper-ticket but slower all-bus alternative (huge labor) for comparison.
const SCENARIO_B = {
  id: 'B', name: 'Somente ônibus',
  segments: [
    leg({ segmentType: 'bus', originLocationId: 'Alta Floresta', destinationLocationId: 'Tucuruí',
      originLocationType: 'bus_terminal', destinationLocationType: 'bus_terminal',
      dep: '2026-01-09T18:00', depTz: MT, arr: '2026-01-11T12:00', arrTz: PA, priceAmountMinor: 42000 }),
  ],
};

describe('E2E — Manual Alta Floresta → Tucuruí (§25.4)', () => {
  const result = runManualSimulation({
    simulation: { name: 'Mobilização Alta Floresta', origin: 'Alta Floresta - MT', destination: 'Tucuruí - PA' },
    employees: EMP,
    deadlineUtc: zonedLocalToUtcIso('2026-01-11T18:00', PA),
    scenarios: [SCENARIO_A, SCENARIO_B],
  });
  const A = result.scenarios.find((s) => s.scenarioId === 'A');
  const B = result.scenarios.find((s) => s.scenarioId === 'B');

  it('normalizes every manual leg and derives waiting gaps + keeps transfers', () => {
    // 6 entered legs + derived waiting gaps between same-terminal legs.
    expect(A.segments.length).toBeGreaterThanOrEqual(6);
    expect(A.segments.some((s) => s.source === 'derived' && s.mode === 'waiting')).toBe(true);
    expect(A.segments.filter((s) => s.mode === 'local_transfer').length).toBe(2);
    // Transfers present → no missing-transfer continuity issue.
    expect(A.continuityIssues.filter((c) => c.code === 'missing_transfer')).toHaveLength(0);
    expect(A.feasibilityStatus).toBe('valid');
  });

  it('derives duration from timestamps (door-to-door)', () => {
    // Fri 18:00 MT → Sun 10:00 PA. MT=UTC-4, PA=UTC-3.
    // 2026-01-09T22:00Z → 2026-01-11T13:00Z = 39h.
    expect(A.durationMinutes).toBe(39 * 60);
  });

  it('classifies Saturday at +100% from the first minute, Sunday at 2.5×, with night overlap (§4.2/§4.3/§4.4)', () => {
    for (const emp of A.laborByEmployee) {
      expect(emp.summary.saturdayOvertime100Minutes).toBeGreaterThan(0);
      expect(emp.summary.sundayPremium150Minutes).toBeGreaterThan(0);
      expect(emp.summary.nightPremiumMinutes).toBeGreaterThan(0);
    }
    // No Saturday minute is ever classified as regular.
    const anaBlocks = A.laborByEmployee[0].blocks;
    expect(anaBlocks.some((b) => b.dayType === 'saturday' && b.baseClassification === 'regular')).toBe(false);
    expect(anaBlocks.some((b) => b.dayType === 'saturday' && b.baseClassification === 'overtime_100')).toBe(true);
  });

  it('computes labor individually — higher-rate employee costs proportionally more', () => {
    const ana = A.laborByEmployee.find((l) => l.employeeId === 'e1');
    const bruno = A.laborByEmployee.find((l) => l.employeeId === 'e2');
    expect(ana.summary.totalCountedMinutes).toBe(bruno.summary.totalCountedMinutes); // same route
    // 90/h vs 60/h → 1.5× cost, same minutes.
    expect(bruno.totalCostC).toBe(Math.round(ana.totalCostC * 1.5));
    expect(A.laborCostC).toBe(ana.totalCostC + bruno.totalCostC);
  });

  it('allocates commercial cost: per-person fares × 2 + total transfers', () => {
    // buses+flight per-person (250+300+900+150)=1600,00 × 2 = 3200,00; transfers 60+60 total.
    expect(A.commercialCostC).toBe(160000 * 2);      // per-person legs × team
    expect(A.localMobilityCostC).toBe(6000 + 6000);  // transfers (scenario totals)
    expect(A.totalMobilizationCostC).toBe(A.commercialCostC + A.laborCostC + A.permanenceCostC + A.localMobilityCostC);
  });

  it('produces a recommendation across ≥2 alternatives and reproduces the total from the breakdown', () => {
    expect(result.scenarios).toHaveLength(2);
    expect(result.recommended).toBeTruthy();
    expect(['A', 'B']).toContain(result.recommended.scenarioId);
    // The all-bus alternative racks up far more labor (39h+ of premium time).
    expect(B.laborCostC).toBeGreaterThan(A.laborCostC);
    // Breakdown reproduces the total (§26 "total reproducível pelo breakdown").
    expect(A.breakdown.total_c).toBe(A.totalMobilizationCostC);
  });
});
