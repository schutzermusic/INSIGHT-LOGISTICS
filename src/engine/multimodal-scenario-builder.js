/**
 * Multimodal Scenario Builder Engine
 *
 * Core intelligence engine that automatically generates complex logistics
 * alternatives for any origin-destination pair in Brazil. Instead of failing
 * when a direct route is unavailable, this engine:
 *
 * 1. Detects nearby hubs (airports, terminals) for origin and destination
 * 2. Generates multimodal scenarios (car, bus, flight+car, flight+bus, etc.)
 * 3. Calculates door-to-door time and cost for each scenario
 * 4. Filters out non-viable scenarios
 * 5. Returns all viable alternatives for scoring
 *
 * Designed for Brazilian logistics where many field destinations require
 * combining air, road, and regional transfers.
 */

import { getCityInfo, getExtendedCitiesData, getOperatorsForRoute } from './routes-intelligence-db.js';

// ============================================================
// CONFIGURATION
// ============================================================

const HUB_SEARCH_RADIUS_KM = 400;     // Max radius to search for nearby airports
const CLOSE_HUB_RADIUS_KM = 150;      // "Close" hub — short ground transfer
const BUS_MAX_VIABLE_HOURS = 36;       // Max bus travel time to consider viable
const CAR_MAX_VIABLE_HOURS = 24;       // Max car travel time to consider viable
const MAX_TOTAL_TRAVEL_HOURS = 48;     // Absolute max for any scenario
const MIN_FLIGHT_DISTANCE_KM = 300;    // Min distance to consider flying
const FUEL_PRICE_PER_LITER = 5.89;
const FUEL_CONSUMPTION_KM_PER_L = 10;
const CAR_RENTAL_PER_DAY = 180;
const BUS_COST_PER_KM = 0.18;
const BUS_AVG_SPEED_KMH = 60;
const CAR_AVG_SPEED_KMH = 80;
const AIRPORT_CHECKIN_HOURS = 1.5;
const AIRPORT_TO_CITY_DEFAULT_HOURS = 1.0;
const CITY_TO_AIRPORT_DEFAULT_HOURS = 1.5;
const FLIGHT_SPEED_KMH = 700;
const FLIGHT_BASE_COST = 250;          // Minimum flight cost
const FLIGHT_COST_PER_KM = 0.22;
const TRANSFER_WAIT_HOURS = 1.0;       // Wait between legs

// ============================================================
// HAVERSINE DISTANCE
// ============================================================

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roadDistanceKm(lat1, lng1, lat2, lng2) {
    return Math.round(haversineKm(lat1, lng1, lat2, lng2) * 1.3);
}

// ============================================================
// LOCATION CONTEXT INTELLIGENCE
// ============================================================

/**
 * Build a complete access context for a city — nearby airports, hubs, terminals
 */
export function buildLocationContext(cityName) {
    const city = getCityInfo(cityName);
    const allCities = getExtendedCitiesData();

    // If city is in extended DB, use its data
    if (city) {
        const nearbyHubs = findNearbyHubs(city, allCities);
        return {
            found: true,
            city,
            name: city.nome,
            uf: city.uf,
            lat: city.lat,
            lng: city.lng,
            hasAirport: city.aeroportos && city.aeroportos.length > 0,
            airports: city.aeroportos || [],
            isHub: city.hub || false,
            nearbyHubs,
            nearbyAirports: findNearbyAirports(city, allCities),
        };
    }

    // City not in extended DB — try to find it from the name pattern "City - UF"
    const ufMatch = cityName.match(/\s*-\s*([A-Z]{2})$/);
    const uf = ufMatch ? ufMatch[1] : null;

    // Find the closest hub in the same state or nearby
    const stateCapitals = allCities.filter(c => c.hub && (uf ? c.uf === uf : true));
    const closestCapital = stateCapitals.length > 0 ? stateCapitals[0] : allCities.find(c => c.hub);

    if (closestCapital) {
        // Estimate coordinates based on state capital (rough approximation)
        return {
            found: false,
            city: null,
            name: cityName,
            uf: uf || closestCapital.uf,
            lat: closestCapital.lat + (Math.random() - 0.5) * 2, // approximate
            lng: closestCapital.lng + (Math.random() - 0.5) * 2,
            hasAirport: false,
            airports: [],
            isHub: false,
            nearbyHubs: [{ city: closestCapital, distanceKm: 0, type: 'state_capital_estimate' }],
            nearbyAirports: closestCapital.aeroportos?.length > 0
                ? [{ city: closestCapital, airports: closestCapital.aeroportos, distanceKm: 0, estimatedTransferH: 2 }]
                : [],
        };
    }

    return { found: false, city: null, name: cityName, uf, lat: null, lng: null, hasAirport: false, airports: [], isHub: false, nearbyHubs: [], nearbyAirports: [] };
}

