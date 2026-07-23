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

const ELIGIBLE = new Set(['confirmed', 'in_progress', 'completed']);
const ACTIVE = new Set(['confirmed', 'in_progress']);
const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);

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
  return {
    activeMobilizations: active.length,
    completedMobilizations: completed.length,
    totalMobilizationsInRange: rows.length,
    totalSpendMinor: totalSpend,
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
    .filter((r) => Number.isFinite(+r.origin_lat) && Number.isFinite(+r.destination_lat))
    .map((r) => {
      const st = deriveLiveState(r, nowMs);
      const oLat = +r.origin_lat, oLng = +r.origin_lng, dLat = +r.destination_lat, dLng = +r.destination_lng;
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
      };
    });
}

function summarizeTeam(snapshot) {
  const list = Array.isArray(snapshot) ? snapshot : [];
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].name;
  return `${list[0].name} +${list.length - 1}`;
}

/** §6.6 cost / duration trend bucketed by day. */
export function costTrend(rows) {
  const agg = new Map();
  for (const r of rows) {
    const day = (r.confirmed_at || '').slice(0, 10);
    if (!day) continue;
    const cur = agg.get(day) || { date: day, amountMinor: 0, count: 0, durationSum: 0 };
    cur.amountMinor += int(r.total_cost_c);
    cur.count += 1;
    cur.durationSum += int(r.duration_minutes);
    agg.set(day, cur);
  }
  return [...agg.values()]
    .map((d) => ({ date: d.date, amountMinor: d.amountMinor, count: d.count, avgDurationMinutes: d.count ? Math.round(d.durationSum / d.count) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
