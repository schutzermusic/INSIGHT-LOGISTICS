/**
 * Bus API Engine — Real-time bus data via Quero Passagem API
 * Integrates with the routing intelligence engine to provide
 * live pricing, schedules, availability, and purchase links for bus routes.
 *
 * Features:
 * - Direct route search with real-time pricing
 * - Automatic indirect/connection search when direct routes unavailable
 * - Purchase links and booking options
 * - Source transparency and provider attribution
 * - Hub-based fallback for remote destinations
 *
 * Architecture:
 *   Frontend → BackendApiClient → Express backend → Quero Passagem API v4
 */

import { fetchBusSearch, fetchBusStopsSearch, fetchBusStatus, fetchBusConnections } from '../services/BackendApiClient.js';

// ── Local cache ─────────────────────────────────────────
const stopMatchCache = new Map();
const STOP_CACHE_TTL = 60 * 60 * 1000; // 1h

// ── API availability ────────────────────────────────────

let _apiAvailable = null;
let _lastCheck = 0;

/**
 * Check if the Quero Passagem API is configured and available
 */
export async function isBusApiEnabled() {
  if (_apiAvailable !== null && Date.now() - _lastCheck < 5 * 60 * 1000) {
    return _apiAvailable;
  }
  try {
    const status = await fetchBusStatus();
    _apiAvailable = status.configured === true;
    _lastCheck = Date.now();
    return _apiAvailable;
  } catch {
    _apiAvailable = false;
    _lastCheck = Date.now();
    return false;
  }
}

// ── Stop matching ───────────────────────────────────────

/**
 * Find the best Quero Passagem stop ID for a city name.
 * Searches by city name and returns the most relevant match.
 *
 * @param {string} cityName - City name (e.g., "São Paulo - SP" or "São Paulo")
 * @returns {Promise<{id: string, name: string} | null>}
 */
export async function findStopForCity(cityName) {
  if (!cityName) return null;

  // Check cache
  const cacheKey = cityName.toLowerCase().trim();
  const cached = stopMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < STOP_CACHE_TTL) {
    return cached.data;
  }

  // Extract city name without state suffix
  const cleanName = cityName.replace(/\s*-\s*[A-Z]{2}$/, '').trim();

  try {
    const result = await fetchBusStopsSearch(cleanName);
    if (!result.success || !result.data || result.data.length === 0) {
      stopMatchCache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    // Prefer city-type stops over stations for broader search
    const cityStop = result.data.find(s => s.type === 'city') || result.data[0];
    const match = { id: cityStop.id, name: cityStop.name };

    stopMatchCache.set(cacheKey, { data: match, ts: Date.now() });
    return match;
  } catch {
    return null;
  }
}

// ── Trip search ─────────────────────────────────────────

/**
 * Search for real-time bus trips between two cities.
 * Automatically resolves city names to stop IDs.
 *
 * @param {string} origin - Origin city name (e.g., "São Paulo - SP")
 * @param {string} destination - Destination city name (e.g., "Curitiba - PR")
 * @param {Object} options
 * @param {string} options.travelDate - Date in yyyy-mm-dd format
 * @param {number} [options.passengers=1] - Number of passengers
 * @returns {Promise<Object>} Search results with alternatives
 */
export async function searchBusTrips(origin, destination, options = {}) {
  const enabled = await isBusApiEnabled();
  if (!enabled) {
    return { success: false, reason: 'api_not_configured', trips: [] };
  }

  // Resolve city names to stop IDs
  const [fromStop, toStop] = await Promise.all([
    findStopForCity(origin),
    findStopForCity(destination),
  ]);

  if (!fromStop) {
    return { success: false, reason: 'origin_not_found', message: `Parada não encontrada para: ${origin}`, trips: [] };
  }
  if (!toStop) {
    return { success: false, reason: 'destination_not_found', message: `Parada não encontrada para: ${destination}`, trips: [] };
  }

  // Default travel date: tomorrow
  const travelDate = options.travelDate || getDefaultTravelDate();

  try {
    const result = await fetchBusSearch(fromStop.id, toStop.id, travelDate, true);

    const trips = (result.success && Array.isArray(result.data)) ? result.data : [];

    // If no direct trips found, automatically search for connections
    let connectionTrips = [];
    let connectionSource = null;
    if (trips.length === 0) {
      try {
        const connResult = await fetchBusConnections(fromStop.id, toStop.id, travelDate);
        if (connResult.success && Array.isArray(connResult.data) && connResult.data.length > 0) {
          connectionTrips = connResult.data;
          connectionSource = 'quero_passagem_connections';
        }
      } catch {
        // Connection search failed — continue with empty results
      }
    }

    const allTrips = [...trips, ...connectionTrips];

    if (allTrips.length === 0) {
      return {
        success: false,
        reason: 'no_results',
        message: `Nenhuma viagem direta ou com conexao encontrada para ${origin} → ${destination}`,
        from: fromStop,
        to: toStop,
        trips: [],
        searchedConnections: true,
      };
    }

    return {
      success: true,
      source: 'quero_passagem',
      sourceLabel: 'Quero Passagem',
      from: fromStop,
      to: toStop,
      travelDate,
      trips: allTrips,
      totalTrips: allTrips.length,
      directTrips: trips.length,
      connectionTrips: connectionTrips.length,
      connectionSource,
    };
  } catch (err) {
    return { success: false, reason: 'fetch_error', error: err.message, trips: [] };
  }
}

