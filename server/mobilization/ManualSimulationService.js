/**
 * ManualSimulationService (§3, §11, §13, §16, §21).
 *
 * The manual counterpart of MobilizationSearchService: it takes manually-entered
 * scenarios (each an ordered list of segments + a team) and runs them through the
 * SAME shared pipeline — ManualItineraryAdapter → LaborCostEngine (per employee)
 * → OperationalCostEngine (commercial/permanence/local) → ManualFeasibilityService
 * → RecommendationEngine. NO parallel labor or final-cost engine (§3, §28).
 *
 * Labor is computed INDIVIDUALLY per employee over only that employee's segments
 * (§14 — different passengers per leg), never a team average, then consolidated.
 * Money is integer centavos throughout (§5/§32).
 *
 * @module server/mobilization/ManualSimulationService
 */

import { buildManualItinerary } from './ManualItineraryAdapter.js';
import { evaluateManualFeasibility } from './ManualFeasibilityService.js';
import { computeItineraryCost } from './OperationalCostEngine.js';
import { classifyLabor } from './LaborCostEngine.js';
import { recommend } from './RecommendationEngine.js';
import {
  DEFAULT_LABOR_POLICY,
  DEFAULT_TRAVEL_TIME_POLICY,
  resolveEmployeeLaborPolicy,
} from './laborPolicyDefaults.js';

const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

/** Reduce a labor block list into the §11.2 per-employee minute buckets. */
export function summarizeBlocks(blocks) {
  const s = {
    regularMinutes: 0,
    weekdayOvertime50Minutes: 0,
    weekdayOvertime100Minutes: 0,
    saturdayOvertime100Minutes: 0,
    sundayPremium150Minutes: 0,
    holidayPremiumMinutes: 0,
    nightPremiumMinutes: 0,
    totalCountedMinutes: 0,
  };
  for (const b of blocks) {
    const m = b.countedMinutes;
    s.totalCountedMinutes += m;
    if (b.nightPremiumApplied) s.nightPremiumMinutes += m;
    if (b.baseClassification === 'regular') s.regularMinutes += m;
    else if (b.baseClassification === 'overtime_50') s.weekdayOvertime50Minutes += m;
    else if (b.baseClassification === 'overtime_100') {
      if (b.dayType === 'saturday') s.saturdayOvertime100Minutes += m;
      else s.weekdayOvertime100Minutes += m;
    } else if (b.baseClassification === 'overtime_150') {
      if (b.dayType === 'holiday') s.holidayPremiumMinutes += m;
      else s.sundayPremium150Minutes += m;
    }
  }
  return s;
}

/** Segments a given employee actually travels on (§14). */
export function segmentsForEmployee(itinerary, employeeId) {
  return itinerary.segments.filter(
    (s) => !s.passengerIds || s.passengerIds.length === 0 || s.passengerIds.includes(employeeId)
  );
}

/** Server-side form validation. Calculation endpoints must not silently turn an
 * incomplete editor into a zero-cost scenario. */
export function validateManualSimulationInput(input) {
  const errors = [];
  const employeeIds = new Set((input.employees || []).map((employee) => employee.id));
  if (!employeeIds.size) errors.push('Selecione ao menos um colaborador.');
  for (const [scenarioIndex, scenario] of (input.scenarios || []).entries()) {
    const segments = scenario.segments || [];
    if (!segments.length) {
      errors.push(`Cenário ${scenarioIndex + 1}: adicione ao menos um trecho.`);
      continue;
    }
    for (const [segmentIndex, segment] of segments.entries()) {
      const prefix = `Cenário ${scenarioIndex + 1}, trecho ${segmentIndex + 1}`;
      const departure = Date.parse(segment.departureAtUtc);
      const arrival = Date.parse(segment.arrivalAtUtc);
      if (!segment.originLocationId || !segment.destinationLocationId) {
        errors.push(`${prefix}: origem e destino são obrigatórios.`);
      }
      if (!Number.isFinite(departure) || !Number.isFinite(arrival)) {
        errors.push(`${prefix}: data e hora de saída e chegada são obrigatórias.`);
      } else if (arrival <= departure) {
        errors.push(`${prefix}: a chegada deve ser posterior à saída.`);
      }
      if (!Number.isInteger(segment.priceAmountMinor) || segment.priceAmountMinor < 0) {
        errors.push(`${prefix}: preço manual inválido.`);
      }
      const passengers = segment.passengerIds || [...employeeIds];
      if (!passengers.length || passengers.some((id) => !employeeIds.has(id))) {
        errors.push(`${prefix}: colaboradores vinculados inválidos.`);
      }
    }
  }
  return errors;
}

