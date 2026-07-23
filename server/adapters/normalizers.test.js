import { describe, it, expect } from 'vitest';
import { normalizeSerpFlights, normalizeQueroBusTrips, normalizeGoogleRoute } from './normalizers.js';

describe('normalizeSerpFlights', () => {
  const serp = {
    best_flights: [{
      price: 512.9,
      total_duration: 145,
      booking_token: 'tok-1',
      flights: [
        { departure_airport: { id: 'CGB', time: '2026-01-07 08:00' }, arrival_airport: { id: 'BEL', time: '2026-01-07 10:25' }, airline: 'LATAM', duration: 145 },
      ],
      layovers: [],
      carbon_emissions: { this_flight: 90000 },
    }],
    other_flights: [{
      price: 480,
      total_duration: 200,
      flights: [
        { departure_airport: { id: 'CGB', time: '2026-01-07 06:00' }, arrival_airport: { id: 'BSB', time: '2026-01-07 07:30' }, airline: 'GOL', duration: 90 },
        { departure_airport: { id: 'BSB', time: '2026-01-07 08:30' }, arrival_airport: { id: 'BEL', time: '2026-01-07 09:20' }, airline: 'GOL', duration: 50 },
      ],
    }],
  };

  it('normalizes priced flights to centavos with stops and airlines', () => {
    const opts = normalizeSerpFlights(serp, { capturedAtUtc: '2026-07-22T00:00:00Z' });
    expect(opts).toHaveLength(2);
    const [direct, oneStop] = opts;
    expect(direct.mode).toBe('flight');
    expect(direct.commercialCostC).toBe(51290);
    expect(direct.originLocationId).toBe('CGB');
    expect(direct.destinationLocationId).toBe('BEL');
    expect(direct.raw.stops).toBe(0);
    expect(direct.raw.airlines).toEqual(['LATAM']);
    expect(direct.estimated).toBe(false);
    expect(direct.priceFreshnessAtUtc).toBe('2026-07-22T00:00:00Z');

    expect(oneStop.commercialCostC).toBe(48000);
    expect(oneStop.raw.stops).toBe(1);
    expect(oneStop.destinationLocationId).toBe('BEL');
  });

  it('skips options with no price or no legs', () => {
    expect(normalizeSerpFlights({ best_flights: [{ flights: [] }, { price: 10 }] })).toEqual([]);
    expect(normalizeSerpFlights({})).toEqual([]);
  });
});

describe('normalizeQueroBusTrips', () => {
  const trips = [
    {
      id: 987, price: { price: 189.9 }, travelDuration: 43200, // 12h
      from: { name: 'Cuiabá' }, to: { name: 'Goiânia' },
      company: { name: 'Viação X' }, seatClass: 'Leito', availableSeats: 12,
      departure: { date: '2026-01-07', time: '20:00:00' }, arrival: { date: '2026-01-08', time: '08:00:00' },
      allowCanceling: true,
    },
    {
      id: 5, price: { price: 90 }, travelDuration: 21600, // 6h
      from: { name: 'A' }, to: { name: 'B' }, company: { name: 'Y' }, availableSeats: 0,
      connection: { node: { name: 'Hub' } },
    },
    { id: 1, /* no price */ from: { name: 'X' } },
  ];

  it('normalizes trips to centavos, minutes, seats and connection info', () => {
    const opts = normalizeQueroBusTrips(trips, { capturedAtUtc: '2026-07-22T00:00:00Z' });
    expect(opts).toHaveLength(2); // no-price trip dropped
    const [a, b] = opts;
    expect(a.mode).toBe('bus');
    expect(a.commercialCostC).toBe(18990);
    expect(a.durationMinutes).toBe(720);
    expect(a.availabilityStatus).toBe('available');
    expect(a.raw.seatClass).toBe('Leito');
    expect(a.raw.purchaseUrl).toContain('travelId=987');

    expect(b.availabilityStatus).toBe('sold_out');
    expect(b.raw.connection).toBe('Hub');
    expect(b.raw.connectionCount).toBe(1);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeQueroBusTrips(null)).toEqual([]);
  });
});

describe('normalizeGoogleRoute', () => {
  it('extracts distance, duration minutes and toll centavos', () => {
    const r = normalizeGoogleRoute({ success: true, routes: [{ distanceKm: 420, duration: '18000s' }], tollCostBRL: 34.5 });
    expect(r.distanceKm).toBe(420);
    expect(r.durationMinutes).toBe(300);
    expect(r.tollCostC).toBe(3450);
    expect(r.tollsAvailable).toBe(true);
  });

  it('marks tolls unavailable when Google returns no BRL price', () => {
    const r = normalizeGoogleRoute({ success: true, routes: [{ distanceKm: 100, duration: '3600s' }] });
    expect(r.tollsAvailable).toBe(false);
    expect(r.tollCostC).toBeUndefined();
  });

  it('throws when there is no usable route', () => {
    expect(() => normalizeGoogleRoute({ success: false })).toThrow();
  });
});
