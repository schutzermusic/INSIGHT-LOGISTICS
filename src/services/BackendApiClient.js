/**
 * Backend API Client
 * All calls to the backend server go through here.
 * The backend holds the private GOOGLE_SERVER_API_KEY.
 *
 * In development, Vite proxies /api/* to the backend (localhost:3001).
 * In production, configure your reverse proxy accordingly.
 */

const BASE_URL = '/api';
const DEFAULT_TIMEOUT_MS = 8000;
const ROUTE_TIMEOUTS_MS = [
  [/^\/bus\/status$/, 2500],
  [/^\/bus\/stops\/search\b/, 4000],
  [/^\/bus\/search$/, 8000],
  [/^\/bus\/connections\/suggestions$/, 5000],
  [/^\/routes\/v2$/, 6000],
  [/^\/routes\/tolls$/, 3500],
];

function getTimeoutMs(endpoint, timeoutMs) {
  if (timeoutMs) return timeoutMs;
  return ROUTE_TIMEOUTS_MS.find(([pattern]) => pattern.test(endpoint))?.[1] || DEFAULT_TIMEOUT_MS;
}

function timeoutSignal(endpoint, timeoutMs) {
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return undefined;
  return AbortSignal.timeout(getTimeoutMs(endpoint, timeoutMs));
}

function normalizeAbortError(err, endpoint, timeoutMs) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
    throw new Error(`Timeout ao consultar ${endpoint} apos ${getTimeoutMs(endpoint, timeoutMs)}ms`);
  }
  throw err;
}

async function post(endpoint, body, options = {}) {
  const { timeoutMs } = options;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(endpoint, timeoutMs),
  }).catch((err) => normalizeAbortError(err, endpoint, timeoutMs));

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function get(endpoint, options = {}) {
  const { timeoutMs } = options;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    signal: timeoutSignal(endpoint, timeoutMs),
  }).catch((err) => normalizeAbortError(err, endpoint, timeoutMs));
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

// ── Mobilization Intelligence ─────────────────────────

/**
 * Run the full multimodal mobilization search (§24).
 * @param {object} payload - { origin, destination, earliestDepartureUtc, deadlineUtc, employees, daysInField?, config? }
 */
export async function mobilizationSearch(payload) {
  return post('/mobilization/search', payload, { timeoutMs: 30000 });
}

/**
 * Run a manual mobilization simulation across scenarios (§21).
 * @param {object} payload - { simulation, employees, scenarios, deadlineUtc?, config?, daysInField? }
 */
export async function mobilizationManualCalculate(payload) {
  return post('/mobilization/manual/calculate', payload, { timeoutMs: 30000 });
}

/** Select an itinerary; pass override {isOverride, recommendedItineraryId, reason} when not the recommended one. */
export async function mobilizationSelect(itineraryId, body) {
  return post(`/mobilization/itineraries/${itineraryId}/select`, body);
}

/** Submit the selected route for approval. */
export async function mobilizationSubmitForApproval(requestId, body) {
  return post(`/mobilization/requests/${requestId}/submit-for-approval`, body);
}

// ── Dashboard & Confirmation (§3.1, §8, §9) ───────────

function toQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, v);
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Confirm a selected mobilization so it becomes dashboard-eligible (§3.1).
 * The backend re-validates the mandatory gate (project, schedule, collaborators,
 * scenario/itinerary, route/dates/cost/labor snapshots) and rejects drafts.
 */
export async function dashboardConfirm(payload) {
  return post('/dashboard/confirm', payload, { timeoutMs: 15000 });
}

/** Full aggregated dashboard payload for the given global filters (§8, §12). */
export async function dashboardOverview(filters = {}) {
  return get(`/dashboard/overview${toQuery(filters)}`, { timeoutMs: 15000 });
}

/** Realtime slice: overview counts + HUD globe items + alerts (§9). */
export async function dashboardRealtime(filters = {}) {
  return get(`/dashboard/realtime${toQuery(filters)}`, { timeoutMs: 10000 });
}

/** Distinct filter option values for the global filter bar (§12). */
export async function dashboardFilters() {
  return get('/dashboard/filters', { timeoutMs: 8000 });
}

/** Whether the backend can persist confirmations / feed the dashboard. */
export async function dashboardStatus() {
  return get('/dashboard/status', { timeoutMs: 4000 });
}

// ── Health Check ──────────────────────────────────────

/**
 * Check backend health and service status
 */
export async function fetchHealthCheck() {
  return get('/health');
}
