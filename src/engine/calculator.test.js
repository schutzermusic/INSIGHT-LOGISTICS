import { describe, expect, it } from 'vitest';
import {
  calcHourlyRates,
  calcTechnicalHourlyRateC,
  ENCARGOS_TRABALHISTAS_PERCENTUAL,
} from './calculator.js';

describe('calcHourlyRates — hora técnica padrão', () => {
  it('usa a hora normal sem acréscimo quando não há valor técnico informado', () => {
    const rates = calcHourlyRates({ salarioBase: 2200, cargaHoraria: 220 });

    expect(ENCARGOS_TRABALHISTAS_PERCENTUAL).toBe(0);
    expect(rates.horaTecnicaBase).toBe(10);
    expect(rates.horaTecnica).toBe(10);
    expect(rates.encargosTrabalhistasPercentual).toBe(0);
  });

  it('preserva o valor-base da hora técnica informado no cadastro', () => {
    const rates = calcHourlyRates({
      salarioBase: 2200,
      cargaHoraria: 220,
      valorHoraTecnica: 50,
    });

    expect(rates.horaTecnicaBase).toBe(50);
    expect(rates.horaTecnica).toBe(50);
    expect(calcTechnicalHourlyRateC({
      salarioBase: 2200,
      cargaHoraria: 220,
      valorHoraTecnica: 50,
    })).toBe(5000);
  });
});
