/**
 * ClickBus Partner API (bus tickets) — server-side.
 *
 * Auth: POST /partners/api/oauth/basic-token with HTTP Basic (username:password)
 * and body {"grant_type":"client_credentials"} → JWT `access_token` (+ expires_in).
 * The token is cached and reused until shortly before expiry.
 *
 *   Places:  GET /partners/api/v4/places?name=<term>  → { data: [{ slug, city, ... }] }
 *   Trips:   GET /partners/api/v5/trips?from=<slug>&to=<slug>&departureDate=YYYY-MM-DD
 *
 * Env: CLICKBUS_USER, CLICKBUS_PASS, CLICKBUS_ENV (production | staging).
 * Docs: https://developer.clickbus.com.br/reference/autenticação
 *
 * @module server/services/ClickBusService
 */

function baseUrl() {
  return process.env.CLICKBUS_ENV === 'production'
    ? 'https://gateway.clickbus.com/partners/api'
    : 'https://platform-bff-partners.stg.clickbus.net/partners/api';
}

export function isConfigured() {
  return !!(process.env.CLICKBUS_USER && process.env.CLICKBUS_PASS);
}

let _token = null;
let _expiresAt = 0;

function timeoutSignal(ms) {
  return AbortSignal?.timeout ? AbortSignal.timeout(ms) : undefined;
}

async function getToken() {
  if (_token && Date.now() < _expiresAt - 60000) return _token;
  if (!isConfigured()) throw new Error('ClickBus não configurada');

  const basic = Buffer.from(`${process.env.CLICKBUS_USER}:${process.env.CLICKBUS_PASS}`).toString('base64');
  const res = await fetch(`${baseUrl()}/oauth/basic-token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    signal: timeoutSignal(10000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ClickBus auth ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  _token = data.access_token;
  _expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return _token;
}

async function authGet(path, timeoutMs = 12000) {
  const token = await getToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: timeoutSignal(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`ClickBus ${path} ${res.status}: ${t.slice(0, 160)}`);
  }
  return res.json();
}

/**
 * Resolve a city/terminal name into ClickBus places (slug used by trip search).
 * @param {string} name
 * @returns {Promise<Array<{ id:number, slug:string, name:string, city:string, state:string, useGroupByCity?:boolean }>>}
 */
export async function searchPlaces(name) {
  const data = await authGet(`/v4/places?name=${encodeURIComponent(name)}&limit=10`);
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Search trips between two place slugs on a date.
 * @param {string} fromSlug
 * @param {string} toSlug
 * @param {string} departureDate — YYYY-MM-DD
 * @returns {Promise<object[]>} trips array
 */
export async function searchTrips(fromSlug, toSlug, departureDate) {
  const data = await authGet(
    `/v5/trips?from=${encodeURIComponent(fromSlug)}&to=${encodeURIComponent(toSlug)}&departureDate=${departureDate}`,
    15000,
  );
  // The trips list may be exposed as `departures` or `data` depending on version.
  if (Array.isArray(data?.departures)) return data.departures;
  if (Array.isArray(data?.data)) return data.data;
  return Array.isArray(data) ? data : [];
}
