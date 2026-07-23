/**
 * Default labor & travel-time policies in DOMAIN (camelCase) shape.
 *
 * These mirror the approved seed rows created by
 * supabase/migrations/0002_labor_policies.sql. The engine always reads values
 * from a policy object (never hardcoded §5/§32); these constants are the
 * in-memory representation used by callers and tests until the server DB layer
 * maps rows → domain objects.
 *
 * Durations are minutes; multipliers are absolute decimals.
 *
 * @module server/mobilization/laborPolicyDefaults
 */

/** @type {import('../../src/domain/types.js').LaborPolicyVersion} */
export const DEFAULT_LABOR_POLICY = Object.freeze({
  // v2 (0009 migration): Saturday all-overtime. v1 (…0001) is retired but kept
  // for historical snapshot reproducibility.
  id: '00000000-0000-4000-a000-000000000011',
  name: 'Política CLT Padrão',
  effectiveFrom: '2000-01-01',
  effectiveTo: undefined,
  regularDailyMinutes: 480, // 8h
  weekdayFirstOvertimeMinutes: 120, // next 2h
  weekdayFirstOvertimeMultiplier: 1.5,
  weekdayExcessMultiplier: 2.0,
  saturdayRegularMinutes: 480,
  saturdayExcessMultiplier: 2.0,
  // Spec §4.2 / Fase 2: on Saturday EVERY counted minute is +100% from the very
  // first minute — no 8h regular band, no 50% band. When true this overrides
  // saturdayRegularMinutes. Kept as a versioned, configurable policy flag (§5),
  // never hardcoded in the UI.
  saturdayAllHoursOvertime: true,
  sundayMultiplier: 2.5,
  nightStartLocalTime: '22:00',
  nightEndLocalTime: '05:00',
  nightMultiplier: 1.2, // +20%
  premiumStackingMode: 'additive', // see migration README — confirm with business
  // A continuous journey accumulates the daily counter across midnight (§7); a
  // gap >= this many minutes (11h CLT inter-journey rest) resets it. Stored in
  // the labor policy `data` jsonb in the DB (no dedicated column).
  interJourneyRestMinutes: 660,
  status: 'approved',
  version: 2,
});

/** @type {import('../../src/domain/types.js').TravelTimePolicy} */
export const DEFAULT_TRAVEL_TIME_POLICY = Object.freeze({
  id: '00000000-0000-4000-a000-000000000002',
  flightTimeCounts: true,
  busTimeCounts: true,
  passengerVehicleTimeCounts: true,
  driverVehicleTimeCounts: true,
  airportWaitingCounts: true,
  busTerminalWaitingCounts: true,
  connectionWaitingCounts: true,
  terminalTransferCounts: true,
  checkInCounts: true,
  baggageClaimCounts: true,
  overnightBusCounts: true,
  overnightFlightCounts: true,
  hotelRestCounts: false,
  mealBreakCounts: false,
});

/** Maps a segment's LaborCountingRuleId (§8) to its TravelTimePolicy flag. */
export const RULE_TO_TRAVEL_FLAG = Object.freeze({
  flight_time: 'flightTimeCounts',
  bus_time: 'busTimeCounts',
  passenger_vehicle_time: 'passengerVehicleTimeCounts',
  driver_vehicle_time: 'driverVehicleTimeCounts',
  airport_waiting: 'airportWaitingCounts',
  bus_terminal_waiting: 'busTerminalWaitingCounts',
  connection_waiting: 'connectionWaitingCounts',
  terminal_transfer: 'terminalTransferCounts',
  check_in: 'checkInCounts',
  baggage_claim: 'baggageClaimCounts',
  overnight_bus: 'overnightBusCounts',
  overnight_flight: 'overnightFlightCounts',
  hotel_rest: 'hotelRestCounts',
  meal_break: 'mealBreakCounts',
});
