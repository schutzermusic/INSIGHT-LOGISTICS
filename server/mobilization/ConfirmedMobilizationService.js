/**
 * ConfirmedMobilizationService (§3.1 — dashboard confirmation gate).
 *
 * Turns a SELECTED scenario/itinerary (from the Manual Simulation or Automatic
 * Mobilization flow) into an immutable, dashboard-eligible confirmed record.
 *
 * This is the single choke point that enforces the critical rule: only records
 * that pass the mandatory-field gate here may ever feed the dashboard, the HUD
 * globe, KPIs, rankings, project/collaborator/category spend and savings.
 * Drafts, previews, provider quotes and unselected scenarios are rejected.
 *
 * It reuses the existing engines' output (breakdown, laborByEmployee, mode
 * sequence, timings) — no parallel cost engine — and only (a) validates, (b)
 * normalizes categories via dashboardCategories, and (c) attributes shared cost
 * per collaborator (§10). Money is integer centavos throughout.
 *
 * @module server/mobilization/ConfirmedMobilizationService
 */

import { normalizeCategorySpend, CATEGORY_GROUP, splitLaborByClassification } from './dashboardCategories.js';
import { resolveNode } from './geo.js';

/** Statuses a confirmed record can carry and still be dashboard-eligible (§3.1). */
export const CONFIRMATION_ELIGIBLE_STATUSES = Object.freeze(['confirmed', 'in_progress', 'completed']);

const int = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate the mandatory confirmation context (§3.1 "Mandatory data before
 * confirmation"). Returns a list of human-readable errors; empty means the
 * mobilization may be confirmed.
 *
 * @param {object} input
 * @returns {string[]} errors
 */
export function validateConfirmation(input = {}) {
  const errors = [];
  const s = input.source;
  if (s !== 'manual_simulation' && s !== 'automatic_mobilization') {
    errors.push('source deve ser manual_simulation ou automatic_mobilization.');
  }
  if (!input.project || !nonEmpty(input.project.id) || !nonEmpty(input.project.name)) {
    errors.push('Projeto é obrigatório (id e nome).');
  }
  if (!input.schedule || !nonEmpty(input.schedule.id) || !nonEmpty(input.schedule.name)) {
    errors.push('Cronograma / etapa / frente de serviço é obrigatório (id e nome).');
  }
  const employees = Array.isArray(input.employees) ? input.employees : [];
  if (employees.length === 0) {
    errors.push('Selecione ao menos um colaborador identificado.');
  } else if (employees.some((e) => !e || !nonEmpty(String(e.id ?? '')) || !nonEmpty(e.name))) {
    errors.push('Todo colaborador deve ter id e nome completo.');
  }
  // A concrete selected scenario/itinerary is required (never a draft/preview).
  if (!nonEmpty(input.selectedScenarioId) && !nonEmpty(input.selectedItineraryId) && !input.scenario) {
    errors.push('Selecione um cenário ou itinerário antes de confirmar.');
  }
  const sc = input.scenario;
  if (!sc) {
    errors.push('Snapshot do cenário selecionado ausente.');
  } else {
    if (!nonEmpty(sc.departureAtUtc)) errors.push('Partida planejada ausente no cenário.');
    if (!nonEmpty(sc.arrivalAtUtc)) errors.push('Chegada prevista ausente no cenário.');
    if (!(int(sc.totalMobilizationCostC) > 0)) errors.push('Custo total do cenário ausente ou inválido.');
    if (!Array.isArray(sc.laborByEmployee)) errors.push('Snapshot de mão de obra ausente no cenário.');
  }
  if (!nonEmpty(input.origin)) errors.push('Origem é obrigatória.');
  if (!nonEmpty(input.destination)) errors.push('Destino final é obrigatório.');
  return errors;
}

/**
 * Attribute a confirmed mobilization's cost to each assigned collaborator (§10).
 *
 * Methodology (explicit + auditable):
 *  - Labor: always individual — taken directly from that employee's labor blocks.
 *  - Per-person fare / shared transfer / shared vehicle / accommodation / meals:
 *    the shared (non-labor) commercial + permanence + local cost is split
 *    EQUALLY across the assigned team (per-person allocation). When a scenario
 *    later carries per-segment passenger assignments the same helper can divide
 *    by assigned passengers instead; today teams travel together so an equal
 *    split matches the engine's per-person fare model.
 *
 * @param {object} scenario — costed scenario (breakdown + laborByEmployee)
 * @param {Array<{id,name,role}>} employees
 * @returns {Array<object>} per-collaborator attributed spend rows
 */
export function attributeCollaboratorSpend(scenario, employees) {
  const laborByEmployee = scenario.laborByEmployee || [];
  const laborById = new Map(laborByEmployee.map((l) => [String(l.employeeId), l]));

  const totalLaborC = laborByEmployee.reduce((s, l) => s + int(l.totalCostC), 0);
  const sharedC = Math.max(0, int(scenario.totalMobilizationCostC) - totalLaborC);
  const n = Math.max(1, employees.length);
  const sharePer = Math.floor(sharedC / n);
  const remainder = sharedC - sharePer * n; // give the rounding remainder to the first person

  return employees.map((emp, idx) => {
    const labor = laborById.get(String(emp.id));
    const laborSpend = int(labor?.totalCostC);
    const transportShare = sharePer + (idx === 0 ? remainder : 0);
    let overtimeMinutes = 0;
    let nightMinutes = 0;
    for (const bl of labor?.blocks || []) {
      if (bl.baseClassification && bl.baseClassification !== 'regular') overtimeMinutes += int(bl.countedMinutes);
      if (bl.nightPremiumApplied) nightMinutes += int(bl.countedMinutes);
    }
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role || null,
      laborSpendC: laborSpend,
      transportSpendC: transportShare,
      otherSpendC: 0,
      totalSpendC: laborSpend + transportShare,
      overtimeMinutes,
      nightMinutes,
    };
  });
}

