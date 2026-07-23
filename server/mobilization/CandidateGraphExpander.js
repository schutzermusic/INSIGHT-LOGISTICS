/**
 * CandidateGraphExpander (§10–11).
 *
 * The ItineraryGenerator is generic — it explores every feasible path in the
 * graph. Its usefulness therefore depends on the graph being WIDE: many hubs,
 * nearby airports/terminals, and multiple departures per leg. This module builds
 * that candidate graph.
 *
 * Given an origin, a destination and a catalog of candidate intermediate hubs
 * (regional hubs, nearby airports/terminals from the geo data), it enumerates
 * the relevant city-pairs to search:
 *
 *   origin → destination            (direct, if any)
 *   origin → hub                    (reach a hub)
 *   hub    → hub                    (hop between hubs)
 *   hub    → destination            (final leg)
 *
 * and asks an injected `queryLegs(fromId, toId)` for the timed legs on each pair
 * (that function wraps the provider adapters + binds local schedules to UTC).
 * All returned legs become scheduled edges in one graph, which the generator then
 * turns into ranked, non-dominated multimodal itineraries.
 *
 * Bounded by maxHubs / maxLegsPerPair / maxPairs to prevent route explosion (§12).
 * `queryLegs` runs per pair with error isolation — one failing pair never aborts
 * the expansion (§18).
 *
 * @module server/mobilization/CandidateGraphExpander
 */

import { createMobilizationGraph } from './MultimodalGraphBuilder.js';

/**
 * @typedef {Object} CandidateNode
 * @property {string} id
 * @property {string} timezone
 * @property {string} [city]
 */

/**
 * @typedef {Object} TimedLeg
 * @property {string} id
 * @property {'flight'|'bus'|'rental_car'|'company_car'} mode
 * @property {string} departureAtUtc
 * @property {string} arrivalAtUtc
 * @property {number} costC
 * @property {'airport'|'bus_terminal'|'city'} [fromTerminalType]
 * @property {'airport'|'bus_terminal'|'city'} [toTerminalType]
 * @property {string} [providerId]
 * @property {boolean} [estimated]
 */

/**
 * Enumerate the bounded set of city-pairs worth searching.
 * @param {string} originId
 * @param {string} destId
 * @param {CandidateNode[]} hubs
 * @param {{ maxPairs?: number }} [opts]
 * @returns {Array<[string, string]>}
 */
export function enumerateCandidatePairs(originId, destId, hubs, opts = {}) {
  const maxPairs = opts.maxPairs ?? 60;
  const pairs = [];
  const seen = new Set();
  const add = (a, b) => {
    if (a === b) return;
    const key = `${a}->${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  };

  add(originId, destId);                       // direct
  for (const h of hubs) add(originId, h.id);   // reach a hub
  for (const h of hubs) add(h.id, destId);     // final leg
  for (const a of hubs) for (const b of hubs) add(a.id, b.id); // hub → hub

  return pairs.slice(0, maxPairs);
}

/**
 * Build a wide candidate graph by searching every relevant pair.
 * @param {Object} p
 * @param {CandidateNode} p.origin
 * @param {CandidateNode} p.destination
 * @param {CandidateNode[]} p.hubs
 * @param {(fromId: string, toId: string) => Promise<TimedLeg[]>} p.queryLegs
 * @param {number} [p.maxHubs]
 * @param {number} [p.maxLegsPerPair]
 * @param {number} [p.maxPairs]
 * @param {(msg: string) => void} [p.onProgress]
 * @returns {Promise<{ graph: object, stats: object }>}
 */
export async function expandCandidateGraph({
  origin,
  destination,
  hubs = [],
  queryLegs,
  maxHubs = 8,
  maxLegsPerPair = 6,
  maxPairs = 60,
  onProgress = () => {},
}) {
  if (typeof queryLegs !== 'function') throw new Error('expandCandidateGraph: queryLegs is required');

  const selectedHubs = hubs.slice(0, maxHubs);
  const g = createMobilizationGraph();

  // Register every node up front so edges always resolve.
  const nodeCatalog = [origin, destination, ...selectedHubs];
  const registered = new Set();
  for (const n of nodeCatalog) {
    if (registered.has(n.id)) continue;
    g.addNode({ id: n.id, city: n.city || n.id, timezone: n.timezone });
    registered.add(n.id);
  }

  const pairs = enumerateCandidatePairs(origin.id, destination.id, selectedHubs, { maxPairs });
  const stats = { pairsQueried: 0, pairsFailed: 0, legsAdded: 0, edgesSkipped: 0 };

  onProgress(`Expandindo grafo: ${pairs.length} par(es) de cidades para consultar...`);

  const settled = await Promise.all(pairs.map(async ([from, to]) => {
    try {
      const legs = await queryLegs(from, to);
      return { from, to, legs: Array.isArray(legs) ? legs.slice(0, maxLegsPerPair) : [] };
    } catch (err) {
      stats.pairsFailed++;
      return { from, to, legs: [], error: err.message };
    }
  }));

  for (const { from, to, legs } of settled) {
    stats.pairsQueried++;
    for (const leg of legs) {
      if (!registered.has(from) || !registered.has(to)) { stats.edgesSkipped++; continue; }
      try {
        g.addScheduledEdge({
          id: leg.id,
          mode: leg.mode,
          fromCity: from,
          toCity: to,
          departureAtUtc: leg.departureAtUtc,
          arrivalAtUtc: leg.arrivalAtUtc,
          costC: leg.costC,
          fromTerminalType: leg.fromTerminalType,
          toTerminalType: leg.toTerminalType,
          providerId: leg.providerId,
          estimated: leg.estimated,
        });
        stats.legsAdded++;
      } catch {
        stats.edgesSkipped++; // invalid leg (e.g. arrival<=departure) — isolated
      }
    }
  }

  onProgress(`Grafo montado: ${stats.legsAdded} trecho(s) de ${stats.pairsQueried} par(es).`);
  return { graph: g.build(), stats };
}
