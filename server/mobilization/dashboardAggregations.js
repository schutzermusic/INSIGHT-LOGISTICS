/**
 * Dashboard aggregations (§8, §15) — pure functions over the confirmed dataset.
 *
 * EVERY aggregation begins from `eligible()`, which enforces the critical rule:
 * only mobilizations with confirmation_status in confirmed | in_progress |
 * completed feed the dashboard (§3.1 / §8). Drafts, searches, previews, provider
 * quotes and unselected scenarios never reach here.
 *
 * Functions are pure and take the current time as an argument so they are fully
 * deterministic and unit-testable without a database. They operate on the
 * confirmed-mobilization row shape (snake_case, as produced by
 * ConfirmedMobilizationService.buildConfirmationRecord and read back from
 * Supabase), where each row may carry an embedded `collaborators` array.
 * Money is integer centavos.
 *
 * @module server/mobilization/dashboardAggregations
 */

import { CATEGORY_LABELS } from './dashboardCategories.js';
import { resolveNode } from './geo.js';

const ELIGIBLE = new Set(['confirmed', 'in_progress', 'completed']);
const ACTIVE = new Set(['confirmed', 'in_progress']);
const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);

function resolveMapCoordinate(label, latValue, lngValue) {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  // Dashboard operations are in Brazil. Besides rejecting null/NaN, these
  // bounds repair legacy rows whose missing NUMERIC coordinates became (0, 0).
  if (
    Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -35 && lat <= 6
    && lng >= -75 && lng <= -32
  ) {
    return { lat, lng };
  }
  const node = resolveNode(label);
  return node ? { lat: node.lat, lng: node.lng } : null;
}

/** The confirmation gate as data (§3.1): keep only dashboard-eligible rows. */
export function eligible(rows = []) {
  return rows.filter((r) => ELIGIBLE.has(r.confirmation_status));
}

/**
 * Apply global filters (§12). Unknown/empty filters are ignored. Operates on
 * already-eligible rows.
 */
export function applyFilters(rows, filters = {}) {
  const f = filters || {};
  const from = f.dateFrom ? Date.parse(f.dateFrom) : null;
  const to = f.dateTo ? Date.parse(f.dateTo) : null;
  return rows.filter((r) => {
    const ts = Date.parse(r.confirmed_at);
    if (from != null && ts < from) return false;
    if (to != null && ts > to) return false;
    if (f.projectId && r.project_id !== f.projectId) return false;
    if (f.costCenter && r.cost_center !== f.costCenter) return false;
    if (f.businessUnit && r.business_unit !== f.businessUnit) return false;
    if (f.contract && r.contract !== f.contract) return false;
    if (f.modal && r.modal_primary !== f.modal) return false;
    if (f.status && r.confirmation_status !== f.status) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.riskLevel && r.risk_level !== f.riskLevel) return false;
    if (f.origin && r.origin_label !== f.origin) return false;
    if (f.destination && r.destination_label !== f.destination) return false;
    if (f.category && !(r.category_spend && r.category_spend[f.category])) return false;
    if (f.employeeId && !(r.collaborators || []).some((c) => String(c.employee_id ?? c.employee_id_text) === String(f.employeeId))) return false;
    return true;
  });
}

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function costComposition(row) {
  const categories = row.category_spend || {};
  const labor = int(row.labor_cost_c);
  const hasTicketCategories = Object.prototype.hasOwnProperty.call(categories, 'airfare')
    || Object.prototype.hasOwnProperty.call(categories, 'bus_fare');
  const tickets = hasTicketCategories
    ? int(categories.airfare) + int(categories.bus_fare)
    : int(row.transport_cost_c);
  const meals = Object.prototype.hasOwnProperty.call(categories, 'meals')
    ? int(categories.meals)
    : int(row.meals_cost_c);

  return { labor, tickets, meals, total: labor + tickets + meals };
}

/**
 * Derive the live HUD/operational state of a confirmed mobilization (§4).
 * @returns {{ status: string, progress: number, delayed: boolean }}
 */
