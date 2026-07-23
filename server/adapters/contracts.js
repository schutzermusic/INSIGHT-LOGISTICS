/**
 * Provider adapter contracts (§17).
 *
 * The domain must not be coupled to any single travel provider. Every provider
 * (flights, buses, rental cars, road routing, transfer estimation) is wrapped by
 * an adapter that returns NormalizedOption[] (see src/domain/types.js). The
 * routing and recommendation engines only ever see normalized shapes.
 *
 * This module defines the contracts as JSDoc typedefs plus a light runtime guard
 * (`assertAdapter`) so a misconfigured adapter fails fast at registration time
 * rather than deep inside a search. Concrete adapters (FlightAdapter, BusAdapter,
 * …) arrive in Phase 4 and each satisfies one of these interfaces.
 *
 * @module server/adapters/contracts
 */

/**
 * @typedef {import('../../src/domain/types.js').NormalizedOption} NormalizedOption
 * @typedef {import('../../src/domain/types.js').TransportMode} TransportMode
 */

/**
 * Common metadata every adapter attaches to its results for auditability (§17):
 * provider, request/response timestamps, cache expiration, price freshness,
 * search params, errors, partial availability, currency, source confidence.
 * @typedef {Object} AdapterSearchMeta
 * @property {string} providerId
 * @property {string} requestedAtUtc
 * @property {string} respondedAtUtc
 * @property {string} [cacheExpiresAtUtc]
 * @property {Record<string, unknown>} searchParams
 * @property {string[]} errors — non-fatal provider errors (partial results still returned)
 * @property {boolean} partial — true when some sub-requests failed
 * @property {string} currency
 * @property {number} [sourceConfidence] — 0..1
 */

/**
 * @typedef {Object} AdapterResult
 * @property {boolean} success
 * @property {NormalizedOption[]} options
 * @property {AdapterSearchMeta} meta
 */

/**
 * @typedef {Object} FlightSearchInput
 * @property {string} originCity
 * @property {string} destinationCity
 * @property {string} [departureDate] — yyyy-mm-dd
 * @property {number} [passengers]
 */

/**
 * @typedef {Object} BusSearchInput
 * @property {string} originCity
 * @property {string} destinationCity
 * @property {string} [travelDate]
 * @property {number} [passengers]
 * @property {boolean} [includeConnections]
 */

/**
 * @typedef {Object} RentalCarSearchInput
 * @property {string} pickupLocationId
 * @property {string} dropoffLocationId
 * @property {string} [pickupAtUtc]
 * @property {string} [vehicleCategory]
 */

/**
 * @typedef {Object} RoadRouteInput
 * @property {{ lat: number, lng: number }} origin
 * @property {{ lat: number, lng: number }} destination
 * @property {boolean} [includeTolls]
 */

/**
 * @typedef {Object} NormalizedRoadRoute
 * @property {number} distanceKm
 * @property {number} durationMinutes
 * @property {import('../../src/domain/types.js').NormalizedOption['commercialCostC']} [tollCostC]
 * @property {boolean} tollsAvailable
 */

/**
 * @typedef {Object} TransferEstimateInput
 * @property {string} fromLocationId
 * @property {string} toLocationId
 * @property {TransportMode} [mode]
 */

/**
 * @typedef {Object} NormalizedTransferEstimate
 * @property {number} durationMinutes
 * @property {import('../../src/domain/types.js').NormalizedOption['commercialCostC']} costC
 * @property {boolean} estimated
 */

/**
 * @typedef {Object} FlightSearchProvider
 * @property {string} providerId
 * @property {(input: FlightSearchInput) => Promise<AdapterResult>} search
 */

/**
 * @typedef {Object} BusSearchProvider
 * @property {string} providerId
 * @property {(input: BusSearchInput) => Promise<AdapterResult>} search
 */

/**
 * @typedef {Object} RentalCarProvider
 * @property {string} providerId
 * @property {(input: RentalCarSearchInput) => Promise<AdapterResult>} search
 */

/**
 * @typedef {Object} RoadRouteProvider
 * @property {string} providerId
 * @property {(input: RoadRouteInput) => Promise<NormalizedRoadRoute>} calculate
 */

/**
 * @typedef {Object} TransferEstimateProvider
 * @property {string} providerId
 * @property {(input: TransferEstimateInput) => Promise<NormalizedTransferEstimate>} estimate
 */

/** Method each adapter kind must expose, keyed by a stable adapter "kind". */
const ADAPTER_METHOD_BY_KIND = {
  flight: 'search',
  bus: 'search',
  rental_car: 'search',
  road_route: 'calculate',
  transfer: 'estimate',
};

/**
 * Runtime guard: verify an object satisfies the named adapter contract before it
 * is registered with the orchestrator. Fails fast with a clear message so a
 * broken adapter can never silently return nothing during a live search.
 * @param {keyof typeof ADAPTER_METHOD_BY_KIND} kind
 * @param {unknown} adapter
 * @returns {void}
 */
export function assertAdapter(kind, adapter) {
  const method = ADAPTER_METHOD_BY_KIND[kind];
  if (!method) {
    throw new Error(`Unknown adapter kind: "${kind}". Expected one of ${Object.keys(ADAPTER_METHOD_BY_KIND).join(', ')}.`);
  }
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Adapter of kind "${kind}" must be an object.`);
  }
  if (typeof adapter.providerId !== 'string' || adapter.providerId.length === 0) {
    throw new Error(`Adapter of kind "${kind}" must expose a non-empty string providerId.`);
  }
  if (typeof adapter[method] !== 'function') {
    throw new Error(`Adapter "${adapter.providerId}" (kind "${kind}") must implement ${method}().`);
  }
}

export const ADAPTER_KINDS = Object.freeze(Object.keys(ADAPTER_METHOD_BY_KIND));
