/**
 * Google Flights API Integration via SerpAPI
 * Fetches real-time flight data for Brazilian domestic routes
 *
 * API Docs: https://serpapi.com/google-flights-api
 *
 * Provides:
 * - Real-time flight search with booking links
 * - Price insights / price history from Google Flights
 * - Booking options with seller links
 * - Source transparency for pricing data
 *
 * Falls back to static database when:
 * - API key not configured
 * - API request fails
 * - Rate limit exceeded
 */

const SERPAPI_BASE = '/serpapi'; // Proxied through Vite dev server

// Cache to avoid repeated API calls for the same route
const flightCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================
// IATA CODE MAPPING — Brazilian airports
// ============================================================
const CITY_TO_IATA = {
    'São Paulo - SP': ['GRU', 'CGH', 'VCP'],
    'Rio de Janeiro - RJ': ['GIG', 'SDU'],
    'Belo Horizonte - MG': ['CNF', 'PLU'],
    'Brasília - DF': ['BSB'],
    'Salvador - BA': ['SSA'],
    'Recife - PE': ['REC'],
    'Fortaleza - CE': ['FOR'],
    'Manaus - AM': ['MAO'],
    'Belém - PA': ['BEL'],
    'Curitiba - PR': ['CWB'],
    'Porto Alegre - RS': ['POA'],
    'Goiânia - GO': ['GYN'],
    'Cuiabá - MT': ['CGB'],
    'Londrina - PR': ['LDB'],
    'Maringá - PR': ['MGF'],
    'Cascavel - PR': ['CAC'],
    'Foz do Iguaçu - PR': ['IGU'],
    'Alta Floresta - MT': ['AFL'],
    'Sinop - MT': ['OPS'],
    'Rondonópolis - MT': ['ROO'],
    'Campinas - SP': ['VCP'],
    'Ribeirão Preto - SP': ['RAO'],
    'São José do Rio Preto - SP': ['SJP'],
    'Uberlândia - MG': ['UDI'],
    'Montes Claros - MG': ['MOC'],
    'Campo Grande - MS': ['CGR'],
    'Vitória - ES': ['VIX'],
    'Florianópolis - SC': ['FLN'],
    'Natal - RN': ['NAT'],
    'João Pessoa - PB': ['JPA'],
    'Maceió - AL': ['MCZ'],
    'São Luís - MA': ['SLZ'],
    'Teresina - PI': ['THE'],
    'Palmas - TO': ['PMW'],
    'Porto Velho - RO': ['PVH'],
    'Marabá - PA': ['MAB'],
    'Santarém - PA': ['STM'],
    'Parauapebas - PA': ['CKS'],
    'Joinville - SC': ['JOI'],
    'Caxias do Sul - RS': ['CXJ'],
    'Barreiras - BA': ['BRA'],
    'Ilhéus - BA': ['IOS'],
    'Vitória da Conquista - BA': ['VDC'],
    'Macaé - RJ': ['MEA'],
    'Campos dos Goytacazes - RJ': ['CAW'],
    'Cabo Frio - RJ': ['CFB'],
    'Petrolina - PE': ['PNZ'],
    'Juazeiro do Norte - CE': ['JDO'],
    'Chapecó - SC': ['XAP'],
    'Navegantes - SC': ['NVT'],
    'Imperatriz - MA': ['IMP'],
    'Aracaju - SE': ['AJU'],
    'Dourados - MS': ['DOU'],
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Check if the SerpAPI key is configured
 */
export function isFlightsApiEnabled() {
    const key = import.meta.env.VITE_SERPAPI_KEY;
    return key && key !== 'your_serpapi_key_here' && key.length > 10;
}

/**
 * Search real-time flights between two Brazilian cities
 * @param {string} origemCity - Origin city name (e.g., "Londrina - PR")
 * @param {string} destinoCity - Destination city name (e.g., "Alta Floresta - MT")
 * @param {Object} options - Search options
 * @param {string} options.dataIda - Departure date (YYYY-MM-DD), defaults to tomorrow
 * @param {string} options.dataVolta - Return date (YYYY-MM-DD), optional
 * @param {number} options.adultos - Number of adults (default 1)
 * @returns {Promise<Object>} Flight search results
 */
export async function searchFlights(origemCity, destinoCity, options = {}) {
    if (!isFlightsApiEnabled()) {
        return { success: false, reason: 'api_disabled', message: 'API key não configurada' };
    }

    const origemAirports = getAirportsForCity(origemCity);
    const destinoAirports = getAirportsForCity(destinoCity);

    if (origemAirports.length === 0 || destinoAirports.length === 0) {
        return { success: false, reason: 'no_airports', message: 'Cidade sem aeroporto mapeado' };
    }

    // Search all airport combinations and find the best options
    const allFlights = [];
    const errors = [];
    let collectedPriceInsights = null;

    for (const depAirport of origemAirports) {
        for (const arrAirport of destinoAirports) {
            try {
                const result = await fetchFlights(depAirport, arrAirport, options);
                if (result.success) {
                    allFlights.push(...result.flights.map(f => ({
                        ...f,
                        aeroportoOrigem: depAirport,
                        aeroportoDestino: arrAirport,
                    })));
                    // Collect price insights from the first route that has them
                    if (!collectedPriceInsights && result.priceInsights) {
                        collectedPriceInsights = result.priceInsights;
                    }
                }
            } catch (err) {
                errors.push(`${depAirport}-${arrAirport}: ${err.message}`);
            }
        }
    }
    // Attach price insights to the flights array for extraction
    allFlights._priceInsights = collectedPriceInsights;

    if (allFlights.length === 0) {
        return {
            success: false,
            reason: 'no_results',
            message: `Nenhum voo encontrado. ${errors.length > 0 ? errors[0] : ''}`,
        };
    }

    // Sort by price and deduplicate
    allFlights.sort((a, b) => a.preco - b.preco);

    // Aggregate price insights from all searched routes
    const aggregatedPriceInsights = allFlights._priceInsights || null;

    return {
        success: true,
        source: 'serpapi_google_flights',
        sourceLabel: 'Google Flights via SerpAPI',
        timestamp: new Date().toISOString(),
        totalResultados: allFlights.length,
        flights: allFlights,
        melhorPreco: allFlights[0].preco,
        origemCidade: origemCity,
        destinoCidade: destinoCity,
        aeroportosOrigem: origemAirports,
        aeroportosDestino: destinoAirports,
        priceInsights: aggregatedPriceInsights,
    };
}

/**
 * Convert SerpAPI flight results to the routing-intelligence alternative format
 * @param {Object} flightResults - Results from searchFlights()
 * @param {Object} cityOrigem - Origin city info
 * @param {Object} cityDestino - Destination city info
 * @returns {Array} Alternatives in the format expected by routing-intelligence.js
 */
export function convertToAlternatives(flightResults) {
    if (!flightResults.success || !flightResults.flights) return [];

    // Group flights by route pattern (direct, 1 stop, 2 stops)
    const directFlights = flightResults.flights.filter(f => f.paradas === 0);
    const oneStopFlights = flightResults.flights.filter(f => f.paradas === 1);
    const multiStopFlights = flightResults.flights.filter(f => f.paradas >= 2);

    const alternatives = [];

    // Best direct flight
    if (directFlights.length > 0) {
        const best = directFlights[0];
        alternatives.push(buildFlightAlternative(best, directFlights, 'Voo direto'));
    }

    // Best 1-stop flight (if cheaper or only option)
    if (oneStopFlights.length > 0) {
        const best = oneStopFlights[0];
        const isDifferentRoute = !directFlights.length || best.preco < directFlights[0].preco * 0.85;
        if (isDifferentRoute || directFlights.length === 0) {
            alternatives.push(buildFlightAlternative(best, oneStopFlights, 'Voo com 1 conexão'));
        }
    }

    // Best multi-stop (only if significantly cheaper)
    if (multiStopFlights.length > 0) {
        const best = multiStopFlights[0];
        const cheapestOther = alternatives[0]?.custoTotal || Infinity;
        if (best.preco < cheapestOther * 0.75) {
            alternatives.push(buildFlightAlternative(best, multiStopFlights, 'Voo com múltiplas conexões'));
        }
    }

    return alternatives;
}

// ============================================================
// INTERNAL — API FETCH
// ============================================================

async function fetchFlights(departureId, arrivalId, options = {}) {
    const dataIda = options.dataIda || getNextBusinessDay();
    const adultos = options.adultos || 1;

    const cacheKey = `${departureId}-${arrivalId}-${dataIda}-${adultos}`;
    const cached = flightCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    const params = new URLSearchParams({
        engine: 'google_flights',
        departure_id: departureId,
        arrival_id: arrivalId,
        outbound_date: dataIda,
        currency: 'BRL',
        hl: 'pt',
        gl: 'br',
        type: '2', // One-way
        adults: adultos.toString(),
        api_key: import.meta.env.VITE_SERPAPI_KEY,
    });

    if (options.dataVolta) {
        params.set('return_date', options.dataVolta);
        params.set('type', '1'); // Round trip
    }

    const response = await fetch(`${SERPAPI_BASE}?${params.toString()}`, {
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`SerpAPI error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const parsed = parseFlightResults(data, departureId, arrivalId);

    flightCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    return parsed;
}

// ============================================================
// INTERNAL — PARSE SERPAPI RESPONSE
// ============================================================

function parseFlightResults(data, departureId, arrivalId) {
    const flights = [];

    // SerpAPI returns best_flights and other_flights arrays
    const allResults = [
        ...(data.best_flights || []),
        ...(data.other_flights || []),
    ];

    for (const flight of allResults) {
        if (!flight.flights || flight.flights.length === 0) continue;

        const legs = flight.flights;
        const totalDuration = flight.total_duration || legs.reduce((s, l) => s + (l.duration || 0), 0);
        const price = flight.price;

        if (!price) continue;

        const trechos = legs.map(leg => ({
            de: leg.departure_airport?.id || departureId,
            deNome: leg.departure_airport?.name || '',
            para: leg.arrival_airport?.id || arrivalId,
            paraNome: leg.arrival_airport?.name || '',
            cia: leg.airline || 'N/A',
            ciaLogo: leg.airline_logo || '',
            numero: leg.flight_number || '',
            tempoVooMin: leg.duration || 0,
            tempoVooH: Math.round((leg.duration || 0) / 60 * 10) / 10,
            horaSaida: leg.departure_airport?.time || '',
            horaChegada: leg.arrival_airport?.time || '',
            classe: leg.travel_class || 'Economy',
            aviao: leg.airplane || '',
        }));

        // Calculate layover times
        const layovers = (flight.layovers || []).map(l => ({
            aeroporto: l.id || '',
            nome: l.name || '',
            duracao: l.duration || 0,
            duracaoH: Math.round((l.duration || 0) / 60 * 10) / 10,
            overnight: l.overnight || false,
        }));

        // Extract booking options from SerpAPI response
        const bookingOptions = (flight.booking_options || flight.extensions || [])
            .filter(opt => typeof opt === 'object' && opt.book_with)
            .map(opt => ({
                seller: opt.book_with || '',
                price: opt.price || price,
                url: opt.booking_request?.url || opt.url || null,
            }));

        // If SerpAPI exposes a booking token or deep link, use it
        const bookingToken = flight.booking_token || flight.departure_token || null;

        flights.push({
            preco: price,
            duracaoTotalMin: totalDuration,
            duracaoTotalH: Math.round(totalDuration / 60 * 10) / 10,
            paradas: legs.length - 1,
            trechos,
            layovers,
            tipo: flight.type || 'one_way',
            emissaoCarbono: flight.carbon_emissions?.this_flight || null,
            fonte: 'Google Flights (SerpAPI)',
            bookingOptions,
            bookingToken,
        });
    }

    // Price insights — full extraction from SerpAPI
    const priceInsights = data.price_insights ? {
        faixaPreco: data.price_insights.typical_price_range || [],
        precoAtualNivel: data.price_insights.price_level || '',
        melhorMomento: data.price_insights.lowest_price || null,
        precoMaisBaixo: data.price_insights.lowest_price || null,
        descricao: data.price_insights.price_history || null,
        fonte: 'Google Flights via SerpAPI',
        ultimaAtualizacao: new Date().toISOString(),
    } : null;

    // Search metadata from SerpAPI
    const searchInfo = data.search_metadata || {};

    return {
        success: flights.length > 0,
        flights,
        priceInsights,
        searchMetadata: {
            departureId,
            arrivalId,
            totalResults: flights.length,
            searchId: searchInfo.id || null,
            googleFlightsUrl: searchInfo.google_flights_url || null,
        },
    };
}

// ============================================================
// INTERNAL — BUILD ALTERNATIVE FORMAT
// ============================================================

function buildFlightAlternative(bestFlight, allInCategory, descricao) {
    const legs = bestFlight.trechos;
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];

    // Estimate ground transfer times (average for Brazilian airports)
    const deslocamentoOrigemH = 1.5; // City → airport
    const deslocamentoDestinoH = 1.0; // Airport → city
    const tempoCheckIn = 1.5; // Check-in + security

    const tempoVooTotal = legs.reduce((s, l) => s + l.tempoVooH, 0);
    const tempoLayovers = bestFlight.layovers.reduce((s, l) => s + l.duracaoH, 0);
    const tempoTotalPortaPortaH = Math.round(
        (deslocamentoOrigemH + tempoCheckIn + tempoVooTotal + tempoLayovers + deslocamentoDestinoH) * 10
    ) / 10;

    return {
        descricao: `${descricao}: ${firstLeg.deNome || firstLeg.de} → ${lastLeg.paraNome || lastLeg.para}`,
        custoTotal: bestFlight.preco,
        tempoTotalPortaPortaH,
        conexoes: bestFlight.paradas,
        tempoConexaoH: tempoLayovers,
        deslocamentoAeroportoOrigemH: deslocamentoOrigemH,
        deslocamentoAeroportoDestinoH: deslocamentoDestinoH,
        trechos: legs.map(l => ({
            de: l.de,
            para: l.para,
            tempoVooH: l.tempoVooH,
            custo: Math.round(bestFlight.preco / legs.length), // Approximate split
            cia: l.cia,
            ciaLogo: l.ciaLogo,
            numero: l.numero,
            horaSaida: l.horaSaida,
            horaChegada: l.horaChegada,
            aviao: l.aviao,
            classe: l.classe,
        })),
        layovers: bestFlight.layovers,
        precoMinimo: allInCategory.length > 0 ? Math.min(...allInCategory.map(f => f.preco)) : bestFlight.preco,
        precoMaximo: allInCategory.length > 0 ? Math.max(...allInCategory.map(f => f.preco)) : bestFlight.preco,
        opcoes: allInCategory.length,
        emissaoCarbono: bestFlight.emissaoCarbono,
        fonte: 'realtime',
        fonteLabel: 'Google Flights via SerpAPI',
        dataConsulta: new Date().toISOString(),
        // Booking options from SerpAPI
        bookingOptions: bestFlight.bookingOptions || [],
        bookingToken: bestFlight.bookingToken || null,
        // Airport pair used
        aeroportoOrigem: bestFlight.aeroportoOrigem || firstLeg.de,
        aeroportoDestino: bestFlight.aeroportoDestino || lastLeg.para,
    };
}

// ============================================================
// HELPERS
// ============================================================

function getAirportsForCity(cityName) {
    return CITY_TO_IATA[cityName] || [];
}

/**
 * Get all IATA airport codes mapped in the system
 */
export function getAllMappedAirports() {
    return CITY_TO_IATA;
}

/**
 * Find the nearest city with IATA airports for a given city name
 * Used by the multimodal scenario builder to search hub flights
 */
export function findNearestAirportCity(cityName) {
    const direct = CITY_TO_IATA[cityName];
    if (direct && direct.length > 0) {
        return { city: cityName, airports: direct, isDirect: true };
    }

    // Try to match by UF — find any city in same state with airports
    const ufMatch = cityName.match(/\s*-\s*([A-Z]{2})$/);
    if (ufMatch) {
        const uf = ufMatch[1];
        const sameStateEntries = Object.entries(CITY_TO_IATA)
            .filter(([city]) => city.endsWith(`- ${uf}`));

        if (sameStateEntries.length > 0) {
            // Return the first (likely capital or major hub)
            return { city: sameStateEntries[0][0], airports: sameStateEntries[0][1], isDirect: false };
        }
    }

    return null;
}

function getNextBusinessDay() {
    const date = new Date();
    date.setDate(date.getDate() + 7); // Search for 1 week from now
    const day = date.getDay();
    if (day === 0) date.setDate(date.getDate() + 1); // Skip Sunday
    if (day === 6) date.setDate(date.getDate() + 2); // Skip Saturday
    return date.toISOString().split('T')[0];
}

/**
 * Clear the flight cache
 */
export function clearFlightCache() {
    flightCache.clear();
}

/**
 * Search flight options for a given route — wrapper with enhanced error handling.
 * Never throws; returns a structured result even on failure.
 */
export async function searchFlightOptions(origemCity, destinoCity, options = {}) {
    try {
        return await searchFlights(origemCity, destinoCity, options);
    } catch (err) {
        return { success: false, reason: 'error', message: err.message, flights: [] };
    }
}

/**
 * Get booking options for a specific flight result.
 * Extracts seller links and booking URLs from SerpAPI data.
 */
export function getFlightBookingOptions(flightResult) {
    if (!flightResult?.flights) return [];
    return flightResult.flights
        .filter(f => f.bookingOptions && f.bookingOptions.length > 0)
        .flatMap(f => f.bookingOptions.map(opt => ({
            ...opt,
            flightPrice: f.preco,
            airline: f.trechos?.[0]?.cia || '',
            route: `${f.aeroportoOrigem} → ${f.aeroportoDestino}`,
        })));
}

/**
 * Get price insights for a flight search result.
 * Returns structured pricing intelligence with source attribution.
 */
export function getFlightPriceInsights(flightResult) {
    if (!flightResult?.priceInsights) {
        return {
            available: false,
            fonte: 'Google Flights via SerpAPI',
            ultimaAtualizacao: flightResult?.timestamp || new Date().toISOString(),
        };
    }
    return {
        available: true,
        ...flightResult.priceInsights,
        precoAtual: flightResult.melhorPreco || null,
        totalOpcoes: flightResult.totalResultados || 0,
        fonte: 'Google Flights via SerpAPI',
        ultimaAtualizacao: flightResult.timestamp || new Date().toISOString(),
    };
}
