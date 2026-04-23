/**
 * Quero Passagem API Service (Server-Side)
 * Integrates with the Quero Passagem bus ticket API (v4).
 *
 * Base URLs:
 *   - Sandbox: https://queropassagem.qpdevs.com/ws_v4
 *   - Production: https://queropassagem.com.br/ws_v4
 *
 * Authentication: HTTP Basic Auth
 * Credentials stored in environment variables (never exposed to frontend).
 */

const getBaseUrl = () =>
  process.env.QUERO_PASSAGEM_ENV === 'production'
    ? 'https://queropassagem.com.br/ws_v4'
    : 'https://queropassagem.qpdevs.com/ws_v4';

const getAuthHeader = () => {
  const user = process.env.QUERO_PASSAGEM_USER;
  const pass = process.env.QUERO_PASSAGEM_PASS;
  if (!user || !pass) return null;
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
};

const AFFILIATE_CODE = () => process.env.QUERO_PASSAGEM_AFFILIATE_CODE || '';

// ── In-memory cache (simple TTL) ───────────────────────
const cache = new Map();
const CACHE_TTL = {
  stops: 24 * 60 * 60 * 1000,    // 24h — stops rarely change
  companies: 24 * 60 * 60 * 1000, // 24h
  search: 50 * 60 * 1000,         // 50min (API says valid 1h)
};

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries when cache grows too large
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > ttl) cache.delete(k);
    }
  }
}

// ── HTTP helpers ────────────────────────────────────────

async function apiGet(path) {
  const auth = getAuthHeader();
  if (!auth) return { success: false, reason: 'credentials_not_configured' };

  const url = `${getBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, status: res.status, errors: body.errors || body.error || res.statusText };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[QueroPassagem] GET ${path} error:`, err.message);
    return { success: false, reason: 'fetch_error', error: err.message };
  }
}

async function apiPost(path, body) {
  const auth = getAuthHeader();
  if (!auth) return { success: false, reason: 'credentials_not_configured' };

  const url = `${getBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, status: res.status, errors: data.errors || data.error || res.statusText };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[QueroPassagem] POST ${path} error:`, err.message);
    return { success: false, reason: 'fetch_error', error: err.message };
  }
}

async function apiDelete(path) {
  const auth = getAuthHeader();
  if (!auth) return { success: false, reason: 'credentials_not_configured' };

  const url = `${getBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, status: res.status, errors: data.errors || data.error || res.statusText };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[QueroPassagem] DELETE ${path} error:`, err.message);
    return { success: false, reason: 'fetch_error', error: err.message };
  }
}

// ════════════════════════════════════════════════════════
// COMPANIES
// ════════════════════════════════════════════════════════

/**
 * List all bus companies
 */
export async function listCompanies() {
  const cached = getCached('companies:all', CACHE_TTL.companies);
  if (cached) return { success: true, data: cached, source: 'cache' };

  const result = await apiGet('/companies');
  if (result.success) setCache('companies:all', result.data, CACHE_TTL.companies);
  return result;
}

/**
 * Get details for a specific company
 * @param {number} companyId
 */
export async function getCompany(companyId) {
  const cacheKey = `company:${companyId}`;
  const cached = getCached(cacheKey, CACHE_TTL.companies);
  if (cached) return { success: true, data: cached, source: 'cache' };

  const result = await apiGet(`/companies/${companyId}`);
  if (result.success) setCache(cacheKey, result.data, CACHE_TTL.companies);
  return result;
}

// ════════════════════════════════════════════════════════
// STOPS (Stations / Cities)
// ════════════════════════════════════════════════════════

/**
 * List all stops (cities and stations)
 */
export async function listStops() {
  const cached = getCached('stops:all', CACHE_TTL.stops);
  if (cached) return { success: true, data: cached, source: 'cache' };

  const result = await apiGet('/stops');
  if (result.success) setCache('stops:all', result.data, CACHE_TTL.stops);
  return result;
}

/**
 * Get details for a specific stop
 * @param {string} stopId
 */
export async function getStop(stopId) {
  const cacheKey = `stop:${stopId}`;
  const cached = getCached(cacheKey, CACHE_TTL.stops);
  if (cached) return { success: true, data: cached, source: 'cache' };

  const result = await apiGet(`/stops/${stopId}`);
  if (result.success) setCache(cacheKey, result.data, CACHE_TTL.stops);
  return result;
}

/**
 * Search stops by name (local filter on cached list)
 * @param {string} query - Search term
 */
export async function searchStops(query) {
  const allStops = await listStops();
  if (!allStops.success) return allStops;

  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = allStops.data.filter(stop => {
    const name = stop.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes(q);
  });

  return { success: true, data: results, total: results.length };
}

// ════════════════════════════════════════════════════════
// SEARCH (Find Trips)
// ════════════════════════════════════════════════════════

/**
 * Search for available trips
 * @param {string} from - Stop ID (e.g., "ROD_1")
 * @param {string} to - Stop ID (e.g., "ROD_55")
 * @param {string} travelDate - Date in yyyy-mm-dd format
 * @param {Object} options - { includeConnections: boolean }
 */
