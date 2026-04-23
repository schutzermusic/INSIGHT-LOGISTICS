/**
 * API Routes: Google Geocoding
 * All endpoints use the server-side GOOGLE_SERVER_API_KEY
 */

import { Router } from 'express';
import {
  geocodeAddress,
  reverseGeocode,
  batchGeocode,
  normalizeLocations,
} from '../services/GoogleGeocodingService.js';

export const googleGeocoding = Router();

/**
 * POST /api/geocoding/address
 * Geocode an address to coordinates
 */
googleGeocoding.post('/address', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }

  try {
    const result = await geocodeAddress(address);
    if (result) {
      res.json({ success: true, ...result });
    } else {
      res.json({ success: false, reason: 'no_results' });
    }
  } catch (err) {
    console.error('[/api/geocoding/address] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/geocoding/reverse
 * Reverse geocode coordinates to address
 */
googleGeocoding.post('/reverse', async (req, res) => {
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  try {
    const result = await reverseGeocode(lat, lng);
    if (result) {
      res.json({ success: true, ...result });
    } else {
      res.json({ success: false, reason: 'no_results' });
    }
  } catch (err) {
    console.error('[/api/geocoding/reverse] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/geocoding/batch
 * Geocode multiple addresses at once
 */
googleGeocoding.post('/batch', async (req, res) => {
  const { addresses } = req.body;

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: 'addresses array is required' });
  }

  if (addresses.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 addresses per batch' });
  }

  try {
    const results = await batchGeocode(addresses);
    res.json({ success: true, results });
  } catch (err) {
    console.error('[/api/geocoding/batch] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/geocoding/normalize
 * Normalize origin/destination pair (geocode as needed)
 */
googleGeocoding.post('/normalize', async (req, res) => {
  const { origin, destination } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  try {
    const result = await normalizeLocations(origin, destination);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[/api/geocoding/normalize] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
