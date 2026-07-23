/**
 * FlightAdapter (§17) — wraps the existing Google Flights (SerpAPI) integration
 * behind the FlightSearchProvider contract. HTTP is injected (`fetchRaw`) so the
 * adapter is testable without network and reuses the existing fetch path.
 *
 * @module server/adapters/FlightAdapter
 */

import { normalizeSerpFlights } from './normalizers.js';
import { ok, fail } from './adapterUtil.js';

/**
 * @param {object} deps
 * @param {(input: import('./contracts.js').FlightSearchInput) => Promise<object>} deps.fetchRaw
 *        Returns the raw SerpAPI response (best_flights/other_flights).
 * @param {string} [deps.providerId]
 * @returns {import('./contracts.js').FlightSearchProvider}
 */
export function createFlightAdapter({ fetchRaw, providerId = 'serpapi_google_flights' }) {
  if (typeof fetchRaw !== 'function') {
    throw new Error('createFlightAdapter: fetchRaw is required');
  }
  return {
    providerId,
    async search(input) {
      const requestedAtUtc = new Date().toISOString();
      try {
        const raw = await fetchRaw(input);
        const options = normalizeSerpFlights(raw, { providerId });
        return ok(providerId, options, { requestedAtUtc, searchParams: input, partial: options.length === 0 });
      } catch (err) {
        return fail(providerId, err.message || 'flight provider error', { requestedAtUtc, searchParams: input });
      }
    },
  };
}
