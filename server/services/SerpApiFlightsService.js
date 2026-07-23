/**
 * SerpApiFlightsService — server-side Google Flights (SerpAPI) fetch.
 *
 * Moves the SerpAPI key OFF the client (§26 security: the key was previously
 * exposed as VITE_SERPAPI_KEY and proxied through Vite). The new mobilization
 * flow calls the backend, which injects SERPAPI_KEY here. Returns the raw
 * SerpAPI JSON; normalization happens in server/adapters/normalizers.js.
 *
 * @module server/services/SerpApiFlightsService
 */

const SERPAPI_URL = 'https://serpapi.com/search.json';

/**
 * Resolve the SerpAPI key. Prefer the server-only SERPAPI_KEY; fall back to the
 * legacy VITE_SERPAPI_KEY (dotenv exposes it to the server too) so the new
 * server-side flow works with the key that already exists in .env. The browser
 * still never receives it — it calls /api/flights and the server injects the key.
 */
function serpApiKey() {
  return process.env.SERPAPI_KEY || process.env.VITE_SERPAPI_KEY || '';
}

export function isSerpApiConfigured() {
  const key = serpApiKey();
  return typeof key === 'string' && key.length > 10 && key !== 'your_serpapi_key_here';
}

/**
 * Fetch flights for one airport pair. Returns the raw SerpAPI response.
 * @param {object} p
 * @param {string} p.departureId — IATA
 * @param {string} p.arrivalId — IATA
 * @param {string} p.outboundDate — yyyy-mm-dd
 * @param {string} [p.returnDate]
 * @param {number} [p.adults]
 * @param {number} [p.timeoutMs]
 * @returns {Promise<object>}
 */
export async function fetchSerpFlights({ departureId, arrivalId, outboundDate, returnDate, adults = 1, timeoutMs = 7000 }) {
  if (!isSerpApiConfigured()) {
    throw new Error('SERPAPI_KEY não configurada no servidor');
  }
  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: departureId,
    arrival_id: arrivalId,
    outbound_date: outboundDate,
    currency: 'BRL',
    hl: 'pt',
    gl: 'br',
    type: returnDate ? '1' : '2',
    adults: String(adults),
    api_key: serpApiKey(),
  });
  if (returnDate) params.set('return_date', returnDate);

  const signal = AbortSignal?.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(`${SERPAPI_URL}?${params.toString()}`, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SerpAPI ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
