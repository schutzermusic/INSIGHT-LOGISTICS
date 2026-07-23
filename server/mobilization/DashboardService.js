/**
 * DashboardService (§8, §9, §18) — the backend aggregation entry point.
 *
 * Owns the confirmed dataset lifecycle: fetch once, cache with a short TTL, and
 * run the pure `dashboardAggregations` on top. Realtime-ish pieces (overview
 * counts, HUD map, alerts) recompute from the cached dataset on every call
 * (cheap, in-memory), while the whole dataset fetch is what the TTL protects —
 * this is the §9 "realtime vs cached" split without overloading the database.
 *
 * The dataset cache is invalidated immediately when a new mobilization is
 * confirmed, so a confirmation shows up on the dashboard on the next poll.
 *
 * @module server/mobilization/DashboardService
 */

import { fetchConfirmedDataset } from './confirmedPersistence.js';
import {
  buildDashboard, computeOverview, activeMapItems, computeAlerts,
  applyFilters, eligible,
} from './dashboardAggregations.js';

const TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000); // 30s default

let _cache = { at: 0, rows: null, promise: null };

/** Force the next read to hit the database (called after a confirmation). */
export function invalidateDashboardCache() {
  _cache = { at: 0, rows: null, promise: null };
}

async function getDataset({ force = false } = {}) {
  const now = Date.now();
  if (!force && _cache.rows && now - _cache.at < TTL_MS) return _cache.rows;
  if (_cache.promise) return _cache.promise; // coalesce concurrent refreshes
  _cache.promise = fetchConfirmedDataset()
    .then((rows) => {
      _cache = { at: Date.now(), rows, promise: null };
      return rows;
    })
    .catch((err) => {
      _cache.promise = null;
      throw err;
    });
  return _cache.promise;
}

/** Full dashboard payload for the given global filters (§8/§11/§12). */
export async function getDashboard(filters = {}, { force = false } = {}) {
  const rows = await getDataset({ force });
  return buildDashboard(rows, filters, Date.now());
}

/**
 * Realtime slice only (§9 "realtime / frequent refresh"): overview counts, HUD
 * globe items and alerts. Cheaper payload for a high-frequency poll/SSE tick.
 */
export async function getRealtimeSlice(filters = {}, { force = false } = {}) {
  const rows = applyFilters(eligible(await getDataset({ force })), filters);
  const now = Date.now();
  return {
    overview: computeOverview(rows, now),
    map: activeMapItems(rows, now),
    alerts: computeAlerts(rows, now),
    generatedAt: new Date(now).toISOString(),
  };
}

/** Distinct filter option values (projects, cost centers, modals…) for the UI. */
export async function getFilterOptions() {
  const rows = eligible(await getDataset());
  const projects = new Map();
  const costCenters = new Set();
  const businessUnits = new Set();
  const modals = new Set();
  for (const r of rows) {
    projects.set(r.project_id, r.project_name_snapshot);
    if (r.cost_center) costCenters.add(r.cost_center);
    if (r.business_unit) businessUnits.add(r.business_unit);
    if (r.modal_primary) modals.add(r.modal_primary);
  }
  return {
    projects: [...projects.entries()].map(([id, name]) => ({ id, name })),
    costCenters: [...costCenters],
    businessUnits: [...businessUnits],
    modals: [...modals],
    statuses: ['confirmed', 'in_progress', 'completed'],
    sources: ['manual_simulation', 'automatic_mobilization'],
  };
}
