/**
 * Real provider leg fetchers (§17) — turn live flight/bus data into TimedLegs
 * for the candidate graph, binding each provider's LOCAL schedule to UTC using
 * the node timezone (§14). Error-isolated (returns [] on any failure) and
 * cached per pair+date so the same route is never fetched twice in one search.
 *
 * Real legs carry `estimated: false`; when a provider has no data the caller
 * falls back to the estimated timetable (never a silent mock in prod, §32).
 *
 * @module server/mobilization/providers
 */

import { localToUtc } from './MultimodalGraphBuilder.js';
import { toCentavos } from '../../src/domain/money.js';
import { normalizeSerpFlights, normalizeQueroBusTrips } from '../adapters/normalizers.js';
import { fetchSerpFlights, isSerpApiConfigured } from '../services/SerpApiFlightsService.js';
import { searchStops, searchTrips, isConfigured as isQueroConfigured } from '../services/QueroPassagemService.js';
import * as clickbus from '../services/ClickBusService.js';

export { isSerpApiConfigured };
export const isClickBusConfigured = clickbus.isConfigured;
export const isQueroPassagemConfigured = isQueroConfigured;
/** Any bus source available? */
export function isBusConfigured() {
  return clickbus.isConfigured() || isQueroConfigured();
}

/** "2026-01-07 08:00" | "2026-01-07T08:00:00" → "2026-01-07T08:00" */
function toLocalWall(s) {
  if (!s) return null;
  return s.replace(' ', 'T').slice(0, 16);
}

/**
 * Real flights between two airport nodes for a given local date.
 * @returns {Promise<object[]>} TimedLeg[]
 */
export async function fetchRealFlightLegs(fromNode, toNode, outboundDate, cache) {
  if (!isSerpApiConfigured()) return [];
  const dep = fromNode.airports?.[0];
  const arr = toNode.airports?.[0];
  if (!dep || !arr) return [];

  const key = `fly:${dep}:${arr}:${outboundDate}`;
  if (cache?.has(key)) return cache.get(key);

  try {
    const raw = await fetchSerpFlights({ departureId: dep, arrivalId: arr, outboundDate, adults: 1, timeoutMs: 8000 });
    const options = normalizeSerpFlights(raw);
    const legs = [];
    options.forEach((o, i) => {
      const d = toLocalWall(o.raw?.localDeparture);
      const a = toLocalWall(o.raw?.localArrival);
      if (!d || !a) return;
      const departureAtUtc = localToUtc(d, fromNode.timezone);
      const arrivalAtUtc = localToUtc(a, toNode.timezone);
      if (Date.parse(arrivalAtUtc) <= Date.parse(departureAtUtc)) return;
      legs.push({
        id: `realfly-${fromNode.id}-${toNode.id}-${i}`,
        mode: 'flight', departureAtUtc, arrivalAtUtc, costC: o.commercialCostC,
        fromTerminalType: 'airport', toTerminalType: 'airport',
        providerId: 'serpapi_google_flights', estimated: false,
      });
    });
    cache?.set(key, legs);
    return legs;
  } catch {
    cache?.set(key, []);
    return [];
  }
}

