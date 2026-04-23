/**
 * Google Maps Loader (Frontend)
 * Dynamically loads the Google Maps JavaScript API using the public VITE key.
 * This key is safe to expose — it should be restricted to Maps JS API + Places only.
 *
 * Usage:
 *   import { loadGoogleMaps, isGoogleMapsLoaded } from '@/services/GoogleMapsLoader';
 *   await loadGoogleMaps(); // call once at app startup
 */

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let loadPromise = null;
let loaded = false;

/**
 * Load Google Maps JavaScript API + Places library
 * Safe to call multiple times — only loads once
 * @returns {Promise<void>}
 */
export function loadGoogleMaps() {
  if (loaded || window.google?.maps) {
    loaded = true;
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  if (!API_KEY || API_KEY === 'your_google_maps_api_key_here') {
    console.warn('[GoogleMapsLoader] VITE_GOOGLE_MAPS_API_KEY not configured. Places autocomplete will use local fallback.');
    return Promise.resolve();
  }

  loadPromise = new Promise((resolve, reject) => {
    // Define the callback Google Maps will invoke
    const callbackName = '__googleMapsInit__';
    window[callbackName] = () => {
      loaded = true;
      delete window[callbackName];
      console.log('[GoogleMapsLoader] Google Maps API loaded successfully');
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,geometry&language=pt-BR&region=BR&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error('[GoogleMapsLoader] Failed to load Google Maps API');
      loadPromise = null;
      reject(new Error('Failed to load Google Maps API'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Check if Google Maps is loaded and ready
 */
export function isGoogleMapsLoaded() {
  return loaded || !!window.google?.maps;
}

/**
 * Check if the API key is configured
 */
export function isApiKeyConfigured() {
  return API_KEY && API_KEY.length > 10 && API_KEY !== 'your_google_maps_api_key_here';
}

/**
 * Get the configured API key (for status display only)
 */
export function getApiKeyStatus() {
  if (!API_KEY) return 'not_set';
  if (API_KEY === 'your_google_maps_api_key_here') return 'placeholder';
  return 'configured';
}
