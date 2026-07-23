/**
 * Mobilization search route (§24).
 * POST /api/mobilization/search — runs the full pipeline and returns ranked,
 * costed itineraries with a recommendation.
 *
 * @module server/routes/mobilization
 */

import express from 'express';
import { searchMobilization } from '../mobilization/MobilizationSearchService.js';
import {
  selectItinerary, recordOverride, submitForApproval, recordApprovalAction, isPersistenceEnabled,
} from '../mobilization/persistence.js';

export const mobilization = express.Router();

mobilization.get('/status', (_req, res) => {
  res.json({ auditEnabled: isPersistenceEnabled() });
});

mobilization.post('/search', async (req, res) => {
  const { origin, destination, earliestDepartureUtc, deadlineUtc } = req.body || {};
  if (!origin || !destination || !earliestDepartureUtc || !deadlineUtc) {
    return res.status(400).json({
      error: 'origin, destination, earliestDepartureUtc e deadlineUtc são obrigatórios',
    });
  }
  try {
    const result = await searchMobilization(req.body);
    res.json(result);
  } catch (err) {
    console.error('[mobilization/search]', err);
    res.status(500).json({ error: err.message });
  }
});

// Select an itinerary (§24). Records selection + audit; an override (choosing a
// non-recommended option) requires a reason (§25).
mobilization.post('/itineraries/:id/select', async (req, res) => {
  const { requestId, actorId, override } = req.body || {};
  if (!requestId) return res.status(400).json({ error: 'requestId é obrigatório' });
  try {
    const sel = await selectItinerary({ requestId, itineraryId: req.params.id, actorId });
    if (!sel.ok) return res.status(sel.reason === 'persistence_disabled' ? 409 : 500).json({ error: sel.reason });
    if (override && override.isOverride) {
      const ov = await recordOverride({
        requestId, originalItineraryId: override.recommendedItineraryId,
        chosenItineraryId: req.params.id, reason: override.reason, actorId,
      });
      if (!ov.ok) return res.status(400).json({ error: ov.reason });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit the selected route for approval (§24).
mobilization.post('/requests/:id/submit-for-approval', async (req, res) => {
  const { itineraryId, actorId, note } = req.body || {};
  try {
    const r = await submitForApproval({ requestId: req.params.id, itineraryId, actorId, note });
    if (!r.ok) return res.status(r.reason === 'persistence_disabled' ? 409 : 500).json({ error: r.reason });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve or reject a mobilization request (§25).
mobilization.post('/requests/:id/decision', async (req, res) => {
  const { action, itineraryId, note, actorId } = req.body || {};
  if (!['approved', 'rejected'].includes(action)) return res.status(400).json({ error: 'action deve ser approved|rejected' });
  try {
    const r = await recordApprovalAction({ requestId: req.params.id, itineraryId, action, note, actorId });
    if (!r.ok) return res.status(r.reason === 'persistence_disabled' ? 409 : 500).json({ error: r.reason });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
