/**
 * Google Routes Service (Server-Side)
 * Uses GOOGLE_SERVER_API_KEY for:
 * - Directions API (route calculation, alternatives, traffic)
 * - Routes API (toll-aware routing, future expansion)
 *
 * This key is NEVER exposed to the frontend.
 */

const API_KEY = () => process.env.GOOGLE_SERVER_API_KEY;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Calculate driving routes using Directions API
 * @param {Object} origin - { lat, lng } or address string
 * @param {Object} destination - { lat, lng } or address string
 * @param {Object} options - { alternatives, avoidTolls, avoidHighways, departureTime }
 * @returns {Promise<Object>} Parsed route data
 */
export async function getDrivingRoutes(origin, destination, options = {}) {
  const key = API_KEY();
  if (!key) return { success: false, reason: 'server_key_not_configured', routes: [] };

  const originStr = typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`;
  const destStr = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;

  const params = new URLSearchParams({
    origin: originStr,
    destination: destStr,
    key,
    alternatives: options.alternatives !== false ? 'true' : 'false',
    units: 'metric',
    language: 'pt-BR',
    region: 'br',
  });

  if (options.avoidTolls) params.set('avoid', 'tolls');
  if (options.avoidHighways) params.set('avoid', 'highways');
  if (options.departureTime) {
    params.set('departure_time', Math.floor(new Date(options.departureTime).getTime() / 1000).toString());
    params.set('traffic_model', 'best_guess');
  }

  try {
    const res = await fetch(`${DIRECTIONS_URL}?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      return { success: false, reason: data.status || 'no_routes', routes: [] };
    }

    const routes = data.routes.map((route, idx) => {
      const leg = route.legs[0];
      return {
        index: idx,
        summary: route.summary,
        distanceKm: Math.round(leg.distance.value / 1000),
        distanceText: leg.distance.text,
        durationMinutes: Math.round(leg.duration.value / 60),
        durationHours: Math.round(leg.duration.value / 3600 * 10) / 10,
        durationText: leg.duration.text,
        durationInTrafficMinutes: leg.duration_in_traffic
          ? Math.round(leg.duration_in_traffic.value / 60)
          : null,
        durationInTrafficHours: leg.duration_in_traffic
          ? Math.round(leg.duration_in_traffic.value / 3600 * 10) / 10
          : null,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        startLocation: leg.start_location,
        endLocation: leg.end_location,
        polyline: route.overview_polyline?.points || '',
        warnings: route.warnings || [],
        copyrights: route.copyrights || '',
        steps: (leg.steps || []).map(step => ({
          instruction: step.html_instructions,
          distanceKm: Math.round(step.distance.value / 1000 * 10) / 10,
          durationMinutes: Math.round(step.duration.value / 60),
          maneuver: step.maneuver || null,
        })),
      };
    });

    return {
      success: true,
      source: 'google_directions_api',
      routes,
      totalAlternatives: routes.length,
    };
  } catch (err) {
    console.error('[GoogleRoutesService] Directions API error:', err.message);
    return { success: false, reason: 'fetch_error', error: err.message, routes: [] };
  }
}

/**
 * Get driving alternatives with ranking
 */
export async function getDrivingAlternatives(origin, destination) {
  const result = await getDrivingRoutes(origin, destination, { alternatives: true });
  if (!result.success) return result;

  const ranked = rankDrivingAlternatives(result.routes);
  return { ...result, ranked };
}

/**
 * Compute route via Routes API v2 (toll-aware, multimodal-ready)
 * This is the newer API that supports toll pricing
 */
export async function computeRouteV2(origin, destination, options = {}) {
  const key = API_KEY();
  if (!key) return { success: false, reason: 'server_key_not_configured' };

  const body = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    travelMode: options.travelMode || 'DRIVE',
    routingPreference: options.routingPreference || 'TRAFFIC_AWARE',
    computeAlternativeRoutes: options.alternatives !== false,
    languageCode: 'pt-BR',
    units: 'METRIC',
  };

  // Request toll info if available
  const fieldMask = [
    'routes.duration',
    'routes.distanceMeters',
    'routes.polyline.encodedPolyline',
    'routes.legs',
    'routes.travelAdvisory',
    'routes.routeLabels',
  ];

  if (options.includeTolls) {
    body.extraComputations = ['TOLLS'];
    fieldMask.push('routes.travelAdvisory.tollInfo');
  }

  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask.join(','),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.error) {
      return { success: false, reason: data.error.message, routes: [] };
    }

    return {
      success: true,
      source: 'google_routes_api_v2',
      routes: (data.routes || []).map((route, idx) => ({
        index: idx,
        distanceKm: Math.round((route.distanceMeters || 0) / 1000),
        duration: route.duration,
        polyline: route.polyline?.encodedPolyline || '',
        labels: route.routeLabels || [],
        tollInfo: route.travelAdvisory?.tollInfo || null,
        legs: route.legs || [],
      })),
    };
  } catch (err) {
    console.error('[GoogleRoutesService] Routes API v2 error:', err.message);
    return { success: false, reason: 'fetch_error', error: err.message, routes: [] };
  }
}

/**
 * Estimate vehicle costs for a route (pure calculation, no API call)
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

// Internal helpers

function rankDrivingAlternatives(routes) {
  if (routes.length === 0) return { fastest: null, shortest: null, bestBalance: null };

  const byDuration = [...routes].sort((a, b) => a.durationMinutes - b.durationMinutes);
  const byDistance = [...routes].sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    fastest: byDuration[0],
    shortest: byDistance[0],
    bestBalance: routes[0],
    all: routes,
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}