const stopCache = new Map();
async function resolveStopId(cityName) {
  const key = cityName.toLowerCase().trim();
  if (stopCache.has(key)) return stopCache.get(key);
  try {
    const res = await searchStops(cityName);
    const list = res?.success ? res.data : [];
    const stop = list.find((s) => s.type === 'city') || list[0];
    const id = stop?.id || null;
    stopCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Real DIRECT bus trips between two nodes for a given local date. Connections are
 * skipped — the graph engine builds multi-leg chains itself (§10).
 * @returns {Promise<object[]>} TimedLeg[]
 */
async function fetchQueroBusLegs(fromNode, toNode, travelDate, cache) {
  if (!isQueroConfigured()) return [];
  const key = `quero:${fromNode.id}:${toNode.id}:${travelDate}`;
  if (cache?.has(key)) return cache.get(key);

  try {
    const [fromStop, toStop] = await Promise.all([resolveStopId(fromNode.city), resolveStopId(toNode.city)]);
    if (!fromStop || !toStop) { cache?.set(key, []); return []; }

    const res = await searchTrips(fromStop, toStop, travelDate, { allowCache: true });
    const trips = (res?.success && Array.isArray(res.data)) ? res.data.filter((t) => !t.connection) : [];
    const options = normalizeQueroBusTrips(trips);
    const legs = [];
    options.forEach((o, i) => {
      const d = o.raw?.localDeparture;
      const a = o.raw?.localArrival;
      if (!d?.date || !a?.date) return;
      const departureAtUtc = localToUtc(`${d.date}T${(d.time || '00:00').slice(0, 5)}`, fromNode.timezone);
      const arrivalAtUtc = localToUtc(`${a.date}T${(a.time || '00:00').slice(0, 5)}`, toNode.timezone);
      if (Date.parse(arrivalAtUtc) <= Date.parse(departureAtUtc)) return;
      legs.push({
        id: `realbus-${fromNode.id}-${toNode.id}-${i}`,
        mode: 'bus', departureAtUtc, arrivalAtUtc, costC: o.commercialCostC,
        fromTerminalType: 'bus_terminal', toTerminalType: 'bus_terminal',
        providerId: 'quero_passagem', estimated: false,
      });
    });
    cache?.set(key, legs);
    return legs;
  } catch {
    cache?.set(key, []);
    return [];
  }
}

// ── ClickBus (preferred bus source) ─────────────────────
const cbSlugCache = new Map();
async function resolveClickBusSlug(cityName) {
  const key = cityName.toLowerCase().trim();
  if (cbSlugCache.has(key)) return cbSlugCache.get(key);
  try {
    const places = await clickbus.searchPlaces(cityName);
    // Prefer a city-group place (covers all terminals) over a single terminal.
    const p = places.find((x) => x.useGroupByCity) || places[0];
    const slug = p?.slug || null;
    cbSlugCache.set(key, slug);
    return slug;
  } catch {
    return null;
  }
}

/** Real DIRECT bus trips via ClickBus, UTC-bound. @returns {Promise<object[]>} */
export async function fetchClickBusLegs(fromNode, toNode, travelDate, cache) {
  if (!clickbus.isConfigured()) return [];
  const key = `cb:${fromNode.id}:${toNode.id}:${travelDate}`;
  if (cache?.has(key)) return cache.get(key);
  try {
    const [f, t] = await Promise.all([resolveClickBusSlug(fromNode.city), resolveClickBusSlug(toNode.city)]);
    if (!f || !t) { cache?.set(key, []); return []; }
    const trips = await clickbus.searchTrips(f, t, travelDate);
    const legs = [];
    trips.forEach((trip, i) => {
      const d = trip.departure?.schedule;
      const a = trip.arrival?.schedule;
      if (!d?.date || !a?.date) return;
      const departureAtUtc = localToUtc(`${d.date}T${(d.time || '00:00:00').slice(0, 5)}`, fromNode.timezone);
      const arrivalAtUtc = localToUtc(`${a.date}T${(a.time || '00:00:00').slice(0, 5)}`, toNode.timezone);
      if (Date.parse(arrivalAtUtc) <= Date.parse(departureAtUtc)) return;
      const price = typeof trip.price === 'number' ? trip.price : parseFloat(trip.price);
      if (!Number.isFinite(price) || price <= 0) return;
      legs.push({
        id: `cbbus-${fromNode.id}-${toNode.id}-${i}`,
        mode: 'bus', departureAtUtc, arrivalAtUtc, costC: toCentavos(price),
        fromTerminalType: 'bus_terminal', toTerminalType: 'bus_terminal',
        providerId: 'clickbus', estimated: false,
      });
    });
    cache?.set(key, legs);
    return legs;
  } catch {
    cache?.set(key, []);
    return [];
  }
}

/**
 * Real bus legs from the best available source: ClickBus first, then Quero
 * Passagem, else []. The generator falls back to the estimated timetable when
 * nothing is returned (§17/§32).
 */
export async function fetchRealBusLegs(fromNode, toNode, travelDate, cache) {
  if (clickbus.isConfigured()) {
    const cb = await fetchClickBusLegs(fromNode, toNode, travelDate, cache);
    if (cb.length) return cb;
  }
  if (isQueroConfigured()) {
    const q = await fetchQueroBusLegs(fromNode, toNode, travelDate, cache);
    if (q.length) return q;
  }
  return [];
}
