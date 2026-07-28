import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  calculateMealAllowances,
  DEFAULT_MEAL_ALLOWANCE_POLICY,
} from '../server/mobilization/MealAllowanceEngine.js';
import { recommend } from '../server/mobilization/RecommendationEngine.js';
import { mobilizationDraftHistorySummary } from '../src/domain/mobilizationDraftSummary.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
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

let eligible = 0;
let changed = 0;
let skipped = 0;
let confirmedPreserved = 0;
let alreadyCurrent = 0;
let allowanceDeltaC = 0;

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
  if (draft.status === 'confirmed' || draft.dashboardPublished === true) {
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

  if (allowanceSignature(draft.calculationResult) !== allowanceSignature(calculationResult)) changed += 1;
  if (apply) {
    const { error: updateError } = await supabase
      .from('simulations')
      .update({ data: nextDraft })
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
  alreadyCurrent,
  allowanceDeltaC,
  policyVersion: currentPolicy.version,
}));
