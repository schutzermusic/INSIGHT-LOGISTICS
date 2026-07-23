/**
 * ItineraryGenerator (§11–12).
 *
 * Walks the time-dependent multimodal graph to produce a manageable set of
 * non-dominated door-to-door itineraries. It:
 *  - chains scheduled edges only across FEASIBLE connections (§13),
 *  - inserts synthetic transfer/waiting segments so the timeline is complete (§9),
 *  - applies pruning constraints (max segments/connections/modal-changes/wait/
 *    trip-duration, no city revisits → no backtracking, deadline) (§12),
 *  - flags deadline-missers as `invalid` instead of silently dropping them (§20),
 *  - returns the Pareto frontier over {cost, duration, connections} (§11).
 *
 * Commercial cost only here; labor/permanence/local costs are layered by the
 * cost engine (Phase 6). Money is centavos.
 *
 * @module server/mobilization/ItineraryGenerator
 */

import { evaluateConnection, DEFAULT_BUFFER_POLICY } from './ConnectionFeasibilityService.js';

const MS_PER_MINUTE = 60000;

/** Defaults mirror search_limit_policies (0006_config.sql). */
export const DEFAULT_CONSTRAINTS = Object.freeze({
  maxSegments: 6,
  maxConnections: 4,
  maxModalChanges: 3,
  maxTotalTripMinutes: 2880, // 48h
  maxWaitPerConnectionMin: 480,
  maxCumulativeWaitMin: 720,
  maxResults: 200,
});

function connSeg(sequence, mode, from, to, startMs, endMs, tz, rule) {
  return {
    sequence,
    mode,
    originLocationId: from,
    destinationLocationId: to,
    departureAtUtc: new Date(startMs).toISOString(),
    arrivalAtUtc: new Date(endMs).toISOString(),
    originTimezone: tz,
    destinationTimezone: tz,
    commercialCostC: 0,
    currency: 'BRL',
    availabilityStatus: 'n/a',
    laborCountingRuleId: rule,
    providerId: null,
    estimated: true,
    metadata: { synthetic: true },
  };
}

function buildItinerary(path, { deadlineMs, bufferPolicy }) {
  const p = { ...DEFAULT_BUFFER_POLICY, ...bufferPolicy };
  const segments = [];
  let seq = 0;

  for (let i = 0; i < path.length; i++) {
    const e = path[i];
    segments.push({
      sequence: seq++,
      mode: e.mode,
      originLocationId: e.fromCity,
      destinationLocationId: e.toCity,
      departureAtUtc: e.departureAtUtc,
      arrivalAtUtc: e.arrivalAtUtc,
      originTimezone: e.originTimezone,
      destinationTimezone: e.destinationTimezone,
      commercialCostC: e.costC,
      currency: 'BRL',
      availabilityStatus: 'available',
      laborCountingRuleId: e.laborCountingRuleId,
      providerId: e.providerId,
      estimated: e.estimated,
      metadata: { terminalFrom: e.fromTerminalType, terminalTo: e.toTerminalType },
    });

    const next = path[i + 1];
    if (!next) continue;

    const arrMs = Date.parse(e.arrivalAtUtc);
    const depMs = Date.parse(next.departureAtUtc);
    const sameTerminal = e.toTerminalType === next.fromTerminalType;
    const tz = e.destinationTimezone;
    let cursor = arrMs;

    if (!sameTerminal) {
      const tEnd = Math.min(arrMs + p.differentTerminalTransferMin * MS_PER_MINUTE, depMs);
      segments.push(connSeg(seq++, 'local_transfer', e.toCity, next.fromCity, arrMs, tEnd, tz, 'terminal_transfer'));
      cursor = tEnd;
    }
    if (depMs > cursor) {
      segments.push(connSeg(seq++, 'waiting', e.toCity, e.toCity, cursor, depMs, tz, 'connection_waiting'));
    }
  }

  const first = path[0];
  const last = path[path.length - 1];
  const commercialCostC = path.reduce((s, e) => s + e.costC, 0);
  const durationMinutes = Math.round((Date.parse(last.arrivalAtUtc) - Date.parse(first.departureAtUtc)) / MS_PER_MINUTE);
  const connectionCount = path.length - 1;
  const modalChangeCount = path.reduce((n, e, i) => (i > 0 && path[i - 1].mode !== e.mode ? n + 1 : n), 0);
  const missesDeadline = Date.parse(last.arrivalAtUtc) > deadlineMs;

  return {
    id: `itin-${path.map((e) => e.id).join('_')}`,
    departureAtUtc: first.departureAtUtc,
    arrivalAtUtc: last.arrivalAtUtc,
    durationMinutes,
    segments,
    connectionCount,
    modalChangeCount,
    modeSequence: path.map((e) => e.mode),
    commercialCostC,
    laborCostC: 0,
    permanenceCostC: 0,
    localMobilityCostC: 0,
    totalMobilizationCostC: commercialCostC,
    feasibilityStatus: missesDeadline ? 'invalid' : 'valid',
    feasibilityReasons: missesDeadline ? ['misses_arrival_deadline'] : [],
    score: 0,
    rankingCategory: undefined,
  };
}

/**
 * Keep only non-dominated itineraries over (cost, duration, connections). An
 * itinerary is dominated when another is <= on all three and < on at least one.
 * @param {object[]} items
 * @returns {object[]}
 */