/**
 * Cost one scenario end-to-end, reusing the shared engines.
 * @param {Object} p
 * @param {object} p.scenario — { id, name, segments }
 * @param {Array<{id,name,role,hourlyRateC,priorWorkedMinutes?,workedMinutesSource?}>} p.employees
 * @param {object} p.policy
 * @param {object} p.travelTimePolicy
 * @param {string} [p.deadlineUtc]
 * @param {object} [p.config] — cost config overrides
 * @param {string[]} [p.holidays]
 * @param {number} [p.daysInField]
 * @returns {object} costed scenario itinerary (recommend-compatible)
 */
export function computeScenario(p) {
  const {
    scenario, employees, policy, travelTimePolicy, allowancePolicy,
    deadlineUtc = null, config = {}, holidays = [], daysInField = 0,
  } = p;
  const employeeIds = employees.map((e) => e.id);

  const { itinerary, derivedGaps, continuityIssues } = buildManualItinerary({
    scenarioId: scenario.id,
    simulationId: scenario.simulationId,
    segments: scenario.segments || [],
    passengerIds: employeeIds,
    deadlineUtc,
    gapPolicy: config.connectionBufferPolicy || config.connectionBuffers || {},
  });

  const feasibility = evaluateManualFeasibility({
    itinerary, continuityIssues, employeeIds, deadlineUtc,
    minimumRestMinutes: policy.interJourneyRestMinutes ?? 660,
  });

  // Operational (commercial/permanence/local) via the shared engine in manual
  // mode — its own labor pass is discarded; labor is recomputed per employee
  // below over each employee's actual segments (§14).
  const op = computeItineraryCost({
    itinerary, employees, laborContext: { policy, travelTimePolicy, holidays },
    config, fieldContext: { daysInField }, allowancePolicy,
  });
  const b = op.breakdown;
  const commercialCostC = op.itinerary.commercialCostC;
  const permanenceCostC = op.itinerary.permanenceCostC;
  const localMobilityCostC = op.itinerary.localMobilityCostC;

  // Individual labor (§11): each employee over their own segments, own rate.
  let laborCostC = 0;
  const laborByEmployee = employees.map((emp) => {
    if (!Number.isInteger(emp.hourlyRateC) || emp.hourlyRateC <= 0) {
      return {
        employeeId: emp.id, employeeName: emp.name, hourlyRateC: emp.hourlyRateC || 0,
        totalCostC: 0, blocks: [], summary: summarizeBlocks([]), warning: 'missing_hourly_rate',
      };
    }
    const employeePolicy = resolveEmployeeLaborPolicy(policy, emp);
    const r = classifyLabor({
      segments: segmentsForEmployee(itinerary, emp.id),
      hourlyRateC: emp.hourlyRateC,
      policy: employeePolicy, travelTimePolicy,
      priorWorkedMinutes: emp.priorWorkedMinutes || 0,
      holidays,
    });
    laborCostC += r.totalCostC;
    return {
      employeeId: emp.id, employeeName: emp.name, hourlyRateC: emp.hourlyRateC,
      priorWorkedMinutes: emp.priorWorkedMinutes || 0,
      workedMinutesSource: emp.workedMinutesSource || 'manual',
      schedule: {
        dailyStandardMinutes: employeePolicy.regularDailyMinutes,
        saturdayCompensated: employeePolicy.saturdayAllHoursOvertime,
        reducedNightHourEnabled: employeePolicy.reducedNightHourEnabled,
        weekdayOvertimeMultiplier: employeePolicy.weekdayFirstOvertimeMultiplier,
        compensatedSaturdayMultiplier: employeePolicy.compensatedSaturdayMultiplier,
        sundayMultiplier: employeePolicy.sundayMultiplier,
        nightMultiplier: employeePolicy.nightMultiplier,
      },
      totalCostC: r.totalCostC,
      blocks: r.blocks,
      deductions: r.deductions,
      summary: summarizeBlocks(r.blocks),
      alerts: r.alerts,
    };
  });

  const totalMobilizationCostC = commercialCostC + laborCostC + permanenceCostC + localMobilityCostC;

  return {
    id: itinerary.id,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    source: 'manual',
    departureAtUtc: itinerary.departureAtUtc,
    arrivalAtUtc: itinerary.arrivalAtUtc,
    durationMinutes: itinerary.durationMinutes,
    segments: itinerary.segments,
    connectionCount: itinerary.connectionCount,
    modalChangeCount: itinerary.modalChangeCount,
    modeSequence: itinerary.modeSequence,
    tripType: itinerary.tripType,
    timelines: itinerary.timelines,
    commercialCostC,
    laborCostC,
    permanenceCostC,
    localMobilityCostC,
    totalMobilizationCostC,
    // Feasibility drives whether a scenario can be recommended (§15/§16).
    feasibilityStatus: feasibility.status === 'valid' || feasibility.status === 'warning' ? 'valid'
      : feasibility.status === 'requires_approval' ? 'warning' : 'invalid',
    feasibilityDetail: feasibility.status,
    feasibilityReasons: itinerary.feasibilityReasons,
    feasibilityChecks: feasibility.checks,
    rest: feasibility.rest,
    derivedGaps,
    continuityIssues,
    breakdown: {
      ticket_c: b.ticket_c, shared_vehicle_c: b.shared_vehicle_c, labor_c: laborCostC,
      transit_meals_c: b.transit_meals_c, transit_hotel_c: b.transit_hotel_c,
      field_meals_c: b.field_meals_c, field_hotel_c: b.field_hotel_c,
      terminal_transfers_c: b.terminal_transfers_c, field_local_c: b.field_local_c,
      meal_allowances: b.meal_allowances, meal_allowance_policy: b.meal_allowance_policy,
      commercial_c: commercialCostC, permanence_c: permanenceCostC, local_mobility_c: localMobilityCostC,
      total_c: totalMobilizationCostC,
    },
    laborByEmployee,
    mealAllowance: op.mealAllowance,
    score: 0,
    rankingCategory: undefined,
  };
}

