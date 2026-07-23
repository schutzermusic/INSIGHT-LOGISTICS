/**
 * OperationalCostEngine (§19).
 *
 * Turns a generated itinerary (commercial legs + timeline) into a full,
 * structured cost breakdown — commercial, road vehicle, permanence, local
 * mobility and (via the LaborCostEngine) labor — all in integer centavos. Every
 * component is available separately, not just a total (§19).
 *
 * Cost basis rules:
 * - Flight/bus fares are PER PERSON → multiplied by team size.
 * - Rental/company vehicle is a SHARED cost → counted once.
 * - Labor is summed across the team from the deterministic labor engine (§15),
 *   so a slow itinerary (long timeline) accrues more labor/meals — the core
 *   reason a cheap ticket can lose on total mobilization cost (§1, §20).
 *
 * @module server/mobilization/OperationalCostEngine
 */

import { classifyLabor } from './LaborCostEngine.js';

export const DEFAULT_COST_CONFIG = Object.freeze({
  mealDailyC: 8000,       // R$80,00/dia (3 refeições)
  hotelDailyC: 15000,     // R$150,00/noite
  localDailyC: 4000,      // R$40,00/dia no destino
  transferFlatC: 6000,    // R$60,00 por transferência de terminal (compartilhado)
  mealIntervalHours: 5,   // uma refeição a cada ~5h em trânsito
  overnightMinHours: 5,   // espera noturna >= 5h exige hotel
});

const PER_PERSON_MODES = new Set(['flight', 'bus']);
const SHARED_MODES = new Set(['rental_car', 'company_car']);

/** True if [startMs,endMs) overlaps the night window (22:00–05:00 local). */
function overlapsNight(startMs, endMs, tz, nightStart = 22, nightEnd = 5) {
  const STEP = 30 * 60000;
  for (let t = startMs; t < endMs; t += STEP) {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(t))
    ) % 24;
    if (hour >= nightStart || hour < nightEnd) return true;
  }
  return false;
}

/**
 * Compute the full cost of one itinerary.
 * @param {Object} p
 * @param {object} p.itinerary — a MultimodalItinerary from the generator
 * @param {Array<{ id: string, hourlyRateC: number, priorWorkedMinutes?: number }>} p.employees
 * @param {{ policy: object, travelTimePolicy: object, holidays?: string[] }} p.laborContext
 * @param {object} [p.config] — overrides DEFAULT_COST_CONFIG (from admin config §22)
 * @param {{ daysInField?: number }} [p.fieldContext]
 * @returns {{ itinerary: object, breakdown: object, laborByEmployee: object[] }}
 */