export function deriveLiveState(row, nowMs) {
  if (row.confirmation_status === 'completed') return { status: 'completed', progress: 1, delayed: false };
  const dep = Date.parse(row.planned_departure_at);
  const arr = Date.parse(row.expected_arrival_at);
  let progress = 0;
  if (Number.isFinite(dep) && Number.isFinite(arr) && arr > dep) {
    progress = Math.max(0, Math.min(1, (nowMs - dep) / (arr - dep)));
  }
  const delayed = Number.isFinite(arr) && nowMs > arr;
  const risky = row.risk_level === 'high' || row.risk_level === 'medium' || (row.risk_flags || []).length > 0;
  let status;
  if (delayed) status = 'delayed';
  else if (nowMs < dep) status = risky ? 'warning' : 'on_track';
  else status = 'in_transit';
  return { status, progress, delayed };
}

/** §17 DashboardOverview. */
export function computeOverview(rows, nowMs = Date.now()) {
  const active = rows.filter((r) => ACTIVE.has(r.confirmation_status));
  const completed = rows.filter((r) => r.confirmation_status === 'completed');
  const totals = rows.map((r) => int(r.total_cost_c));
  const totalSpend = totals.reduce((a, b) => a + b, 0);
  const employeesInTransit = active
    .filter((r) => deriveLiveState(r, nowMs).status === 'in_transit')
    .reduce((s, r) => s + int(r.team_size), 0);
  const onTimeEligible = completed.filter((r) => r.on_time != null);
  const onTimeCount = onTimeEligible.filter((r) => r.on_time).length;

  // ── Cost composition (§6.1) ──────────────────────────────────────────
  // "Custo de mobilização" is not one number. Split it so the KPI strip can
  // answer *where* the money goes, not just how much:
  //   labor   = complete HH already stored in labor_cost_c
  //             (regular + overtime + night premium)
  //   tickets = airfare + bus fare
  //   meals   = meal allowances / alimentação
  //
  // Do not add overtime/night to labor_cost_c again: the confirmed record's
  // labor rollup already contains both and doing so duplicates HH.
  const composition = rows.reduce((sum, row) => {
    const current = costComposition(row);
    sum.labor += current.labor;
    sum.tickets += current.tickets;
    sum.meals += current.meals;
    sum.total += current.total;
    return sum;
  }, { labor: 0, tickets: 0, meals: 0, total: 0 });
  const overtime = rows.reduce((s, r) => s + int(r.overtime_cost_c), 0);
  const nightPremium = rows.reduce((s, r) => s + int(r.night_premium_cost_c), 0);
  const accommodation = rows.reduce((s, r) => s + int(r.accommodation_cost_c), 0);
  const laborSpend = composition.labor;
  const laborBase = Math.max(0, laborSpend - overtime - nightPremium);
  const mobilizationSpend = composition.total;
  const logisticsSpend = composition.tickets + composition.meals;

  // Team-hours actually committed to mobilization: duration × headcount.
  // This is the denominator that makes cost/hour comparable across routes.
  const teamMinutes = rows.reduce((s, r) => s + int(r.duration_minutes) * int(r.team_size), 0);
  const teamHours = Math.round(teamMinutes / 60);

  return {
    laborSpendMinor: laborSpend,
    laborBaseSpendMinor: laborBase,
    overtimeSpendMinor: overtime,
    nightPremiumSpendMinor: nightPremium,
    accommodationSpendMinor: accommodation,
    logisticsSpendMinor: logisticsSpend,
    ticketSpendMinor: composition.tickets,
    mealAllowanceSpendMinor: composition.meals,
    mobilizationSpendMinor: mobilizationSpend,
    otherRecordedSpendMinor: Math.max(0, totalSpend - mobilizationSpend),
    laborSharePercent: mobilizationSpend ? Math.round((laborSpend / mobilizationSpend) * 1000) / 10 : 0,
    ticketSharePercent: mobilizationSpend ? Math.round((composition.tickets / mobilizationSpend) * 1000) / 10 : 0,
    mealAllowanceSharePercent: mobilizationSpend ? Math.round((composition.meals / mobilizationSpend) * 1000) / 10 : 0,
    teamHours,
    costPerTeamHourMinor: teamHours ? Math.round(mobilizationSpend / teamHours) : 0,
    averageTeamSize: rows.length
      ? Math.round((rows.reduce((s, r) => s + int(r.team_size), 0) / rows.length) * 10) / 10
      : 0,
    activeMobilizations: active.length,
    completedMobilizations: completed.length,
    totalMobilizationsInRange: rows.length,
    totalSpendMinor: totalSpend,
    averageMobilizationSpendMinor: rows.length ? Math.round(mobilizationSpend / rows.length) : 0,
    averageSpendPerMobilizationMinor: rows.length ? Math.round(totalSpend / rows.length) : 0,
    medianSpendPerMobilizationMinor: median(totals),
    averageDurationMinutes: rows.length ? Math.round(rows.reduce((s, r) => s + int(r.duration_minutes), 0) / rows.length) : 0,
    activeEmployeesInTransit: employeesInTransit,
    estimatedSavingsMinor: rows.reduce((s, r) => s + int(r.estimated_savings_c), 0),
    onTimeRate: onTimeEligible.length ? onTimeCount / onTimeEligible.length : null,
    alertCount: computeAlerts(rows, nowMs).length,
    projectsWithMobilization: new Set(rows.map((r) => r.project_id)).size,
    multimodalCount: rows.filter((r) => r.modal_primary === 'multimodal').length,
    manualCount: rows.filter((r) => r.source === 'manual_simulation').length,
    automaticCount: rows.filter((r) => r.source === 'automatic_mobilization').length,
    lastUpdatedAt: new Date(nowMs).toISOString(),
  };
}

