/**
 * §34 end-to-end validation: Alta Floresta → Tucuruí with no direct route.
 * Exercises the full pipeline (graph → generate → cost → recommend) and asserts
 * the required validation report fields: commercial, labor, meals, accommodation,
 * transfers, total, duration, arrival, connections, recommendation reason.
 */
import { describe, it, expect } from 'vitest';
import { createMobilizationGraph } from './MultimodalGraphBuilder.js';
import { generateItineraries } from './ItineraryGenerator.js';
import { computeItineraryCost } from './OperationalCostEngine.js';
import { recommend } from './RecommendationEngine.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';

const TZ = { af: 'America/Cuiaba', cgb: 'America/Cuiaba', gyn: 'America/Sao_Paulo', bel: 'America/Belem', tuc: 'America/Belem' };
const D = '2026-07-29'; const N = '2026-07-30';
const iso = (s) => `${s}:00Z`;

function buildGraph() {
  const g = createMobilizationGraph();
  [['AF', TZ.af], ['CGB', TZ.cgb], ['GYN', TZ.gyn], ['BEL', TZ.bel], ['TUC', TZ.tuc]].forEach(([id, tz]) => g.addNode({ id, timezone: tz }));
  // Chain A: AF→CGB(bus)→GYN(bus)→BEL(flight)→TUC(bus) — 4 legs, no direct route.
  g.addScheduledEdge({ id: 'b1', mode: 'bus', fromCity: 'AF', toCity: 'CGB', departureAtUtc: iso(`${D}T09:00`), arrivalAtUtc: iso(`${D}T21:00`), costC: 12000 });
  g.addScheduledEdge({ id: 'b2', mode: 'bus', fromCity: 'CGB', toCity: 'GYN', departureAtUtc: iso(`${D}T23:00`), arrivalAtUtc: iso(`${N}T09:00`), costC: 18000 });
  g.addScheduledEdge({ id: 'fA', mode: 'flight', fromCity: 'GYN', toCity: 'BEL', departureAtUtc: iso(`${N}T12:00`), arrivalAtUtc: iso(`${N}T14:00`), costC: 90000 });
  g.addScheduledEdge({ id: 't1', mode: 'bus', fromCity: 'BEL', toCity: 'TUC', departureAtUtc: iso(`${N}T16:00`), arrivalAtUtc: iso(`${N}T22:00`), costC: 8000 });
  // Chain B: AF→CGB(bus)→BEL(flight)→TUC(bus) — fewer connections, cheaper, faster.
  g.addScheduledEdge({ id: 'fB', mode: 'flight', fromCity: 'CGB', toCity: 'BEL', departureAtUtc: iso(`${N}T00:00`), arrivalAtUtc: iso(`${N}T03:00`), costC: 100000 });
  g.addScheduledEdge({ id: 't2', mode: 'bus', fromCity: 'BEL', toCity: 'TUC', departureAtUtc: iso(`${N}T06:00`), arrivalAtUtc: iso(`${N}T12:00`), costC: 8000 });
  return g.build();
}

describe('§34 — Alta Floresta → Tucuruí (no direct route)', () => {
  const graph = buildGraph();
  const { valid } = generateItineraries({
    graph, originCity: 'AF', destinationCity: 'TUC',
    earliestDepartureUtc: iso(`${D}T06:00`), deadlineUtc: iso('2026-07-31T02:00'),
  });
  const employees = [{ id: 'e1', hourlyRateC: 6000 }, { id: 'e2', hourlyRateC: 6000 }];
  const laborContext = { policy: DEFAULT_LABOR_POLICY, travelTimePolicy: DEFAULT_TRAVEL_TIME_POLICY };
  const costed = valid.map((it) => {
    const r = computeItineraryCost({ itinerary: it, employees, laborContext });
    return { ...r.itinerary, breakdown: r.breakdown, laborByEmployee: r.laborByEmployee };
  });
  const out = recommend({ itineraries: costed });

  it('discovers the 4-leg multimodal chain and at least two alternatives', () => {
    const shapes = new Set(costed.map((c) => c.modeSequence.join('>')));
    expect(shapes.has('bus>bus>flight>bus')).toBe(true); // the §34 chain
    expect(costed.length).toBeGreaterThanOrEqual(2);
  });

  it('produces a complete cost/labor report for the recommendation', () => {
    const r = out.recommended;
    expect(r).toBeTruthy();
    // All required report figures present and coherent (§34).
    expect(r.commercialCostC).toBeGreaterThan(0);
    expect(r.laborCostC).toBeGreaterThan(0);
    expect(r.totalMobilizationCostC).toBe(
      r.commercialCostC + r.laborCostC + r.permanenceCostC + r.localMobilityCostC
    );
    expect(r.connectionCount).toBeGreaterThanOrEqual(1);
    expect(r.durationMinutes).toBeGreaterThan(0);
    expect(typeof r.arrivalAtUtc).toBe('string');
    expect(r.feasibilityStatus).toBe('valid');
    // Terminal transfers and transit meals were computed.
    expect(r.breakdown.terminal_transfers_c).toBeGreaterThan(0);
    expect(r.breakdown.transit_meals_c).toBeGreaterThan(0);
  });

  it('recommends the lowest viable TOTAL cost with reason codes', () => {
    expect(out.reasonCodes).toContain('lowest_total_cost');
    expect(out.explanation.paragraphs.length).toBeGreaterThan(0);
    // The recommended total is the minimum among valid options.
    const minTotal = Math.min(...costed.map((c) => c.totalMobilizationCostC));
    expect(out.recommended.totalMobilizationCostC).toBe(minTotal);
    // A comparison against another alternative is available.
    expect(out.comparison.lowestTicket).toBeTruthy();
    expect(out.comparison.fastest).toBeTruthy();
  });
});
