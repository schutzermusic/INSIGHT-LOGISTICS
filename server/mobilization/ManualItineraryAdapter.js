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
 * derived connection operations + flags impossible connections (§8, §9).
 *
 * Money is integer centavos (§5/§32). Timestamps are UTC; each endpoint carries
 * its local IANA timezone for labor classification (§14/§23).
 *
 * @module server/mobilization/ManualItineraryAdapter
 */

import { connectionComponents } from './ConnectionFeasibilityService.js';

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

  const addDerived = ({
    segmentType, mode = 'waiting', rule, startMs, minutes, prev, next, passengers, component,
  }) => {
    if (minutes <= 0) return null;
    const derived = {
      id: `${scenarioId || 'seg'}-derived-${seq}`,
      sequence: seq++,
      segmentType,
      direction: prev.direction || prev.metadata?.direction || 'outbound',
      mode,
      originLocationId: prev.destinationLocationId,
      destinationLocationId: next.originLocationId,
      originLocationType: prev.destinationLocationType || null,
      destinationLocationType: next.originLocationType || null,
      departureAtUtc: new Date(startMs).toISOString(),
      arrivalAtUtc: new Date(startMs + minutes * MS_PER_MINUTE).toISOString(),
      originTimezone: prev.destinationTimezone || 'America/Sao_Paulo',
      destinationTimezone: next.originTimezone || prev.destinationTimezone || 'America/Sao_Paulo',
      providerId: null,
      providerReference: null,
      commercialCostC: 0,
      currency: 'BRL',
      priceAllocation: 'none',
      availabilityStatus: 'derived',
      laborCountingRuleId: rule,
      countsAsLabor: undefined,
      qualifiesAsRest: false,
      durationMinutes: minutes,
      passengerIds: passengers,
      source: 'derived',
      metadata: {
        origin: 'connection_policy',
        component,
        systemGenerated: true,
        direction: prev.direction || prev.metadata?.direction || 'outbound',
      },
    };
    normalized.push(derived);
    return derived;
  };

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const mode = TYPE_TO_MODE[s.segmentType] || 'waiting';
    const rule = s.laborActivityType || TYPE_TO_RULE[s.segmentType] || 'connection_waiting';
    const pax = (s.passengerIds && s.passengerIds.length ? s.passengerIds : passengerIds) || [];
    const direction = s.direction || s.metadata?.direction || 'outbound';
    const previousInput = ordered[i - 1];
    const nextInput = ordered[i + 1];
    const firstInDirection = !previousInput ||
      (previousInput.direction || previousInput.metadata?.direction || 'outbound') !== direction;
    const lastInDirection = !nextInput ||
      (nextInput.direction || nextInput.metadata?.direction || 'outbound') !== direction;

    if (firstInDirection && ['bus', 'flight'].includes(mode)) {
      const boardingMinutes = Math.max(0, Number(s.metadata?.boardingLeadMinutes || 0));
      addDerived({
        segmentType: 'check_in_boarding',
        rule: 'check_in',
        startMs: Date.parse(s.departureAtUtc) - boardingMinutes * MS_PER_MINUTE,
        minutes: boardingMinutes,
        prev: {
          ...s,
          direction,
          destinationLocationId: s.originLocationId,
          destinationLocationType: s.originLocationType,
          destinationTimezone: s.originTimezone,
        },
        next: s,
        passengers: pax,
        component: 'check_in_boarding',
      });
    }

    normalized.push({
      id: s.id || `${scenarioId || 'seg'}-${seq}`,
      sequence: seq++,
      segmentType: s.segmentType,
      direction,
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
        direction,
        releaseAtUtc: s.releaseAtUtc || null,
        quoteValidUntil: s.quoteValidUntil || null,
      },
    });

    // --- Connection calculation between this leg and the next (§8, §9) ---
    if (lastInDirection && ['bus', 'flight'].includes(mode)) {
      let cursor = Date.parse(s.arrivalAtUtc);
      const disembarkationMinutes = Math.max(0, Number(s.metadata?.disembarkMinutes || 0));
      const baggageClaimMinutes = mode === 'flight'
        ? (s.metadata?.checkedBaggage === true ? Math.max(0, Number(s.metadata?.baggageClaimMinutes || 0)) : 0)
        : Math.max(0, Number(s.metadata?.baggageClaimMinutes || 0));
      addDerived({
        segmentType: 'disembarkation',
        rule: mode === 'flight' ? 'airport_waiting' : 'bus_terminal_waiting',
        startMs: cursor,
        minutes: disembarkationMinutes,
        prev: s,
        next: {
          ...s,
          originLocationId: s.destinationLocationId,
          originLocationType: s.destinationLocationType,
          originTimezone: s.destinationTimezone,
        },
        passengers: pax,
        component: 'disembarkation',
      });
      cursor += disembarkationMinutes * MS_PER_MINUTE;
      addDerived({
        segmentType: 'baggage_claim',
        rule: 'baggage_claim',
        startMs: cursor,
        minutes: baggageClaimMinutes,
        prev: s,
        next: {
          ...s,
          originLocationId: s.destinationLocationId,
          originLocationType: s.destinationLocationType,
          originTimezone: s.destinationTimezone,
        },
        passengers: pax,
        component: 'baggage_claim',
      });
    }

    const next = nextInput;
    if (!next) continue;
    const arrMs = Date.parse(s.arrivalAtUtc);
    const depMs = Date.parse(next.departureAtUtc);
    const gapMin = Math.round((depMs - arrMs) / MS_PER_MINUTE);

    // Geographic continuity: cross-city gaps still require an explicit transfer.
    // Same-city terminal changes are represented by a derived transfer block.
    const sameLocation = s.destinationLocationId === next.originLocationId;
    const bothTerminals = TERMINAL_TYPES.has(s.destinationLocationType) &&
      TERMINAL_TYPES.has(next.originLocationType);
    const differentTerminal = bothTerminals && s.destinationLocationType !== next.originLocationType;
    const nextIsTransfer = TYPE_TO_MODE[next.segmentType] === 'local_transfer';
    const currentIsTransfer = mode === 'local_transfer';
    const sameDirection =
      (s.direction || s.metadata?.direction || 'outbound') ===
      (next.direction || next.metadata?.direction || 'outbound');

    if (!sameLocation && !nextIsTransfer) {
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

    // Outbound and return are independent timelines; no giant field wait is
    // inferred between them.
    if (sameDirection && gapMin >= 0) {
      const prevNormalized = normalized.at(-1);
      const nextMode = TYPE_TO_MODE[next.segmentType] || 'waiting';
      const transitioningPassengers = (prevNormalized.passengerIds || passengerIds)
        .filter((id) => !(next.passengerIds?.length) || next.passengerIds.includes(id));
      const connection = connectionComponents(prevNormalized, {
        mode: nextMode,
        departureAtUtc: next.departureAtUtc,
        metadata: next.metadata || {},
      }, {
        policy: gapPolicy,
        requiresTerminalTransfer: sameLocation && differentTerminal && !nextIsTransfer && !currentIsTransfer,
      });
      const summary = {
        afterSegmentId: prevNormalized.id,
        beforeSegmentId: next.id,
        at: s.destinationLocationId,
        ...connection,
      };
      derivedGaps.push(summary);

      if (!connection.feasible) {
        continuityIssues.push({
          code: 'insufficient_connection',
          afterSegmentId: prevNormalized.id,
          beforeSegmentId: next.id,
          availableMinutes: connection.availableMinutes,
          requiredMinutes: connection.requiredMinutes,
          components: connection.components,
        });
        continue;
      }

      let cursor = arrMs;
      const c = connection.components;
      addDerived({
        segmentType: 'disembarkation',
        rule: mode === 'flight' ? 'airport_waiting' : 'bus_terminal_waiting',
        startMs: cursor,
        minutes: c.disembarkationMinutes,
        prev: s,
        next,
        passengers: transitioningPassengers,
        component: 'disembarkation',
      });
      cursor += c.disembarkationMinutes * MS_PER_MINUTE;
      addDerived({
        segmentType: 'baggage_claim',
        rule: 'baggage_claim',
        startMs: cursor,
        minutes: c.baggageClaimMinutes,
        prev: s,
        next,
        passengers: transitioningPassengers,
        component: 'baggage_claim',
      });
      cursor += c.baggageClaimMinutes * MS_PER_MINUTE;
      addDerived({
        segmentType: 'terminal_transfer',
        mode: 'local_transfer',
        rule: 'terminal_transfer',
        startMs: cursor,
        minutes: c.terminalTransferMinutes,
        prev: s,
        next,
        passengers: transitioningPassengers,
        component: 'terminal_transfer',
      });
      cursor += c.terminalTransferMinutes * MS_PER_MINUTE;
      const wait = addDerived({
        segmentType: 'waiting',
        rule: 'connection_waiting',
        startMs: cursor,
        minutes: connection.residualWaitingMinutes,
        prev: s,
        next,
        passengers: transitioningPassengers,
        component: 'residual_waiting',
      });
      cursor += connection.residualWaitingMinutes * MS_PER_MINUTE;
      addDerived({
        segmentType: 'check_in_boarding',
        rule: 'check_in',
        startMs: cursor,
        minutes: c.nextBoardingBufferMinutes,
        prev: s,
        next,
        passengers: transitioningPassengers,
        component: 'check_in_boarding',
      });
      summary.id = wait?.id || null;
      summary.minutes = connection.residualWaitingMinutes;
    }
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const paidModes = normalized.filter(
    (n) => n.source !== 'derived' && n.mode !== 'hotel_rest' && n.mode !== 'meal_break'
  );
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
