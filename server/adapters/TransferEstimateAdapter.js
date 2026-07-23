/**
 * TransferEstimateAdapter (§17) — ESTIMATED provider for short local transfers
 * (city↔airport/terminal, hotel, worksite). Flagged `estimated: true`. Used by
 * the graph builder to price/duration transfer edges (§13). Distance supplied by
 * the caller (from geo data or a RoadRouteProvider).
 *
 * @module server/adapters/TransferEstimateAdapter
 */

import { addC, mulC } from '../../src/domain/money.js';

const DEFAULT_ASSUMPTIONS = {
  avgSpeedKmh: 45,      // urban transfer average
  baseFareC: 1000,      // R$10,00 flag fall
  perKmC: 250,          // R$2,50/km
};

/**
 * @param {object} [deps]
 * @param {object} [deps.assumptions]
 * @param {string} [deps.providerId]
 * @returns {import('./contracts.js').TransferEstimateProvider}
 */
export function createTransferEstimateAdapter({ assumptions = {}, providerId = 'transfer_estimate' } = {}) {
  const cfg = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  return {
    providerId,
    async estimate(input) {
      const distanceKm = Number(input?.distanceKm);
      if (!Number.isFinite(distanceKm) || distanceKm < 0) {
        throw new Error('transfer estimate requires a non-negative distanceKm');
      }
      const durationMinutes = Math.max(1, Math.round((distanceKm / cfg.avgSpeedKmh) * 60));
      const costC = addC(cfg.baseFareC, mulC(cfg.perKmC, distanceKm));
      return { durationMinutes, costC, estimated: true };
    },
  };
}
