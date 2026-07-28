import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { calcTechnicalHourlyRateC } from '../src/engine/calculator.js';
import { mulC } from '../src/domain/money.js';
import { mobilizationDraftHistorySummary } from '../src/domain/mobilizationDraftSummary.js';
import { recommend } from '../server/mobilization/RecommendationEngine.js';
import {
  normalizeCategorySpend,
  splitLaborByClassification,
} from '../server/mobilization/dashboardCategories.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const VERSION = 1;
const LEGACY_MULTIPLIER = 1.7;
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const [
  { data: simulationRows, error: simulationError },
  { data: collaboratorRows, error: collaboratorError },
  { data: confirmedRows, error: confirmedError },
] = await Promise.all([
  supabase.from('simulations').select('id,data').eq('type', 'mobilization-draft'),
  supabase.from('collaborators').select('id,data'),
  supabase
    .from('confirmed_mobilizations')
    .select('*, collaborators:confirmed_mobilization_collaborators(*)')
    .limit(5000),
]);

if (simulationError) throw simulationError;
if (collaboratorError) throw collaboratorError;
if (confirmedError) throw confirmedError;

const currentCollaborators = new Map(
  (collaboratorRows || []).map((row) => [
    String(row.id),
    { id: row.id, ...(row.data || {}) },
  ]),
);

function standardRateC(storedEmployee = {}) {
  const current = currentCollaborators.get(String(storedEmployee.id ?? storedEmployee.employeeId));
  if (current) return calcTechnicalHourlyRateC(current);

  const storedRateC = Number(storedEmployee.hourlyRateC || 0);
  if (!Number.isFinite(storedRateC) || storedRateC <= 0) return 0;
  if (
    storedEmployee.hourlyCostBasis === 'technical_base'
    || storedEmployee.laborChargesPercent === 0
  ) {
    return Math.round(storedRateC);
  }
  return Math.round(storedRateC / LEGACY_MULTIPLIER);
}

function repriceLaborEmployee(employee, rateC = standardRateC(employee)) {
  if (!Number.isInteger(rateC) || rateC <= 0) {
    return {
      ...employee,
      hourlyRateC: 0,
      hourlyCostBasis: 'technical_base',
      laborChargesPercent: 0,
      totalCostC: 0,
      blocks: [],
      warning: 'missing_hourly_rate',
    };
  }
  const blocks = (employee.blocks || []).map((block) => {
    const computedMinutes = Number(block.computedMinutes ?? block.countedMinutes ?? 0);
    const multiplier = Number(block.finalMultiplier || 1);
    return {
      ...block,
      hourlyRateC: rateC,
      calculatedCostC: mulC(rateC, (computedMinutes / 60) * multiplier),
    };
  });
  return {
    ...employee,
    hourlyRateC: rateC,
    hourlyCostBasis: 'technical_base',
    laborChargesPercent: 0,
    totalCostC: blocks.reduce((sum, block) => sum + block.calculatedCostC, 0),
    blocks,
  };
}

function repriceScenario(scenario, employeeRates = new Map()) {
  const laborByEmployee = (scenario.laborByEmployee || []).map((employee) => {
    const rateC = employeeRates.get(String(employee.employeeId)) || standardRateC(employee);
    return repriceLaborEmployee(employee, rateC);
  });
  const laborCostC = laborByEmployee.reduce((sum, employee) => sum + employee.totalCostC, 0);
  const previousLaborCostC = Number(scenario.laborCostC ?? scenario.breakdown?.labor_c ?? 0);
  const previousTotalCostC = Number(
    scenario.totalMobilizationCostC ?? scenario.breakdown?.total_c ?? 0,
  );
  const totalMobilizationCostC = previousTotalCostC + laborCostC - previousLaborCostC;
  return {
    ...scenario,
    laborCostC,
    totalMobilizationCostC,
    laborByEmployee,
    breakdown: {
      ...(scenario.breakdown || {}),
      labor_c: laborCostC,
      total_c: totalMobilizationCostC,
    },
  };
}

const recalculatedByConfirmedId = new Map();
let simulationsChanged = 0;
let simulationsSkipped = 0;
let simulationLaborDeltaC = 0;
let simulationTotalDeltaC = 0;

for (const row of simulationRows || []) {
  const draft = row.data || {};
  if (!force && Number(draft.standardTechnicalRateVersion) >= VERSION) {
    simulationsSkipped += 1;
    continue;
  }
  const result = draft.calculationResult;
  if (!result?.scenarios?.length) {
    simulationsSkipped += 1;
    continue;
  }

  const employees = (result.employees || []).map((employee) => ({
    ...employee,
    hourlyRateC: standardRateC(employee),
    hourlyCostBasis: 'technical_base',
    laborChargesPercent: 0,
  }));
  const employeeRates = new Map(
    employees.map((employee) => [String(employee.id), employee.hourlyRateC]),
  );
  const scenarios = result.scenarios.map((scenario) => repriceScenario(scenario, employeeRates));
  const ranking = recommend({ itineraries: scenarios });
  const recommended = ranking.recommended || scenarios.find(
    (scenario) => scenario.id === result.recommended?.id,
  ) || scenarios[0];
  const previousLaborC = Number(result.recommended?.laborCostC || 0);
  const previousTotalC = Number(result.recommended?.totalMobilizationCostC || 0);
  simulationLaborDeltaC += recommended.laborCostC - previousLaborC;
  simulationTotalDeltaC += recommended.totalMobilizationCostC - previousTotalC;

  const calculationResult = {
    ...result,
    employees,
    scenarios,
    recommended,
    ranked: ranking.ranked,
    reasonCodes: ranking.reasonCodes,
    explanation: ranking.explanation,
    comparison: ranking.comparison || null,
    policySummary: {
      ...(result.policySummary || {}),
      hourlyCostBasis: 'technical_base',
      laborChargesPercent: 0,
    },
  };
  const timestamp = new Date().toISOString();
  const nextDraft = {
    ...draft,
    calculationResult,
    resumo: mobilizationDraftHistorySummary(recommended),
    standardTechnicalRateVersion: VERSION,
    standardTechnicalRateRecalculatedAt: timestamp,
  };

  if (draft.confirmedId) {
    recalculatedByConfirmedId.set(String(draft.confirmedId), calculationResult);
  }
  simulationsChanged += 1;
  if (apply) {
    const { error } = await supabase
      .from('simulations')
      .update({ data: nextDraft })
      .eq('id', row.id);
    if (error) throw error;
  }
}

