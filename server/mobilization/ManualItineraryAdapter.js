/**
 * ManualItineraryAdapter (§3, §10, §21).
 *
 * Transforms manually-entered scenario segments into the SAME normalized
 * MultimodalItinerary/ItinerarySegment shape produced by the automatic
 * ItineraryGenerator, so both flows converge on one labor/cost/recommendation
 * pipeline (§3). This adapter contains NO overtime or final-cost formulas
 * (§3) — it only normalizes: maps segment types to transport modes + labor
 * counting rules, derives per-segment duration from departure/arrival
 * timestamps (never asks for total hours §7.3), resolves the price allocation
 * into a single resolved commercial cost in centavos (§7.2), and inserts
 * derived waiting gaps + flags missing terminal transfers (§8, §9).
 *
 * Money is integer centavos (§5/§32). Timestamps are UTC; each endpoint carries
 * its local IANA timezone for labor classification (§14/§23).
 *
 * @module server/mobilization/ManualItineraryAdapter
 */

const MS_PER_MINUTE = 60000;

/** Manual segment type → automatic-engine TransportMode (drives cost buckets). */
const TYPE_TO_MODE = Object.freeze({
  bus: 'bus',
  flight: 'flight',
  rental_car: 'rental_car',
  company_car: 'company_car',
  transfer: 'local_transfer',
  taxi: 'local_transfer',
  waiting: 'waiting',
  airport_process: 'waiting',
  bus_terminal_process: 'waiting',
  baggage_claim: 'waiting',
  hotel_rest: 'hotel_rest',
  meal_break: 'meal_break',
  mandatory_rest: 'hotel_rest',
  custom: 'waiting',
});

/** Manual segment type → LaborCountingRuleId (§8). */
const TYPE_TO_RULE = Object.freeze({
  bus: 'bus_time',
  flight: 'flight_time',
  rental_car: 'passenger_vehicle_time',
  company_car: 'passenger_vehicle_time',
  transfer: 'terminal_transfer',
  taxi: 'terminal_transfer',
  waiting: 'connection_waiting',
  airport_process: 'airport_waiting',
  bus_terminal_process: 'bus_terminal_waiting',
  baggage_claim: 'baggage_claim',
  hotel_rest: 'hotel_rest',
  meal_break: 'meal_break',
  mandatory_rest: 'hotel_rest',
  custom: 'connection_waiting',
});

/** Location types that live inside the same city but are distinct terminals. */
const TERMINAL_TYPES = new Set(['airport', 'bus_terminal']);

/**
 * Resolve a segment's price allocation into a single commercial cost in centavos
 * for the whole segment (all its passengers), so downstream costing never
 * re-multiplies a total as if it were per-person (§7.2).
 * @param {object} seg
 * @param {number} passengerCount — passengers actually on this segment
 * @returns {number} centavos
 */
export function resolveSegmentCostC(seg, passengerCount) {
  const amt = Number.isInteger(seg.priceAmountMinor) ? seg.priceAmountMinor : 0;
  if (amt <= 0) return 0;
  const n = Math.max(1, passengerCount);
  switch (seg.priceAllocation) {
    case 'per_person':
      return amt * n;
    case 'per_day':
      return amt * Math.max(1, seg.priceUnits || 1);
    case 'per_room':
      return amt * Math.max(1, seg.priceUnits || Math.ceil(n / (seg.roomOccupancy || 2)));
    case 'per_kilometer':
      return amt * Math.max(0, seg.priceUnits || 0);
    case 'per_vehicle':
    case 'selected_passengers_total':
    case 'scenario_total':
      return amt; // already a total
    case 'none':
      return 0;
    default:
      return amt; // safest: treat unknown allocation as an already-computed total
  }
}

function durationMinutes(startUtc, endUtc) {
  return Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / MS_PER_MINUTE);
}

/**
 * Build a normalized itinerary from manual scenario input.
 *
 * @param {Object} input
 * @param {string} [input.simulationId]
 * @param {string} [input.scenarioId]
 * @param {Array<object>} input.segments — manual segments (see §7); ordered by
 *   `sequence` if present, else by departure time.
 * @param {string[]} [input.passengerIds] — the scenario's full team
 * @param {string} [input.deadlineUtc] — required arrival (§20)
 * @param {{ differentTerminalTransferMin?: number }} [input.gapPolicy]
 * @returns {{ itinerary: object, derivedGaps: object[], continuityIssues: object[] }}
 */