/**
 * Find nearby hub cities within configurable radius
 */
function findNearbyHubs(city, allCities) {
    return allCities
        .filter(c => c.nome !== city.nome && (c.hub || (c.aeroportos && c.aeroportos.length > 0)))
        .map(c => ({
            city: c,
            distanceKm: roadDistanceKm(city.lat, city.lng, c.lat, c.lng),
            isHub: c.hub,
            hasAirport: c.aeroportos && c.aeroportos.length > 0,
        }))
        .filter(h => h.distanceKm <= HUB_SEARCH_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Find nearby airports (including those at hub cities)
 */
function findNearbyAirports(city, allCities) {
    // If city itself has an airport, include it first
    const results = [];

    if (city.aeroportos && city.aeroportos.length > 0) {
        results.push({
            city,
            airports: city.aeroportos,
            distanceKm: 0,
            estimatedTransferH: 0.5, // Airport within same city
        });
    }

    // Find nearby cities with airports
    const nearby = allCities
        .filter(c => c.nome !== city.nome && c.aeroportos && c.aeroportos.length > 0)
        .map(c => {
            const dist = roadDistanceKm(city.lat, city.lng, c.lat, c.lng);
            return {
                city: c,
                airports: c.aeroportos,
                distanceKm: dist,
                estimatedTransferH: Math.round((dist / CAR_AVG_SPEED_KMH) * 10) / 10,
            };
        })
        .filter(a => a.distanceKm <= HUB_SEARCH_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm);

    return [...results, ...nearby.slice(0, 5)]; // Top 5 nearby airports
}

// ============================================================
// SCENARIO GENERATION
// ============================================================

/**
 * Generate all viable multimodal scenarios for a route
 * @param {Object} originCtx - Origin location context
 * @param {Object} destCtx - Destination location context
 * @param {Function} onProgress - Progress callback
 * @returns {Object} scenarios and metadata
 */
export function generateMultimodalScenarios(originCtx, destCtx, onProgress = () => {}) {
    const scenarios = [];
    const explorationLog = [];
    const failedStrategies = [];

    if (!originCtx.lat || !destCtx.lat) {
        return {
            scenarios: [],
            explorationLog: ['Coordenadas insuficientes para calcular rotas.'],
            directRouteViable: false,
        };
    }

    const directDistanceKm = roadDistanceKm(originCtx.lat, originCtx.lng, destCtx.lat, destCtx.lng);

    // -------------------------------------------------------
    // STRATEGY 1: DIRECT CAR ROUTE
    // Never stop if this fails — continue to other strategies
    // -------------------------------------------------------
    try {
        onProgress('Avaliando rota direta por veiculo...');
        const carScenario = buildDirectCarScenario(originCtx, destCtx, directDistanceKm);
        if (carScenario) {
            scenarios.push(carScenario);
            explorationLog.push(`Rota direta de carro: ${directDistanceKm} km, ${carScenario.vehicle.tempoEstimadoH}h`);
        } else {
            explorationLog.push('Rota direta de carro inviavel (distancia/tempo excede limites)');
        }
    } catch (err) {
        failedStrategies.push('car_direct');
        explorationLog.push(`Erro ao avaliar rota de carro: ${err.message}`);
    }

    // -------------------------------------------------------
    // STRATEGY 2: DIRECT BUS ROUTE
    // -------------------------------------------------------
    try {
        onProgress('Avaliando rota direta de onibus...');
        const busScenarios = buildDirectBusScenarios(originCtx, destCtx, directDistanceKm);
        scenarios.push(...busScenarios);
        if (busScenarios.length > 0) {
            explorationLog.push(`${busScenarios.length} alternativa(s) de onibus encontrada(s)`);
        } else {
            explorationLog.push('Onibus direto inviavel (tempo excede limites)');
        }
    } catch (err) {
        failedStrategies.push('bus_direct');
        explorationLog.push(`Erro ao avaliar onibus direto: ${err.message}`);
    }

    // -------------------------------------------------------
    // STRATEGY 3: DIRECT FLIGHT (if both have airports)
    // -------------------------------------------------------
    if (directDistanceKm >= MIN_FLIGHT_DISTANCE_KM) {
        try {
            onProgress('Avaliando voos diretos...');
            const directFlightScenarios = buildDirectFlightScenarios(originCtx, destCtx, directDistanceKm);
            scenarios.push(...directFlightScenarios);
            if (directFlightScenarios.length > 0) {
                explorationLog.push(`${directFlightScenarios.length} alternativa(s) aerea(s) direta(s)`);
            } else {
                explorationLog.push('Voo direto: origem ou destino sem aeroporto mapeado');
            }
        } catch (err) {
            failedStrategies.push('flight_direct');
            explorationLog.push(`Erro ao avaliar voos diretos: ${err.message}`);
        }
    }

    // -------------------------------------------------------
    // STRATEGY 4: MULTIMODAL: FLIGHT + GROUND TRANSFER
    // This is the KEY strategy for difficult routes
    // -------------------------------------------------------
    if (directDistanceKm >= MIN_FLIGHT_DISTANCE_KM) {
        try {
            onProgress('Construindo cenarios multimodais (voo + transferencia terrestre)...');
            const multimodalScenarios = buildFlightPlusGroundScenarios(originCtx, destCtx, directDistanceKm);
            scenarios.push(...multimodalScenarios);
            if (multimodalScenarios.length > 0) {
                explorationLog.push(`${multimodalScenarios.length} cenario(s) multimodal(is) gerado(s) (voo + terrestre)`);
            }
        } catch (err) {
            failedStrategies.push('flight_ground');
            explorationLog.push(`Erro ao construir cenarios multimodais: ${err.message}`);
        }
    }

    // -------------------------------------------------------
    // STRATEGY 5: BUS + TRANSFER (for remote destinations)
    // -------------------------------------------------------
    if (directDistanceKm > 200) {
        try {
            onProgress('Avaliando onibus com transferencia...');
            const busTransferScenarios = buildBusPlusTransferScenarios(originCtx, destCtx, directDistanceKm);
            scenarios.push(...busTransferScenarios);
            if (busTransferScenarios.length > 0) {
                explorationLog.push(`${busTransferScenarios.length} cenario(s) de onibus com transferencia`);
            }
        } catch (err) {
            failedStrategies.push('bus_transfer');
            explorationLog.push(`Erro ao avaliar onibus com transferencia: ${err.message}`);
        }
    }

    // -------------------------------------------------------
    // FILTER NON-VIABLE SCENARIOS
    // -------------------------------------------------------
    const viable = scenarios.filter(s => isScenarioViable(s, directDistanceKm));

    if (failedStrategies.length > 0) {
        explorationLog.push(`${failedStrategies.length} estrategia(s) falharam, mas ${viable.length} alternativa(s) viavel(is) foram geradas`);
    } else {
        explorationLog.push(`${viable.length} de ${scenarios.length} cenarios viaveis apos filtro`);
    }

    return {
        scenarios: viable,
        explorationLog,
        failedStrategies,
        directRouteViable: scenarios.some(s => s.type === 'vehicle'),
        directDistanceKm,
        totalScenariosGenerated: scenarios.length,
        totalScenariosViable: viable.length,
        originContext: {
            hasAirport: originCtx.hasAirport,
            isHub: originCtx.isHub,
            nearbyAirportsCount: originCtx.nearbyAirports?.length || 0,
        },
        destinationContext: {
            hasAirport: destCtx.hasAirport,
            isHub: destCtx.isHub,
            nearbyAirportsCount: destCtx.nearbyAirports?.length || 0,
        },
    };
}

// ============================================================
// SCENARIO BUILDERS
// ============================================================

function buildDirectCarScenario(originCtx, destCtx, distanceKm) {
    const tempoH = Math.round((distanceKm / CAR_AVG_SPEED_KMH) * 10) / 10;
    if (tempoH > CAR_MAX_VIABLE_HOURS) return null;

    const combustivel = Math.round(distanceKm * FUEL_PRICE_PER_LITER / FUEL_CONSUMPTION_KM_PER_L);
    const diasEstimados = Math.max(1, Math.ceil(tempoH / 10));
    const aluguel = diasEstimados * CAR_RENTAL_PER_DAY;
    const pedagios = Math.round(distanceKm * 0.08);

    return {
        type: 'vehicle',
        mode: 'car_only',
        label: 'Veiculo direto',
        description: `${originCtx.name} → ${destCtx.name} (rota rodoviaria)`,
        legs: [
            { mode: 'car', from: originCtx.name, to: destCtx.name, distanceKm, durationH: tempoH }
        ],
        totalDistanceKm: distanceKm,
        totalDurationH: tempoH,
        transfers: 0,
        vehicle: {
            distanciaKm: distanceKm,
            tempoEstimadoH: tempoH,
            rotaDescricao: `${originCtx.name} → ${destCtx.name} (rota rodoviaria)`,
            combustivelEstimado: combustivel,
            consumoMedioKmL: FUEL_CONSUMPTION_KM_PER_L,
            precoLitro: FUEL_PRICE_PER_LITER,
            pedagios,
            custoAluguel: aluguel,
            aluguelDiaria: CAR_RENTAL_PER_DAY,
            diasEstimados,
            custoTotalVeiculo: combustivel + pedagios + aluguel,
            trecho: [],
        },
        estimatedCost: combustivel + pedagios + aluguel,
        strengths: ['Flexibilidade de horario', 'Porta a porta', 'Custo compartilhado entre equipe'],
        limitations: tempoH > 8
            ? ['Fadiga do motorista em viagens longas', 'Risco rodoviario']
            : ['Custo de combustivel e pedagios'],
    };
}

function buildDirectBusScenarios(originCtx, destCtx, distanceKm) {
    const tempoH = Math.round((distanceKm / BUS_AVG_SPEED_KMH) * 10) / 10;
    if (tempoH > BUS_MAX_VIABLE_HOURS) return [];

    const custo = Math.round(distanceKm * BUS_COST_PER_KM);
    const operators = getOperatorsForRoute(originCtx.uf, destCtx.uf);
    const operatorNames = operators.length > 0 ? operators.map(o => o.nome) : ['Estimativa'];

    const scenarios = [];

    // Direct bus
    scenarios.push({
        type: 'bus',
        mode: 'bus_only',
        label: 'Onibus direto',
        description: `${originCtx.name} → ${destCtx.name} (onibus direto)`,
        legs: [
            { mode: 'bus', from: originCtx.name, to: destCtx.name, distanceKm, durationH: tempoH, operators: operatorNames }
        ],
        totalDistanceKm: distanceKm,
        totalDurationH: tempoH,
        transfers: 0,
        bus: {
            alternativas: [{
                descricao: `${originCtx.name} → ${destCtx.name} (onibus direto, estimativa)`,
                trechos: [{ de: originCtx.name, para: destCtx.name, distKm: distanceKm, tempoH, custo, operadores: operatorNames, tipo: 'convencional' }],
                tempoTotalH: tempoH,
                custoTotal: custo,
                baldeacoes: 0,
                tempoEspera: 0,
            }],
        },
        estimatedCost: custo,
        strengths: ['Baixo custo por pessoa', 'Sem necessidade de motorista'],
        limitations: tempoH > 10
            ? ['Fadiga em viagens longas', 'Horarios fixos', 'Impacto noturno']
            : ['Horarios fixos', 'Sem flexibilidade de parada'],
    });

    // If distance is long, add leito option
    if (tempoH > 6) {
        const custoLeito = Math.round(custo * 1.6);
        scenarios.push({
            type: 'bus',
            mode: 'bus_leito',
            label: 'Onibus leito',
            description: `${originCtx.name} → ${destCtx.name} (onibus leito)`,
            legs: [
                { mode: 'bus_leito', from: originCtx.name, to: destCtx.name, distanceKm, durationH: tempoH, operators: operatorNames }
            ],
            totalDistanceKm: distanceKm,
            totalDurationH: tempoH,
            transfers: 0,
            bus: {
                alternativas: [{
                    descricao: `${originCtx.name} → ${destCtx.name} (onibus leito, estimativa)`,
                    trechos: [{ de: originCtx.name, para: destCtx.name, distKm: distanceKm, tempoH, custo: custoLeito, operadores: operatorNames, tipo: 'leito' }],
                    tempoTotalH: tempoH,
                    custoTotal: custoLeito,
                    baldeacoes: 0,
                    tempoEspera: 0,
                }],
            },
            estimatedCost: custoLeito,
            strengths: ['Conforto superior', 'Descanso durante viagem'],
            limitations: ['Custo mais alto que convencional', 'Horarios limitados'],
        });
    }

    return scenarios;
}

function buildDirectFlightScenarios(originCtx, destCtx, distanceKm) {
    const scenarios = [];

    // Only if both origin and destination have airports
    if (!originCtx.hasAirport || !destCtx.hasAirport) return scenarios;

    const flightTimeH = Math.round((distanceKm / FLIGHT_SPEED_KMH) * 10) / 10;
    const doorToDoorH = Math.round((CITY_TO_AIRPORT_DEFAULT_HOURS + AIRPORT_CHECKIN_HOURS + flightTimeH + AIRPORT_TO_CITY_DEFAULT_HOURS) * 10) / 10;
    const custoVoo = Math.round(FLIGHT_BASE_COST + distanceKm * FLIGHT_COST_PER_KM);

    const originAirport = originCtx.airports[0];
    const destAirport = destCtx.airports[0];

    // Direct flight
    scenarios.push({
        type: 'air',
        mode: 'flight_direct',
        label: 'Voo direto',
        description: `Voo direto: ${originAirport} → ${destAirport}`,
        legs: [
            { mode: 'ground_transfer', from: originCtx.name, to: `Aeroporto ${originAirport}`, durationH: CITY_TO_AIRPORT_DEFAULT_HOURS },
            { mode: 'flight', from: originAirport, to: destAirport, durationH: flightTimeH, distanceKm },
            { mode: 'ground_transfer', from: `Aeroporto ${destAirport}`, to: destCtx.name, durationH: AIRPORT_TO_CITY_DEFAULT_HOURS },
        ],
        totalDistanceKm: distanceKm,
        totalDurationH: doorToDoorH,
        transfers: 0,
        air: {
            alternativas: [{
                descricao: `Voo direto: ${originAirport} → ${destAirport} (estimativa)`,
                trechos: [{ de: originAirport, para: destAirport, tempoVooH: flightTimeH, custo: custoVoo, cia: 'Estimativa' }],
                conexoes: 0,
                tempoConexaoH: 0,
                deslocamentoAeroportoOrigemH: CITY_TO_AIRPORT_DEFAULT_HOURS,
                deslocamentoAeroportoDestinoH: AIRPORT_TO_CITY_DEFAULT_HOURS,
                trechoTerrestreFinal: null,
                tempoTotalPortaPortaH: doorToDoorH,
                custoTotal: custoVoo,
            }],
        },
        estimatedCost: custoVoo,
        strengths: ['Mais rapido', 'Menor fadiga', 'Ideal para longas distancias'],
        limitations: ['Custo mais alto por pessoa', 'Dependencia de horarios de voo'],
    });

    // If both are hubs, add connection option for cheaper alternative
    if (!originCtx.isHub || !destCtx.isHub) {
        const custoConexao = Math.round(custoVoo * 0.85);
        const conexaoDoorToDoor = doorToDoorH + 2; // +2h for connection

        scenarios.push({
            type: 'air',
            mode: 'flight_connection',
            label: 'Voo com conexao',
            description: `Voo com conexao: ${originAirport} → Hub → ${destAirport}`,
            legs: [
                { mode: 'ground_transfer', from: originCtx.name, to: `Aeroporto ${originAirport}`, durationH: CITY_TO_AIRPORT_DEFAULT_HOURS },
                { mode: 'flight', from: originAirport, to: 'Hub', durationH: flightTimeH * 0.6 },
                { mode: 'connection', from: 'Hub', to: 'Hub', durationH: 2 },
                { mode: 'flight', from: 'Hub', to: destAirport, durationH: flightTimeH * 0.6 },
                { mode: 'ground_transfer', from: `Aeroporto ${destAirport}`, to: destCtx.name, durationH: AIRPORT_TO_CITY_DEFAULT_HOURS },
            ],
            totalDistanceKm: Math.round(distanceKm * 1.2),
            totalDurationH: conexaoDoorToDoor,
            transfers: 1,
            air: {
                alternativas: [{
                    descricao: `Voo com conexao: ${originAirport} → Hub → ${destAirport} (estimativa)`,
                    trechos: [
                        { de: originAirport, para: 'Hub', tempoVooH: flightTimeH * 0.6, custo: Math.round(custoConexao * 0.5), cia: 'Estimativa' },
                        { de: 'Hub', para: destAirport, tempoVooH: flightTimeH * 0.6, custo: Math.round(custoConexao * 0.5), cia: 'Estimativa' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2,
                    deslocamentoAeroportoOrigemH: CITY_TO_AIRPORT_DEFAULT_HOURS,
                    deslocamentoAeroportoDestinoH: AIRPORT_TO_CITY_DEFAULT_HOURS,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: conexaoDoorToDoor,
                    custoTotal: custoConexao,
                }],
            },
            estimatedCost: custoConexao,
            strengths: ['Potencialmente mais barato', 'Mais opcoes de horario'],
            limitations: ['Tempo de conexao', 'Risco de perda de conexao'],
        });
    }

    return scenarios;
}

/**
 * Build flight + ground transfer scenarios
 * This is the KEY multimodal logic for difficult routes
 */
function buildFlightPlusGroundScenarios(originCtx, destCtx, directDistanceKm) {
    const scenarios = [];

    // Find airports near origin and destination
    const originAirports = originCtx.nearbyAirports || [];
    const destAirports = destCtx.nearbyAirports || [];

    // For destinations WITHOUT a direct airport, find nearby airports to fly into
    const destAirportsToConsider = destCtx.hasAirport
        ? destAirports.filter(a => a.distanceKm <= CLOSE_HUB_RADIUS_KM)
        : destAirports;

    // For origins WITHOUT a direct airport, find nearby airports to fly from
    const originAirportsToConsider = originCtx.hasAirport
        ? originAirports.filter(a => a.distanceKm <= CLOSE_HUB_RADIUS_KM)
        : originAirports;

    // Build combinations
    for (const origAP of originAirportsToConsider.slice(0, 3)) {
        for (const destAP of destAirportsToConsider.slice(0, 3)) {
            // Skip if flying to same city
            if (origAP.city.nome === destAP.city.nome) continue;

            // Calculate flight distance between airports
            const flightDist = roadDistanceKm(origAP.city.lat, origAP.city.lng, destAP.city.lat, destAP.city.lng);
            if (flightDist < MIN_FLIGHT_DISTANCE_KM) continue;

            // Skip if the flight doesn't save significant time vs driving
            const directDriveH = directDistanceKm / CAR_AVG_SPEED_KMH;
            const groundTransferOriginH = origAP.distanceKm / CAR_AVG_SPEED_KMH;
            const flightH = flightDist / FLIGHT_SPEED_KMH;
            const groundTransferDestH = destAP.distanceKm / CAR_AVG_SPEED_KMH;
            const totalMultimodalH = groundTransferOriginH + AIRPORT_CHECKIN_HOURS + flightH + groundTransferDestH;

            if (totalMultimodalH > directDriveH * 0.9) continue; // Must be at least 10% faster

            const custoVoo = Math.round(FLIGHT_BASE_COST + flightDist * FLIGHT_COST_PER_KM);
            const needsDestTransfer = destAP.distanceKm > 0;
            const needsOriginTransfer = origAP.distanceKm > 0;

            // --- FLIGHT + RENTAL CAR ---
            if (needsDestTransfer && destAP.distanceKm > 20) {
                const transferDistKm = destAP.distanceKm;
                const transferH = Math.round(groundTransferDestH * 10) / 10;
                const rentalCost = Math.round(CAR_RENTAL_PER_DAY * Math.max(1, Math.ceil(transferH / 10)));
                const fuelCost = Math.round(transferDistKm * FUEL_PRICE_PER_LITER / FUEL_CONSUMPTION_KM_PER_L);
                const totalDoorToDoor = Math.round((
                    (needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS) +
                    AIRPORT_CHECKIN_HOURS + flightH +
                    TRANSFER_WAIT_HOURS + // Rental car pickup
                    transferH
                ) * 10) / 10;

                const originLabel = origAP.distanceKm > 0
                    ? `${originCtx.name} → Aeroporto ${origAP.airports[0]} (${origAP.city.nome})`
                    : `${originCtx.name} → Aeroporto ${origAP.airports[0]}`;

                scenarios.push({
                    type: 'multimodal',
                    mode: 'flight_car',
                    label: `Voo + Carro alugado`,
                    description: `Voo ${origAP.airports[0]} → ${destAP.airports[0]}, depois carro ate ${destCtx.name}`,
                    legs: [
                        { mode: 'ground_transfer', from: originCtx.name, to: `Aeroporto ${origAP.airports[0]}`, durationH: needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS, distanceKm: origAP.distanceKm || 15 },
                        { mode: 'flight', from: origAP.airports[0], to: destAP.airports[0], durationH: flightH, distanceKm: flightDist },
                        { mode: 'rental_car', from: `Aeroporto ${destAP.airports[0]} (${destAP.city.nome})`, to: destCtx.name, durationH: transferH, distanceKm: transferDistKm },
                    ],
                    totalDistanceKm: (origAP.distanceKm || 15) + flightDist + transferDistKm,
                    totalDurationH: totalDoorToDoor,
                    transfers: 1,
                    air: {
                        alternativas: [{
                            descricao: `Voo ${origAP.airports[0]} → ${destAP.airports[0]} + carro ate ${destCtx.name} (${transferDistKm} km)`,
                            trechos: [{ de: origAP.airports[0], para: destAP.airports[0], tempoVooH: flightH, custo: custoVoo, cia: 'Estimativa' }],
                            conexoes: 0,
                            tempoConexaoH: 0,
                            deslocamentoAeroportoOrigemH: needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS,
                            deslocamentoAeroportoDestinoH: transferH,
                            trechoTerrestreFinal: {
                                tipo: 'carro_alugado',
                                de: destAP.city.nome,
                                para: destCtx.name,
                                distanciaKm: transferDistKm,
                                tempoH: transferH,
                                custo: rentalCost + fuelCost,
                            },
                            tempoTotalPortaPortaH: totalDoorToDoor,
                            custoTotal: custoVoo + rentalCost + fuelCost,
                        }],
                    },
                    estimatedCost: custoVoo + rentalCost + fuelCost,
                    strengths: [
                        'Combina velocidade aerea com flexibilidade terrestre',
                        `Economiza ${Math.round(directDriveH - totalDoorToDoor)}h vs dirigir tudo`,
                    ],
                    limitations: [
                        `Requer ${transferDistKm} km de carro apos o voo`,
                        'Custo do aluguel de veiculo no destino',
                    ],
                });
            }

            // --- FLIGHT + BUS TO DESTINATION ---
            if (needsDestTransfer && destAP.distanceKm > 20 && destAP.distanceKm < 500) {
                const transferDistKm = destAP.distanceKm;
                const busTransferH = Math.round((transferDistKm / BUS_AVG_SPEED_KMH) * 10) / 10;
                const busCost = Math.round(transferDistKm * BUS_COST_PER_KM);
                const totalDoorToDoor = Math.round((
                    (needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS) +
                    AIRPORT_CHECKIN_HOURS + flightH +
                    TRANSFER_WAIT_HOURS +
                    busTransferH
                ) * 10) / 10;

                scenarios.push({
                    type: 'multimodal',
                    mode: 'flight_bus',
                    label: `Voo + Onibus`,
                    description: `Voo ${origAP.airports[0]} → ${destAP.airports[0]}, depois onibus ate ${destCtx.name}`,
                    legs: [
                        { mode: 'ground_transfer', from: originCtx.name, to: `Aeroporto ${origAP.airports[0]}`, durationH: needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS },
                        { mode: 'flight', from: origAP.airports[0], to: destAP.airports[0], durationH: flightH, distanceKm: flightDist },
                        { mode: 'bus', from: destAP.city.nome, to: destCtx.name, durationH: busTransferH, distanceKm: transferDistKm },
                    ],
                    totalDistanceKm: (origAP.distanceKm || 15) + flightDist + transferDistKm,
                    totalDurationH: totalDoorToDoor,
                    transfers: 1,
                    air: {
                        alternativas: [{
                            descricao: `Voo ${origAP.airports[0]} → ${destAP.airports[0]} + onibus ate ${destCtx.name} (${transferDistKm} km)`,
                            trechos: [{ de: origAP.airports[0], para: destAP.airports[0], tempoVooH: flightH, custo: custoVoo, cia: 'Estimativa' }],
                            conexoes: 0,
                            tempoConexaoH: 0,
                            deslocamentoAeroportoOrigemH: needsOriginTransfer ? groundTransferOriginH : CITY_TO_AIRPORT_DEFAULT_HOURS,
                            deslocamentoAeroportoDestinoH: busTransferH,
                            trechoTerrestreFinal: {
                                tipo: 'onibus',
                                de: destAP.city.nome,
                                para: destCtx.name,
                                distanciaKm: transferDistKm,
                                tempoH: busTransferH,
                                custo: busCost,
                            },
                            tempoTotalPortaPortaH: totalDoorToDoor,
                            custoTotal: custoVoo + busCost,
                        }],
                    },
                    estimatedCost: custoVoo + busCost,
                    strengths: [
                        'Menor custo que voo + carro',
                        `Economiza ${Math.round(directDriveH - totalDoorToDoor)}h vs dirigir tudo`,
                    ],
                    limitations: [
                        `Requer ${busTransferH}h de onibus apos o voo`,
                        'Depende de horarios de onibus',
                    ],
                });
            }
        }
    }

    // Deduplicate scenarios with same origin/dest airport pair
    const seen = new Set();
    return scenarios.filter(s => {
        const key = `${s.mode}-${s.legs.map(l => `${l.from}-${l.to}`).join('|')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Build bus routes through intermediate hubs
 */
function buildBusPlusTransferScenarios(originCtx, destCtx, directDistanceKm) {
    const scenarios = [];
    const destHubs = destCtx.nearbyHubs || [];

    // Find hub cities near destination that might have better bus connections
    for (const hub of destHubs.slice(0, 3)) {
        if (hub.distanceKm < 30 || hub.distanceKm > 300) continue;
        if (!hub.city.hub) continue;

        // Bus from origin to hub
        const originToHubDist = roadDistanceKm(originCtx.lat, originCtx.lng, hub.city.lat, hub.city.lng);
        const busToHubH = Math.round((originToHubDist / BUS_AVG_SPEED_KMH) * 10) / 10;
        const busCostToHub = Math.round(originToHubDist * BUS_COST_PER_KM);

        // Transfer from hub to destination
        const hubToDestDist = hub.distanceKm;
        const transferH = Math.round((hubToDestDist / CAR_AVG_SPEED_KMH) * 10) / 10;
        const transferCost = Math.round(hubToDestDist * BUS_COST_PER_KM);

        const totalH = busToHubH + TRANSFER_WAIT_HOURS + transferH;
        if (totalH > BUS_MAX_VIABLE_HOURS) continue;

        // Only include if it's competitive with direct bus
        const directBusH = directDistanceKm / BUS_AVG_SPEED_KMH;
        if (totalH > directBusH * 1.3) continue; // Must not be >30% slower

        scenarios.push({
            type: 'bus',
            mode: 'bus_transfer',
            label: `Onibus via ${hub.city.nome.split(' - ')[0]}`,
            description: `Onibus ate ${hub.city.nome} + transferencia ate ${destCtx.name}`,
            legs: [
                { mode: 'bus', from: originCtx.name, to: hub.city.nome, durationH: busToHubH, distanceKm: originToHubDist },
                { mode: 'transfer', from: hub.city.nome, to: destCtx.name, durationH: transferH, distanceKm: hubToDestDist },
            ],
            totalDistanceKm: originToHubDist + hubToDestDist,
            totalDurationH: totalH,
            transfers: 1,
            bus: {
                alternativas: [{
                    descricao: `Onibus ${originCtx.name} → ${hub.city.nome} + transferencia ate ${destCtx.name}`,
                    trechos: [
                        { de: originCtx.name, para: hub.city.nome, distKm: originToHubDist, tempoH: busToHubH, custo: busCostToHub, operadores: ['Estimativa'], tipo: 'convencional' },
                        { de: hub.city.nome, para: destCtx.name, distKm: hubToDestDist, tempoH: transferH, custo: transferCost, operadores: ['Transfer local'], tipo: 'transfer' },
                    ],
                    tempoTotalH: totalH,
                    custoTotal: busCostToHub + transferCost,
                    baldeacoes: 1,
                    tempoEspera: TRANSFER_WAIT_HOURS,
                }],
            },
            estimatedCost: busCostToHub + transferCost,
            strengths: ['Acesso via hub regional', 'Custo potencialmente menor'],
            limitations: ['Requer baldeacao', `Transferencia de ${hubToDestDist} km ate o destino`],
        });
    }

    return scenarios;
}

// ============================================================
// VIABILITY ENGINE
// ============================================================

function isScenarioViable(scenario, directDistanceKm) {
    // Max total time
    if (scenario.totalDurationH > MAX_TOTAL_TRAVEL_HOURS) return false;

    // Scenario shouldn't be excessively longer than direct drive
    const directDriveH = directDistanceKm / CAR_AVG_SPEED_KMH;
    if (scenario.totalDurationH > directDriveH * 2.5 && scenario.type !== 'bus') return false;

    // Cost sanity check
    if (scenario.estimatedCost <= 0) return false;

    // Too many transfers
    if (scenario.transfers > 3) return false;

    return true;
}

// ============================================================
// CONVERT SCENARIOS TO ROUTING-INTELLIGENCE FORMAT
// ============================================================

/**
 * Convert multimodal scenarios into the format expected by routing-intelligence.js
 * This bridges the new scenario builder with the existing scoring/ranking engine
 */
export function convertScenariosToRouteFormat(scenarios, directDistanceKm) {
    const route = {
        origem: null,
        destino: null,
        distanciaKm: directDistanceKm,
        estimado: true,
        multimodal: true,
        bus: { alternativas: [] },
        air: { alternativas: [] },
        vehicle: null,
    };

    for (const scenario of scenarios) {
        if (scenario.type === 'vehicle' && scenario.vehicle) {
            route.vehicle = scenario.vehicle;
        } else if ((scenario.type === 'bus') && scenario.bus) {
            route.bus.alternativas.push(...scenario.bus.alternativas);
        } else if ((scenario.type === 'air' || scenario.type === 'multimodal') && scenario.air) {
            route.air.alternativas.push(...scenario.air.alternativas);
        }
    }

    return route;
}
