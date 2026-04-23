/**
 * Google Geocoding Service (Server-Side)
 * Uses GOOGLE_SERVER_API_KEY for:
 * - Geocoding API (address → coordinates)
 * - Reverse Geocoding (coordinates → address)
 * - Place normalization for route computation
 *
 * This key is NEVER exposed to the frontend.
 */

const API_KEY = () => process.env.GOOGLE_SERVER_API_KEY;
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Geocode an address string to coordinates
 * @param {string} address - Address to geocode
 * @returns {Promise<Object|null>} { lat, lng, formattedAddress, placeId }
 */
export async function geocodeAddress(address) {
  const key = API_KEY();
  if (!key) return null;

  const params = new URLSearchParams({
    address,
    key,
    language: 'pt-BR',
    region: 'br',
    components: 'country:BR',
  });

  try {
    const res = await fetch(`${GEOCODING_URL}?${params}`);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        types: result.types || [],
        addressComponents: result.address_components || [],
      };
    }
    return null;
  } catch (err) {
    console.error('[GoogleGeocodingService] Geocode error:', err.message);
    return null;
  }
}

/**
 * Reverse geocode coordinates to address
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object|null>}
 */
export async function reverseGeocode(lat, lng) {
  const key = API_KEY();
  if (!key) return null;

  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key,
    language: 'pt-BR',
    result_type: 'locality|administrative_area_level_2',
  });

  try {
    const res = await fetch(`${GEOCODING_URL}?${params}`);
    const data = await res.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const result = data.results[0];
      return {
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        types: result.types || [],
        addressComponents: result.address_components || [],
      };
    }
    return null;
  } catch (err) {
    console.error('[GoogleGeocodingService] Reverse geocode error:', err.message);
    return null;
  }
}

/**
 * Batch geocode multiple addresses
 * Useful for normalizing origin + destination before route calculation
 * @param {string[]} addresses - Array of address strings
 * @returns {Promise<Array>} Array of geocoded results
 */
export async function batchGeocode(addresses) {
  const results = await Promise.all(
    addresses.map(addr => geocodeAddress(addr))
  );
  return results;
}

/**
 * Normalize an origin/destination pair by geocoding if needed
 * @param {Object} origin - { lat, lng } or { address }
 * @param {Object} destination - { lat, lng } or { address }
 * @returns {Promise<Object>} { origin, destination } with lat/lng guaranteed
 */
export async function normalizeLocations(origin, destination) {
  const tasks = [];

  const needsOriginGeocode = !origin.lat && origin.address;
  const needsDestGeocode = !destination.lat && destination.address;

  if (needsOriginGeocode) {
    tasks.push(geocodeAddress(origin.address).then(r => ({ key: 'origin', result: r })));
  }
  if (needsDestGeocode) {
    tasks.push(geocodeAddress(destination.address).then(r => ({ key: 'destination', result: r })));
  }

  const resolved = await Promise.all(tasks);

  const normalizedOrigin = needsOriginGeocode
    ? { ...origin, ...(resolved.find(r => r.key === 'origin')?.result || {}) }
    : origin;

  const normalizedDestination = needsDestGeocode
    ? { ...destination, ...(resolved.find(r => r.key === 'destination')?.result || {}) }
    : destination;

  return {
    origin: normalizedOrigin,
    destination: normalizedDestination,
  };
}
