/**
 * RentalCarAdapter (§17) — ESTIMATED provider (§6/§32: estimated, never a silent
 * mock — every option is flagged `estimated: true`). Prices a rental leg from a
 * distance + configurable vehicle assumptions (fuel, rental daily). Distance and
 * duration are supplied by the graph builder (from a RoadRouteProvider), keeping
 * this adapter decoupled from any mapping API.
 *
 * @module server/adapters/RentalCarAdapter
 */

import { addC, mulC } from '../../src/domain/money.js';
import { ok, fail } from './adapterUtil.js';

const DEFAULT_ASSUMPTIONS = {
  fuelConsumptionKmPerL: 10,
  fuelPricePerLiterC: 589, // R$5,89
  rentalPerDayC: 18000,    // R$180,00
  maxHoursPerDay: 10,
};

/**
 * @param {object} [deps]
 * @param {object} [deps.assumptions] — overrides DEFAULT_ASSUMPTIONS (from vehicle_assumptions/fuel_prices config)
 * @param {string} [deps.providerId]
 * @returns {import('./contracts.js').RentalCarProvider}
 */
export function createRentalCarAdapter({ assumptions = {}, providerId = 'rental_estimate' } = {}) {
  const cfg = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  return {
    providerId,
    async search(input) {
      const requestedAtUtc = new Date().toISOString();
      const distanceKm = Number(input?.distanceKm);
      const durationMinutes = Number(input?.durationMinutes) || 0;
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        return fail(providerId, 'rental estimate requires a positive distanceKm', { requestedAtUtc, searchParams: input });
      }

      const fuelCostC = mulC(cfg.fuelPricePerLiterC, distanceKm / cfg.fuelConsumptionKmPerL);
      const days = Math.max(1, Math.ceil(durationMinutes / 60 / cfg.maxHoursPerDay));
      const rentalCostC = cfg.rentalPerDayC * days;
      const totalC = addC(fuelCostC, rentalCostC);

      /** @type {import('../../src/domain/types.js').NormalizedOption} */
      const option = {
        mode: 'rental_car',
        providerId,
        providerReference: null,
        originLocationId: input.pickupLocationId || '',
        destinationLocationId: input.dropoffLocationId || '',
        departureAtUtc: input.pickupAtUtc,
        arrivalAtUtc: undefined,
        durationMinutes,
        commercialCostC: totalC,
        currency: 'BRL',
        availabilityStatus: 'available',
        estimated: true,
        priceFreshnessAtUtc: requestedAtUtc,
        raw: { distanceKm, fuelCostC, rentalCostC, days, vehicleCategory: input.vehicleCategory || null, assumptions: cfg },
      };
      return ok(providerId, [option], { requestedAtUtc, searchParams: input });
    },
  };
}