export function computeItineraryCost({ itinerary, employees, laborContext, config = {}, fieldContext = {} }) {
  const cfg = { ...DEFAULT_COST_CONFIG, ...config };
  const team = Math.max(1, employees.length);

  // Manual itineraries arrive with segment costs already resolved by the
  // ManualItineraryAdapter (§7.2 price allocation) and with EXPLICIT hotel/meal/
  // transfer segments — so we must not re-apply the per-person split nor auto-
  // derive permanence from duration. Automatic itineraries keep the original
  // per-person × team behaviour. Labor is the SAME shared engine in both (§3).
  const manual = itinerary.commercialResolved === true;

  // --- Commercial (per-person fares × team, shared vehicle once) ---
  let perPersonC = 0;
  let sharedC = 0;
  for (const s of itinerary.segments) {
    if (manual) {
      if (PER_PERSON_MODES.has(s.mode) || SHARED_MODES.has(s.mode)) perPersonC += s.commercialCostC || 0;
    } else if (PER_PERSON_MODES.has(s.mode)) {
      perPersonC += s.commercialCostC || 0;
    } else if (SHARED_MODES.has(s.mode)) {
      sharedC += s.commercialCostC || 0;
    }
  }
  const commercialCostC = manual ? perPersonC : perPersonC * team + sharedC;

  // --- Labor (deterministic engine, per employee, §15) ---
  // Employees without a valid hourly rate (missing salary/hours) contribute no
  // labor cost and are flagged, rather than aborting the whole search.
  let laborCostC = 0;
  const laborByEmployee = employees.map((emp) => {
    if (!Number.isInteger(emp.hourlyRateC) || emp.hourlyRateC <= 0) {
      return { employeeId: emp.id, totalCostC: 0, blocks: [], warning: 'missing_hourly_rate' };
    }
    const r = classifyLabor({
      segments: itinerary.segments,
      hourlyRateC: emp.hourlyRateC,
      policy: laborContext.policy,
      travelTimePolicy: laborContext.travelTimePolicy,
      priorWorkedMinutes: emp.priorWorkedMinutes || 0,
      holidays: laborContext.holidays || [],
    });
    laborCostC += r.totalCostC;
    return { employeeId: emp.id, totalCostC: r.totalCostC, blocks: r.blocks };
  });

  // --- Transit meals (scale with timeline duration) ---
  const durationHours = itinerary.durationMinutes / 60;
  let mealsCount = 0;
  let transitMealsC = 0;
  if (manual) {
    // Manual: explicit meal_break segment prices are the source of truth.
    transitMealsC = itinerary.segments
      .filter((s) => s.mode === 'meal_break')
      .reduce((sum, s) => sum + (s.commercialCostC || 0), 0);
  } else {
    mealsCount = Math.floor(durationHours / cfg.mealIntervalHours);
    const perMealC = Math.round(cfg.mealDailyC / 3);
    transitMealsC = mealsCount * perMealC * team;
  }

  // --- Transit hotel (long night waits/rests not spent on a vehicle) ---
  let hotelNights = 0;
  let transitHotelC = 0;
  if (manual) {
    // Manual: explicit hotel_rest segment prices are the source of truth.
    transitHotelC = itinerary.segments
      .filter((s) => s.mode === 'hotel_rest')
      .reduce((sum, s) => sum + (s.commercialCostC || 0), 0);
    hotelNights = itinerary.segments.filter((s) => s.mode === 'hotel_rest' && (s.commercialCostC || 0) > 0).length;
  } else {
    for (const s of itinerary.segments) {
      if (s.mode !== 'waiting' && s.mode !== 'hotel_rest') continue;
      const dur = (Date.parse(s.arrivalAtUtc) - Date.parse(s.departureAtUtc)) / 60000;
      if (dur < cfg.overnightMinHours * 60) continue;
      if (overlapsNight(Date.parse(s.departureAtUtc), Date.parse(s.arrivalAtUtc), s.originTimezone)) hotelNights++;
    }
    transitHotelC = hotelNights * cfg.hotelDailyC * team;
  }

  // --- Local mobility (terminal transfers) ---
  const transferCount = itinerary.segments.filter((s) => s.mode === 'local_transfer').length;
  const transferC = manual
    ? itinerary.segments.filter((s) => s.mode === 'local_transfer').reduce((sum, s) => sum + (s.commercialCostC || 0), 0)
    : transferCount * cfg.transferFlatC;

  // --- Optional destination field permanence (constant across options) ---
  const daysInField = fieldContext.daysInField || 0;
  const fieldMealsC = daysInField * cfg.mealDailyC * team;
  const fieldHotelC = daysInField * cfg.hotelDailyC * team;
  const fieldLocalC = daysInField * cfg.localDailyC * team;

  const permanenceCostC = transitMealsC + transitHotelC + fieldMealsC + fieldHotelC;
  const localMobilityCostC = transferC + fieldLocalC;
  const totalMobilizationCostC = commercialCostC + laborCostC + permanenceCostC + localMobilityCostC;

  const breakdown = {
    ticket_c: manual ? perPersonC : perPersonC * team,
    shared_vehicle_c: sharedC,
    labor_c: laborCostC,
    transit_meals_c: transitMealsC,
    transit_hotel_c: transitHotelC,
    field_meals_c: fieldMealsC,
    field_hotel_c: fieldHotelC,
    terminal_transfers_c: transferC,
    field_local_c: fieldLocalC,
    total_c: totalMobilizationCostC,
    inputs: { team, mealsCount, hotelNights, transferCount, daysInField },
  };

  return {
    itinerary: {
      ...itinerary,
      commercialCostC,
      laborCostC,
      permanenceCostC,
      localMobilityCostC,
      totalMobilizationCostC,
    },
    breakdown,
    laborByEmployee,
  };
}
