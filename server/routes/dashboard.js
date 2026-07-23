/**
 * Dashboard & confirmation routes (§3.1, §8, §9).
 *
 *   POST /api/dashboard/confirm            — confirm a selected mobilization
 *   GET  /api/dashboard/overview           — full aggregated dashboard payload
 *   GET  /api/dashboard/realtime           — realtime slice (overview+map+alerts)
 *   GET  /api/dashboard/filters            — distinct filter option values
 *   GET  /api/dashboard/stream             — SSE realtime stream (polling-backed)
 *   GET  /api/dashboard/status             — persistence availability
 *
 * Query params on the read endpoints map 1:1 to the global filters (§12):
 *   dateFrom, dateTo, projectId, costCenter, businessUnit, contract, modal,
 *   status, source, employeeId, riskLevel, origin, destination, category.
 *
 * @module server/routes/dashboard
 */

import express from 'express';
import { buildConfirmationRecord } from '../mobilization/ConfirmedMobilizationService.js';
import { persistConfirmation, isConfirmationPersistenceEnabled } from '../mobilization/confirmedPersistence.js';
import {
  getDashboard, getRealtimeSlice, getFilterOptions, invalidateDashboardCache,
} from '../mobilization/DashboardService.js';

export const dashboard = express.Router();

const FILTER_KEYS = [
  'dateFrom', 'dateTo', 'projectId', 'costCenter', 'businessUnit', 'contract',
  'modal', 'status', 'source', 'employeeId', 'riskLevel', 'origin', 'destination', 'category',
];

function filtersFromQuery(q = {}) {
  const f = {};
  for (const k of FILTER_KEYS) if (q[k]) f[k] = q[k];
  if (q.collaboratorLimit) f.collaboratorLimit = Math.min(100, Math.max(1, Number(q.collaboratorLimit) || 20));
  return f;
}

dashboard.get('/status', (_req, res) => {
  res.json({ persistenceEnabled: isConfirmationPersistenceEnabled() });
});

// Confirm a selected mobilization → becomes dashboard-eligible (§3.1).
dashboard.post('/confirm', async (req, res) => {
  try {
    const { record, collaborators } = buildConfirmationRecord(req.body || {});
    if (!isConfirmationPersistenceEnabled()) {
      // Gate still ran; report that persistence (and thus dashboard feed) is off.
      return res.status(409).json({
        error: 'Persistência desativada — configure SUPABASE_SERVICE_ROLE_KEY para confirmar mobilizações.',
        validated: true,
      });
    }
    const saved = await persistConfirmation({ record, collaborators, actorId: req.body?.actorId });
    invalidateDashboardCache();
    res.json({ ok: true, confirmedId: saved?.confirmedId || null });
  } catch (err) {
    if (err.code === 'CONFIRMATION_INVALID') {
      return res.status(422).json({ error: err.message, errors: err.errors });
    }
    console.error('[dashboard/confirm]', err);
    res.status(500).json({ error: err.message });
  }
});

dashboard.get('/overview', async (req, res) => {
  try {
    const data = await getDashboard(filtersFromQuery(req.query), { force: req.query.force === '1' });
    res.json(data);
  } catch (err) {
    console.error('[dashboard/overview]', err);
    res.status(500).json({ error: err.message });
  }
});

dashboard.get('/realtime', async (req, res) => {
  try {
    res.json(await getRealtimeSlice(filtersFromQuery(req.query)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

dashboard.get('/filters', async (_req, res) => {
  try {
    res.json(await getFilterOptions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events realtime stream (§9). Backed by periodic recomputation of
// the cheap realtime slice; the client uses this for the live HUD without
// hammering the DB (dataset fetch is TTL-cached under the hood).
dashboard.get('/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  const filters = filtersFromQuery(req.query);
  const intervalMs = Math.min(60000, Math.max(3000, Number(req.query.intervalMs) || 8000));

  let closed = false;
  const tick = async () => {
    if (closed) return;
    try {
      const slice = await getRealtimeSlice(filters);
      res.write(`event: realtime\ndata: ${JSON.stringify(slice)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };
  await tick();
  const timer = setInterval(tick, intervalMs);
  req.on('close', () => { closed = true; clearInterval(timer); });
});
