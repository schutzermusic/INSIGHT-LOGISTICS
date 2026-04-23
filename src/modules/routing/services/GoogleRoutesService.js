/**
 * Google Routes Service (Frontend Adapter)
 * Route calculations now go through the backend server,
 * which holds the private GOOGLE_SERVER_API_KEY.
 *
 * This file maintains the same API surface so existing code
 * (RouteIntelligenceService, pages) continues to work unchanged.
 */

import { fetchDrivingRoutes, fetchDrivingAlternatives, fetchHealthCheck } from '../../../services/BackendApiClient';

let backendAvailable = null;

/**
 * Get driving routes between two points
 * Calls backend → Google Directions API (server-side key)
 * @param {Object} origin - { lat, lng } or address string
 * @param {Object} destination - { lat, lng } or address string
 * @param {Object} options - { alternatives, avoidTolls, avoidHighways, departureTime }
 * @returns {Promise<Object>} Routes with distance, duration, polyline, etc
 */
export async function getDrivingRoutes(origin, destination, options = {}) {
  try {
    const result = await fetchDrivingRoutes(origin, destination, options);
    return result;
  } catch (err) {
    console.warn('[GoogleRoutesService] Backend call failed:', err.message);
    return { success: false, reason: 'backend_unavailable', routes: [] };
  }
}

/**
 * Get driving alternatives with ranking
 * @param {Object} origin - { lat, lng }
 * @param {Object} destination - { lat, lng }
 * @returns {Promise<Object>} Ranked alternatives
 */
export async function getDrivingAlternatives(origin, destination) {
  try {
    const result = await fetchDrivingAlternatives(origin, destination);
    return result;
  } catch (err) {
    console.warn('[GoogleRoutesService] Backend alternatives failed:', err.message);
    return { success: false, reason: 'backend_unavailable', routes: [] };
  }
}

/**
 * Estimate vehicle costs for a route (pure calculation, no API call)
 * Kept client-side since it's just math.
 * @param {Object} route - Route with distanceKm, durationHours
 * @param {Object} config - { fuelConsumptionKmL, fuelPricePerLiter, rentalPerDay, tollEstimate }
 * @returns {Object} Cost breakdown
 */
export function estimateVehicleCosts(route, config = {}) {
  const {
    fuelConsumptionKmL = 10,
    fuelPricePerLiter = 5.50,
    rentalPerDay = 180,
    tollEstimate = 0,
    drivingDays = null,
  } = config;

  const distanceKm = route.distanceKm || 0;
  const durationH = route.durationHours || 0;
  const estimatedDays = drivingDays || Math.ceil(durationH / 10) || 1;

  const fuelLiters = distanceKm / fuelConsumptionKmL;
  const fuelCost = round(fuelLiters * fuelPricePerLiter);
  const rentalCost = round(rentalPerDay * estimatedDays);
  const tollCost = round(tollEstimate);
  const totalCost = round(fuelCost + rentalCost + tollCost);

  return {
    distanceKm,
    durationHours: durationH,
    estimatedDays,
    fuel: { liters: round(fuelLiters), costPerLiter: fuelPricePerLiter, total: fuelCost },
    rental: { perDay: rentalPerDay, days: estimatedDays, total: rentalCost },
    tolls: tollCost,
    total: totalCost,
    perKm: distanceKm > 0 ? round(totalCost / distanceKm) : 0,
  };
}

/**
 * Check if Google Routes is available (backend reachable)
 */
export async function isGoogleRoutesAvailable() {
  if (backendAvailable !== null) return backendAvailable;

  try {
    const health = await fetchHealthCheck();
    backendAvailable = health.status === 'ok' && health.services?.routes;
    return backendAvailable;
  } catch {
    backendAvailable = false;
    return false;
  }
}

// Internal
function round(val) {
  return Math.round(val * 100) / 100;
}