export function paretoFrontier(items) {
  const key = (a) => [a.totalMobilizationCostC, a.durationMinutes, a.connectionCount];
  const dominates = (a, b) => {
    const ka = key(a); const kb = key(b);
    const le = ka.every((v, i) => v <= kb[i]);
    const lt = ka.some((v, i) => v < kb[i]);
    return le && lt;
  };
  return items.filter((a) => !items.some((b) => b !== a && dominates(b, a)));
}

/**
 * Tag a set of (valid) itineraries with named alternative categories so the UI
 * can present a handful of meaningful choices (§11) instead of near-duplicates.
 * Ranking/recommendation weighting is applied later by the recommendation engine
 * (Phase 6); this only labels the extremes that are always worth surfacing.
 * @param {object[]} valid — itineraries with feasibilityStatus 'valid'
 * @returns {object[]} the same itineraries, with `rankingCategory` set where apt
 */
export function categorizeAlternatives(valid) {
  if (valid.length === 0) return valid;
  const min = (fn) => valid.reduce((best, it) => (fn(it) < fn(best) ? it : best), valid[0]);

  const cheapest = min((it) => it.totalMobilizationCostC);
  const fastest = min((it) => it.durationMinutes);
  const simplest = min((it) => it.connectionCount);
  const lowestTicket = min((it) => it.commercialCostC);

  // First label wins if an itinerary is the extreme on several axes.
  const assign = (it, cat) => { if (!it.rankingCategory) it.rankingCategory = cat; };
  assign(cheapest, 'lowest_total_cost');
  assign(fastest, 'fastest');
  assign(simplest, 'lowest_complexity');
  assign(lowestTicket, 'lowest_ticket');
  return valid;
}

/**
 * Generate itineraries from origin to destination.
 * @param {object} p
 * @param {{ nodes: Map, edgesByFrom: Map }} p.graph — from MultimodalGraphBuilder.build()
 * @param {string} p.originCity
 * @param {string} p.destinationCity
 * @param {string} p.earliestDepartureUtc
 * @param {string} p.deadlineUtc
 * @param {object} [p.constraints]
 * @param {object} [p.bufferPolicy]
 * @returns {{ itineraries: object[], valid: object[], pareto: object[], stats: object }}
 */
export function generateItineraries({
  graph,
  originCity,
  destinationCity,
  earliestDepartureUtc,
  deadlineUtc,
  constraints = {},
  bufferPolicy = {},
}) {
  const c = { ...DEFAULT_CONSTRAINTS, ...constraints };
  const earliestMs = Date.parse(earliestDepartureUtc);
  const deadlineMs = Date.parse(deadlineUtc);
  const { edgesByFrom } = graph;

  const results = [];
  const stats = { generated: 0, pruned: 0, prunedReasons: {} };
  const prune = (reason) => { stats.pruned++; stats.prunedReasons[reason] = (stats.prunedReasons[reason] || 0) + 1; };

  function dfs(path, currentCity, currentTimeMs, visited, cumWait, modalChanges) {
    if (results.length >= c.maxResults) return;
    const out = edgesByFrom.get(currentCity) || [];

    for (const edge of out) {
      if (visited.has(edge.toCity)) continue; // no revisits → no backtracking (§12)

      const prev = path[path.length - 1];
      let gapMin = 0;
      if (!prev) {
        if (Date.parse(edge.departureAtUtc) < earliestMs) { prune('before_earliest'); continue; }
      } else {
        if (Date.parse(edge.departureAtUtc) < currentTimeMs) { prune('departs_before_arrival'); continue; }
        const conn = evaluateConnection(prev, edge, { policy: bufferPolicy, maxWaitPerConnectionMin: c.maxWaitPerConnectionMin });
        if (!conn.feasible) { prune(conn.reason); continue; }
        gapMin = conn.gapMin;
      }

      const newLen = path.length + 1;
      if (newLen > c.maxSegments) { prune('max_segments'); continue; }
      if (newLen - 1 > c.maxConnections) { prune('max_connections'); continue; }
      const newModalChanges = modalChanges + (prev && prev.mode !== edge.mode ? 1 : 0);
      if (newModalChanges > c.maxModalChanges) { prune('max_modal_changes'); continue; }
      const newCumWait = cumWait + gapMin;
      if (newCumWait > c.maxCumulativeWaitMin) { prune('max_cumulative_wait'); continue; }
      const startMs = Date.parse((path[0] || edge).departureAtUtc);
      const arrMs = Date.parse(edge.arrivalAtUtc);
      if ((arrMs - startMs) / MS_PER_MINUTE > c.maxTotalTripMinutes) { prune('max_trip_duration'); continue; }

      const newPath = [...path, edge];

      if (edge.toCity === destinationCity) {
        results.push(buildItinerary(newPath, { deadlineMs, bufferPolicy }));
        stats.generated++;
        continue;
      }
      // Extending past the deadline can never recover — prune (still record any
      // deadline-miss that already reached the destination above).
      if (arrMs > deadlineMs) { prune('past_deadline'); continue; }

      visited.add(edge.toCity);
      dfs(newPath, edge.toCity, arrMs, visited, newCumWait, newModalChanges);
      visited.delete(edge.toCity);
    }
  }

  dfs([], originCity, earliestMs, new Set([originCity]), 0, 0);

  const valid = results.filter((r) => r.feasibilityStatus === 'valid');
  const pareto = paretoFrontier(valid);
  return { itineraries: results, valid, pareto, stats };
}
