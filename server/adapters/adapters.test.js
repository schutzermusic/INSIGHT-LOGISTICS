import { describe, it, expect } from 'vitest';
import { assertAdapter } from './contracts.js';
import { createFlightAdapter } from './FlightAdapter.js';
import { createBusAdapter } from './BusAdapter.js';
import { createRoadRouteAdapter } from './RoadRouteAdapter.js';
import { createRentalCarAdapter } from './RentalCarAdapter.js';
import { createTransferEstimateAdapter } from './TransferEstimateAdapter.js';

describe('adapters satisfy their contracts', () => {
  it('flight/bus/rental are search adapters; road=calculate; transfer=estimate', () => {
    expect(() => assertAdapter('flight', createFlightAdapter({ fetchRaw: async () => ({}) }))).not.toThrow();
    expect(() => assertAdapter('bus', createBusAdapter({ fetchRaw: async () => [] }))).not.toThrow();
    expect(() => assertAdapter('rental_car', createRentalCarAdapter())).not.toThrow();
    expect(() => assertAdapter('road_route', createRoadRouteAdapter({ fetchRaw: async () => ({}) }))).not.toThrow();
    expect(() => assertAdapter('transfer', createTransferEstimateAdapter())).not.toThrow();
  });
});

describe('FlightAdapter', () => {
  it('normalizes a raw SerpAPI payload into an AdapterResult', async () => {
    const adapter = createFlightAdapter({
      fetchRaw: async () => ({ best_flights: [{ price: 500, total_duration: 120, flights: [{ departure_airport: { id: 'CGB' }, arrival_airport: { id: 'BEL' }, airline: 'GOL', duration: 120 }] }] }),
    });
    const res = await adapter.search({ originCity: 'Cuiabá - MT', destinationCity: 'Belém - PA' });
    expect(res.success).toBe(true);
    expect(res.options[0].commercialCostC).toBe(50000);
    expect(res.meta.providerId).toBe('serpapi_google_flights');
  });

  it('isolates provider errors into a failed result (never throws)', async () => {
    const adapter = createFlightAdapter({ fetchRaw: async () => { throw new Error('boom'); } });
    const res = await adapter.search({});
    expect(res.success).toBe(false);
    expect(res.meta.errors[0]).toBe('boom');
  });
});

describe('RentalCarAdapter (estimated)', () => {
  it('estimates cost from distance and flags estimated=true', async () => {
    const adapter = createRentalCarAdapter();
    const res = await adapter.search({ pickupLocationId: 'AP', dropoffLocationId: 'CITY', distanceKm: 100, durationMinutes: 90 });
    expect(res.success).toBe(true);
    const opt = res.options[0];
    expect(opt.mode).toBe('rental_car');
    expect(opt.estimated).toBe(true);
    // fuel: 589 c/L × (100/10 L) = 5890; rental: 1 day × 18000 = 18000 → 23890
    expect(opt.commercialCostC).toBe(23890);
  });

  it('fails cleanly without a distance', async () => {
    const res = await createRentalCarAdapter().search({});
    expect(res.success).toBe(false);
  });
});

describe('TransferEstimateAdapter (estimated)', () => {
  it('estimates duration and cost from distance', async () => {
    const est = await createTransferEstimateAdapter().estimate({ fromLocationId: 'A', toLocationId: 'B', distanceKm: 30 });
    expect(est.estimated).toBe(true);
    expect(est.durationMinutes).toBe(40); // 30km / 45kmh × 60
    expect(est.costC).toBe(1000 + 250 * 30); // base + perKm
  });
});
