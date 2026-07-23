/**
 * ConnectionFeasibilityService (§13).
 *
 * A connection is not valid just because two segments occur in the same city.
 * When the previous leg arrives at one terminal and the next departs from
 * another (bus terminal ↔ airport), the engine must account for disembarkation,
 * baggage, an inter-terminal transfer, a traffic buffer, and the next leg's
 * check-in/boarding cutoff. A connection is feasible only when:
 *
 *   previous arrival + required buffer  <=  next departure
 *
 * Infeasible connections must be removed so impossible itineraries never appear
 * as valid results.
 *
 * @module server/mobilization/ConnectionFeasibilityService
 */

const MS_PER_MINUTE = 60000;

/** Defaults mirror connection_buffer_policies (0006/0007 migrations). Minutes. */
export const DEFAULT_BUFFER_POLICY = Object.freeze({
  sameTerminalBufferMin: 60,
  // Operational mode-pair minimums (business rule): a bus→bus connection needs
  // at least 2h and a bus→flight connection at least 3h, regardless of terminal.
  busToBusBufferMin: 120,   // 2h
  busToFlightBufferMin: 180, // 3h
  flightToBusBufferMin: 90,
  differentTerminalTransferMin: 60,
  disembarkBufferMin: 20,
  airportCheckinBufferMin: 90,
  busTerminalBoardingMin: 30, // stored in policy `data` jsonb
});

/**
 * Minutes required between a previous leg and the next, given whether they share
 * the same physical terminal.
 * @param {{ mode: string }} prev
 * @param {{ mode: string }} next
 * @param {{ sameTerminal: boolean }} ctx
 * @param {object} [policy]
 * @returns {number}
 */
export function requiredBufferMinutes(prev, next, ctx, policy = {}) {
  const p = { ...DEFAULT_BUFFER_POLICY, ...policy };

  let required;
  if (ctx.sameTerminal && prev.mode === next.mode) {
    // Same physical terminal, same mode: a single consolidated disembark/reboard.
    required = p.sameTerminalBufferMin;
  } else {
    const boarding = next.mode === 'flight' ? p.airportCheckinBufferMin : p.busTerminalBoardingMin;
    const transfer = ctx.sameTerminal ? 0 : p.differentTerminalTransferMin;
    required = p.disembarkBufferMin + transfer + boarding;
  }

  // Mode-pair minimums (business rule) — apply regardless of terminal (§13):
  //   bus→bus ≥ 2h, bus→flight ≥ 3h, flight→bus ≥ its floor.
  if (prev.mode === 'bus' && next.mode === 'bus') required = Math.max(required, p.busToBusBufferMin);
  if (prev.mode === 'bus' && next.mode === 'flight') required = Math.max(required, p.busToFlightBufferMin);
  if (prev.mode === 'flight' && next.mode === 'bus') required = Math.max(required, p.flightToBusBufferMin);

  return required;
}

/**
 * Evaluate a connection between two timed legs.
 * @param {{ mode: string, arrivalAtUtc: string, toTerminalType?: string }} prev
 * @param {{ mode: string, departureAtUtc: string, fromTerminalType?: string }} next
 * @param {object} [opts]
 * @param {object} [opts.policy]
 * @param {number} [opts.maxWaitPerConnectionMin]
 * @returns {{ feasible: boolean, gapMin: number, requiredMin: number, reason: string|null }}
 */
export function evaluateConnection(prev, next, opts = {}) {
  const sameTerminal =
    prev.toTerminalType != null &&
    next.fromTerminalType != null &&
    prev.toTerminalType === next.fromTerminalType;

  const requiredMin = requiredBufferMinutes(prev, next, { sameTerminal }, opts.policy);
  const gapMin = (Date.parse(next.departureAtUtc) - Date.parse(prev.arrivalAtUtc)) / MS_PER_MINUTE;

  if (gapMin < 0) {
    return { feasible: false, gapMin, requiredMin, reason: 'connection_overlaps' };
  }
  if (gapMin < requiredMin) {
    return { feasible: false, gapMin, requiredMin, reason: 'insufficient_transfer_buffer' };
  }
  if (opts.maxWaitPerConnectionMin != null && gapMin > opts.maxWaitPerConnectionMin) {
    return { feasible: false, gapMin, requiredMin, reason: 'wait_exceeds_maximum' };
  }
  return { feasible: true, gapMin, requiredMin, reason: null };
}
