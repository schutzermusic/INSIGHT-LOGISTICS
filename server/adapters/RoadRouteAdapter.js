/**
 * RoadRouteAdapter (§17) — wraps Google Routes v2 behind the RoadRouteProvider
 * contract. Used by the graph builder to price/duration road edges and tolls.
 * HTTP is injected (`fetchRaw`).
 *
 * @module server/adapters/RoadRouteAdapter
 */

import { normalizeGoogleRoute } from './normalizers.js';

/**
 * @param {object} deps
 * @param {(input: import('./contracts.js').RoadRouteInput) => Promise<object>} deps.fetchRaw
 *        Returns the raw Google Routes v2 result ({ success, routes, tollCostBRL }).
 * @param {string} [deps.providerId]
 * @returns {import('./contracts.js').RoadRouteProvider}
 */
export function createRoadRouteAdapter({ fetchRaw, providerId = 'google_routes' }) {
  if (typeof fetchRaw !== 'function') {
    throw new Error('createRoadRouteAdapter: fetchRaw is required');
  }
  return {
    providerId,
    async calculate(input) {
      const raw = await fetchRaw(input);
      return normalizeGoogleRoute(raw);
    },
  };
}
