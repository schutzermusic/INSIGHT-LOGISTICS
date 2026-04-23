/**
 * API Routes: Quero Passagem (Bus Tickets)
 * Proxies requests to the Quero Passagem API v4 using server-side credentials.
 * Credentials are NEVER exposed to the frontend.
 */

import { Router } from 'express';
import {
  listCompanies,
  getCompany,
  listStops,
  getStop,
  searchStops,
  searchTrips,
  getSeats,
  createBooking,
  getBooking,
  deleteBooking,
  checkout,
  getPaymentKey,
  listPurchases,
  getPurchase,
  cancelVoucher,
  cancelPurchase,
  updateExternalId,
  getConnectionSuggestions,
  isConfigured,
} from '../services/QueroPassagemService.js';

export const queroPassagem = Router();

// ── Health / Status ─────────────────────────────────────

queroPassagem.get('/status', (_req, res) => {
  res.json({
    configured: isConfigured(),
    env: process.env.QUERO_PASSAGEM_ENV || 'sandbox',
  });
});

// ── Companies ───────────────────────────────────────────

queroPassagem.get('/companies', async (_req, res) => {
  try {
    const result = await listCompanies();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    console.error('[/api/bus/companies] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.get('/companies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await getCompany(parseInt(id, 10));
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error(`[/api/bus/companies/${id}] Error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Stops ───────────────────────────────────────────────

queroPassagem.get('/stops', async (_req, res) => {
  try {
    const result = await listStops();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    console.error('[/api/bus/stops] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.get('/stops/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" is required (min 2 chars)' });
  }
  try {
    const result = await searchStops(q);
    res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    console.error('[/api/bus/stops/search] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.get('/stops/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await getStop(id);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error(`[/api/bus/stops/${id}] Error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Search Trips ────────────────────────────────────────

queroPassagem.post('/search', async (req, res) => {
  const { from, to, travelDate, includeConnections } = req.body;

  if (!from || !to || !travelDate) {
    return res.status(400).json({ error: 'from, to, and travelDate are required' });
  }

  try {
    const result = await searchTrips(from, to, travelDate, { includeConnections });
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/search] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Seats ───────────────────────────────────────────────

queroPassagem.post('/seats', async (req, res) => {
  const { travelId, orientation, type } = req.body;

  if (!travelId) {
    return res.status(400).json({ error: 'travelId is required' });
  }

  try {
    const result = await getSeats(travelId, { orientation, type });
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/seats] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Booking ─────────────────────────────────────────────

queroPassagem.post('/booking', async (req, res) => {
  const { travels } = req.body;

  if (!travels || !Array.isArray(travels) || travels.length === 0) {
    return res.status(400).json({ error: 'travels array is required' });
  }

  try {
    const result = await createBooking(travels);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/booking] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.get('/booking/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await getBooking(id);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error(`[/api/bus/booking/${id}] Error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.delete('/booking/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await deleteBooking(id);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error(`[/api/bus/booking/${id}] Error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Checkout (Payment) ──────────────────────────────────

queroPassagem.post('/checkout', async (req, res) => {
  const { bookingId, email, buyer, payment, callbackURL, externalId } = req.body;

  if (!bookingId || !email || !buyer || !payment || !callbackURL) {
    return res.status(400).json({ error: 'bookingId, email, buyer, payment, and callbackURL are required' });
  }

  try {
    const result = await checkout({ bookingId, email, buyer, payment, callbackURL, externalId });
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/checkout] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.get('/payment/key', async (_req, res) => {
  try {
    const result = await getPaymentKey();
    res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    console.error('[/api/bus/payment/key] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Purchases ───────────────────────────────────────────

queroPassagem.post('/purchases', async (req, res) => {
  const { filters } = req.body;
  try {
    const result = await listPurchases(filters);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/purchases] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.post('/purchases/get', async (req, res) => {
  const { id, externalId, email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }
  if (!id && !externalId) {
    return res.status(400).json({ error: 'id or externalId is required' });
  }

  try {
    const result = await getPurchase({ id, externalId, email });
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/purchases/get] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.post('/purchases/cancel-voucher', async (req, res) => {
  const { purchaseId, passengerId, email } = req.body;

  if (!purchaseId || !passengerId) {
    return res.status(400).json({ error: 'purchaseId and passengerId are required' });
  }

  try {
    const result = await cancelVoucher(purchaseId, passengerId, email);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/purchases/cancel-voucher] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.post('/purchases/cancel', async (req, res) => {
  const { purchaseId, email } = req.body;

  if (!purchaseId) {
    return res.status(400).json({ error: 'purchaseId is required' });
  }

  try {
    const result = await cancelPurchase(purchaseId, email);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/purchases/cancel] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

queroPassagem.post('/purchases/update-external-id', async (req, res) => {
  const { purchaseId, externalId } = req.body;

  if (!purchaseId || !externalId) {
    return res.status(400).json({ error: 'purchaseId and externalId are required' });
  }

  try {
    const result = await updateExternalId(purchaseId, externalId);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/purchases/update-external-id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Connections ─────────────────────────────────────────

queroPassagem.post('/connections/suggestions', async (req, res) => {
  const { from, to, travelDate } = req.body;

  if (!from || !to || !travelDate) {
    return res.status(400).json({ error: 'from, to, and travelDate are required' });
  }

  try {
    const result = await getConnectionSuggestions(from, to, travelDate);
    res.status(result.success ? 200 : result.status || 500).json(result);
  } catch (err) {
    console.error('[/api/bus/connections/suggestions] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