export async function searchTrips(from, to, travelDate, options = {}) {
  const cacheKey = `search:${from}:${to}:${travelDate}:${options.includeConnections || false}`;
  const cached = getCached(cacheKey, CACHE_TTL.search);
  if (cached) return { success: true, data: cached, source: 'cache' };

  const body = {
    from,
    to,
    travelDate,
    affiliateCode: AFFILIATE_CODE(),
  };

  if (options.includeConnections) {
    body['include-connections'] = true;
  }

  const result = await apiPost('/new/search', body);
  if (result.success) setCache(cacheKey, result.data, CACHE_TTL.search);
  return result;
}

// ════════════════════════════════════════════════════════
// SEATS
// ════════════════════════════════════════════════════════

/**
 * Get available seats for a specific trip
 * @param {string} travelId - Travel ID from search results
 * @param {Object} options - { orientation: 'vertical'|'horizontal', type: 'matrix'|'list' }
 */
export async function getSeats(travelId, options = {}) {
  const body = { travelId };
  if (options.orientation) body.orientation = options.orientation;
  if (options.type) body.type = options.type;

  return apiPost('/new/seats', body);
}

// ════════════════════════════════════════════════════════
// BOOKING
// ════════════════════════════════════════════════════════

/**
 * Create a booking (reserve seats before payment)
 * @param {Array} travels - Array of { travelId, passengers: [{ name, travelDocument, travelDocumentType, seatNumber, ... }] }
 */
export async function createBooking(travels) {
  return apiPost('/new/booking', {
    affiliateCode: AFFILIATE_CODE(),
    travels,
  });
}

/**
 * Check if a booking is still active
 * @param {string} bookingId
 */
export async function getBooking(bookingId) {
  return apiGet(`/new/booking/${bookingId}`);
}

/**
 * Cancel/remove an active booking
 * @param {string} bookingId
 */
export async function deleteBooking(bookingId) {
  return apiDelete(`/new/booking/${bookingId}`);
}

// ════════════════════════════════════════════════════════
// CHECKOUT (Payment)
// ════════════════════════════════════════════════════════

/**
 * Process payment for a booking
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string} params.email
 * @param {Object} params.buyer - { name, cpf, phone, cnpj? }
 * @param {Object} params.payment - { method, token?, holder?, lastFourDigits?, cardNumber?, expiresAt?, securityCode? }
 * @param {string} params.callbackURL
 * @param {string} [params.externalId]
 */
export async function checkout(params) {
  const body = {
    bookingId: params.bookingId,
    email: params.email,
    buyer: params.buyer,
    payment: params.payment,
    callbackURL: params.callbackURL,
  };

  if (params.externalId) body.externalId = params.externalId;

  return apiPost('/new/checkout', body);
}

/**
 * Get PagSeguro public key for credit card tokenization
 */
export async function getPaymentKey() {
  return apiGet('/new/payment/key');
}

// ════════════════════════════════════════════════════════
// PURCHASES (Order Management)
// ════════════════════════════════════════════════════════

/**
 * List purchases with optional filters
 * @param {Object} filters - See API docs for full filter options
 */
export async function listPurchases(filters = {}) {
  return apiPost('/purchase/list', {
    affiliateCode: AFFILIATE_CODE(),
    filters,
  });
}

/**
 * Get a specific purchase by ID or externalId
 * @param {Object} params - { id?, externalId?, email }
 */
export async function getPurchase(params) {
  return apiPost('/purchase/get', params);
}

/**
 * Cancel a specific passenger's voucher (partial cancellation)
 * @param {number} purchaseId
 * @param {number} passengerId
 * @param {string} [email]
 */
export async function cancelVoucher(purchaseId, passengerId, email) {
  const body = { id: purchaseId, passengerId };
  if (email) body.email = email;
  return apiPost('/purchase/voucher/cancel', body);
}

/**
 * Cancel an entire purchase (full cancellation)
 * @param {number} purchaseId
 * @param {string} [email]
 */
export async function cancelPurchase(purchaseId, email) {
  const body = { id: purchaseId };
  if (email) body.email = email;
  return apiPost('/purchase/cancel', body);
}

/**
 * Update the external ID of a purchase
 * @param {number} purchaseId
 * @param {string} externalId
 */
export async function updateExternalId(purchaseId, externalId) {
  return apiPost('/purchase/updateExternalId', {
    id: purchaseId,
    externalId,
  });
}

// ════════════════════════════════════════════════════════
// CONNECTIONS
// ════════════════════════════════════════════════════════

/**
 * Get connection suggestions for a route
 * @param {string} from - Stop ID
 * @param {string} to - Stop ID
 * @param {string} travelDate - yyyy-mm-dd
 */
export async function getConnectionSuggestions(from, to, travelDate) {
  return apiPost('/connection/suggestions', { from, to, travelDate });
}

// ════════════════════════════════════════════════════════
// UTILITY: Check if API is configured
// ════════════════════════════════════════════════════════

export function isConfigured() {
  return !!(process.env.QUERO_PASSAGEM_USER && process.env.QUERO_PASSAGEM_PASS);
}
