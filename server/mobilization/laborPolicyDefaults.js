/**
 * Default labor & travel-time policies in DOMAIN (camelCase) shape.
 *
 * These mirror the latest approved versioned policy row. The engine always reads values
 * from a policy object (never hardcoded §5/§32); these constants are the
 * in-memory representation used by callers and tests until the server DB layer
 * maps rows → domain objects.
 *
 * Durations are minutes; multipliers are absolute decimals.
 *
 * @module server/mobilization/laborPolicyDefaults
 */

export const DAILY_STANDARD_HOURS = 8;
export const WEEKDAY_OVERTIME_RATE = 0.50;
export const COMPENSATED_DAY_OVERTIME_RATE = 1.00;
export const SUNDAY_HOLIDAY_OVERTIME_RATE = 1.50;
export const NIGHT_SHIFT_RATE = 0.20;
export const NIGHT_SHIFT_START = '22:00';
export const NIGHT_SHIFT_END = '05:00';
export const MIN_INTERJOURNEY_REST_HOURS = 11;
export const REDUCED_NIGHT_HOUR_MINUTES = 52.5;

/** @type {import('../../src/domain/types.js').LaborPolicyVersion} */
export const DEFAULT_LABOR_POLICY = Object.freeze({
  // Historical policy versions remain persisted for snapshot reproducibility.
  id: '00000000-0000-4000-a000-000000000014',
  name: 'Política CLT Padrão',
  effectiveFrom: '2000-01-01',
  effectiveTo: undefined,
  regularDailyMinutes: DAILY_STANDARD_HOURS * 60,
  weekdayFirstOvertimeMinutes: 120, // next 2h
  weekdayFirstOvertimeMultiplier: 1 + WEEKDAY_OVERTIME_RATE,
  weekdayExcessMultiplier: 1 + WEEKDAY_OVERTIME_RATE,
  saturdayRegularMinutes: DAILY_STANDARD_HOURS * 60,
  saturdayExcessMultiplier: 1 + WEEKDAY_OVERTIME_RATE,
  compensatedSaturdayMultiplier: 1 + COMPENSATED_DAY_OVERTIME_RATE,
  // Spec §4.2 / Fase 2: on Saturday EVERY counted minute is +100% from the very
  // first minute — no 8h regular band, no 50% band. When true this overrides
  // saturdayRegularMinutes. Kept as a versioned, configurable policy flag (§5),
  // never hardcoded in the UI.
  saturdayAllHoursOvertime: true,
  sundayMultiplier: 1 + SUNDAY_HOLIDAY_OVERTIME_RATE,
  nightStartLocalTime: NIGHT_SHIFT_START,
  nightEndLocalTime: NIGHT_SHIFT_END,
  nightMultiplier: 1 + NIGHT_SHIFT_RATE,
  premiumStackingMode: 'multiplicative',
  reducedNightHourEnabled: true,
  reducedNightHourMinutes: REDUCED_NIGHT_HOUR_MINUTES,
  // A continuous journey accumulates the daily counter across midnight (§7); a
  // gap >= this many minutes (11h CLT inter-journey rest) resets it. Stored in
  // the labor policy `data` jsonb in the DB (no dedicated column).
  interJourneyRestMinutes: MIN_INTERJOURNEY_REST_HOURS * 60,
  maxDailyOvertimeMinutes: 120,
  intervalRequiredAfterMinutes: 360,
  minimumRegisteredIntervalMinutes: 30,
  automaticJourneyIntervalEnabled: true,
  journeyIntervalEveryMinutes: 8 * 60,
  journeyIntervalDeductionMinutes: 60,
  status: 'approved',
  version: 4,
});

/**
 * Applies the employee's explicit schedule/category settings to a versioned
 * policy without creating a second calculation path.
 */
export function resolveEmployeeLaborPolicy(policy, employee = {}) {
  const configuredNumber = (value) => (
    value === null || value === undefined || value === '' ? Number.NaN : Number(value)
  );
  const configuredMinutes = Number(employee.dailyStandardMinutes);
  const configuredHours = Number(employee.dailyStandardHours);
  const regularDailyMinutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
    ? Math.round(configuredMinutes)
    : Number.isFinite(configuredHours) && configuredHours > 0
      ? Math.round(configuredHours * 60)
      : policy.regularDailyMinutes;
  const saturdayCompensated = typeof employee.saturdayCompensated === 'boolean'
    ? employee.saturdayCompensated
    : policy.saturdayAllHoursOvertime;
  const configuredOvertime50 = configuredNumber(employee.weekdayOvertimeMultiplier ?? employee.multHE50);
  const configuredCompensated = configuredNumber(employee.compensatedSaturdayMultiplier ?? employee.multHE100);
  const configuredSunday = configuredNumber(employee.sundayHolidayMultiplier ?? employee.multHE150);
  const configuredNightPercent = configuredNumber(employee.nightPremiumPercent ?? employee.percNoturno);
  const weekdayOvertimeMultiplier = Number.isFinite(configuredOvertime50) && configuredOvertime50 >= 1
    ? configuredOvertime50
    : policy.weekdayFirstOvertimeMultiplier;
  const compensatedSaturdayMultiplier = Number.isFinite(configuredCompensated) && configuredCompensated >= 1
    ? configuredCompensated
    : policy.compensatedSaturdayMultiplier;
  const sundayMultiplier = Number.isFinite(configuredSunday) && configuredSunday >= 1
    ? configuredSunday
    : policy.sundayMultiplier;
  const nightMultiplier = Number.isFinite(configuredNightPercent) && configuredNightPercent >= 0
    ? 1 + configuredNightPercent / 100
    : policy.nightMultiplier;

  return {
    ...policy,
    regularDailyMinutes,
    saturdayRegularMinutes: Number.isFinite(Number(employee.saturdayRegularMinutes))
      && Number(employee.saturdayRegularMinutes) > 0
      ? Math.round(Number(employee.saturdayRegularMinutes))
      : regularDailyMinutes,
    saturdayAllHoursOvertime: saturdayCompensated,
    weekdayFirstOvertimeMultiplier: weekdayOvertimeMultiplier,
    weekdayExcessMultiplier: weekdayOvertimeMultiplier,
    saturdayExcessMultiplier: weekdayOvertimeMultiplier,
    compensatedSaturdayMultiplier,
    sundayMultiplier,
    nightMultiplier,
    reducedNightHourEnabled: typeof employee.reducedNightHourEnabled === 'boolean'
      ? employee.reducedNightHourEnabled
      : policy.reducedNightHourEnabled,
  };
}

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
