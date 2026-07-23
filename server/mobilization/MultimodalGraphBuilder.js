/**
 * MultimodalGraphBuilder (§10).
 *
 * Builds a time-dependent multimodal graph. Nodes are cities (each with an IANA
 * timezone); scheduled edges (flight/bus/…) carry concrete UTC departure/arrival
 * times plus the terminal type at each end, so connection feasibility (§13) can
 * tell a bus-terminal↔airport transfer from a same-terminal connection without
 * exploding the node set into separate terminal nodes.
 *
 * Provider schedules usually come as local wall-clock strings; `localToUtc`
 * converts them to UTC using the node timezone (§14), with no external deps.
 *
 * @module server/mobilization/MultimodalGraphBuilder
 */

/** Segment mode → the LaborCountingRuleId used by the labor engine (§8). */
export const MODE_TO_LABOR_RULE = Object.freeze({
  flight: 'flight_time',
  bus: 'bus_time',
  rental_car: 'driver_vehicle_time',
  company_car: 'driver_vehicle_time',
  local_transfer: 'terminal_transfer',
  taxi: 'terminal_transfer',
  waiting: 'connection_waiting',
  hotel_rest: 'hotel_rest',
});

/**
 * Offset (ms) of an IANA timezone at a given UTC instant.
 * @param {number} utcMs
 * @param {string} timeZone
 */
function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asIfUtc - utcMs;
}

/**
 * Convert a local wall-clock string ("YYYY-MM-DDTHH:MM" or with seconds) in a
 * timezone to a UTC ISO string.
 * @param {string} localWall
 * @param {string} timeZone
 * @returns {string} ISO UTC
 */
export function localToUtc(localWall, timeZone) {
  const normalized = localWall.length === 16 ? `${localWall}:00` : localWall;
  const asUtcGuess = Date.parse(`${normalized}Z`);
  const offset = tzOffsetMs(asUtcGuess, timeZone);
  return new Date(asUtcGuess - offset).toISOString();
}

/**
 * Create a mutable graph. Cities are keyed by id; edges are indexed by fromCity
 * for the generator's adjacency walk.
 */
export function createMobilizationGraph() {
  const nodes = new Map();       // cityId -> { id, city, timezone }
  const edgesByFrom = new Map(); // cityId -> edge[]
  const allEdges = [];

  function addNode({ id, city, timezone }) {
    if (!id || !timezone) throw new Error('addNode requires id and timezone');
    nodes.set(id, { id, city: city || id, timezone });
    if (!edgesByFrom.has(id)) edgesByFrom.set(id, []);
    return id;
  }

  /**
   * Add a scheduled edge between two known city nodes.
   * @param {object} e
   * @param {string} e.id
   * @param {'flight'|'bus'|'rental_car'|'company_car'} e.mode
   * @param {string} e.fromCity
   * @param {string} e.toCity
   * @param {string} e.departureAtUtc
   * @param {string} e.arrivalAtUtc
   * @param {number} e.costC
   * @param {'airport'|'bus_terminal'|'city'} [e.fromTerminalType]
   * @param {'airport'|'bus_terminal'|'city'} [e.toTerminalType]
   * @param {string} [e.providerId]
   * @param {boolean} [e.estimated]
   */
  function addScheduledEdge(e) {
    const from = nodes.get(e.fromCity);
    const to = nodes.get(e.toCity);
    if (!from || !to) throw new Error(`addScheduledEdge: unknown node(s) ${e.fromCity} / ${e.toCity}`);
    if (Date.parse(e.arrivalAtUtc) <= Date.parse(e.departureAtUtc)) {
      throw new Error(`addScheduledEdge ${e.id}: arrival must be after departure`);
    }
    const edge = {
      id: e.id,
      mode: e.mode,
      fromCity: e.fromCity,
      toCity: e.toCity,
      fromTerminalType: e.fromTerminalType || (e.mode === 'flight' ? 'airport' : 'bus_terminal'),
      toTerminalType: e.toTerminalType || (e.mode === 'flight' ? 'airport' : 'bus_terminal'),
      departureAtUtc: e.departureAtUtc,
      arrivalAtUtc: e.arrivalAtUtc,
      durationMinutes: Math.round((Date.parse(e.arrivalAtUtc) - Date.parse(e.departureAtUtc)) / 60000),
      costC: e.costC ?? 0,
      providerId: e.providerId || null,
      estimated: e.estimated ?? false,
      originTimezone: from.timezone,
      destinationTimezone: to.timezone,
      laborCountingRuleId: MODE_TO_LABOR_RULE[e.mode] || 'bus_time',
    };
    edgesByFrom.get(e.fromCity).push(edge);
    allEdges.push(edge);
    return edge;
  }

  function build() {
    // Keep each city's outgoing edges sorted by departure for deterministic walks.
    for (const list of edgesByFrom.values()) {
      list.sort((a, b) => Date.parse(a.departureAtUtc) - Date.parse(b.departureAtUtc));
    }
    return { nodes, edgesByFrom, allEdges };
  }

  return { addNode, addScheduledEdge, build };
}