// ── Convert to routing alternatives ─────────────────────

/**
 * Convert Quero Passagem search results into routing intelligence alternatives.
 * Groups trips by company and class to create meaningful alternatives.
 *
 * @param {Object} searchResult - Result from searchBusTrips()
 * @returns {Array} Array of route alternatives for the routing engine
 */
export function convertToAlternatives(searchResult) {
  if (!searchResult.success || searchResult.trips.length === 0) return [];

  const trips = searchResult.trips;

  // Sort by price
  const sorted = [...trips].sort((a, b) =>
    (a.price?.price || Infinity) - (b.price?.price || Infinity)
  );

  // Group by company + seatClass for meaningful alternatives
  const groups = new Map();
  for (const trip of sorted) {
    const companyName = trip.company?.name || 'Desconhecida';
    const seatClass = trip.seatClass || 'Convencional';
    const key = `${companyName}|${seatClass}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(trip);
  }

  const alternatives = [];

  for (const [key, groupTrips] of groups) {
    const [companyName, seatClass] = key.split('|');
    const cheapest = groupTrips[0]; // Already sorted by price
    const earliest = [...groupTrips].sort((a, b) =>
      compareDepartureTime(a, b)
    )[0];

    // Use the cheapest trip as representative
    const representative = cheapest;
    const durationH = (representative.travelDuration || 0) / 3600;
    const price = representative.price?.price || 0;

    // Build connection info if present
    const hasConnection = !!representative.connection;
    const connectionInfo = hasConnection ? {
      node: representative.connection.node?.name || '',
      waitingH: getWaitingHours(representative.connection.waitingInformation),
    } : null;

    const descricao = hasConnection
      ? `${companyName} ${seatClass} via ${connectionInfo.node}`
      : `${companyName} ${seatClass}`;

    const tempoEspera = connectionInfo?.waitingH || 0;

    // Build purchase link from the Quero Passagem trip ID
    const purchaseUrl = representative.id
      ? `https://www.queropassagem.com.br/checkout?travelId=${representative.id}`
      : null;

    alternatives.push({
      descricao,
      custoTotal: price,
      tempoTotalH: durationH,
      tempoEspera,
      tempoTotalPortaPortaH: durationH + tempoEspera + 1, // +1h for terminals
      trechos: buildTrechos(representative),
      baldeacoes: hasConnection ? 1 : 0,
      operadores: [companyName],
      tipo: seatClass,
      assentosDisponiveis: representative.availableSeats,
      horarioPartida: formatTime(representative.departure),
      horarioChegada: formatTime(representative.arrival),
      permiteCancelamento: representative.allowCanceling,
      limiteCancelamento: representative.travelCancellationLimitDate,
      taxaCancelamento: representative.travelCancellationFee,
      seguro: representative.insurance || 0,
      withBPE: representative.withBPE,
      precoDetalhado: {
        assento: representative.price?.seatPrice || 0,
        taxa: representative.price?.taxPrice || 0,
        total: price,
        taxaCartao: representative.price?.ccTaxPrice || 0,
      },
      fonte: 'quero_passagem',
      fonteLabel: 'Quero Passagem',
      travelId: representative.id,
      purchaseUrl,
      totalOpcoes: groupTrips.length,
      ultimaAtualizacao: new Date().toISOString(),
      opcoes: groupTrips.map(t => ({
        travelId: t.id,
        partida: formatTime(t.departure),
        chegada: formatTime(t.arrival),
        preco: t.price?.price || 0,
        assentos: t.availableSeats,
        classe: t.seatClass,
        purchaseUrl: t.id
          ? `https://www.queropassagem.com.br/checkout?travelId=${t.id}`
          : null,
      })),
    });
  }

  // Limit to top 6 alternatives
  return alternatives.slice(0, 6);
}

