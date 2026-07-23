import { describe, it, expect } from 'vitest';
import {
  eligible, applyFilters, computeOverview, categorySpend, projectSpend,
  collaboratorSpend, modalMix, savings, activeMapItems, deriveLiveState,
  computeAlerts, buildDashboard,
} from './dashboardAggregations.js';

const NOW = Date.parse('2026-07-20T12:00:00Z');

/** Build a confirmed-mobilization row (snake_case, as stored/read). */
function row(o = {}) {
  return {
    id: o.id || 'm1',
    confirmation_status: o.confirmation_status || 'confirmed',
    operational_status: o.operational_status || 'awaiting_departure',
    source: o.source || 'automatic_mobilization',
    project_id: o.project_id || 'p1',
    project_name_snapshot: o.project_name_snapshot || 'Projeto 1',
    schedule_name_snapshot: 'Etapa',
    cost_center: o.cost_center || 'CC1',
    business_unit: o.business_unit || 'BU1',
    contract: o.contract || null,
    modal_primary: o.modal_primary || 'air',
    origin_label: o.origin_label || 'São Paulo - SP',
    destination_label: o.destination_label || 'Recife - PE',
    origin_lat: o.origin_lat ?? -23.5, origin_lng: o.origin_lng ?? -46.6,
    destination_lat: o.destination_lat ?? -8.05, destination_lng: o.destination_lng ?? -34.9,
    planned_departure_at: o.planned_departure_at || '2026-07-20T09:00:00Z',
    expected_arrival_at: o.expected_arrival_at || '2026-07-20T18:00:00Z',
    duration_minutes: o.duration_minutes ?? 540,
    team_size: o.team_size ?? 2,
    total_cost_c: o.total_cost_c ?? 300000,
    labor_cost_c: o.labor_cost_c ?? 160000,
    overtime_cost_c: o.overtime_cost_c ?? 0,
    night_premium_cost_c: o.night_premium_cost_c ?? 0,
    estimated_savings_c: o.estimated_savings_c ?? 20000,
    baseline_cost_c: o.baseline_cost_c ?? 320000,
    category_spend: o.category_spend || { airfare: 120000, labor_regular: 160000, meals: 8000, accommodation: 12000 },
    risk_level: o.risk_level || 'low',
    risk_flags: o.risk_flags || [],
    on_time: o.on_time ?? null,
    confirmed_at: o.confirmed_at || '2026-07-15T10:00:00Z',
    employee_snapshot: o.employee_snapshot || [{ id: 'e1', name: 'Ana' }, { id: 'e2', name: 'Bruno' }],
    collaborators: o.collaborators || [
      { employee_id: 'e1', employee_name_snapshot: 'Ana', role_snapshot: 'Eletricista', labor_spend_c: 100000, transport_spend_c: 70000, other_spend_c: 0, total_spend_c: 170000, overtime_minutes: 60, night_minutes: 0 },
      { employee_id: 'e2', employee_name_snapshot: 'Bruno', role_snapshot: 'Mecânico', labor_spend_c: 60000, transport_spend_c: 70000, other_spend_c: 0, total_spend_c: 130000, overtime_minutes: 0, night_minutes: 0 },
    ],
  };
}

describe('eligible (§3.1 critical rule)', () => {
  it('includes only confirmed | in_progress | completed', () => {
    const rows = [
      row({ id: 'a', confirmation_status: 'draft' }),
      row({ id: 'b', confirmation_status: 'calculated' }),
      row({ id: 'c', confirmation_status: 'selected' }),
      row({ id: 'd', confirmation_status: 'rejected' }),
      row({ id: 'e', confirmation_status: 'cancelled' }),
      row({ id: 'f', confirmation_status: 'archived' }),
      row({ id: 'g', confirmation_status: 'confirmed' }),
      row({ id: 'h', confirmation_status: 'in_progress' }),
      row({ id: 'i', confirmation_status: 'completed' }),
    ];
    expect(eligible(rows).map((r) => r.id).sort()).toEqual(['g', 'h', 'i']);
  });

  it('never lets a draft reach the dashboard payload or the globe', () => {
    const rows = [row({ id: 'draft', confirmation_status: 'draft' }), row({ id: 'ok', confirmation_status: 'in_progress' })];
    const dash = buildDashboard(rows, {}, NOW);
    expect(dash.eligibleCount).toBe(1);
    expect(dash.overview.totalMobilizationsInRange).toBe(1);
    expect(dash.map.every((m) => m.mobilizationId !== 'draft')).toBe(true);
  });
});