export function buildManualItinerary(input) {
  const {
    simulationId = null,
    scenarioId = null,
    segments = [],
    passengerIds = [],
    deadlineUtc = null,
    gapPolicy = {},
  } = input;

  const ordered = [...segments].sort((a, b) => {
    if (Number.isFinite(a.sequence) && Number.isFinite(b.sequence) && a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return Date.parse(a.departureAtUtc) - Date.parse(b.departureAtUtc);
  });

  const normalized = [];
  const derivedGaps = [];
  const continuityIssues = [];
  let seq = 0;

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const mode = TYPE_TO_MODE[s.segmentType] || 'waiting';
    const rule = s.laborActivityType || TYPE_TO_RULE[s.segmentType] || 'connection_waiting';
    const pax = (s.passengerIds && s.passengerIds.length ? s.passengerIds : passengerIds) || [];

    normalized.push({
      id: s.id || `${scenarioId || 'seg'}-${seq}`,
      sequence: seq++,
      segmentType: s.segmentType,
      direction: s.direction || s.metadata?.direction || 'outbound',
      mode,
      originLocationId: s.originLocationId,
      destinationLocationId: s.destinationLocationId,
      originLocationType: s.originLocationType || null,
      destinationLocationType: s.destinationLocationType || null,
      departureAtUtc: s.departureAtUtc,
      arrivalAtUtc: s.arrivalAtUtc,
      originTimezone: s.originTimezone || s.destinationTimezone || 'America/Sao_Paulo',
      destinationTimezone: s.destinationTimezone || s.originTimezone || 'America/Sao_Paulo',
      providerId: s.providerName || null,
      providerReference: s.providerReference || null,
      commercialCostC: resolveSegmentCostC(s, pax.length),
      currency: s.currency || 'BRL',
      priceAllocation: s.priceAllocation || 'none',
      availabilityStatus: 'manual',
      laborCountingRuleId: rule,
      // Explicit overrides let manual waiting/meal/custom rules opt in/out of
      // paid time and rest qualification without touching the shared engine (§8).
      countsAsLabor: typeof s.countsAsLabor === 'boolean' ? s.countsAsLabor : undefined,
      qualifiesAsRest: typeof s.qualifiesAsRest === 'boolean'
        ? s.qualifiesAsRest
        : (mode === 'hotel_rest'),
      durationMinutes: durationMinutes(s.departureAtUtc, s.arrivalAtUtc),
      passengerIds: pax,
      source: 'manual',
      metadata: {
        ...(s.metadata || {}),
        direction: s.direction || s.metadata?.direction || 'outbound',
        releaseAtUtc: s.releaseAtUtc || null,
        quoteValidUntil: s.quoteValidUntil || null,
      },
    });

    // --- Gap detection between this leg and the next (§8, §9) ---
    const next = ordered[i + 1];
    if (!next) continue;
    const arrMs = Date.parse(s.arrivalAtUtc);
    const depMs = Date.parse(next.departureAtUtc);
    const gapMin = Math.round((depMs - arrMs) / MS_PER_MINUTE);

    // Geographic continuity (§9): a different terminal in the same/next location
    // needs an explicit transfer; flag it so feasibility can require one.
    const sameLocation = s.destinationLocationId === next.originLocationId;
    const bothTerminals = TERMINAL_TYPES.has(s.destinationLocationType) &&
      TERMINAL_TYPES.has(next.originLocationType);
    const differentTerminal = bothTerminals && s.destinationLocationType !== next.originLocationType;
    const nextIsTransfer = TYPE_TO_MODE[next.segmentType] === 'local_transfer';
    const sameDirection =
      (s.direction || s.metadata?.direction || 'outbound') ===
      (next.direction || next.metadata?.direction || 'outbound');

    if ((!sameLocation || differentTerminal) && !nextIsTransfer) {
      continuityIssues.push({
        code: 'missing_transfer',
        afterSegmentId: s.id || `${scenarioId || 'seg'}-${seq - 1}`,
        from: s.destinationLocationId,
        fromType: s.destinationLocationType,
        to: next.originLocationId,
        toType: next.originLocationType,
        gapMinutes: gapMin,
      });
    }

    // Derived waiting gap (§8): time between arriving and the next departure that
    // the user did not explicitly model. Marked `derived` and auditable.
    // Do not turn the field interval between outbound and return into a giant
    // paid "connection wait". The return remains a separate editable timeline;
    // any hotel/rest/activity that affects labor must be modelled explicitly.
    if (gapMin > 0 && sameDirection && !nextIsTransfer && sameLocation && !differentTerminal) {
      const gapSeg = {
        id: `${scenarioId || 'seg'}-gap-${seq}`,
        sequence: seq++,
        segmentType: 'waiting',
        direction: s.direction || s.metadata?.direction || 'outbound',
        mode: 'waiting',
        originLocationId: s.destinationLocationId,
        destinationLocationId: next.originLocationId,
        originLocationType: s.destinationLocationType || null,
        destinationLocationType: next.originLocationType || null,
        departureAtUtc: s.arrivalAtUtc,
        arrivalAtUtc: next.departureAtUtc,
        originTimezone: s.destinationTimezone || 'America/Sao_Paulo',
        destinationTimezone: next.originTimezone || s.destinationTimezone || 'America/Sao_Paulo',
        providerId: null,
        providerReference: null,
        commercialCostC: 0,
        currency: 'BRL',
        priceAllocation: 'none',
        availabilityStatus: 'derived',
        laborCountingRuleId: 'connection_waiting',
        countsAsLabor: undefined,
        qualifiesAsRest: false,
        durationMinutes: gapMin,
        passengerIds: passengerIds || [],
        source: 'derived',
        metadata: {
          origin: 'connection_policy',
          direction: s.direction || s.metadata?.direction || 'outbound',
        },
      };
      normalized.push(gapSeg);
      derivedGaps.push({ id: gapSeg.id, minutes: gapMin, at: s.destinationLocationId });
    }
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const paidModes = normalized.filter((n) => n.mode !== 'hotel_rest' && n.mode !== 'meal_break');
  const modeSequence = paidModes.map((n) => n.mode);
  const modalChangeCount = paidModes.reduce(
    (n, seg, i) => (i > 0 && paidModes[i - 1].mode !== seg.mode ? n + 1 : n), 0
  );
  const connectionCount = Math.max(0, normalized.filter(
    (n) => n.mode === 'bus' || n.mode === 'flight' || n.mode === 'rental_car' || n.mode === 'company_car'
  ).length - 1);

  const arrivalAtUtc = last ? last.arrivalAtUtc : null;
  const missesDeadline = deadlineUtc && arrivalAtUtc
    ? Date.parse(arrivalAtUtc) > Date.parse(deadlineUtc)
    : false;

  const itinerary = {
    id: `manual-${scenarioId || 'scenario'}`,
    simulationId,
    scenarioId,
    source: 'manual',
    departureAtUtc: first ? first.departureAtUtc : null,
    arrivalAtUtc,
    originLocationId: first ? first.originLocationId : null,
    destinationLocationId: last ? last.destinationLocationId : null,
    originTimezone: first ? first.originTimezone : null,
    destinationTimezone: last ? last.destinationTimezone : null,
    durationMinutes: first && last ? durationMinutes(first.departureAtUtc, last.arrivalAtUtc) : 0,
    segments: normalized,
    connectionCount,
    modalChangeCount,
    modeSequence,
    tripType: normalized.some((segment) => segment.direction === 'return') ? 'roundtrip' : 'oneway',
    timelines: {
      outbound: normalized.filter((segment) => segment.direction !== 'return').map((segment) => segment.id),
      return: normalized.filter((segment) => segment.direction === 'return').map((segment) => segment.id),
    },
    passengerIds,
    // Commercial cost is already resolved per segment by the adapter, so the
    // shared operational engine must NOT re-apply the per-person/shared split.
    commercialResolved: true,
    commercialCostC: normalized.reduce((sum, n) => sum + (n.commercialCostC || 0), 0),
    laborCostC: 0,
    permanenceCostC: 0,
    localMobilityCostC: 0,
    totalMobilizationCostC: 0,
    feasibilityStatus: missesDeadline ? 'invalid' : 'valid',
    feasibilityReasons: missesDeadline ? ['misses_arrival_deadline'] : [],
    score: 0,
    rankingCategory: undefined,
  };

  return { itinerary, derivedGaps, continuityIssues };
}
