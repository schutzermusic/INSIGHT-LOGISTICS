/**
 * BusAdapter (§17) — wraps the Quero Passagem integration behind the
 * BusSearchProvider contract. Region coverage varies by provider, so multiple
 * bus adapters can be registered; the orchestrator merges their options.
 * HTTP is injected (`fetchRaw`) for testability.
 *
 * @module server/adapters/BusAdapter
 */

import { normalizeQueroBusTrips } from './normalizers.js';
import { ok, fail } from './adapterUtil.js';

/**
 * @param {object} deps
 * @param {(input: import('./contracts.js').BusSearchInput) => Promise<object[]>} deps.fetchRaw
 *        Returns the raw trips array from the bus provider search.
 * @param {(trips: object[], opts: object) => import('../../src/domain/types.js').NormalizedOption[]} [deps.normalize]
 * @param {string} [deps.providerId]
 * @returns {import('./contracts.js').BusSearchProvider}
 */
export function createBusAdapter({ fetchRaw, normalize = normalizeQueroBusTrips, providerId = 'quero_passagem' }) {
  if (typeof fetchRaw !== 'function') {
    throw new Error('createBusAdapter: fetchRaw is required');
  }
  return {
    providerId,
    async search(input) {
      const requestedAtUtc = new Date().toISOString();
      try {
        const trips = await fetchRaw(input);
        const options = normalize(trips, { providerId });
        return ok(providerId, options, { requestedAtUtc, searchParams: input, partial: options.length === 0 });
      } catch (err) {
        return fail(providerId, err.message || 'bus provider error', { requestedAtUtc, searchParams: input });
      }
    },
  };
}
