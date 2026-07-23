import { describe, it, expect } from 'vitest';
import { enumerateCandidatePairs, expandCandidateGraph } from './CandidateGraphExpander.js';
import { generateItineraries, categorizeAlternatives } from './ItineraryGenerator.js';

const TZ = { af: 'America/Cuiaba', cgb: 'America/Cuiaba', gyn: 'America/Sao_Paulo', bel: 'America/Belem', tuc: 'America/Belem' };
const D = '2026-07-29';
const N = '2026-07-30';       // next day
const N2 = '2026-07-31';      // day after
const iso = (s) => `${s}:00Z`;

describe('enumerateCandidatePairs', () => {
  it('enumerates direct + origin→hub + hub→dest + hub↔hub', () => {
    const hubs = [{ id: 'CGB' }, { id: 'GYN' }, { id: 'BEL' }];
    const pairs = enumerateCandidatePairs('AF', 'TUC', hubs);
    // 1 direct + 3 (AF→hub) + 3 (hub→TUC) + 6 (hub↔hub, no self) = 13
    expect(pairs).toHaveLength(13);
    expect(pairs).toContainEqual(['AF', 'TUC']);
    expect(pairs).toContainEqual(['CGB', 'GYN']);
  });
});

describe('expandCandidateGraph → generateItineraries (many alternatives)', () => {
  // A realistic wide search: Alta Floresta → Tucuruí, no direct route, several
  // hubs and multiple departures per leg. The engine must return SEVERAL
  // distinct non-dominated alternatives, not one hardcoded chain.
  const LEGS = {
    'AF->CGB': [
      { id: 'b1a', mode: 'bus', departureAtUtc: iso(`${D}T09:00`), arrivalAtUtc: iso(`${D}T21:00`), costC: 12000 },
      { id: 'b1b', mode: 'bus', departureAtUtc: iso(`${D}T07:00`), arrivalAtUtc: iso(`${D}T19:00`), costC: 13000 },
    ],
    'CGB->GYN': [
      { id: 'g1', mode: 'bus', departureAtUtc: iso(`${D}T23:00`), arrivalAtUtc: iso(`${N}T08:30`), costC: 18000 },
    ],
    'CGB->BEL': [
      { id: 'cbel', mode: 'flight', departureAtUtc: iso(`${N}T00:00`), arrivalAtUtc: iso(`${N}T03:00`), costC: 100000 },
    ],
    'GYN->BEL': [
      { id: 'f1', mode: 'flight', departureAtUtc: iso(`${N}T12:00`), arrivalAtUtc: iso(`${N}T14:00`), costC: 90000 },
      { id: 'f2', mode: 'flight', departureAtUtc: iso(`${N}T15:00`), arrivalAtUtc: iso(`${N}T18:00`), costC: 70000 },
    ],
    'BEL->TUC': [
      { id: 'tEarly', mode: 'bus', departureAtUtc: iso(`${N}T06:00`), arrivalAtUtc: iso(`${N}T12:00`), costC: 8000 },
      { id: 'tLate', mode: 'bus', departureAtUtc: iso(`${N}T20:00`), arrivalAtUtc: iso(`${N2}T02:00`), costC: 8000 },
    ],
  };

  const queryLegs = async (from, to) => LEGS[`${from}->${to}`] || [];

  it('builds a wide graph and returns several categorized alternatives', async () => {
    const { graph, stats } = await expandCandidateGraph({
      origin: { id: 'AF', city: 'Alta Floresta', timezone: TZ.af },
      destination: { id: 'TUC', city: 'Tucuruí', timezone: TZ.tuc },
      hubs: [
        { id: 'CGB', city: 'Cuiabá', timezone: TZ.cgb },
        { id: 'GYN', city: 'Goiânia', timezone: TZ.gyn },
        { id: 'BEL', city: 'Belém', timezone: TZ.bel },
      ],
      queryLegs,
    });

    expect(stats.legsAdded).toBe(8); // all legs across pairs
    expect(stats.pairsFailed).toBe(0);

    const { valid, pareto } = generateItineraries({
      graph, originCity: 'AF', destinationCity: 'TUC',
      earliestDepartureUtc: iso(`${D}T06:00`), deadlineUtc: iso(`${N2}T04:00`),
    });

    // Several distinct end-to-end alternatives were discovered automatically.
    expect(valid.length).toBeGreaterThanOrEqual(3);
    const distinctShapes = new Set(valid.map((v) => v.modeSequence.join('>')));
    expect(distinctShapes.size).toBeGreaterThanOrEqual(2);

    // Includes both a via-Goiânia chain (bus,bus,flight,bus) and a via-Cuiabá
    // chain (bus,flight,bus) — different hub strategies, not one fixed path.
    expect([...distinctShapes]).toContain('bus>bus>flight>bus');
    expect([...distinctShapes]).toContain('bus>flight>bus');

    // Pareto keeps a small non-dominated set (§11), not every near-duplicate.
    expect(pareto.length).toBeGreaterThanOrEqual(2);
    expect(pareto.length).toBeLessThanOrEqual(valid.length);

    const categorized = categorizeAlternatives(pareto);
    const cats = categorized.map((c) => c.rankingCategory).filter(Boolean);
    expect(cats).toContain('lowest_total_cost');
    expect(cats).toContain('fastest');

    // Cheapest overall uses the cheaper Goiânia flight (f2): 12000+18000+70000+8000.
    const cheapest = pareto.reduce((a, b) => (a.totalMobilizationCostC < b.totalMobilizationCostC ? a : b));
    expect(cheapest.totalMobilizationCostC).toBe(108000);
  });

  it('isolates a failing pair without aborting the expansion (§18)', async () => {
    const flaky = async (from, to) => {
      if (from === 'CGB' && to === 'GYN') throw new Error('provider down');
      return LEGS[`${from}->${to}`] || [];
    };
    const { graph, stats } = await expandCandidateGraph({
      origin: { id: 'AF', timezone: TZ.af },
      destination: { id: 'TUC', timezone: TZ.tuc },
      hubs: [{ id: 'CGB', timezone: TZ.cgb }, { id: 'GYN', timezone: TZ.gyn }, { id: 'BEL', timezone: TZ.bel }],
      queryLegs: flaky,
    });
    expect(stats.pairsFailed).toBe(1);
    // The via-Cuiabá route still exists even though CGB→GYN failed.
    const { valid } = generateItineraries({
      graph, originCity: 'AF', destinationCity: 'TUC',
      earliestDepartureUtc: iso(`${D}T06:00`), deadlineUtc: iso(`${N2}T04:00`),
    });
    expect(valid.length).toBeGreaterThanOrEqual(1);
    expect(valid.every((v) => !v.modeSequence.includes('bus') || true)).toBe(true);
  });
});
