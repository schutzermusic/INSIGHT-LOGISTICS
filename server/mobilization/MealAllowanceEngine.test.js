import { describe, expect, it } from 'vitest';
import { calculateMealAllowances } from './MealAllowanceEngine.js';

const segment = (overrides = {}) => ({
  id: 's',
  mode: 'bus',
  departureAtUtc: '2026-01-07T08:00:00Z',
  arrivalAtUtc: '2026-01-07T12:00:00Z',
  originTimezone: 'America/Sao_Paulo',
  passengerIds: ['standard', 'leader'],
  ...overrides,
});

describe('MealAllowanceEngine', () => {
  it('uses explicit categories and deduplicates several segments on one local day', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [
          segment(),
          segment({ id: 'wait', mode: 'waiting', departureAtUtc: '2026-01-07T12:00:00Z', arrivalAtUtc: '2026-01-07T18:00:00Z' }),
        ],
      },
      employees: [
        { id: 'standard', name: 'Ana', allowanceCategory: 'standard' },
        { id: 'leader', name: 'Bia', allowanceCategory: 'leader' },
      ],
    });
    expect(result.byEmployee[0]).toMatchObject({ category: 'standard', quantity: 0.5, unitValueC: 9000, totalC: 4500 });
    expect(result.byEmployee[1]).toMatchObject({ category: 'leader', quantity: 0.5, unitValueC: 12000, totalC: 6000 });
  });

  it('counts travel, connection waiting and hotel away from base on distinct local dates per employee', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [
          segment(),
          segment({
            id: 'hotel',
            mode: 'hotel_rest',
            departureAtUtc: '2026-01-08T02:00:00Z',
            arrivalAtUtc: '2026-01-09T10:00:00Z',
          }),
        ],
      },
      employees: [{ id: 'standard', name: 'Ana', allowanceCategory: 'standard' }],
    });
    expect(result.byEmployee[0].eligibleDates).toEqual(['2026-01-08', '2026-01-09']);
    expect(result.byEmployee[0].quantity).toBe(1.5);
  });

  it('calculates independently when employees travel on different segments', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [
          segment({ arrivalAtUtc: '2026-01-07T16:00:00Z', passengerIds: ['standard'] }),
          segment({
            id: 'later',
            departureAtUtc: '2026-01-08T08:00:00Z',
            arrivalAtUtc: '2026-01-08T16:00:00Z',
            passengerIds: ['leader'],
          }),
        ],
      },
      employees: [
        { id: 'standard', allowanceCategory: 'standard' },
        { id: 'leader', allowanceCategory: 'leader' },
      ],
    });
    expect(result.byEmployee[0].eligibleDates).toEqual(['2026-01-07']);
    expect(result.byEmployee[1].eligibleDates).toEqual(['2026-01-08']);
  });

  it('fills every local mobilization day between outbound and return per employee', () => {
    const result = calculateMealAllowances({
      itinerary: {
        tripType: 'roundtrip',
        segments: [
          segment({
            direction: 'outbound',
            passengerIds: ['standard'],
            departureAtUtc: '2026-01-07T08:00:00Z',
            arrivalAtUtc: '2026-01-07T12:00:00Z',
          }),
          segment({
            id: 'return',
            direction: 'return',
            passengerIds: ['standard'],
            departureAtUtc: '2026-01-10T08:00:00Z',
            arrivalAtUtc: '2026-01-10T12:00:00Z',
          }),
        ],
      },
      employees: [{ id: 'standard', name: 'Ana', allowanceCategory: 'standard' }],
    });

    expect(result.byEmployee[0].eligibleDates).toEqual(['2026-01-08', '2026-01-09']);
    expect(result.byEmployee[0]).toMatchObject({
      quantity: 2,
      unitValueC: 9000,
      totalC: 18000,
    });
  });

  it('does not pay an allowance when the employee arrives during the early morning', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [segment({
          departureAtUtc: '2026-01-06T20:00:00Z',
          arrivalAtUtc: '2026-01-07T05:00:00Z',
          originTimezone: 'UTC',
        })],
      },
      employees: [{ id: 'standard', allowanceCategory: 'standard' }],
    });

    expect(result.byEmployee[0].quantity).toBe(0);
    expect(result.byEmployee[0].totalC).toBe(0);
    expect(result.byEmployee[0].lines.find((line) => line.eligibleDate === '2026-01-07'))
      .toMatchObject({ coverageMinutes: 300, allowanceType: 'none', totalC: 0 });
  });

  it('pays half a standard allowance when arrival is around the middle of the day', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [segment({
          departureAtUtc: '2026-01-06T20:00:00Z',
          arrivalAtUtc: '2026-01-07T12:00:00Z',
          originTimezone: 'UTC',
        })],
      },
      employees: [{ id: 'standard', allowanceCategory: 'standard' }],
    });

    expect(result.byEmployee[0]).toMatchObject({ quantity: 0.5, totalC: 4500 });
    expect(result.byEmployee[0].lines.find((line) => line.eligibleDate === '2026-01-07'))
      .toMatchObject({ coverageMinutes: 720, allowanceType: 'half', totalC: 4500 });
  });

  it('pays a full allowance only for a substantially complete local day away', () => {
    const result = calculateMealAllowances({
      itinerary: {
        segments: [segment({
          departureAtUtc: '2026-01-07T00:00:00Z',
          arrivalAtUtc: '2026-01-08T00:00:00Z',
          originTimezone: 'UTC',
        })],
      },
      employees: [{ id: 'standard', allowanceCategory: 'standard' }],
    });

    expect(result.byEmployee[0]).toMatchObject({ quantity: 1, totalC: 9000 });
  });
});
