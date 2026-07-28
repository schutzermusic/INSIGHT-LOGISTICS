import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  calculateMealAllowances,
  DEFAULT_MEAL_ALLOWANCE_POLICY,
} from '../server/mobilization/MealAllowanceEngine.js';
import { recommend } from '../server/mobilization/RecommendationEngine.js';
import { attributeCollaboratorSpend, computeSavings } from '../server/mobilization/ConfirmedMobilizationService.js';
import { CATEGORY_GROUP, normalizeCategorySpend } from '../server/mobilization/dashboardCategories.js';
import { mobilizationDraftHistorySummary } from '../src/domain/mobilizationDraftSummary.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const includeConfirmed = process.argv.includes('--include-confirmed');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: policyRow, error: policyError } = await supabase
  .from('meal_allowance_policy_versions')
  .select('*')
  .eq('status', 'approved')
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle();

if (policyError && policyError.code !== 'PGRST205') throw policyError;

const currentPolicy = !policyError && policyRow
  ? {
    id: policyRow.id,
    version: policyRow.version,
    name: policyRow.name,
    status: policyRow.status,
    leaderDailyC: policyRow.leader_daily_c,
    standardDailyC: policyRow.standard_daily_c,
    maxAllowancesPerLocalDay: policyRow.max_allowances_per_local_day,
    travelingCounts: policyRow.traveling_counts,
    connectionWaitingCounts: policyRow.connection_waiting_counts,
    hotelAwayFromBaseCounts: policyRow.hotel_away_from_base_counts,
    timezoneBasis: policyRow.timezone_basis,
    noAllowanceBelowMinutes: policyRow.no_allowance_below_minutes,
    fullAllowanceFromMinutes: policyRow.full_allowance_from_minutes,
    partialAllowanceRatio: Number(policyRow.partial_allowance_ratio),
  }
  : DEFAULT_MEAL_ALLOWANCE_POLICY;

const { data: rows, error } = await supabase
  .from('simulations')
  .select('id,data')
  .eq('type', 'mobilization-draft');

if (error) throw error;

const { data: confirmedRows, error: confirmedError } = includeConfirmed
  ? await supabase
    .from('confirmed_mobilizations')
    .select('*, collaborators:confirmed_mobilization_collaborators(*)')
    .limit(5000)
  : { data: [], error: null };

if (confirmedError) throw confirmedError;

let eligible = 0;
let changed = 0;
let skipped = 0;
let confirmedPreserved = 0;
let alreadyCurrent = 0;
let allowanceDeltaC = 0;
const recalculatedByConfirmedId = new Map();

const allowanceSignature = (result) => JSON.stringify({
  recommendedId: result?.recommended?.id || null,
  scenarios: (result?.scenarios || []).map((scenario) => ({
    id: scenario.id,
    permanenceCostC: scenario.permanenceCostC,
    totalMobilizationCostC: scenario.totalMobilizationCostC,
    transitMealsC: scenario.breakdown?.transit_meals_c,
    allowanceTotalC: scenario.mealAllowance?.totalC,
    employees: (scenario.mealAllowance?.byEmployee || []).map((employee) => ({
      employeeId: employee.employeeId,
      category: employee.category,
      eligibleDates: employee.eligibleDates,
      quantity: employee.quantity,
      unitValueC: employee.unitValueC,
      totalC: employee.totalC,
      lines: employee.lines,
    })),
  })),
});

for (const row of rows || []) {
  const draft = row.data || {};
  if (!includeConfirmed && (draft.status === 'confirmed' || draft.dashboardPublished === true)) {
    confirmedPreserved += 1;
    continue;
  }
  if (!force && Number(draft.mealAllowanceBackfillVersion) >= currentPolicy.version) {
    alreadyCurrent += 1;
    continue;
  }
  const result = draft.calculationResult;
  if (!result?.scenarios?.length || !result?.employees?.length) {
    skipped += 1;
    continue;
  }
  eligible += 1;

  const scenarios = result.scenarios.map((storedScenario) => {
    const scenario = { ...storedScenario, rankingCategory: undefined };
    const mealAllowance = calculateMealAllowances({
      itinerary: scenario,
      employees: result.employees,
      policy: currentPolicy,
    });
    const oldAllowanceC = Number(
      scenario.mealAllowance?.totalC ?? scenario.breakdown?.transit_meals_c ?? 0,
    );
    const deltaC = mealAllowance.totalC - oldAllowanceC;
    allowanceDeltaC += deltaC;
    const breakdown = {
      ...(scenario.breakdown || {}),
      transit_meals_c: mealAllowance.totalC,
      meal_allowances: mealAllowance.byEmployee,
      meal_allowance_policy: mealAllowance.policy,
      permanence_c: Number(scenario.permanenceCostC || 0) + deltaC,
      total_c: Number(scenario.totalMobilizationCostC || 0) + deltaC,
    };
    return {
      ...scenario,
      permanenceCostC: Number(scenario.permanenceCostC || 0) + deltaC,
      totalMobilizationCostC: Number(scenario.totalMobilizationCostC || 0) + deltaC,
      mealAllowance,
      breakdown,
    };
  });

  const ranking = recommend({ itineraries: scenarios });
  const calculationResult = {
    ...result,
    scenarios,
    recommended: ranking.recommended,
    ranked: ranking.ranked,
    reasonCodes: ranking.reasonCodes,
    explanation: ranking.explanation,
    comparison: ranking.comparison || null,
    policySummary: {
      ...(result.policySummary || {}),
      mealAllowancePolicyVersionId: currentPolicy.id,
      mealAllowancePolicyVersion: currentPolicy.version,
    },
  };
  const nextDraft = {
    ...draft,
    calculationResult,
    resumo: mobilizationDraftHistorySummary(ranking.recommended || scenarios[0]),
    mealAllowanceBackfilledAt: new Date().toISOString(),
    mealAllowanceBackfillVersion: currentPolicy.version,
  };

  if (draft.confirmedId) {
    recalculatedByConfirmedId.set(String(draft.confirmedId), {
      result: calculationResult,
      scenario: scenarios.find(
        (scenario) => String(scenario.id) === String(draft.calculationResult?.recommended?.id),
      ) || ranking.recommended || scenarios[0],
    });
  }

  if (allowanceSignature(draft.calculationResult) !== allowanceSignature(calculationResult)) changed += 1;
  if (apply) {
    const { error: updateError } = await supabase
      .from('simulations')
      .update({ data: nextDraft })
      .eq('id', row.id);
    if (updateError) throw updateError;
  }
}

