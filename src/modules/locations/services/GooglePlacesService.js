/**
 * Google Places Service (Frontend)
 * Uses the public VITE_GOOGLE_MAPS_API_KEY loaded via GoogleMapsLoader.
 * Handles: Place Autocomplete, Place Details, location search
 *
 * This is the ONLY service that uses the frontend Google key.
 * Routes and Geocoding go through the backend.
 */

import { isGoogleMapsLoaded } from '../../../services/GoogleMapsLoader';
import { getExtendedCities, getCityInfo } from '../../../engine/routes-intelligence-db.js';

let autocompleteService = null;
let placesService = null;
let sessionToken = null;

function getAutocompleteService() {
  if (!autocompleteService && window.google?.maps?.places) {
    autocompleteService = new window.google.maps.places.AutocompleteService();
  }
  return autocompleteService;
}

function getPlacesService() {
  if (!placesService && window.google?.maps?.places) {
    const div = document.createElement('div');
    placesService = new window.google.maps.places.PlacesService(div);
  }
  return placesService;
}

function getSessionToken() {
  if (!sessionToken && window.google?.maps?.places) {
    sessionToken = new window.google.maps.places.AutocompleteSessionToken();
  }
  return sessionToken;
}

function resetSessionToken() {
  sessionToken = null;
}

/**
 * Search locations with autocomplete
 * Falls back to local city database when Google Maps not loaded
 * @param {string} query - Search text
 * @param {Object} options - { types, componentRestrictions, bounds }
 * @returns {Promise<Array>} Autocomplete predictions
 */
export async function searchLocations(query, options = {}) {
  const service = getAutocompleteService();
  if (!service) {
    return searchLocalCities(query);
  }

  return new Promise((resolve, reject) => {
    service.getPlacePredictions(
      {
        input: query,
        sessionToken: getSessionToken(),
        componentRestrictions: { country: 'br' },
        types: options.types || ['(cities)'],
        ...options,
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          resolve(predictions.map(p => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text || '',
            secondaryText: p.structured_formatting?.secondary_text || '',
            types: p.types || [],
          })));
        } else if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
        } else {
          reject(new Error(`Places API error: ${status}`));
        }
      }
    );
  });
}

/**
 * Get full place details from place_id
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>} Place details with lat/lng, address, etc
 */
export async function getPlaceDetails(placeId) {
  const service = getPlacesService();
  if (!service) return null;

  return new Promise((resolve, reject) => {
    service.getDetails(
      {
        placeId,
        fields: ['geometry', 'formatted_address', 'name', 'types', 'address_components', 'place_id'],
        sessionToken: getSessionToken(),
      },
      (place, status) => {
        resetSessionToken();
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const state = place.address_components?.find(c => c.types.includes('administrative_area_level_1'));
          resolve({
            placeId: place.place_id,
            name: place.name,
            formattedAddress: place.formatted_address,
            lat: place.geometry?.location?.lat(),
            lng: place.geometry?.location?.lng(),
            types: place.types || [],
            state: state?.short_name || '',
            stateLong: state?.long_name || '',
          });
        } else {
          reject(new Error(`Place details error: ${status}`));
        }
      }
    );
  });
}

/**
 * Select a location (get details from autocomplete result)
 * @param {Object} prediction - Autocomplete prediction
 * @returns {Promise<Object>} Full location details
 */
export async function selectLocation(prediction) {
  if (prediction.placeId) {
    return getPlaceDetails(prediction.placeId);
  }
  return {
    placeId: null,
    name: prediction.mainText || prediction.description,
    formattedAddress: prediction.description,
    lat: prediction.lat || null,
    lng: prediction.lng || null,
    types: prediction.types || [],
    state: prediction.state || '',
  };
}

/**
 * Check if Google Maps Places API is loaded
 */
export function isGooglePlacesAvailable() {
  return isGoogleMapsLoaded() && !!window.google?.maps?.places;
}

/**
 * Check if API key is configured
 */
export function isApiKeyConfigured() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  return key && key.length > 10 && key !== 'your_google_maps_api_key_here';
}

/**
 * Fallback: search local cities database
 */
function searchLocalCities(query) {
  const cities = getExtendedCities();
  const q = query.toLowerCase();

  return cities
    .filter(c => c.toLowerCase().includes(q))
    .slice(0, 8)
    .map(name => {
      const info = getCityInfo(name);
      return {
        placeId: null,
        description: name,
        mainText: name.split(' - ')[0],
        secondaryText: name.split(' - ')[1] || '',
        types: ['locality'],
        lat: info?.lat || null,
        lng: info?.lng || null,
        state: info?.uf || '',
      };
    });
}