describe('applyFilters (§12)', () => {
  const rows = eligible([
    row({ id: 'a', project_id: 'p1', modal_primary: 'air', confirmed_at: '2026-07-10T00:00:00Z' }),
    row({ id: 'b', project_id: 'p2', modal_primary: 'bus', confirmed_at: '2026-07-16T00:00:00Z' }),
  ]);
  it('filters by project', () => { expect(applyFilters(rows, { projectId: 'p2' }).map((r) => r.id)).toEqual(['b']); });
  it('filters by modal', () => { expect(applyFilters(rows, { modal: 'air' }).map((r) => r.id)).toEqual(['a']); });
  it('filters by date window', () => { expect(applyFilters(rows, { dateFrom: '2026-07-14', dateTo: '2026-07-20' }).map((r) => r.id)).toEqual(['b']); });
  it('filters by employee', () => { expect(applyFilters(rows, { employeeId: 'e1' }).map((r) => r.id).sort()).toEqual(['a', 'b']); });
});

describe('computeOverview', () => {
  it('separates active vs completed and totals spend', () => {
    const rows = eligible([
      row({ id: 'a', confirmation_status: 'confirmed', total_cost_c: 100000 }),
      row({ id: 'b', confirmation_status: 'in_progress', total_cost_c: 200000 }),
      row({ id: 'c', confirmation_status: 'completed', total_cost_c: 300000, on_time: true }),
    ]);
    const ov = computeOverview(rows, NOW);
    expect(ov.activeMobilizations).toBe(2);
    expect(ov.completedMobilizations).toBe(1);
    expect(ov.totalSpendMinor).toBe(600000);
    expect(ov.averageSpendPerMobilizationMinor).toBe(200000);
    expect(ov.onTimeRate).toBe(1);
    expect(ov.projectsWithMobilization).toBe(1);
  });
});

describe('categorySpend (§6.1)', () => {
  it('aggregates normalized categories with percentage shares', () => {
    const rows = eligible([row()]);
    const cats = categorySpend(rows);
    const air = cats.find((c) => c.category === 'airfare');
    expect(air.amountMinor).toBe(120000);
    const total = cats.reduce((s, c) => s + c.amountMinor, 0);
    expect(total).toBe(300000);
    expect(cats[0].amountMinor).toBeGreaterThanOrEqual(cats[1].amountMinor); // sorted desc
  });
});

describe('projectSpend (§6.2)', () => {
  it('ranks projects by total spend with active counts', () => {
    const rows = eligible([
      row({ id: 'a', project_id: 'p1', project_name_snapshot: 'P1', total_cost_c: 100000, confirmation_status: 'confirmed' }),
      row({ id: 'b', project_id: 'p1', project_name_snapshot: 'P1', total_cost_c: 100000, confirmation_status: 'completed' }),
      row({ id: 'c', project_id: 'p2', project_name_snapshot: 'P2', total_cost_c: 500000, confirmation_status: 'confirmed' }),
    ]);
    const ps = projectSpend(rows);
    expect(ps[0].projectId).toBe('p2');
    const p1 = ps.find((p) => p.projectId === 'p1');
    expect(p1.amountMinor).toBe(200000);
    expect(p1.activeMobilizations).toBe(1);
    expect(p1.averageSpendMinor).toBe(100000);
  });
});

