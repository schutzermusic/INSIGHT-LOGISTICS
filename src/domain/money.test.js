import { describe, it, expect } from 'vitest';
import {
  toCentavos,
  fromCentavos,
  addC,
  subC,
  mulC,
  costForMinutes,
  formatBRL,
} from './money.js';

describe('toCentavos', () => {
  it('converts whole and fractional BRL to integer centavos', () => {
    expect(toCentavos(0)).toBe(0);
    expect(toCentavos(1)).toBe(100);
    expect(toCentavos(1290)).toBe(129000);
    expect(toCentavos(12.34)).toBe(1234);
  });

  it('rounds half away from zero and avoids float drift', () => {
    expect(toCentavos(1.005)).toBe(101); // classic float trap: 1.005*100 = 100.4999…
    expect(toCentavos(2.675)).toBe(268);
    expect(toCentavos(-1.005)).toBe(-101);
  });

  it('accepts numeric strings', () => {
    expect(toCentavos('5.50')).toBe(550);
  });

  it('normalizes negative zero to 0', () => {
    expect(Object.is(toCentavos(-0), 0)).toBe(true);
  });

  it('throws on non-finite input', () => {
    expect(() => toCentavos(NaN)).toThrow();
    expect(() => toCentavos(Infinity)).toThrow();
  });
});

describe('fromCentavos', () => {
  it('is the inverse of toCentavos for exact cents', () => {
    expect(fromCentavos(129000)).toBe(1290);
    expect(fromCentavos(1234)).toBe(12.34);
  });

  it('throws on non-integer input', () => {
    expect(() => fromCentavos(12.5)).toThrow();
  });
});

describe('addC / subC', () => {
  it('adds any number of centavos operands', () => {
    expect(addC()).toBe(0);
    expect(addC(100, 250, 50)).toBe(400);
  });

  it('subtracts', () => {
    expect(subC(164000, 129000)).toBe(35000); // R$1.640 - R$1.290 = R$350 (spec §20 example)
  });

  it('rejects non-integer operands (guards against stray floats)', () => {
    expect(() => addC(100, 2.5)).toThrow();
    expect(() => subC(1.1, 1)).toThrow();
  });
});

describe('mulC', () => {
  it('applies fractional factors and rounds to whole centavos', () => {
    expect(mulC(1000, 1.5)).toBe(1500); // HE 50%
    expect(mulC(1000, 2.5)).toBe(2500); // Sunday
    expect(mulC(333, 1.2)).toBe(400); // 399.6 → 400 (night premium, rounded)
  });

  it('handles zero and negative factors', () => {
    expect(mulC(1000, 0)).toBe(0);
    expect(mulC(1000, -1)).toBe(-1000);
  });

  it('throws on non-finite factor', () => {
    expect(() => mulC(1000, NaN)).toThrow();
  });
});

describe('costForMinutes', () => {
  it('prorates an hourly rate across minutes', () => {
    expect(costForMinutes(6000, 60)).toBe(6000); // 1h at R$60/h
    expect(costForMinutes(6000, 30)).toBe(3000); // 30min
    expect(costForMinutes(6000, 90)).toBe(9000); // 1h30
  });

  it('rounds fractional-minute results to whole centavos', () => {
    expect(costForMinutes(6000, 20)).toBe(2000); // 60000*20/60 = 20000? no: 6000*0.333=2000
    expect(costForMinutes(5500, 10)).toBe(917); // 5500 * (10/60) = 916.66… → 917
  });

  it('throws on negative minutes', () => {
    expect(() => costForMinutes(6000, -1)).toThrow();
  });
});

describe('formatBRL', () => {
  it('formats centavos as a pt-BR currency string', () => {
    // Non-breaking space is used by Intl between symbol and number.
    expect(formatBRL(129000).replace(/ /g, ' ')).toBe('R$ 1.290,00');
    expect(formatBRL(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });

  it('throws on non-integer input', () => {
    expect(() => formatBRL(12.5)).toThrow();
  });
});
