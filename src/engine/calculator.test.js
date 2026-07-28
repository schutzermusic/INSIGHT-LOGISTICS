import { describe, expect, it } from 'vitest';
import {
  calcHourlyRates,
  calcTechnicalHourlyRateC,
  ENCARGOS_TRABALHISTAS_PERCENTUAL,
} from './calculator.js';

describe('calcHourlyRates — encargos da hora técnica', () => {
  it('adiciona 70% à hora normal quando não há valor técnico informado', () => {
    const rates = calcHourlyRates({ salarioBase: 2200, cargaHoraria: 220 });

    expect(ENCARGOS_TRABALHISTAS_PERCENTUAL).toBe(70);
    expect(rates.horaTecnicaBase).toBe(10);
    expect(rates.horaTecnica).toBe(17);
    expect(rates.encargosTrabalhistasPercentual).toBe(70);
  });

  it('adiciona 70% ao valor-base da hora técnica informado no cadastro', () => {
    const rates = calcHourlyRates({
      salarioBase: 2200,
      cargaHoraria: 220,
      valorHoraTecnica: 50,
    });

    expect(rates.horaTecnicaBase).toBe(50);
    expect(rates.horaTecnica).toBe(85);
    expect(calcTechnicalHourlyRateC({
      salarioBase: 2200,
      cargaHoraria: 220,
      valorHoraTecnica: 50,
    })).toBe(8500);
  });
});