describe('collaboratorSpend (§6.3 Top 20)', () => {
  it('ranks collaborators by attributed spend across mobilizations', () => {
    const rows = eligible([row({ id: 'a' }), row({ id: 'b' })]);
    const cs = collaboratorSpend(rows, 20);
    const ana = cs.find((c) => c.employeeId === 'e1');
    expect(ana.totalSpendMinor).toBe(340000); // 170000 x2
    expect(ana.mobilizationCount).toBe(2);
    expect(ana.laborSpendMinor).toBe(200000);
    expect(cs[0].totalSpendMinor).toBeGreaterThanOrEqual(cs[1].totalSpendMinor);
  });
  it('honors the limit', () => {
    const rows = eligible([
      row({ id: 'a', collaborators: [{ employee_id: 'x1', employee_name_snapshot: 'X1', total_spend_c: 10, labor_spend_c: 10, transport_spend_c: 0, other_spend_c: 0 }] }),
      row({ id: 'b', collaborators: [{ employee_id: 'x2', employee_name_snapshot: 'X2', total_spend_c: 20, labor_spend_c: 20, transport_spend_c: 0, other_spend_c: 0 }] }),
    ]);
    expect(collaboratorSpend(rows, 1)).toHaveLength(1);
    expect(collaboratorSpend(rows, 1)[0].employeeId).toBe('x2');
  });
});

describe('modalMix + savings', () => {
  it('distributes by modal', () => {
    const rows = eligible([row({ id: 'a', modal_primary: 'air', total_cost_c: 300000, team_size: 2 }), row({ id: 'b', modal_primary: 'bus', total_cost_c: 100000, team_size: 2 })]);
    const mm = modalMix(rows);
    expect(mm[0].modal).toBe('air');
    expect(mm[0].avgCostPerEmployeeMinor).toBe(150000);
  });
  it('totals auditable savings', () => {
    const rows = eligible([row({ id: 'a', estimated_savings_c: 20000 }), row({ id: 'b', estimated_savings_c: 30000 })]);
    const sv = savings(rows);
    expect(sv.totalSavingsMinor).toBe(50000);
    expect(sv.byProject[0].savingsMinor).toBe(50000);
  });
});

describe('deriveLiveState + activeMapItems (§4 HUD globe)', () => {
  it('marks a mobilization past its ETA as delayed', () => {
    const r = row({ planned_departure_at: '2026-07-19T00:00:00Z', expected_arrival_at: '2026-07-20T00:00:00Z' });
    expect(deriveLiveState(r, NOW).status).toBe('delayed');
  });
  it('marks in_transit mid-journey with interpolated position', () => {
    const r = row({ planned_departure_at: '2026-07-20T09:00:00Z', expected_arrival_at: '2026-07-20T18:00:00Z' });
    const st = deriveLiveState(r, NOW);
    expect(st.status).toBe('in_transit');
    expect(st.progress).toBeGreaterThan(0);
    expect(st.progress).toBeLessThan(1);
  });
  it('globe includes only active confirmed items, never completed', () => {
    const rows = eligible([
      row({ id: 'active', confirmation_status: 'in_progress' }),
      row({ id: 'done', confirmation_status: 'completed' }),
    ]);
    const items = activeMapItems(rows, NOW);
    expect(items.map((i) => i.mobilizationId)).toEqual(['active']);
    expect(items[0].currentPosition).toBeTruthy();
  });
});

describe('computeAlerts', () => {
  it('raises a high-severity delay alert', () => {
    const rows = eligible([row({ id: 'late', planned_departure_at: '2026-07-19T00:00:00Z', expected_arrival_at: '2026-07-20T00:00:00Z' })]);
    const alerts = computeAlerts(rows, NOW);
    expect(alerts.some((a) => a.type === 'delay' && a.severity === 'high')).toBe(true);
  });
});