/**
 * Search for bus connection suggestions between two cities.
 *
 * @param {string} origin - Origin city name
 * @param {string} destination - Destination city name
 * @param {string} travelDate - yyyy-mm-dd
 */
export async function searchBusConnections(origin, destination, travelDate) {
  const enabled = await isBusApiEnabled();
  if (!enabled) return { success: false, reason: 'api_not_configured' };

  const [fromStop, toStop] = await Promise.all([
    findStopForCity(origin),
    findStopForCity(destination),
  ]);

  if (!fromStop || !toStop) {
    return { success: false, reason: 'stops_not_found' };
  }

  try {
    return await fetchBusConnections(fromStop.id, toStop.id, travelDate || getDefaultTravelDate());
  } catch (err) {
    return { success: false, reason: 'fetch_error', error: err.message };
  }
}

// ── Helpers ─────────────────────────────────────────────

function getDefaultTravelDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function formatTime(dt) {
  if (!dt) return '';
  if (dt.date && dt.time) return `${dt.date} ${dt.time}`;
  return String(dt);
}

function compareDepartureTime(a, b) {
  const tA = a.departure?.time || '99:99:99';
  const tB = b.departure?.time || '99:99:99';
  return tA.localeCompare(tB);
}

function getWaitingHours(waitingInfo) {
  if (!waitingInfo) return 0;
  if (waitingInfo.arrival && waitingInfo.departure) {
    const arrival = new Date(waitingInfo.arrival);
    const depDate = waitingInfo.departure.date;
    const depTime = waitingInfo.departure.time;
    if (depDate && depTime) {
      const departure = new Date(`${depDate}T${depTime}`);
      return Math.max(0, (departure - arrival) / (1000 * 3600));
    }
  }
  return 0;
}

/**
 * Search bus tickets with full resilience — never throws.
 * Automatically tries connections when direct routes are unavailable.
 */
export async function searchBusTickets(origin, destination, options = {}) {
  try {
    return await searchBusTrips(origin, destination, options);
  } catch (err) {
    return { success: false, reason: 'error', message: err.message, trips: [] };
  }
}

/**
 * Get purchase options for a bus search result.
 * Extracts booking URLs and seller info.
 */
export function getBusPurchaseOptions(searchResult) {
  if (!searchResult?.success || !searchResult.trips) return [];
  return searchResult.trips
    .filter(t => t.id)
    .map(t => ({
      travelId: t.id,
      company: t.company?.name || '',
      price: t.price?.price || 0,
      departure: formatTime(t.departure),
      arrival: formatTime(t.arrival),
      seatClass: t.seatClass || 'Convencional',
      availableSeats: t.availableSeats,
      purchaseUrl: `https://www.queropassagem.com.br/checkout?travelId=${t.id}`,
      fonte: 'Quero Passagem',
    }));
}

function buildTrechos(trip) {
  const trechos = [];

  // Main leg
  trechos.push({
    de: trip.from?.name || '',
    para: trip.connection ? trip.connection.node?.name || '' : (trip.to?.name || ''),
    operadores: [trip.company?.name || ''],
    tempoH: trip.connection
      ? (trip.travelDuration || 0) / 3600 * 0.6 // Approximate first leg
      : (trip.travelDuration || 0) / 3600,
    tipo: trip.seatClass || 'Convencional',
    distanciaKm: parseFloat(trip.travelDistance) || 0,
  });

  // Connection leg
  if (trip.connection) {
    trechos.push({
      de: trip.connection.node?.name || '',
      para: trip.to?.name || '',
      operadores: [trip.connection.company?.name || trip.company?.name || ''],
      tempoH: (trip.travelDuration || 0) / 3600 * 0.4, // Approximate second leg
      tipo: trip.connection.seatClass || trip.seatClass || 'Convencional',
      distanciaKm: 0,
    });
  }

  return trechos;
}