/** §6.1 / §17 CategorySpendItem[]. */
export function categorySpend(rows) {
  const agg = new Map();
  for (const r of rows) {
    for (const [cat, c] of Object.entries(r.category_spend || {})) {
      const cur = agg.get(cat) || { amountMinor: 0, mobilizationCount: 0 };
      cur.amountMinor += int(c);
      cur.mobilizationCount += 1;
      agg.set(cat, cur);
    }
  }
  const total = [...agg.values()].reduce((s, v) => s + v.amountMinor, 0) || 1;
  return [...agg.entries()]
    .map(([category, v]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      amountMinor: v.amountMinor,
      percentage: Math.round((v.amountMinor / total) * 1000) / 10,
      mobilizationCount: v.mobilizationCount,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** §6.2 / §17 ProjectSpendItem[]. */
export function projectSpend(rows) {
  const agg = new Map();
  for (const r of rows) {
    const cur = agg.get(r.project_id) || {
      projectId: r.project_id, projectName: r.project_name_snapshot,
      amountMinor: 0, mobilizationCount: 0, activeMobilizations: 0,
    };
    cur.amountMinor += int(r.total_cost_c);
    cur.mobilizationCount += 1;
    if (ACTIVE.has(r.confirmation_status)) cur.activeMobilizations += 1;
    agg.set(r.project_id, cur);
  }
  return [...agg.values()]
    .map((p) => ({ ...p, averageSpendMinor: p.mobilizationCount ? Math.round(p.amountMinor / p.mobilizationCount) : 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** §6.3 / §17 CollaboratorSpendItem[] — Top N (default 20). */
export function collaboratorSpend(rows, limit = 20) {
  const agg = new Map();
  const activeByEmp = new Map();
  for (const r of rows) {
    const isActive = ACTIVE.has(r.confirmation_status);
    for (const c of r.collaborators || []) {
      const key = String(c.employee_id ?? c.employee_id_text ?? c.employee_name_snapshot);
      const cur = agg.get(key) || {
        employeeId: c.employee_id ?? c.employee_id_text ?? null,
        employeeName: c.employee_name_snapshot,
        role: c.role_snapshot || null,
        totalSpendMinor: 0, laborSpendMinor: 0, transportSpendMinor: 0,
        mobilizationCount: 0, durationMinutesSum: 0,
        overtimeMinutes: 0, nightMinutes: 0,
        projects: new Set(),
      };
      cur.totalSpendMinor += int(c.total_spend_c);
      cur.laborSpendMinor += int(c.labor_spend_c);
      cur.transportSpendMinor += int(c.transport_spend_c) + int(c.other_spend_c);
      cur.mobilizationCount += 1;
      cur.durationMinutesSum += int(r.duration_minutes);
      cur.overtimeMinutes += int(c.overtime_minutes);
      cur.nightMinutes += int(c.night_minutes);
      cur.projects.add(r.project_id);
      agg.set(key, cur);
      if (isActive) activeByEmp.set(key, (activeByEmp.get(key) || 0) + 1);
    }
  }
  return [...agg.entries()]
    .map(([key, v]) => ({
      employeeId: v.employeeId,
      employeeName: v.employeeName,
      role: v.role,
      totalSpendMinor: v.totalSpendMinor,
      laborSpendMinor: v.laborSpendMinor,
      transportSpendMinor: v.transportSpendMinor,
      mobilizationCount: v.mobilizationCount,
      averageSpendMinor: v.mobilizationCount ? Math.round(v.totalSpendMinor / v.mobilizationCount) : 0,
      averageDurationMinutes: v.mobilizationCount ? Math.round(v.durationMinutesSum / v.mobilizationCount) : 0,
      overtimeMinutes: v.overtimeMinutes,
      nightMinutes: v.nightMinutes,
      projectCount: v.projects.size,
      activeMobilizationCount: activeByEmp.get(key) || 0,
    }))
    .sort((a, b) => b.totalSpendMinor - a.totalSpendMinor)
    .slice(0, limit);
}

/** §6.4 modal distribution. */
export function modalMix(rows) {
  const agg = new Map();
  for (const r of rows) {
    const cur = agg.get(r.modal_primary) || { modal: r.modal_primary, count: 0, amountMinor: 0, durationSum: 0, teamSum: 0 };
    cur.count += 1;
    cur.amountMinor += int(r.total_cost_c);
    cur.durationSum += int(r.duration_minutes);
    cur.teamSum += int(r.team_size);
    agg.set(r.modal_primary, cur);
  }
  return [...agg.values()]
    .map((m) => ({
      modal: m.modal,
      count: m.count,
      amountMinor: m.amountMinor,
      avgDurationMinutes: m.count ? Math.round(m.durationSum / m.count) : 0,
      avgCostPerEmployeeMinor: m.teamSum ? Math.round(m.amountMinor / m.teamSum) : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** §6.5 savings intelligence. */
export function savings(rows) {
  const withBaseline = rows.filter((r) => r.baseline_cost_c != null);
  const totalSavings = rows.reduce((s, r) => s + int(r.estimated_savings_c), 0);
  const byProject = new Map();
  for (const r of rows) {
    const cur = byProject.get(r.project_id) || { projectId: r.project_id, projectName: r.project_name_snapshot, savingsMinor: 0 };
    cur.savingsMinor += int(r.estimated_savings_c);
    byProject.set(r.project_id, cur);
  }
  return {
    totalSavingsMinor: totalSavings,
    averageSavingsMinor: rows.length ? Math.round(totalSavings / rows.length) : 0,
    coverage: rows.length ? Math.round((withBaseline.length / rows.length) * 100) / 100 : 0,
    byProject: [...byProject.values()].filter((p) => p.savingsMinor > 0).sort((a, b) => b.savingsMinor - a.savingsMinor),
    methodology: 'savings = maior alternativa viável − cenário confirmado (não negativo)',
  };
}

/** §6.7 SLA / arrival compliance. */
export function slaCompliance(rows, nowMs = Date.now()) {
  const completed = rows.filter((r) => r.confirmation_status === 'completed' && r.on_time != null);
  const onTime = completed.filter((r) => r.on_time).length;
  const active = rows.filter((r) => ACTIVE.has(r.confirmation_status));
  const atRisk = active.filter((r) => {
    const st = deriveLiveState(r, nowMs);
    return st.status === 'delayed' || st.status === 'warning';
  });
  return {
    onTimeRate: completed.length ? onTime / completed.length : null,
    completedCount: completed.length,
    lateCount: completed.length - onTime,
    activeAtRisk: atRisk.length,
    routesAtRisk: atRisk.map((r) => ({ id: r.id, projectName: r.project_name_snapshot, destination: r.destination_label })),
  };
}

/** §6.8 alerts & compliance. */
export function computeAlerts(rows, nowMs = Date.now()) {
  const alerts = [];
  for (const r of rows) {
    if (!ACTIVE.has(r.confirmation_status) && r.confirmation_status !== 'completed') continue;
    const st = deriveLiveState(r, nowMs);
    if (st.status === 'delayed') {
      alerts.push({ id: r.id, severity: 'high', type: 'delay', message: `Atraso: ${r.project_name_snapshot} → ${r.destination_label}` });
    }
    if ((r.risk_flags || []).includes('infeasible')) {
      alerts.push({ id: r.id, severity: 'high', type: 'infeasible', message: `Rota inviável confirmada: ${r.project_name_snapshot}` });
    }
    if (int(r.overtime_cost_c) > 0 && int(r.overtime_cost_c) >= int(r.labor_cost_c) * 0.5 && int(r.labor_cost_c) > 0) {
      alerts.push({ id: r.id, severity: 'medium', type: 'overtime', message: `Alta exposição a HE: ${r.project_name_snapshot}` });
    }
    if (int(r.night_premium_cost_c) > 0 && int(r.night_premium_cost_c) >= int(r.total_cost_c) * 0.15) {
      alerts.push({ id: r.id, severity: 'low', type: 'night', message: `Adicional noturno elevado: ${r.project_name_snapshot}` });
    }
    if (r.risk_level === 'medium' && st.status === 'warning') {
      alerts.push({ id: r.id, severity: 'medium', type: 'risk', message: `Risco de conexão: ${r.project_name_snapshot}` });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * §4 / §17 ActiveMobilizationMapItem[] for the HUD globe. ONLY currently active
 * confirmed mobilizations (awaiting departure, in transit, delayed, at risk) —
 * completed/archived/cancelled/draft never appear.
 */
export function activeMapItems(rows, nowMs = Date.now()) {
  return rows
    .filter((r) => ACTIVE.has(r.confirmation_status))
    .map((r) => ({
      row: r,
      origin: resolveMapCoordinate(r.origin_label, r.origin_lat, r.origin_lng),
      destination: resolveMapCoordinate(r.destination_label, r.destination_lat, r.destination_lng),
    }))
    .filter(({ origin, destination }) => origin && destination)
    .map(({ row: r, origin, destination }) => {
      const st = deriveLiveState(r, nowMs);
      const oLat = origin.lat, oLng = origin.lng, dLat = destination.lat, dLng = destination.lng;
      return {
        mobilizationId: r.id,
        projectId: r.project_id,
        projectName: r.project_name_snapshot,
        scheduleName: r.schedule_name_snapshot,
        origin: { label: r.origin_label, lat: oLat, lng: oLng },
        destination: { label: r.destination_label, lat: dLat, lng: dLng },
        currentPosition: {
          lat: oLat + (dLat - oLat) * st.progress,
          lng: oLng + (dLng - oLng) * st.progress,
        },
        progressPercentage: Math.round(st.progress * 100),
        modal: r.modal_primary,
        status: st.status,
        teamSize: int(r.team_size),
        employeeSummary: summarizeTeam(r.employee_snapshot),
        estimatedArrivalAt: r.expected_arrival_at,
        plannedDepartureAt: r.planned_departure_at,
        totalCostMinor: int(r.total_cost_c),
        riskLevel: r.risk_level,
        source: r.source === 'manual_simulation' ? 'manual' : 'automatic',
        lastUpdatedAt: r.updated_at || r.confirmed_at,
        // Hospedagem (§6.1 accommodation): the globe shows a hotel marker at the
        // destination while the team is lodged. `lodgingActive` is true once the
        // team has arrived (real-time, per current date) and the operation is
        // still running.
        lodging: buildLodging(r, st, nowMs, dLat, dLng),
      };
    });
}

/**
 * Build the lodging (hospedagem) descriptor for the HUD globe. A mobilization
 * has lodging when it carries accommodation cost; nights are estimated from the
 * door-to-door duration (min 1 when there is accommodation spend). The hotel
 * marker sits at the destination and is "active" once the team has arrived and
 * the operation is still running (real-time, keyed to `nowMs`).
 */
function buildLodging(r, liveState, nowMs, dLat, dLng) {
  const accommodationCostMinor = int(r.accommodation_cost_c);
  if (accommodationCostMinor <= 0) return null;
  const nights = Math.max(1, Math.round(int(r.duration_minutes) / (24 * 60)));
  const arr = Date.parse(r.expected_arrival_at);
  const active = Number.isFinite(arr) && nowMs >= arr && r.confirmation_status !== 'completed';
  return {
    hasLodging: true,
    nights,
    accommodationCostMinor,
    label: `Hospedagem · ${r.destination_label}`,
    lat: dLat,
    lng: dLng,
    active,
  };
}

function summarizeTeam(snapshot) {
  const list = Array.isArray(snapshot) ? snapshot : [];
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].name;
  return `${list[0].name} +${list.length - 1}`;
}

/**
 * §6.6 cost / duration trend bucketed by day.
 *
 * Also emits the running totals that drive the S-curve: `cumulativeAmountMinor`
 * and `cumulativeCount`. Daily bars answer "how much today"; the cumulative
 * curve answers "how fast are we burning the period", which is the question a
 * controller actually asks. Its slope is the burn rate — a flattening tail
 * means mobilization is winding down, a steepening middle means it is not.
 *
 * `baselineAmountMinor` is the straight-line spend the period would have had
 * at a constant daily rate; plotting it against the real curve is what makes
 * the S readable (above the line = spending ahead of pace).
 */
export function costTrend(rows) {
  const agg = new Map();
  for (const r of rows) {
    const day = (r.confirmed_at || '').slice(0, 10);
    if (!day) continue;
    const cur = agg.get(day) || { date: day, amountMinor: 0, count: 0, durationSum: 0, laborSum: 0 };
    cur.amountMinor += int(r.total_cost_c);
    cur.laborSum += int(r.labor_cost_c);
    cur.count += 1;
    cur.durationSum += int(r.duration_minutes);
    agg.set(day, cur);
  }
  const days = [...agg.values()].sort((a, b) => a.date.localeCompare(b.date));
  const grandTotal = days.reduce((s, d) => s + d.amountMinor, 0);
  let runningAmount = 0;
  let runningCount = 0;
  return days.map((d, i) => {
    runningAmount += d.amountMinor;
    runningCount += d.count;
    return {
      date: d.date,
      amountMinor: d.amountMinor,
      laborAmountMinor: d.laborSum,
      count: d.count,
      avgDurationMinutes: d.count ? Math.round(d.durationSum / d.count) : 0,
      cumulativeAmountMinor: runningAmount,
      cumulativeCount: runningCount,
      baselineAmountMinor: Math.round((grandTotal / days.length) * (i + 1)),
    };
  });
}

/**
 * One-shot dashboard payload: filters an eligible dataset and runs every
 * aggregation. `realtime`-tagged pieces (map, alerts, overview counts) can be
 * refreshed more frequently than the cached analytics (§9).
 */
export function buildDashboard(allRows, filters = {}, nowMs = Date.now()) {
  const rows = applyFilters(eligible(allRows), filters);
  return {
    overview: computeOverview(rows, nowMs),
    categorySpend: categorySpend(rows),
    projectSpend: projectSpend(rows),
    collaboratorSpend: collaboratorSpend(rows, filters.collaboratorLimit || 20),
    modalMix: modalMix(rows),
    savings: savings(rows),
    sla: slaCompliance(rows, nowMs),
    alerts: computeAlerts(rows, nowMs),
    map: activeMapItems(rows, nowMs),
    trend: costTrend(rows),
    generatedAt: new Date(nowMs).toISOString(),
    eligibleCount: rows.length,
  };
}
