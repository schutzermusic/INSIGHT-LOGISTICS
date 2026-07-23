import { describe, it, expect } from 'vitest';
import { recommend } from './RecommendationEngine.js';

// Mirrors the §20 example: flight+bus R$1.290 vs bus-only R$1.640,
// savings R$350, time saved 26h.
const flightBus = {
  id: 'flight-bus', modeSequence: ['flight', 'bus'],
  commercialCostC: 90000, laborCostC: 30000,
  totalMobilizationCostC: 129000, durationMinutes: 480, connectionCount: 1,
  feasibilityStatus: 'valid', feasibilityReasons: [],
};
const busOnly = {
  id: 'bus-only', modeSequence: ['bus'],
  commercialCostC: 40000, laborCostC: 110000,
  totalMobilizationCostC: 164000, durationMinutes: 2040, connectionCount: 0,
  feasibilityStatus: 'valid', feasibilityReasons: [],
};

describe('recommend', () => {
  it('recommends the lower TOTAL cost even though its ticket is pricier (§20)', () => {
    const { recommended, reasonCodes, explanation } = recommend({ itineraries: [flightBus, busOnly] });
    expect(recommended.id).toBe('flight-bus');
    expect(reasonCodes).toContain('lowest_total_cost');
    expect(reasonCodes).toContain('cheaper_ticket_higher_total');
    expect(explanation.savingsC).toBe(35000); // R$1.640 − R$1.290 = R$350
    expect(explanation.timeSavedMinutes).toBe(1560); // 26h
    const text = explanation.paragraphs.join(' ');
    expect(text).toContain('R$ 350,00'); // exact figure, deterministic
    expect(text).toContain('26h');
  });

  it('excludes invalid (deadline-missing) itineraries from recommendation', () => {
    const invalid = { ...busOnly, id: 'invalid', feasibilityStatus: 'invalid', feasibilityReasons: ['misses_arrival_deadline'] };
    const { recommended } = recommend({ itineraries: [invalid, flightBus] });
    expect(recommended.id).toBe('flight-bus');
  });

  it('returns no recommendation when nothing is valid, distinguishing deadline misses', () => {
    const invalid = { ...busOnly, feasibilityStatus: 'invalid', feasibilityReasons: ['misses_arrival_deadline'] };
    const res = recommend({ itineraries: [invalid] });
    expect(res.recommended).toBeNull();
    expect(res.reasonCodes).toContain('no_option_before_deadline');
  });

  it('ranks by total cost ascending with a display score', () => {
    const { ranked } = recommend({ itineraries: [busOnly, flightBus] });
    expect(ranked.map((r) => r.id)).toEqual(['flight-bus', 'bus-only']);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
