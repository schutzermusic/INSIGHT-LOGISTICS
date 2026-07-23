/**
 * Provider normalizers (§17).
 *
 * Pure functions that turn each provider's raw payload into NormalizedOption[]
 * (or a NormalizedRoadRoute). The routing/recommendation engines only ever see
 * these normalized shapes — provider-specific structures stop here.
 *
 * Rules:
 * - Money → integer centavos (src/domain/money.js). Never floats downstream.
 * - Timestamps: providers often return local wall-clock strings without an
 *   offset (SerpAPI "2026-01-07 08:00", Quero Passagem {date,time}). We do NOT
 *   guess a UTC instant here; we keep the local strings in `raw`/metadata and
 *   expose durationMinutes. The graph builder (Phase 5) assigns zoned UTC
 *   timestamps using each node's IANA timezone (§14).
 * - Every option records `estimated` and `priceFreshnessAtUtc` for auditability.
 *
 * @module server/adapters/normalizers
 */

import { toCentavos } from '../../src/domain/money.js';

/** @typedef {import('../../src/domain/types.js').NormalizedOption} NormalizedOption */

const nowIso = () => new Date().toISOString();

/**
 * Normalize a raw SerpAPI Google Flights response into flight options.
 * Accepts the shape returned by SerpAPI (best_flights/other_flights).
 * @param {object} serpData
 * @param {{ providerId?: string, capturedAtUtc?: string }} [opts]
 * @returns {NormalizedOption[]}
 */
export function normalizeSerpFlights(serpData, opts = {}) {
  const providerId = opts.providerId || 'serpapi_google_flights';
  const capturedAtUtc = opts.capturedAtUtc || nowIso();
  const groups = [...(serpData?.best_flights || []), ...(serpData?.other_flights || [])];

  const options = [];
  for (const g of groups) {
    const legs = g.flights || [];
    if (legs.length === 0 || !g.price) continue;

    const first = legs[0];
    const last = legs[legs.length - 1];
    const durationMinutes = g.total_duration
      || legs.reduce((s, l) => s + (l.duration || 0), 0);

    options.push({
      mode: 'flight',
      providerId,
      providerReference: g.booking_token || g.departure_token || null,
      originLocationId: first.departure_airport?.id || '',
      destinationLocationId: last.arrival_airport?.id || '',
      departureAtUtc: undefined, // local strings only; zoned later (§14)
      arrivalAtUtc: undefined,
      durationMinutes,
      commercialCostC: toCentavos(g.price),
      currency: 'BRL',
      availabilityStatus: 'available',
      estimated: false,
      priceFreshnessAtUtc: capturedAtUtc,
      raw: {
        stops: legs.length - 1,
        localDeparture: first.departure_airport?.time || null,
        localArrival: last.arrival_airport?.time || null,
        airlines: [...new Set(legs.map((l) => l.airline).filter(Boolean))],
        layovers: g.layovers || [],
        bookingOptions: g.booking_options || [],
        carbon: g.carbon_emissions?.this_flight ?? null,
      },
    });
  }
  return options;
}

/**
 * Normalize Quero Passagem trips (already partly shaped by bus-api) into bus
 * options. Accepts the trip objects from the Quero Passagem search response.
 * @param {object[]} trips
 * @param {{ providerId?: string, capturedAtUtc?: string }} [opts]
 * @returns {NormalizedOption[]}
 */
export function normalizeQueroBusTrips(trips, opts = {}) {
  const providerId = opts.providerId || 'quero_passagem';
  const capturedAtUtc = opts.capturedAtUtc || nowIso();
  if (!Array.isArray(trips)) return [];

  return trips
    .filter((t) => t && t.price)
    .map((t) => {
      const priceBRL = t.price?.price ?? 0;
      const durationMinutes = Math.round((t.travelDuration || 0) / 60);
      const hasConnection = !!t.connection;
      return {
        mode: 'bus',
        providerId,
        providerReference: t.id ? String(t.id) : null,
        originLocationId: t.from?.name || '',
        destinationLocationId: t.to?.name || '',
        departureAtUtc: undefined,
        arrivalAtUtc: undefined,
        durationMinutes,
        commercialCostC: toCentavos(priceBRL),
        currency: 'BRL',
        availabilityStatus: (t.availableSeats ?? 1) > 0 ? 'available' : 'sold_out',
        estimated: false,
        priceFreshnessAtUtc: capturedAtUtc,
        raw: {
          company: t.company?.name || '',
          seatClass: t.seatClass || 'Convencional',
          availableSeats: t.availableSeats ?? null,
          localDeparture: t.departure || null,
          localArrival: t.arrival || null,
          connection: hasConnection ? (t.connection.node?.name || '') : null,
          connectionCount: hasConnection ? 1 : 0,
          allowCanceling: t.allowCanceling ?? null,
          purchaseUrl: t.id ? `https://www.queropassagem.com.br/checkout?travelId=${t.id}` : null,
        },
      };
    });
}

/**
 * Normalize a Google Routes v2 result into a road route (distance/duration/toll).
 * @param {object} routeResult — { success, routes:[{ distanceKm, duration }], tollCostBRL? }
 * @returns {import('./contracts.js').NormalizedRoadRoute}
 */
export function normalizeGoogleRoute(routeResult) {
  const route = routeResult?.routes?.[0];
  if (!routeResult?.success || !route || !route.distanceKm) {
    throw new Error('normalizeGoogleRoute: no usable route in result');
  }
  const seconds = Number(String(route.duration || '').replace('s', ''));
  const durationMinutes = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : 0;
  const tollAvailable = typeof routeResult.tollCostBRL === 'number' && routeResult.tollCostBRL > 0;

  return {
    distanceKm: route.distanceKm,
    durationMinutes,
    tollCostC: tollAvailable ? toCentavos(routeResult.tollCostBRL) : undefined,
    tollsAvailable: tollAvailable,
  };
}
