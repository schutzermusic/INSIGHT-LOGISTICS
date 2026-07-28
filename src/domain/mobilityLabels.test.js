import { describe, expect, it } from 'vitest';
import { formatMobilitySequence, mobilityModeLabel } from './mobilityLabels.js';

describe('mobilityLabels', () => {
  it('translates stored English mode sequences for the History screen', () => {
    expect(formatMobilitySequence('bus + waiting + bus + wating'))
      .toBe('Ônibus + Espera + Ônibus + Espera');
    expect(formatMobilitySequence(['flight', 'local_transfer', 'hotel_rest']))
      .toBe('Voo + Transfer + Hotel / Descanso');
  });

  it('preserves labels that are already in Portuguese', () => {
    expect(mobilityModeLabel('Veículo locado')).toBe('Veículo locado');
  });
});