/**
 * Run a full manual simulation across all its scenarios (§16).
 * @param {Object} input
 * @param {object} [input.simulation] — context metadata
 * @param {Array} input.scenarios
 * @param {Array} input.employees — with salarioBase+cargaHoraria OR hourlyRateC
 * @param {object} [input.policy]
 * @param {object} [input.travelTimePolicy]
 * @param {string} [input.deadlineUtc]
 * @param {object} [input.config]
 * @param {string[]} [input.holidays]
 * @param {number} [input.daysInField]
 * @returns {object} UI-ready payload
 */
export function runManualSimulation(input) {
  const policy = input.policy || DEFAULT_LABOR_POLICY;
  const travelTimePolicy = input.travelTimePolicy || DEFAULT_TRAVEL_TIME_POLICY;
  const allowancePolicy = input.allowancePolicy;
  const deadlineUtc = input.deadlineUtc || input.simulation?.deadlineUtc || null;

  // Normalize employee cost basis to centavos/hour (§6) — never float money.
  const employees = (input.employees || []).map((e) => ({
    id: e.id,
    name: e.nome || e.name || 'Colaborador',
    role: e.cargo || e.role || '',
    hourlyRateC: Number.isInteger(e.hourlyRateC)
      ? e.hourlyRateC
      : (e.salarioBase && e.cargaHoraria ? Math.round((e.salarioBase / e.cargaHoraria) * 100) : 0),
    priorWorkedMinutes: e.priorWorkedMinutes || 0,
    workedMinutesSource: e.workedMinutesSource || 'manual',
    allowanceCategory: e.allowanceCategory === 'leader' ? 'leader' : 'standard',
    allowanceOverride: e.allowanceOverride || null,
    allowanceOverrideJustification: e.allowanceOverrideJustification || null,
    dailyStandardMinutes: Number.isFinite(Number(e.dailyStandardMinutes))
      ? Math.round(Number(e.dailyStandardMinutes))
      : Number.isFinite(Number(e.dailyStandardHours))
        ? Math.round(Number(e.dailyStandardHours) * 60)
        : policy.regularDailyMinutes,
    saturdayCompensated: typeof e.saturdayCompensated === 'boolean'
      ? e.saturdayCompensated
      : policy.saturdayAllHoursOvertime,
    reducedNightHourEnabled: typeof e.reducedNightHourEnabled === 'boolean'
      ? e.reducedNightHourEnabled
      : policy.reducedNightHourEnabled,
    multHE50: optionalNumber(e.multHE50),
    multHE100: optionalNumber(e.multHE100),
    multHE150: optionalNumber(e.multHE150),
    percNoturno: optionalNumber(e.percNoturno),
  }));

  const scenarios = (input.scenarios || []).map((scenario) =>
    computeScenario({
      scenario, employees, policy, travelTimePolicy, allowancePolicy, deadlineUtc,
      config: input.config || {}, holidays: input.holidays || [], daysInField: input.daysInField || 0,
    })
  );

  const rec = recommend({ itineraries: scenarios });

  return {
    success: true,
    simulation: input.simulation || null,
    employees: employees.map(({
      id, name, role, hourlyRateC, priorWorkedMinutes, allowanceCategory,
      dailyStandardMinutes, saturdayCompensated, reducedNightHourEnabled,
      multHE50, multHE100, multHE150, percNoturno,
    }) => ({
      id, name, role, hourlyRateC, priorWorkedMinutes, allowanceCategory,
      dailyStandardMinutes, saturdayCompensated, reducedNightHourEnabled,
      multHE50, multHE100, multHE150, percNoturno,
    })),
    scenarios,
    recommended: rec.recommended || null,
    ranked: rec.ranked,
    reasonCodes: rec.reasonCodes,
    explanation: rec.explanation,
    comparison: rec.comparison || null,
    policySummary: {
      name: policy.name, version: policy.version,
      premiumStackingMode: policy.premiumStackingMode,
      mealAllowancePolicyVersionId: scenarios[0]?.mealAllowance?.policy?.id || null,
      mealAllowancePolicyVersion: scenarios[0]?.mealAllowance?.policy?.version || null,
      lines: [
        `SEG–SEX: jornada contratual individual (padrão ${policy.regularDailyMinutes / 60}h)`,
        `SEG–SEX: excedente a +${Math.round((policy.weekdayFirstOvertimeMultiplier - 1) * 100)}%; acima de 2h gera alerta`,
        policy.saturdayAllHoursOvertime
          ? `SÁBADO COMPENSADO: todas as horas a +${Math.round(((policy.compensatedSaturdayMultiplier ?? 2) - 1) * 100)}%`
          : `SÁBADO: após ${policy.saturdayRegularMinutes / 60}h a +${Math.round((policy.saturdayExcessMultiplier - 1) * 100)}%`,
        `DOMINGO: todas as horas a ${policy.sundayMultiplier}×`,
        `NOTURNO: ${policy.nightStartLocalTime}–${policy.nightEndLocalTime} a +${Math.round((policy.nightMultiplier - 1) * 100)}%`,
        `DESCANSO: ${(policy.interJourneyRestMinutes ?? 660) / 60}h consecutivas para reinício`,
      ],
    },
  };
}
