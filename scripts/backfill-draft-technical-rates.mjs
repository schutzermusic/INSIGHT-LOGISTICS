import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyLabor } from '../server/mobilization/LaborCostEngine.js';
import {
  segmentsForEmployee,
  summarizeBlocks,
} from '../server/mobilization/ManualSimulationService.js';
import {
  DEFAULT_LABOR_POLICY,
  DEFAULT_TRAVEL_TIME_POLICY,
} from '../server/mobilization/laborPolicyDefaults.js';
import { recommend } from '../server/mobilization/RecommendationEngine.js';
import { calcTechnicalHourlyRateC } from '../src/engine/calculator.js';
import { mobilizationDraftHistorySummary } from '../src/domain/mobilizationDraftSummary.js';

const apply = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');

const supabase = createClient(url, key, { auth: { persistSession: false } });
const [{ data: rows, error: rowsError }, { data: collaboratorRows, error: collaboratorsError }] =
  await Promise.all([
    supabase.from('simulations').select('id,data').eq('type', 'mobilization-draft'),
    supabase.from('collaborators').select('id,data'),
  ]);

if (rowsError) throw rowsError;
if (collaboratorsError) throw collaboratorsError;

const currentCollaborators = new Map(
  (collaboratorRows || []).map((row) => [String(row.id), { id: row.id, ...(row.data || {}) }]),
);

const signature = (result) => JSON.stringify({
  recommendedId: result?.recommended?.id || null,
  employees: (result?.employees || []).map((employee) => ({
    id: employee.id,
    hourlyRateC: employee.hourlyRateC,
  })),
  scenarios: (result?.scenarios || []).map((scenario) => ({
    id: scenario.id,
    laborCostC: scenario.laborCostC,
    totalMobilizationCostC: scenario.totalMobilizationCostC,
    employees: (scenario.laborByEmployee || []).map((employee) => ({
      employeeId: employee.employeeId,
      hourlyRateC: employee.hourlyRateC,
      totalCostC: employee.totalCostC,
    })),
  })),
});

let eligible = 0;
let changed = 0;
let skipped = 0;
let laborDeltaC = 0;
let totalDeltaC = 0;

for (const row of rows || []) {
  const draft = row.data || {};
  const result = draft.calculationResult;
  if (!result?.scenarios?.length || !result?.employees?.length) {
    skipped += 1;
    continue;
  }
  eligible += 1;

  const employees = result.employees.map((storedEmployee) => {
    const current = currentCollaborators.get(String(storedEmployee.id));
    const hourlyRateC = calcTechnicalHourlyRateC(current || storedEmployee);
    return {
      ...storedEmployee,
      hourlyRateC,
      hourlyCostBasis: 'technical_with_labor_charges',
      laborChargesPercent: 70,
    };
  });

  const scenarios = result.scenarios.map((storedScenario) => {
    const scenario = { ...storedScenario, rankingCategory: undefined };
    const laborByEmployee = employees.map((employee) => {
      const previous = (scenario.laborByEmployee || [])
        .find((item) => String(item.employeeId) === String(employee.id));
      if (!Number.isInteger(employee.hourlyRateC) || employee.hourlyRateC <= 0) {
        return {
          ...(previous || {}),
          employeeId: employee.id,
          employeeName: employee.name,
          hourlyRateC: 0,
          totalCostC: 0,
          blocks: [],
          summary: summarizeBlocks([]),
          warning: 'missing_hourly_rate',
        };
      }
      const calculation = classifyLabor({
        segments: segmentsForEmployee(scenario, employee.id),
        hourlyRateC: employee.hourlyRateC,
        policy: DEFAULT_LABOR_POLICY,
        travelTimePolicy: DEFAULT_TRAVEL_TIME_POLICY,
        priorWorkedMinutes: employee.priorWorkedMinutes || previous?.priorWorkedMinutes || 0,
        holidays: [],
      });
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        hourlyRateC: employee.hourlyRateC,
        hourlyCostBasis: 'technical_with_labor_charges',
        laborChargesPercent: 70,
        priorWorkedMinutes: employee.priorWorkedMinutes || previous?.priorWorkedMinutes || 0,
        workedMinutesSource: employee.workedMinutesSource || previous?.workedMinutesSource || 'cadastro',
        totalCostC: calculation.totalCostC,
        blocks: calculation.blocks,
        summary: summarizeBlocks(calculation.blocks),
      };
    });
    const nextLaborC = laborByEmployee.reduce((sum, employee) => sum + employee.totalCostC, 0);
    const previousLaborC = Number(scenario.laborCostC || 0);
    const deltaC = nextLaborC - previousLaborC;
    laborDeltaC += deltaC;
    totalDeltaC += deltaC;

    return {
      ...scenario,
      laborCostC: nextLaborC,
      totalMobilizationCostC: Number(scenario.totalMobilizationCostC || 0) + deltaC,
      laborByEmployee,
      breakdown: {
        ...(scenario.breakdown || {}),
        labor_c: nextLaborC,
        total_c: Number(scenario.totalMobilizationCostC || 0) + deltaC,
      },
    };
  });

  const ranking = recommend({ itineraries: scenarios });
  const calculationResult = {
    ...result,
    employees,
    scenarios,
    recommended: ranking.recommended,
    ranked: ranking.ranked,
    reasonCodes: ranking.reasonCodes,
    explanation: ranking.explanation,
    comparison: ranking.comparison || null,
    policySummary: {
      ...(result.policySummary || {}),
      hourlyCostBasis: 'technical_with_labor_charges',
      laborChargesPercent: 70,
    },
  };
  const nextDraft = {
    ...draft,
    calculationResult,
    resumo: mobilizationDraftHistorySummary(ranking.recommended || scenarios[0]),
    technicalRatesBackfilledAt: new Date().toISOString(),
    technicalRatesBackfillVersion: 1,
  };

  if (signature(result) !== signature(calculationResult)) changed += 1;
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
  draftsFound: rows?.length || 0,
  eligible,
  changed,
  skipped,
  laborDeltaC,
  totalDeltaC,
}));