/**
 * Compute the auditable estimated savings for a confirmation (§6.5).
 * Savings = most-expensive viable alternative − chosen total (never negative).
 * Only viable, non-selected alternatives are considered; if none are supplied,
 * savings is 0 and baseline is null (methodology stays explicit).
 */
export function computeSavings(scenario, alternatives = []) {
  const chosen = int(scenario.totalMobilizationCostC);
  const viable = alternatives
    .filter((a) => a && a.id !== scenario.id && a.feasibilityStatus !== 'invalid')
    .map((a) => int(a.totalMobilizationCostC))
    .filter((v) => v > 0);
  if (viable.length === 0) return { baselineCostC: null, estimatedSavingsC: 0 };
  const baseline = Math.max(...viable);
  return { baselineCostC: baseline, estimatedSavingsC: Math.max(0, baseline - chosen) };
}

/** Primary modal label from a mode sequence (§6.4). */
export function deriveModal(modeSequence = []) {
  const modes = modeSequence.filter((m) => ['flight', 'bus', 'rental_car', 'company_car'].includes(m));
  const uniq = [...new Set(modes)];
  if (uniq.length === 0) return 'multimodal';
  if (uniq.length > 1) return 'multimodal';
  return { flight: 'air', bus: 'bus', rental_car: 'rental', company_car: 'fleet' }[uniq[0]] || 'multimodal';
}

/**
 * Build the immutable confirmed-mobilization record from a validated input.
 * Throws if validation fails, so callers can't accidentally publish partial
 * dashboard data (§3.1 "must not publish partial dashboard data").
 *
 * @param {object} input
 * @returns {{ record: object, collaborators: object[] }}
 */
export function buildConfirmationRecord(input) {
  const errors = validateConfirmation(input);
  if (errors.length) {
    const err = new Error(`Confirmação inválida: ${errors.join(' ')}`);
    err.code = 'CONFIRMATION_INVALID';
    err.errors = errors;
    throw err;
  }

  const sc = input.scenario;
  const employees = input.employees;
  const modeSequence = sc.modeSequence || [];
  const categorySpend = normalizeCategorySpend(sc);
  const collaborators = attributeCollaboratorSpend(sc, employees);
  const { baselineCostC, estimatedSavingsC } = computeSavings(sc, input.alternatives || []);

  // Coarse rollups from the normalized categories.
  const rollup = { labor: 0, transport: 0, accommodation: 0, meals: 0, other: 0 };
  for (const [cat, c] of Object.entries(categorySpend)) rollup[CATEGORY_GROUP[cat] || 'other'] += c;
  const laborSplit = splitLaborByClassification(sc.laborByEmployee || []);

  const originNode = resolveNode(input.origin);
  const destNode = resolveNode(input.destination);
  const now = new Date().toISOString();

  const record = {
    confirmation_status: 'confirmed',
    operational_status: 'awaiting_departure',
    source: input.source,
    request_id: input.requestId || null,
    simulation_id: input.simulationId || null,
    selected_itinerary_id: input.selectedItineraryId || null,
    selected_scenario_id: input.selectedScenarioId || null,
    engine_scenario_id: sc.id || sc.scenarioId || null,

    project_id: input.project.id,
    project_name_snapshot: input.project.name,
    schedule_id: input.schedule.id,
    schedule_name_snapshot: input.schedule.name,
    schedule_activity_id: input.activity?.id || null,
    schedule_activity_name_snapshot: input.activity?.name || null,
    contract: input.contract || null,
    cost_center: input.costCenter || null,
    business_unit: input.businessUnit || null,

    origin_label: input.origin,
    origin_lat: originNode?.lat ?? null,
    origin_lng: originNode?.lng ?? null,
    destination_label: input.destination,
    destination_lat: destNode?.lat ?? null,
    destination_lng: destNode?.lng ?? null,
    planned_departure_at: sc.departureAtUtc,
    expected_arrival_at: sc.arrivalAtUtc,
    duration_minutes: int(sc.durationMinutes),
    modal_primary: deriveModal(modeSequence),
    mode_sequence: modeSequence,
    team_size: employees.length,

    total_cost_c: int(sc.totalMobilizationCostC),
    labor_cost_c: rollup.labor,
    transport_cost_c: rollup.transport,
    accommodation_cost_c: rollup.accommodation,
    meals_cost_c: rollup.meals,
    local_cost_c: int(categorySpend.transfer || 0),
    overtime_cost_c: laborSplit.overtime_50 + laborSplit.overtime_100 + laborSplit.saturday_100 + laborSplit.sunday_150,
    night_premium_cost_c: laborSplit.night_premium,
    category_spend: categorySpend,
    baseline_cost_c: baselineCostC,
    estimated_savings_c: estimatedSavingsC,

    cost_snapshot: sc.breakdown || {},
    labor_snapshot: sc.laborByEmployee || [],
    route_snapshot: sc.segments || [],
    employee_snapshot: employees.map((e) => ({ id: e.id, name: e.name, role: e.role || null })),
    labor_policy_version_id: input.laborPolicyVersionId || null,

    risk_level: sc.feasibilityDetail === 'requires_approval' ? 'medium' : 'low',
    on_time: null,
    risk_flags: sc.feasibilityStatus === 'invalid' ? ['infeasible'] : [],

    confirmed_by: input.actorId || null,
    confirmed_by_name: input.actorName || null,
    confirmed_at: input.confirmedAt || now,
    data: { reasonCodes: input.reasonCodes || [], policySummary: input.policySummary || null },
  };

  return { record, collaborators };
}