let confirmedChanged = 0;
let confirmedSkipped = 0;
let confirmedLaborDeltaC = 0;
let confirmedTotalDeltaC = 0;
let collaboratorRowsChanged = 0;

for (const row of confirmedRows || []) {
  if (!force && Number(row.data?.standardTechnicalRateVersion) >= VERSION) {
    confirmedSkipped += 1;
    continue;
  }
  const linkedResult = recalculatedByConfirmedId.get(String(row.id));
  const linkedScenario = linkedResult?.scenarios?.find(
    (scenario) => String(scenario.id) === String(row.engine_scenario_id),
  ) || linkedResult?.recommended;
  const laborSnapshot = linkedScenario?.laborByEmployee
    || (Array.isArray(row.labor_snapshot)
      ? row.labor_snapshot.map((employee) => repriceLaborEmployee(employee))
      : []);
  if (!laborSnapshot.length) {
    confirmedSkipped += 1;
    continue;
  }

  const laborCostC = laborSnapshot.reduce(
    (sum, employee) => sum + Number(employee.totalCostC || 0),
    0,
  );
  const previousLaborCostC = Number(row.labor_cost_c || 0);
  const totalCostC = Number(row.total_cost_c || 0) + laborCostC - previousLaborCostC;
  const costSnapshot = {
    ...(row.cost_snapshot || {}),
    labor_c: laborCostC,
    total_c: totalCostC,
  };
  const categorySpend = normalizeCategorySpend({
    breakdown: costSnapshot,
    modeSequence: row.mode_sequence || [],
    laborByEmployee: laborSnapshot,
  });
  const laborSplit = splitLaborByClassification(laborSnapshot);

  let baselineCostC = row.baseline_cost_c;
  let estimatedSavingsC = Number(row.estimated_savings_c || 0);
  if (linkedResult?.scenarios?.length && linkedScenario) {
    const alternatives = linkedResult.scenarios
      .filter((scenario) => scenario.id !== linkedScenario.id && scenario.feasibilityStatus !== 'invalid')
      .map((scenario) => Number(scenario.totalMobilizationCostC || 0))
      .filter((value) => value > 0);
    baselineCostC = alternatives.length ? Math.max(...alternatives) : null;
    estimatedSavingsC = baselineCostC == null ? 0 : Math.max(0, baselineCostC - totalCostC);
  }

  const timestamp = new Date().toISOString();
  const parentUpdate = {
    labor_cost_c: laborCostC,
    total_cost_c: totalCostC,
    overtime_cost_c:
      laborSplit.overtime_50
      + laborSplit.overtime_100
      + laborSplit.saturday_100
      + laborSplit.sunday_150,
    night_premium_cost_c: laborSplit.night_premium,
    category_spend: categorySpend,
    cost_snapshot: costSnapshot,
    labor_snapshot: laborSnapshot,
    baseline_cost_c: baselineCostC,
    estimated_savings_c: estimatedSavingsC,
    data: {
      ...(row.data || {}),
      standardTechnicalRateVersion: VERSION,
      standardTechnicalRateRecalculatedAt: timestamp,
      previousLaborCostC,
      previousTotalCostC: Number(row.total_cost_c || 0),
    },
  };

  for (const collaborator of row.collaborators || []) {
    const employeeId = String(collaborator.employee_id || collaborator.employee_id_text || '');
    const labor = laborSnapshot.find(
      (employee) => String(employee.employeeId) === employeeId,
    );
    if (!labor) continue;
    const laborSpendC = Number(labor.totalCostC || 0);
    const totalSpendC =
      laborSpendC
      + Number(collaborator.transport_spend_c || 0)
      + Number(collaborator.other_spend_c || 0);
    collaboratorRowsChanged += 1;
    if (apply) {
      const { error } = await supabase
        .from('confirmed_mobilization_collaborators')
        .update({
          labor_spend_c: laborSpendC,
          total_spend_c: totalSpendC,
        })
        .eq('id', collaborator.id);
      if (error) throw error;
    }
  }

  confirmedChanged += 1;
  confirmedLaborDeltaC += laborCostC - previousLaborCostC;
  confirmedTotalDeltaC += totalCostC - Number(row.total_cost_c || 0);
  if (apply) {
    const { error } = await supabase
      .from('confirmed_mobilizations')
      .update(parentUpdate)
      .eq('id', row.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({
  mode: apply ? 'applied' : 'dry-run',
  version: VERSION,
  simulationsFound: simulationRows?.length || 0,
  simulationsChanged,
  simulationsSkipped,
  simulationLaborDeltaC,
  simulationTotalDeltaC,
  confirmedFound: confirmedRows?.length || 0,
  confirmedChanged,
  confirmedSkipped,
  collaboratorRowsChanged,
  confirmedLaborDeltaC,
  confirmedTotalDeltaC,
}));
