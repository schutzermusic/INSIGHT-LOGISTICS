/**
 * API Routes: Google Routes / Directions
 * All endpoints use the server-side GOOGLE_SERVER_API_KEY
 */

import { Router } from 'express';
import {
  getDrivingRoutes,
  getDrivingAlternatives,
  computeRouteV2,
  estimateVehicleCosts,
} from '../services/GoogleRoutesService.js';

export const googleRoutes = Router();

/**
 * POST /api/routes/driving
 * Calculate driving routes between origin and destination
 */
googleRoutes.post('/driving', async (req, res) => {
  const { origin, destination, options = {} } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  try {
    const result = await getDrivingRoutes(origin, destination, options);
    res.json(result);
  } catch (err) {
    console.error('[/api/routes/driving] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routes/alternatives
 * Get driving alternatives with ranking
 */
googleRoutes.post('/alternatives', async (req, res) => {
  const { origin, destination } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  try {
    const result = await getDrivingAlternatives(origin, destination);
    res.json(result);
  } catch (err) {
    console.error('[/api/routes/alternatives] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routes/v2
 * Compute route via Routes API v2 (toll-aware, multimodal-ready)
 */
googleRoutes.post('/v2', async (req, res) => {
  const { origin, destination, options = {} } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }

  try {
    const result = await computeRouteV2(origin, destination, options);
    res.json(result);
  } catch (err) {
    console.error('[/api/routes/v2] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routes/tolls
 * Calculate toll costs using Routes API v2 with TOLLS extra computation
 */
googleRoutes.post('/tolls', async (req, res) => {
  const { origin, destination } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required (lat/lng)' });
  }

  try {
    const result = await computeRouteV2(origin, destination, {
      includeTolls: true,
      alternatives: false,
    });

    if (!result.success || !result.routes?.length) {
      return res.json({ success: false, tollCostBRL: 0, reason: result.reason || 'no_routes' });
    }

    // Extract toll info from the first (best) route
    const route = result.routes[0];
    const tollInfo = route.tollInfo;
    let tollCostBRL = 0;

    if (tollInfo?.estimatedPrice) {
      // Find BRL price or use the first available
      const brlPrice = tollInfo.estimatedPrice.find(p => p.currencyCode === 'BRL')
        || tollInfo.estimatedPrice[0];
      if (brlPrice) {
        tollCostBRL = parseFloat(brlPrice.units || 0) + parseFloat(brlPrice.nanos || 0) / 1e9;
      }
    }

    res.json({
      success: true,
      tollCostBRL: Math.round(tollCostBRL * 100) / 100,
      distanceKm: route.distanceKm,
      source: 'google_routes_api_v2',
    });
  } catch (err) {
    console.error('[/api/routes/tolls] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routes/vehicle-costs
 * Estimate vehicle costs for a given route
 */
googleRoutes.post('/vehicle-costs', async (req, res) => {
  const { route, config = {} } = req.body;

  if (!route) {
    return res.status(400).json({ error: 'route is required' });
  }

  const costs = estimateVehicleCosts(route, config);
  res.json(costs);
});
