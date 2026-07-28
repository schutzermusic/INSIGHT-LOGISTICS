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
  resolveEmployeeLaborPolicy,
} from '../server/mobilization/laborPolicyDefaults.js';
import { recommend } from '../server/mobilization/RecommendationEngine.js';
import { calcTechnicalHourlyRateC } from '../src/engine/calculator.js';
import { mobilizationDraftHistorySummary } from '../src/domain/mobilizationDraftSummary.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
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
  (collaboratorRows || []).map((row) => [
    String(row.id),
    {
      id: row.id,
      ...(row.data || {}),
      allowanceCategory: row.data?.allowanceCategory || 'standard',
    },
  ]),
);

const resultSignature = (result) => JSON.stringify({
  recommendedId: result?.recommended?.id || null,
  scenarios: (result?.scenarios || []).map((scenario) => ({
    id: scenario.id,
    laborCostC: scenario.laborCostC,
    totalMobilizationCostC: scenario.totalMobilizationCostC,
    employees: (scenario.laborByEmployee || []).map((employee) => ({
      employeeId: employee.employeeId,
      totalCostC: employee.totalCostC,
      countedMinutes: employee.summary?.totalCountedMinutes,
      deductions: employee.deductions,
      alerts: employee.alerts,
      schedule: employee.schedule,
    })),
  })),
});

let eligible = 0;
let changed = 0;
let skipped = 0;
let confirmedPreserved = 0;
let alreadyCurrent = 0;
let laborDeltaC = 0;
let totalDeltaC = 0;
let automaticIntervalDeductions = 0;

for (const row of rows || []) {
  const draft = row.data || {};
  if (draft.status === 'confirmed' || draft.dashboardPublished === true) {
    confirmedPreserved += 1;
    continue;
  }
  if (!force && Number(draft.laborPolicyBackfillVersion) >= DEFAULT_LABOR_POLICY.version) {
    alreadyCurrent += 1;
    continue;
  }
  const result = draft.calculationResult;
  if (!result?.scenarios?.length || !result?.employees?.length) {
    skipped += 1;
    continue;
  }
  eligible += 1;

  const employees = result.employees.map((storedEmployee) => {
    const current = currentCollaborators.get(String(storedEmployee.id));
    const source = { ...storedEmployee, ...(current || {}) };
    return {
      ...source,
      id: storedEmployee.id,
      name: source.nome || source.name || storedEmployee.name || 'Colaborador',
      hourlyRateC: calcTechnicalHourlyRateC(source),
      hourlyCostBasis: 'technical_with_labor_charges',
      laborChargesPercent: 70,
      allowanceCategory: source.allowanceCategory === 'leader' ? 'leader' : 'standard',
      dailyStandardMinutes: source.dailyStandardMinutes || DEFAULT_LABOR_POLICY.regularDailyMinutes,
      saturdayCompensated: source.saturdayCompensated ?? DEFAULT_LABOR_POLICY.saturdayAllHoursOvertime,
      reducedNightHourEnabled: source.reducedNightHourEnabled ?? DEFAULT_LABOR_POLICY.reducedNightHourEnabled,
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
          deductions: [],
          alerts: [],
          summary: summarizeBlocks([]),
          warning: 'missing_hourly_rate',
        };
      }
      const employeePolicy = resolveEmployeeLaborPolicy(DEFAULT_LABOR_POLICY, employee);
      const calculation = classifyLabor({
        segments: segmentsForEmployee(scenario, employee.id),
        hourlyRateC: employee.hourlyRateC,
        policy: employeePolicy,
        travelTimePolicy: DEFAULT_TRAVEL_TIME_POLICY,
        priorWorkedMinutes: employee.priorWorkedMinutes || previous?.priorWorkedMinutes || 0,
        holidays: result.holidays || [],
      });
      automaticIntervalDeductions += calculation.deductions.length;
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        hourlyRateC: employee.hourlyRateC,
        hourlyCostBasis: employee.hourlyCostBasis,
        laborChargesPercent: employee.laborChargesPercent,
        priorWorkedMinutes: employee.priorWorkedMinutes || previous?.priorWorkedMinutes || 0,
        workedMinutesSource: employee.workedMinutesSource || previous?.workedMinutesSource || 'cadastro',
        schedule: {
          dailyStandardMinutes: employeePolicy.regularDailyMinutes,
          saturdayCompensated: employeePolicy.saturdayAllHoursOvertime,
          reducedNightHourEnabled: employeePolicy.reducedNightHourEnabled,
          weekdayOvertimeMultiplier: employeePolicy.weekdayFirstOvertimeMultiplier,
          compensatedSaturdayMultiplier: employeePolicy.compensatedSaturdayMultiplier,
          sundayMultiplier: employeePolicy.sundayMultiplier,
          nightMultiplier: employeePolicy.nightMultiplier,
        },
        totalCostC: calculation.totalCostC,
        blocks: calculation.blocks,
        deductions: calculation.deductions,
        alerts: calculation.alerts,
        summary: summarizeBlocks(calculation.blocks),
      };
    });

    const nextLaborC = laborByEmployee.reduce((sum, employee) => sum + employee.totalCostC, 0);
    const previousLaborC = Number(scenario.laborCostC || 0);
    const deltaC = nextLaborC - previousLaborC;
    laborDeltaC += deltaC;
    totalDeltaC += deltaC;
    const nextTotalC = Number(scenario.totalMobilizationCostC || 0) + deltaC;

    return {
      ...scenario,
      laborCostC: nextLaborC,
      totalMobilizationCostC: nextTotalC,
      laborByEmployee,
      breakdown: {
        ...(scenario.breakdown || {}),
        labor_c: nextLaborC,
        total_c: nextTotalC,
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
      name: DEFAULT_LABOR_POLICY.name,
      version: DEFAULT_LABOR_POLICY.version,
      laborPolicyVersionId: DEFAULT_LABOR_POLICY.id,
      automaticJourneyIntervalEnabled: DEFAULT_LABOR_POLICY.automaticJourneyIntervalEnabled,
      journeyIntervalEveryMinutes: DEFAULT_LABOR_POLICY.journeyIntervalEveryMinutes,
      journeyIntervalDeductionMinutes: DEFAULT_LABOR_POLICY.journeyIntervalDeductionMinutes,
    },
  };
  const nextDraft = {
    ...draft,
    calculationResult,
    resumo: mobilizationDraftHistorySummary(ranking.recommended || scenarios[0]),
    laborPolicyBackfilledAt: new Date().toISOString(),
    laborHoursRecalculatedAt: new Date().toISOString(),
    laborPolicyBackfillVersion: DEFAULT_LABOR_POLICY.version,
  };

  if (resultSignature(result) !== resultSignature(calculationResult)) changed += 1;
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
  historyMobilizationsFound: rows?.length || 0,
  eligibleDrafts: eligible,
  changedDrafts: changed,
  skipped,
  confirmedSnapshotsPreserved: confirmedPreserved,
  alreadyCurrent,
  automaticIntervalDeductions,
  laborDeltaC,
  totalDeltaC,
  laborPolicyVersion: DEFAULT_LABOR_POLICY.version,
}));
