/**
 * Backend API Client
 * All calls to the backend server go through here.
 * The backend holds the private GOOGLE_SERVER_API_KEY.
 *
 * In development, Vite proxies /api/* to the backend (localhost:3001).
 * In production, configure your reverse proxy accordingly.
 */

const BASE_URL = '/api';

async function post(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function get(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// ── Routes API ────────────────────────────────────────

/**
 * Get driving routes (calls backend → Google Directions API)
 */
export async function fetchDrivingRoutes(origin, destination, options = {}) {
  return post('/routes/driving', { origin, destination, options });
}

/**
 * Get driving alternatives with ranking
 */
export async function fetchDrivingAlternatives(origin, destination) {
  return post('/routes/alternatives', { origin, destination });
}

/**
 * Compute route via Routes API v2 (toll-aware)
 */
export async function fetchRouteV2(origin, destination, options = {}) {
  return post('/routes/v2', { origin, destination, options });
}

/**
 * Estimate vehicle costs
 */
export async function fetchVehicleCosts(route, config = {}) {
  return post('/routes/vehicle-costs', { route, config });
}

/**
 * Fetch toll costs via Routes API v2
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ success: boolean, tollCostBRL: number, routes: Array }>}
 */
export async function fetchTollCost(origin, destination) {
  return post('/routes/tolls', { origin, destination });
}

// ── Geocoding API ─────────────────────────────────────

/**
 * Geocode an address (calls backend → Google Geocoding API)
 */
export async function fetchGeocode(address) {
  return post('/geocoding/address', { address });
}

/**
 * Reverse geocode coordinates
 */
export async function fetchReverseGeocode(lat, lng) {
  return post('/geocoding/reverse', { lat, lng });
}

/**
 * Batch geocode multiple addresses
 */
export async function fetchBatchGeocode(addresses) {
  return post('/geocoding/batch', { addresses });
}

/**
 * Normalize origin/destination pair
 */
export async function fetchNormalizeLocations(origin, destination) {
  return post('/geocoding/normalize', { origin, destination });
}

// ── Quero Passagem (Bus) API ─────────────────────────

/**
 * Check if Quero Passagem API is configured
 */
export async function fetchBusStatus() {
  return get('/bus/status');
}

/**
 * List all bus companies
 */
export async function fetchBusCompanies() {
  return get('/bus/companies');
}

/**
 * Get details for a specific bus company
 */
export async function fetchBusCompany(companyId) {
  return get(`/bus/companies/${companyId}`);
}

/**
 * List all bus stops (cities and stations)
 */
export async function fetchBusStops() {
  return get('/bus/stops');
}

/**
 * Search bus stops by name
 */
export async function fetchBusStopsSearch(query) {
  return get(`/bus/stops/search?q=${encodeURIComponent(query)}`);
}

/**
 * Get details for a specific bus stop
 */
export async function fetchBusStop(stopId) {
  return get(`/bus/stops/${stopId}`);
}

/**
 * Search for available bus trips
 * @param {string} from - Stop ID (e.g., "ROD_1")
 * @param {string} to - Stop ID (e.g., "ROD_55")
 * @param {string} travelDate - Date in yyyy-mm-dd format
 * @param {boolean} [includeConnections]
 */
export async function fetchBusSearch(from, to, travelDate, includeConnections = false) {
  return post('/bus/search', { from, to, travelDate, includeConnections });
}

/**
 * Get available seats for a bus trip
 */
export async function fetchBusSeats(travelId, options = {}) {
  return post('/bus/seats', { travelId, ...options });
}

/**
 * Create a bus booking
 */
export async function fetchBusBooking(travels) {
  return post('/bus/booking', { travels });
}

/**
 * Check if a booking is still active
 */
export async function fetchBusBookingStatus(bookingId) {
  return get(`/bus/booking/${bookingId}`);
}

/**
 * Process bus ticket payment
 */
export async function fetchBusCheckout(params) {
  return post('/bus/checkout', params);
}

/**
 * Get PagSeguro payment key for card tokenization
 */
export async function fetchBusPaymentKey() {
  return get('/bus/payment/key');
}

/**
 * List bus ticket purchases
 */
export async function fetchBusPurchases(filters = {}) {
  return post('/bus/purchases', { filters });
}

/**
 * Get a specific bus purchase
 */
export async function fetchBusPurchase(params) {
  return post('/bus/purchases/get', params);
}

/**
 * Cancel a passenger voucher (partial cancellation)
 */
export async function fetchBusCancelVoucher(purchaseId, passengerId, email) {
  return post('/bus/purchases/cancel-voucher', { purchaseId, passengerId, email });
}

/**
 * Cancel an entire bus purchase
 */
export async function fetchBusCancelPurchase(purchaseId, email) {
  return post('/bus/purchases/cancel', { purchaseId, email });
}

/**
 * Get connection suggestions for bus routes
 */
export async function fetchBusConnections(from, to, travelDate) {
  return post('/bus/connections/suggestions', { from, to, travelDate });
}

// ── Health Check ──────────────────────────────────────

/**
 * Check backend health and service status
 */
export async function fetchHealthCheck() {
  return get('/health');
}
