/**
 * SerpAPI flights route (server-side key). Part of moving the SerpAPI key off
 * the client (§26). The mobilization backend calls this instead of the browser
 * hitting SerpAPI directly.
 *
 * POST /api/flights/search  { departureId, arrivalId, outboundDate, returnDate?, adults? }
 * GET  /api/flights/status
 *
 * @module server/routes/serpapi
 */

import express from 'express';
import { fetchSerpFlights, isSerpApiConfigured } from '../services/SerpApiFlightsService.js';

export const serpApiFlights = express.Router();

serpApiFlights.get('/status', (_req, res) => {
  res.json({ configured: isSerpApiConfigured() });
});

serpApiFlights.post('/search', async (req, res) => {
  const { departureId, arrivalId, outboundDate, returnDate, adults } = req.body || {};
  if (!departureId || !arrivalId || !outboundDate) {
    return res.status(400).json({ error: 'departureId, arrivalId e outboundDate são obrigatórios' });
  }
  try {
    const raw = await fetchSerpFlights({ departureId, arrivalId, outboundDate, returnDate, adults });
    res.json({ success: true, raw });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