let confirmedChanged = 0;
let confirmedSkipped = 0;
let confirmedAllowanceDeltaC = 0;
let confirmedCollaboratorsChanged = 0;

for (const row of confirmedRows || []) {
  const linked = recalculatedByConfirmedId.get(String(row.id));
  if (!linked?.scenario) {
    confirmedSkipped += 1;
    continue;
  }

  const scenario = linked.scenario;
  const previousMealsC = Number(row.meals_cost_c || 0);
  const mealsCostC = Number(scenario.breakdown?.transit_meals_c || 0)
    + Number(scenario.breakdown?.field_meals_c || 0);
  const deltaC = mealsCostC - previousMealsC;
  const totalCostC = Number(row.total_cost_c || 0) + deltaC;
  const categorySpend = normalizeCategorySpend(scenario);
  const rollup = { labor: 0, transport: 0, accommodation: 0, meals: 0, other: 0 };
  for (const [category, amount] of Object.entries(categorySpend)) {
    rollup[CATEGORY_GROUP[category] || 'other'] += Number(amount || 0);
  }
  const { baselineCostC, estimatedSavingsC } = computeSavings(
    scenario,
    (linked.result.scenarios || []).filter((candidate) => candidate.id !== scenario.id),
  );
  const allowance = scenario.mealAllowance || {
    policy: currentPolicy,
    byEmployee: scenario.breakdown?.meal_allowances || [],
  };
  const employees = (linked.result.employees || row.employee_snapshot || []).map((employee) => ({
    id: employee.id ?? employee.employeeId,
    name: employee.name ?? employee.employeeName,
    role: employee.role || null,
    allowanceCategory: employee.allowanceCategory === 'leader' ? 'leader' : 'standard',
  }));
  const collaboratorSpend = attributeCollaboratorSpend(scenario, employees);
  const spendByEmployee = new Map(
    collaboratorSpend.map((item) => [String(item.employeeId), item]),
  );

  const timestamp = new Date().toISOString();
  const parentUpdate = {
    total_cost_c: totalCostC,
    labor_cost_c: rollup.labor,
    transport_cost_c: rollup.transport,
    accommodation_cost_c: rollup.accommodation,
    meals_cost_c: rollup.meals,
    local_cost_c: Number(categorySpend.transfer || 0),
    category_spend: categorySpend,
    baseline_cost_c: baselineCostC,
    estimated_savings_c: estimatedSavingsC,
    allowance_policy_version_id: allowance.policy?.id || currentPolicy.id,
    allowance_snapshot: {
      policy: allowance.policy || currentPolicy,
      employees: allowance.byEmployee || [],
    },
    cost_snapshot: {
      ...(row.cost_snapshot || {}),
      ...(scenario.breakdown || {}),
      transit_meals_c: Number(scenario.breakdown?.transit_meals_c || 0),
      field_meals_c: Number(scenario.breakdown?.field_meals_c || 0),
      total_c: totalCostC,
    },
    data: {
      ...(row.data || {}),
      mealAllowanceBackfillVersion: currentPolicy.version,
      mealAllowanceRecalculatedAt: timestamp,
      previousMealsCostC: previousMealsC,
      previousTotalCostC: Number(row.total_cost_c || 0),
    },
  };

  for (const collaborator of row.collaborators || []) {
    const employeeId = String(collaborator.employee_id || collaborator.employee_id_text || '');
    const spend = spendByEmployee.get(employeeId);
    if (!spend) continue;
    confirmedCollaboratorsChanged += 1;
    if (apply) {
      const { error: collaboratorError } = await supabase
        .from('confirmed_mobilization_collaborators')
        .update({
          labor_spend_c: spend.laborSpendC,
          transport_spend_c: spend.transportSpendC,
          other_spend_c: spend.otherSpendC,
          total_spend_c: spend.totalSpendC,
          allowance_category_snapshot: spend.allowanceCategory,
          allowance_total_c: spend.allowanceTotalC,
          allowance_snapshot: spend.allowanceSnapshot,
        })
        .eq('id', collaborator.id);
      if (collaboratorError) throw collaboratorError;
    }
  }

  confirmedChanged += 1;
  confirmedAllowanceDeltaC += deltaC;
  if (apply) {
    const { error: updateError } = await supabase
      .from('confirmed_mobilizations')
      .update(parentUpdate)
      .eq('id', row.id);
    if (updateError) throw updateError;
  }
}

console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  forced: force,
  draftsFound: rows?.length || 0,
  eligible,
  changed,
  skipped,
  confirmedSnapshotsPreserved: confirmedPreserved,
  includeConfirmed,
  confirmedFound: confirmedRows?.length || 0,
  confirmedChanged,
  confirmedSkipped,
  confirmedCollaboratorsChanged,
  confirmedAllowanceDeltaC,
  alreadyCurrent,
  allowanceDeltaC,
  policyVersion: currentPolicy.version,
}));
