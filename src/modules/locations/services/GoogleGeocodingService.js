/**
 * Google Geocoding Service (Frontend Adapter)
 * API calls (geocode, reverse geocode) now go through the backend server,
 * which holds the private GOOGLE_SERVER_API_KEY.
 *
 * Utility functions (resolvePlaceDetails, normalizeOriginDestination, etc.)
 * remain client-side since they are pure logic with no API calls.
 */

import { fetchGeocode, fetchReverseGeocode } from '../../../services/BackendApiClient';

/**
 * Resolve place details into structured geographic context
 * @param {Object} placeDetails - Place details from GooglePlacesService
 * @returns {Object} Normalized location with type detection
 */
export function resolvePlaceDetails(placeDetails) {
  if (!placeDetails) return null;

  const types = placeDetails.types || [];
  const locationType = detectLocationType(types, placeDetails.name);

  return {
    ...placeDetails,
    locationType,
    isAirport: locationType === 'airport',
    isBusTerminal: locationType === 'bus_terminal',
    isCityCenter: locationType === 'city',
    isExactAddress: locationType === 'address',
  };
}

/**
 * Normalize origin/destination so the system understands the context
 * @param {Object} origin - Origin location
 * @param {Object} destination - Destination location
 * @returns {Object} Normalized pair with mobility context
 */
export function normalizeOriginDestination(origin, destination) {
  const normalizedOrigin = resolvePlaceDetails(origin);
  const normalizedDestination = resolvePlaceDetails(destination);

  return {
    origin: normalizedOrigin,
    destination: normalizedDestination,
    straightLineDistanceKm: normalizedOrigin?.lat && normalizedDestination?.lat
      ? calculateHaversineDistance(
          normalizedOrigin.lat, normalizedOrigin.lng,
          normalizedDestination.lat, normalizedDestination.lng
        )
      : null,
  };
}

/**
 * Detect mobility context for a destination
 * @param {Object} location - Resolved location
 * @param {Array} citiesDb - Extended cities database
 * @returns {Object} Context with nearby airport, bus terminal, road access
 */
export function detectLocationContext(location, citiesDb = []) {
  if (!location) return { nearbyAirport: null, nearbyBusTerminal: null, roadAccessible: true };

  const cityMatch = citiesDb.find(c => {
    if (location.state && c.uf === location.state) {
      const locName = (location.name || '').toLowerCase();
      const cityName = c.nome.split(' - ')[0].toLowerCase();
      return locName.includes(cityName) || cityName.includes(locName);
    }
    return false;
  });

  return {
    nearbyAirport: cityMatch?.aeroportos?.[0] || null,
    hasAirport: (cityMatch?.aeroportos?.length || 0) > 0,
    isHub: cityMatch?.hub || false,
    nearbyBusTerminal: true,
    roadAccessible: true,
    cityData: cityMatch || null,
  };
}

/**
 * Geocode an address string to coordinates
 * Now calls backend → Google Geocoding API (server-side key)
 * @param {string} address - Address to geocode
 * @returns {Promise<Object>} { lat, lng, formattedAddress }
 */
export async function geocodeAddress(address) {
  try {
    const result = await fetchGeocode(address);
    if (result.success) {
      return {
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        placeId: result.placeId,
      };
    }
    return null;
  } catch (err) {
    console.warn('[GoogleGeocodingService] Backend geocode failed:', err.message);
    return null;
  }
}

/**
 * Reverse geocode coordinates to address
 * Now calls backend → Google Geocoding API (server-side key)
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const result = await fetchReverseGeocode(lat, lng);
    if (result.success) {
      return {
        formattedAddress: result.formattedAddress,
        placeId: result.placeId,
      };
    }
    return null;
  } catch (err) {
    console.warn('[GoogleGeocodingService] Backend reverse geocode failed:', err.message);
    return null;
  }
}

// ── Internal helpers (pure logic, no API calls) ──────

function detectLocationType(types, name = '') {
  const nameLower = (name || '').toLowerCase();

  if (types.includes('airport') || nameLower.includes('aeroporto') || nameLower.includes('airport')) {
    return 'airport';
  }
  if (nameLower.includes('rodoviaria') || nameLower.includes('terminal') || nameLower.includes('bus station')) {
    return 'bus_terminal';
  }
  if (types.includes('locality') || types.includes('administrative_area_level_2')) {
    return 'city';
  }
  if (types.includes('street_address') || types.includes('premise') || types.includes('route')) {
    return 'address';
  }
  if (types.includes('point_of_interest') || types.includes('establishment')) {
    return 'landmark';
  }
  return 'unknown';
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}
