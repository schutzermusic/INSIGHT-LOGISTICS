import { describe, it, expect } from 'vitest';
import { createMobilizationGraph } from './MultimodalGraphBuilder.js';
import { generateItineraries, paretoFrontier } from './ItineraryGenerator.js';

const TZ = { af: 'America/Cuiaba', cgb: 'America/Cuiaba', gyn: 'America/Sao_Paulo', bel: 'America/Belem', tuc: 'America/Belem' };
const DAY = '2026-07-29';
const NEXT = '2026-07-30';
const iso = (s) => `${s}:00Z`;

function graphOf(nodes, edges) {
  const g = createMobilizationGraph();
  nodes.forEach((n) => g.addNode(n));
  edges.forEach((e) => g.addScheduledEdge(e));
  return g.build();
}

describe('ItineraryGenerator — basic modes', () => {
  it('1. finds a direct flight', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.gyn }, { id: 'B', timezone: TZ.bel }],
      [{ id: 'f', mode: 'flight', fromCity: 'A', toCity: 'B', departureAtUtc: iso(`${DAY}T12:00`), arrivalAtUtc: iso(`${DAY}T14:00`), costC: 90000 }]
    );
    const { valid } = generateItineraries({ graph, originCity: 'A', destinationCity: 'B', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${DAY}T23:00`) });
    expect(valid).toHaveLength(1);
    expect(valid[0].modeSequence).toEqual(['flight']);
    expect(valid[0].connectionCount).toBe(0);
    expect(valid[0].totalMobilizationCostC).toBe(90000);
  });

  it('2. finds a direct bus', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.af }, { id: 'B', timezone: TZ.cgb }],
      [{ id: 'b', mode: 'bus', fromCity: 'A', toCity: 'B', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T21:00`), costC: 12000 }]
    );
    const { valid } = generateItineraries({ graph, originCity: 'A', destinationCity: 'B', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${DAY}T23:00`) });
    expect(valid).toHaveLength(1);
    expect(valid[0].modeSequence).toEqual(['bus']);
  });

  it('4. builds bus + flight with a terminal transfer segment', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.af }, { id: 'H', timezone: TZ.gyn }, { id: 'B', timezone: TZ.bel }],
      [
        { id: 'b', mode: 'bus', fromCity: 'A', toCity: 'H', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T17:00`), costC: 10000 },
        { id: 'f', mode: 'flight', fromCity: 'H', toCity: 'B', departureAtUtc: iso(`${DAY}T21:00`), arrivalAtUtc: iso(`${DAY}T23:00`), costC: 80000 },
      ]
    );
    const { valid } = generateItineraries({ graph, originCity: 'A', destinationCity: 'B', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${NEXT}T06:00`) });
    expect(valid).toHaveLength(1);
    const it = valid[0];
    expect(it.modeSequence).toEqual(['bus', 'flight']);
    expect(it.segments.some((s) => s.mode === 'local_transfer')).toBe(true); // bus terminal → airport
    expect(it.segments.some((s) => s.mode === 'waiting')).toBe(true);
  });
});

describe('ItineraryGenerator — feasibility & deadline', () => {
  it('7. rejects an itinerary whose connection is too short', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.af }, { id: 'H', timezone: TZ.gyn }, { id: 'B', timezone: TZ.bel }],
      [
        { id: 'b', mode: 'bus', fromCity: 'A', toCity: 'H', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T10:00`), costC: 10000 },
        { id: 'f', mode: 'flight', fromCity: 'H', toCity: 'B', departureAtUtc: iso(`${DAY}T10:30`), arrivalAtUtc: iso(`${DAY}T12:30`), costC: 80000 }, // only 30min < 180
      ]
    );
    const { valid, stats } = generateItineraries({ graph, originCity: 'A', destinationCity: 'B', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${NEXT}T06:00`) });
    expect(valid).toHaveLength(0);
    expect(stats.prunedReasons.insufficient_transfer_buffer).toBeGreaterThan(0);
  });

  it('9. flags an arrival after the deadline as invalid (not recommended, not dropped silently)', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.af }, { id: 'B', timezone: TZ.cgb }],
      [{ id: 'b', mode: 'bus', fromCity: 'A', toCity: 'B', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T21:00`), costC: 12000 }]
    );
    const { itineraries, valid } = generateItineraries({ graph, originCity: 'A', destinationCity: 'B', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${DAY}T18:00`) });
    expect(valid).toHaveLength(0);
    expect(itineraries).toHaveLength(1);
    expect(itineraries[0].feasibilityStatus).toBe('invalid');
    expect(itineraries[0].feasibilityReasons).toContain('misses_arrival_deadline');
  });

  it('15. returns nothing when the destination is unreachable', () => {
    const graph = graphOf(
      [{ id: 'A', timezone: TZ.af }, { id: 'B', timezone: TZ.cgb }, { id: 'C', timezone: TZ.bel }],
      [{ id: 'b', mode: 'bus', fromCity: 'A', toCity: 'B', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T12:00`), costC: 12000 }]
    );
    const { itineraries, valid } = generateItineraries({ graph, originCity: 'A', destinationCity: 'C', earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`${NEXT}T06:00`) });
    expect(itineraries).toHaveLength(0);
    expect(valid).toHaveLength(0);
  });
});

