/**
 * LegSynthesizer — deterministic estimated timetable of legs between two nodes.
 *
 * Real provider adapters (flights/bus) plug in via the same queryLegs contract;
 * this synthesizer gives the engine a usable graph for ANY city pair without
 * live keys, so the mobilization search always returns door-to-door options.
 * Every leg is flagged `estimated: true` (§6/§32 — never a silent mock).
 *
 * Emits several departures per leg (a small timetable) so multi-leg chains can
 * satisfy the connection-buffer rules (§13).
 *
 * @module server/mobilization/LegSynthesizer
 */

import { localToUtc } from './MultimodalGraphBuilder.js';
import { roadKm } from './geo.js';
import { fetchRealFlightLegs, fetchRealBusLegs } from './providers.js';

const BUS_SPEED_KMH = 60;
const FLIGHT_SPEED_KMH = 700;
const BUS_MAX_KM = 2000;
const MIN_FLIGHT_KM = 300;
const DAILY_LOCAL_HOURS = [6, 14, 20]; // departure slots per day
const MAX_DAYS = 3;
const MAX_LEGS_PER_PAIR = 8;

/** Local YYYY-MM-DD of a UTC instant in a timezone. */
function localDate(utcMs, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(utcMs));
}

/** Build UTC departure slots across the allowed window, from a node's local clock. */
function departureSlots(tz, earliestMs, deadlineMs) {
  const slots = new Set();
  for (let d = 0; d <= MAX_DAYS; d++) {
    const dateStr = localDate(earliestMs + d * 86400000, tz);
    for (const hh of DAILY_LOCAL_HOURS) {
      const utc = localToUtc(`${dateStr}T${String(hh).padStart(2, '0')}:00`, tz);
      const ms = Date.parse(utc);
      if (ms >= earliestMs && ms <= deadlineMs) slots.add(utc);
    }
  }
  return [...slots].sort((a, b) => Date.parse(a) - Date.parse(b));
}

/** Local YYYY-MM-DD of the earliest departure, per node timezone (SerpAPI/Quero date). */
function localSearchDate(utcMs, tz) {
  return localDate(utcMs, tz);
}

function estimatedBusLegs(a, b, dist, slots, fromId, toId) {
  const durMin = Math.max(30, Math.round((dist / BUS_SPEED_KMH) * 60));
  const costC = Math.max(3000, Math.round(dist * 18));
  return slots.map((dep, i) => ({
    id: `bus-${fromId}-${toId}-${i}`, mode: 'bus', departureAtUtc: dep,
    arrivalAtUtc: new Date(Date.parse(dep) + durMin * 60000).toISOString(), costC,
    fromTerminalType: 'bus_terminal', toTerminalType: 'bus_terminal', providerId: 'estimate_bus', estimated: true,
  }));
}

function estimatedFlightLegs(a, b, dist, slots, fromId, toId) {
  const durMin = Math.round((dist / FLIGHT_SPEED_KMH) * 60) + 30;
  const costC = Math.round(25000 + dist * 22);
  return slots.map((dep, i) => ({
    id: `fly-${fromId}-${toId}-${i}`, mode: 'flight', departureAtUtc: dep,
    arrivalAtUtc: new Date(Date.parse(dep) + durMin * 60000).toISOString(), costC,
    fromTerminalType: 'airport', toTerminalType: 'airport', providerId: 'estimate_flight', estimated: true,
  }));
}

/**
 * Create a queryLegs(fromId, toId) for the candidate graph expander.
 *
 * When `real.enabled`, live providers are queried per mode (within a call
 * budget) and, if they return data, REPLACE the estimated legs for that mode
 * (accuracy over synthetic coverage). Otherwise the estimated timetable is used.
 *
 * @param {Object} p
 * @param {Record<string, object>} p.nodesById
 * @param {string} p.earliestDepartureUtc
 * @param {string} p.deadlineUtc
 * @param {{ enabled: boolean, budget: { flights: number, buses: number }, cache: Map, sources?: object }} [p.real]
 * @param {boolean} [p.allowEstimated] — when false (default), NO synthetic legs
 *   are produced; only real provider data is used (never invents values §32).
 * @returns {(fromId: string, toId: string) => Promise<object[]>}
 */
export function makeQueryLegs({ nodesById, earliestDepartureUtc, deadlineUtc, real, allowEstimated = false }) {
  const earliestMs = Date.parse(earliestDepartureUtc);
  const deadlineMs = Date.parse(deadlineUtc);

  return async (fromId, toId) => {
    const a = nodesById[fromId];
    const b = nodesById[toId];
    if (!a || !b) return [];
    const dist = roadKm(a, b);
    if (dist <= 0) return [];

    const slots = departureSlots(a.timezone, earliestMs, deadlineMs);
    const busViable = dist <= BUS_MAX_KM;
    const flightViable = a.airports?.length && b.airports?.length && dist >= MIN_FLIGHT_KM;
    const legs = [];

    // --- Bus ---
    if (busViable) {
      let realBus = [];
      if (real?.enabled && real.budget.buses > 0) {
        real.budget.buses -= 1;
        realBus = await fetchRealBusLegs(a, b, localSearchDate(earliestMs, a.timezone), real.cache);
        if (realBus.length && real.sources) {
          real.sources.busRealPairs += 1;
          real.sources.busProvider = realBus[0].providerId;
        }
      }
      if (realBus.length) legs.push(...realBus);
      else if (allowEstimated) legs.push(...estimatedBusLegs(a, b, dist, slots, fromId, toId));
    }

    // --- Flight ---
    if (flightViable) {
      let realFlight = [];
      if (real?.enabled && real.budget.flights > 0) {
        real.budget.flights -= 1;
        realFlight = await fetchRealFlightLegs(a, b, localSearchDate(earliestMs, a.timezone), real.cache);
        if (realFlight.length && real.sources) real.sources.flightRealPairs += 1;
      }
      if (realFlight.length) legs.push(...realFlight);
      else if (allowEstimated) legs.push(...estimatedFlightLegs(a, b, dist, slots, fromId, toId));
    }

    return legs.slice(0, MAX_LEGS_PER_PAIR);
  };
}