describe('ItineraryGenerator — Pareto (§11)', () => {
  it('13. keeps non-dominated and drops a dominated option', () => {
    const a = { totalMobilizationCostC: 100, durationMinutes: 600, connectionCount: 1 }; // cheap, slow
    const b = { totalMobilizationCostC: 200, durationMinutes: 300, connectionCount: 0 }; // pricey, fast
    const c = { totalMobilizationCostC: 250, durationMinutes: 700, connectionCount: 2 }; // dominated by a
    const front = paretoFrontier([a, b, c]);
    expect(front).toContain(a);
    expect(front).toContain(b);
    expect(front).not.toContain(c);
  });
});

describe('ItineraryGenerator — §34 Alta Floresta → Tucuruí (bus→bus→flight→bus)', () => {
  it('discovers the 4-leg multimodal chain with valid connections and full timeline', () => {
    const graph = graphOf(
      [
        { id: 'AF', city: 'Alta Floresta', timezone: TZ.af },
        { id: 'CGB', city: 'Cuiabá', timezone: TZ.cgb },
        { id: 'GYN', city: 'Goiânia', timezone: TZ.gyn },
        { id: 'BEL', city: 'Belém', timezone: TZ.bel },
        { id: 'TUC', city: 'Tucuruí', timezone: TZ.tuc },
      ],
      [
        { id: 'b1', mode: 'bus', fromCity: 'AF', toCity: 'CGB', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T21:00`), costC: 12000 },
        { id: 'b2', mode: 'bus', fromCity: 'CGB', toCity: 'GYN', departureAtUtc: iso(`${DAY}T23:00`), arrivalAtUtc: iso(`${NEXT}T08:30`), costC: 18000 },
        { id: 'f1', mode: 'flight', fromCity: 'GYN', toCity: 'BEL', departureAtUtc: iso(`${NEXT}T12:00`), arrivalAtUtc: iso(`${NEXT}T14:00`), costC: 90000 },
        { id: 'b3', mode: 'bus', fromCity: 'BEL', toCity: 'TUC', departureAtUtc: iso(`${NEXT}T16:00`), arrivalAtUtc: iso(`${NEXT}T22:00`), costC: 8000 },
      ]
    );

    const { valid, pareto } = generateItineraries({
      graph, originCity: 'AF', destinationCity: 'TUC',
      earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`2026-07-31T02:00`),
    });

    expect(valid).toHaveLength(1);
    const it = valid[0];
    expect(it.modeSequence).toEqual(['bus', 'bus', 'flight', 'bus']);
    expect(it.connectionCount).toBe(3);
    expect(it.modalChangeCount).toBe(2); // bus→flight and flight→bus
    expect(it.totalMobilizationCostC).toBe(128000); // 12000+18000+90000+8000
    expect(it.feasibilityStatus).toBe('valid');

    // Full door-to-door timeline: 4 scheduled legs + synthetic connection segments.
    const scheduled = it.segments.filter((s) => ['bus', 'flight'].includes(s.mode));
    expect(scheduled).toHaveLength(4);
    // Goiânia (bus→flight) and Belém (flight→bus) are terminal changes → transfers.
    expect(it.segments.filter((s) => s.mode === 'local_transfer')).toHaveLength(2);
    // Cuiabá bus→bus is same-terminal → waiting only, no transfer there.
    expect(it.segments.some((s) => s.mode === 'waiting')).toBe(true);
    expect(pareto).toHaveLength(1);
  });

  it('cannot form the chain when the Goiânia connection is too tight', () => {
    const graph = graphOf(
      [
        { id: 'AF', timezone: TZ.af }, { id: 'CGB', timezone: TZ.cgb },
        { id: 'GYN', timezone: TZ.gyn }, { id: 'BEL', timezone: TZ.bel }, { id: 'TUC', timezone: TZ.tuc },
      ],
      [
        { id: 'b1', mode: 'bus', fromCity: 'AF', toCity: 'CGB', departureAtUtc: iso(`${DAY}T09:00`), arrivalAtUtc: iso(`${DAY}T21:00`), costC: 12000 },
        { id: 'b2', mode: 'bus', fromCity: 'CGB', toCity: 'GYN', departureAtUtc: iso(`${DAY}T23:00`), arrivalAtUtc: iso(`${NEXT}T08:30`), costC: 18000 },
        { id: 'f1', mode: 'flight', fromCity: 'GYN', toCity: 'BEL', departureAtUtc: iso(`${NEXT}T09:00`), arrivalAtUtc: iso(`${NEXT}T11:00`), costC: 90000 }, // 30min after bus → infeasible
        { id: 'b3', mode: 'bus', fromCity: 'BEL', toCity: 'TUC', departureAtUtc: iso(`${NEXT}T16:00`), arrivalAtUtc: iso(`${NEXT}T22:00`), costC: 8000 },
      ]
    );
    const { valid } = generateItineraries({
      graph, originCity: 'AF', destinationCity: 'TUC',
      earliestDepartureUtc: iso(`${DAY}T06:00`), deadlineUtc: iso(`2026-07-31T02:00`),
    });
    expect(valid).toHaveLength(0);
  });
});
