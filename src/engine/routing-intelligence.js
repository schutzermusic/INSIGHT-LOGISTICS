/**
 * Routing Intelligence Engine
 * AI-powered multimodal logistics recommendation engine that:
 * - Never fails when a direct route is unavailable
 * - Automatically generates multimodal alternatives (car, bus, flight+car, flight+bus)
 * - Detects nearby hubs, airports, and terminals
 * - Calculates full door-to-door mobilization cost
 * - Ranks options by cost, time, and cost-benefit
 * - Generates executive recommendations with justification
 */
import { getRouteIntelligence, getCityInfo, getCityInfoFuzzy } from './routes-intelligence-db.js';
import { calcHourlyRates, calcLaborCost, calcTravelCost, formatCurrency, formatHours } from './calculator.js';
import { searchFlights, convertToAlternatives, isFlightsApiEnabled, getFlightPriceInsights, getFlightBookingOptions } from './flights-api.js';
import { searchBusTrips, convertToAlternatives as convertBusToAlternatives, isBusApiEnabled, getBusPurchaseOptions } from './bus-api.js';
import { fetchTollCost } from '../services/BackendApiClient.js';
import { buildLocationContext, generateMultimodalScenarios, convertScenariosToRouteFormat } from './multimodal-scenario-builder.js';

// ============================================================
// TOLL ESTIMATION (Fallback when Routes API is unavailable)
// ============================================================
const TOLL_RATE_PER_KM_BY_UF = {
    SP: 0.28, PR: 0.22, RJ: 0.24, MG: 0.18, RS: 0.16,
    SC: 0.15, GO: 0.12, MS: 0.14, MT: 0.10, BA: 0.08,
    ES: 0.14, DF: 0.12, PE: 0.06, CE: 0.05, PA: 0.04,
    AM: 0.02, MA: 0.04, RN: 0.05, PB: 0.05, PI: 0.04,
    AL: 0.05, SE: 0.05, TO: 0.04, RO: 0.03, AC: 0.02,
    RR: 0.02, AP: 0.02,
};

function estimateTollByDistance(distanciaKm, ufOrigem, ufDestino) {
    const rateOrigem = TOLL_RATE_PER_KM_BY_UF[ufOrigem] || 0.10;
    const rateDestino = TOLL_RATE_PER_KM_BY_UF[ufDestino] || 0.10;
    const avgRate = (rateOrigem + rateDestino) / 2;
    return round(distanciaKm * avgRate);
}

// ============================================================
// RANKING WEIGHTS
// ============================================================
const RANKING_WEIGHTS = {
    'full-operational': {
        custoDirecto: 0.30,
        custoOperacional: 0.25,
        tempo: 0.25,
        custoBeneficio: 0.20,
    },
    'logistics-labor': {
        custoDirecto: 0.25,
        custoOperacional: 0.30,
        tempo: 0.25,
        custoBeneficio: 0.20,
    },
    'logistics': {
        custoDirecto: 0.45,
        custoOperacional: 0.00,
        tempo: 0.35,
        custoBeneficio: 0.20,
    },
};

const OPTIMIZATION_MODE_LABELS = {
    'logistics': 'Logistics Only',
    'logistics-labor': 'Logistics + Labor Cost',
    'full-operational': 'Full Operational Cost',
};

// ============================================================
// OPERATIONAL PARAMETERS
// ============================================================
const OPERATIONAL_DEFAULTS = {
    custoHospedagemDia: 150,
    custoAlimentacaoDia: 80,
    custoDeslocamentoLocalDia: 40,
    horasNormaisDia: 8,
    horasExtra50Dia: 2,
    horasExtra100Dia: 0,
    horasNoturnasDia: 0,
    diasCampo: 5,
};

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

/**
 * Full routing intelligence analysis — NEVER returns failure for missing routes.
 * When a direct route is unavailable, it automatically generates multimodal alternatives.
 */
export async function analyzeRoutingIntelligence(params) {
    const {
        origem,
        destino,
        collaborators = [],
        diasCampo = 5,
        apenasDesmobilizacao = false,
        dateFilters = {},
        vehicleConfig = null,
        operational = {},
        onProgress = () => {},
    } = params;

    const optimizationMode = params.optimizationMode || 'full-operational';
    const ops = { ...OPERATIONAL_DEFAULTS, ...operational, diasCampo, apenasDesmobilizacao };

    // -------------------------------------------------------
    // PHASE 1: Try direct route lookup (existing DB)
    // -------------------------------------------------------
    onProgress('Buscando rota direta na base de dados...');
    let route = getRouteIntelligence(origem, destino);
    let multimodalExploration = null;
    let usedMultimodal = false;

    // -------------------------------------------------------
    // PHASE 2: If no direct route, use multimodal scenario builder
    // -------------------------------------------------------
    if (!route) {
        onProgress('Rota direta nao encontrada. Ativando motor multimodal...');
        usedMultimodal = true;

        // Build location context for origin and destination
        onProgress('Analisando contexto da origem (aeroportos, hubs, terminais)...');
        const originCtx = buildLocationContext(origem);

        onProgress('Analisando contexto do destino (aeroportos, hubs, terminais)...');
        const destCtx = buildLocationContext(destino);

        // Generate all viable multimodal scenarios
        onProgress('Gerando cenarios multimodais (voo+carro, voo+onibus, direto, misto)...');
        multimodalExploration = generateMultimodalScenarios(originCtx, destCtx, (msg) => onProgress(msg));

        if (multimodalExploration.scenarios.length > 0) {
            // Convert scenarios to route format compatible with existing engine
            route = convertScenariosToRouteFormat(multimodalExploration.scenarios, multimodalExploration.directDistanceKm);
            route.origem = origem;
            route.destino = destino;
            onProgress(`${multimodalExploration.totalScenariosViable} cenario(s) multimodal(is) viavel(is) gerado(s)`);
        } else {
            // Even if multimodal builder couldn't find viable estimated scenarios,
            // DON'T stop here — continue to real-time API search which may find options
            // Only return early if distance is 0 (coordinates not found)
            if (!multimodalExploration?.directDistanceKm) {
                return {
                    success: true,
                    noAlternativesFound: true,
                    origem,
                    destino,
                    distanciaKm: 0,
                    estimado: true,
                    multimodal: true,
                    alternatives: [],
                    rankings: { geral: [], menorCustoDireto: [], menorCustoOperacional: [], menorTempo: [], melhorCustoBeneficio: [] },
                    executive: {
                        paragraphs: [
                            `**Rota analisada:** ${origem} → ${destino}. Nenhuma rota direta simples encontrada.`,
                            `**Exploração multimodal concluída:** O motor explorou rotas diretas, aeroportos próximos, hubs regionais e composições multimodais. Nenhuma alternativa viável encontrada nos parâmetros atuais.`,
                            `**Sugestão:** Verifique se as cidades informadas estão corretas. Para destinos remotos, considere opções de fretamento.`,
                        ],
                        melhor: null,
                        scoreTotal: 0,
                        totalAlternativas: 0,
                    },
                    explorationLog: multimodalExploration?.explorationLog || [],
                    params: ops,
                    qtdColaboradores: collaborators.length,
                    optimizationMode,
                    optimizationModeLabel: OPTIMIZATION_MODE_LABELS[optimizationMode],
                };
            }
            // Build a minimal route with just the distance so real-time APIs can still be tried
            route = {
                origem, destino,
                distanciaKm: multimodalExploration.directDistanceKm,
                estimado: true, multimodal: true,
                bus: { alternativas: [] },
                air: { alternativas: [] },
                vehicle: null,
            };
            onProgress('Cenarios estimados insuficientes. Consultando APIs em tempo real...');
        }
    }

    const cityOrigem = getCityInfoFuzzy(origem) || getCityInfo(origem);
    const cityDestino = getCityInfoFuzzy(destino) || getCityInfo(destino);

    // Build all alternatives
    const alternatives = [];
    let realtimeFlights = null;
    let realtimeBus = null;
    let busSource = 'static';

    // -------------------------------------------------------
    // PHASE 3: Build bus alternatives — real-time API + static
    // Provider-level resilience: never stop the search if bus fails
    // -------------------------------------------------------

    // 3a. Try real-time Quero Passagem API
    if (await isBusApiEnabled()) {
        try {
            const busOptions = {};
            if (dateFilters.dataIda) busOptions.travelDate = dateFilters.dataIda;
            if (collaborators.length > 0) busOptions.passengers = collaborators.length;

            onProgress('Consultando Quero Passagem em tempo real...');
            const busResults = await searchBusTrips(origem, destino, busOptions);

            if (busResults.success && busResults.trips.length > 0) {
                realtimeBus = busResults;
                busSource = 'realtime';
                const liveAlts = convertBusToAlternatives(busResults);
                const busPurchaseOptions = getBusPurchaseOptions(busResults);

                liveAlts.forEach((alt, idx) => {
                    const tempoTotal = alt.tempoTotalPortaPortaH || (alt.tempoTotalH + (alt.tempoEspera || 0));
                    alternatives.push(buildAlternative({
                        id: `bus-live-${idx}`,
                        tipo: 'Ônibus',
                        icon: '🚌',
                        descricao: alt.descricao,
                        custoTransporte: alt.custoTotal,
                        tempoViagemH: tempoTotal,
                        detalhes: {
                            trechos: alt.trechos,
                            baldeacoes: alt.baldeacoes || 0,
                            tempoEspera: alt.tempoEspera || 0,
                            tempoViagem: alt.tempoTotalH,
                            operadores: alt.operadores || [],
                            tipoServico: alt.tipo,
                            assentosDisponiveis: alt.assentosDisponiveis,
                            horarioPartida: alt.horarioPartida,
                            horarioChegada: alt.horarioChegada,
                            permiteCancelamento: alt.permiteCancelamento,
                            precoDetalhado: alt.precoDetalhado,
                            opcoes: alt.opcoes,
                            totalOpcoes: alt.totalOpcoes,
                            travelId: alt.travelId,
                            purchaseUrl: alt.purchaseUrl || null,
                            fonte: 'quero_passagem',
                            fonteLabel: 'Quero Passagem',
                            ultimaAtualizacao: alt.ultimaAtualizacao || new Date().toISOString(),
                        },
                        strengths: alt.baldeacoes === 0
                            ? ['Rota direta sem baldeacao', 'Preco em tempo real', 'Compra online disponivel']
                            : ['Preco em tempo real', 'Compra online disponivel'],
                        limitations: tempoTotal > 12
                            ? ['Viagem longa — fadiga operacional', 'Horarios fixos']
                            : ['Horarios fixos', 'Sem flexibilidade de parada'],
                        collaborators,
                        ops,
                        distanciaKm: route.distanciaKm,
                    }));
                });

                const connInfo = busResults.connectionTrips > 0
                    ? ` (${busResults.directTrips} direto(s) + ${busResults.connectionTrips} com conexao)`
                    : '';
                onProgress(`${liveAlts.length} opcao(oes) de onibus em tempo real encontrada(s)${connInfo}!`);
            } else {
                onProgress(`Quero Passagem: ${busResults.message || 'sem resultados diretos'}. Continuando busca com dados locais...`);
            }
        } catch (err) {
            onProgress(`Erro na API de onibus (${err.message}). Continuando com dados locais...`);
        }
    }

    // 3b. Fallback to static bus alternatives if no real-time data
    if (busSource === 'static' && route.bus && route.bus.alternativas) {
        route.bus.alternativas.forEach((alt, idx) => {
            const tempoTotal = alt.tempoTotalH + (alt.tempoEspera || 0);
            alternatives.push(buildAlternative({
                id: `bus-${idx}`,
                tipo: 'Ônibus',
                icon: '🚌',
                descricao: alt.descricao,
                custoTransporte: alt.custoTotal,
                tempoViagemH: tempoTotal,
                detalhes: {
                    trechos: alt.trechos,
                    baldeacoes: alt.baldeacoes,
                    tempoEspera: alt.tempoEspera || 0,
                    tempoViagem: alt.tempoTotalH,
                    operadores: [...new Set(alt.trechos.flatMap(t => t.operadores || []))],
                    tipoServico: alt.trechos.map(t => t.tipo).join(' + '),
                    fonte: 'static',
                    fonteLabel: 'Base de dados local',
                },
                strengths: ['Dados pre-calculados disponiveis'],
                limitations: ['Precos estimados (nao em tempo real)', 'Horarios nao confirmados'],
                collaborators,
                ops,
                distanciaKm: route.distanciaKm,
            }));
        });
    }

    // -------------------------------------------------------
    // PHASE 4: Air alternatives — real-time API + static + multimodal hub flights
    // Provider-level resilience: never stop the search if flights fail
    // -------------------------------------------------------
    onProgress('Consultando alternativas aereas...');
    let airSource = 'static';
    let flightPriceInsights = null;

    // 4a. Try real-time flights API (direct route)
    if (isFlightsApiEnabled()) {
        try {
            const flightOptions = {
                adultos: collaborators.length || 1,
            };
            if (dateFilters.dataIda) flightOptions.dataIda = dateFilters.dataIda;
            if (dateFilters.dataVolta) flightOptions.dataVolta = dateFilters.dataVolta;

            onProgress('Consultando Google Flights em tempo real...');
            const flightResults = await searchFlights(origem, destino, flightOptions);

            // Extract price insights regardless of flight results
            flightPriceInsights = getFlightPriceInsights(flightResults);

            if (flightResults.success) {
                realtimeFlights = flightResults;
                airSource = 'realtime';
                const liveAlts = convertToAlternatives(flightResults);
                const bookingOpts = getFlightBookingOptions(flightResults);

                liveAlts.forEach((alt, idx) => {
                    alternatives.push(buildAlternative({
                        id: `air-live-${idx}`,
                        tipo: 'Aéreo',
                        icon: '✈️',
                        descricao: alt.descricao,
                        custoTransporte: alt.custoTotal,
                        tempoViagemH: alt.tempoTotalPortaPortaH,
                        detalhes: {
                            trechos: alt.trechos,
                            conexoes: alt.conexoes,
                            tempoConexao: alt.tempoConexaoH,
                            deslocamentoOrigem: alt.deslocamentoAeroportoOrigemH,
                            deslocamentoDestino: alt.deslocamentoAeroportoDestinoH,
                            trechoTerrestre: null,
                            cias: [...new Set(alt.trechos.map(t => t.cia))],
                            layovers: alt.layovers,
                            precoMinimo: alt.precoMinimo,
                            precoMaximo: alt.precoMaximo,
                            opcoes: alt.opcoes,
                            emissaoCarbono: alt.emissaoCarbono,
                            fonte: 'realtime',
                            fonteLabel: 'Google Flights via SerpAPI',
                            dataConsulta: alt.dataConsulta,
                            bookingOptions: alt.bookingOptions || [],
                            bookingToken: alt.bookingToken || null,
                            aeroportoOrigem: alt.aeroportoOrigem,
                            aeroportoDestino: alt.aeroportoDestino,
                            priceInsights: flightPriceInsights,
                            googleFlightsUrl: flightResults.searchMetadata?.googleFlightsUrl || null,
                        },
                        strengths: [
                            'Mais rapido para longas distancias',
                            'Menor fadiga operacional',
                            alt.bookingOptions?.length > 0 ? 'Reserva online disponivel' : null,
                        ].filter(Boolean),
                        limitations: [
                            'Custo mais alto por pessoa',
                            'Dependencia de horarios de voo',
                            alt.conexoes > 0 ? 'Requer conexao' : null,
                        ].filter(Boolean),
                        collaborators,
                        ops,
                        distanciaKm: route.distanciaKm,
                    }));
                });

                onProgress(`${liveAlts.length} voo(s) em tempo real encontrado(s)!`);
            } else {
                onProgress(`Voo direto nao encontrado. Explorando aeroportos alternativos...`);

                // 4b. Try searching flights to nearby hub airports (for multimodal routes)
                // Do this ALWAYS when direct flight fails, not just for multimodal routes
                if (usedMultimodal && multimodalExploration) {
                    await searchHubFlights(origem, destino, multimodalExploration, flightOptions, alternatives, collaborators, ops, route.distanciaKm, onProgress);
                }
            }
        } catch (err) {
            onProgress(`Erro na API de voos (${err.message}). Continuando com dados locais...`);
        }
    }

    // 4c. Fallback to static air alternatives if no real-time data
    if (airSource === 'static' && route.air && route.air.alternativas) {
        route.air.alternativas.forEach((alt, idx) => {
            const isMultimodal = !!alt.trechoTerrestreFinal;
            alternatives.push(buildAlternative({
                id: `air-${idx}`,
                tipo: isMultimodal ? 'Aéreo + Terrestre' : 'Aéreo',
                icon: isMultimodal ? '✈️🚗' : '✈️',
                descricao: alt.descricao,
                custoTransporte: alt.custoTotal,
                tempoViagemH: alt.tempoTotalPortaPortaH,
                detalhes: {
                    trechos: alt.trechos,
                    conexoes: alt.conexoes,
                    tempoConexao: alt.tempoConexaoH,
                    deslocamentoOrigem: alt.deslocamentoAeroportoOrigemH,
                    deslocamentoDestino: alt.deslocamentoAeroportoDestinoH,
                    trechoTerrestre: alt.trechoTerrestreFinal || null,
                    cias: [...new Set(alt.trechos.map(t => t.cia))],
                    fonte: 'static',
                    fonteLabel: 'Base de dados local',
                },
                strengths: isMultimodal
                    ? ['Combina velocidade aerea com acesso terrestre', 'Ideal para destinos sem aeroporto']
                    : ['Mais rapido para longas distancias', 'Menor fadiga'],
                limitations: isMultimodal
                    ? ['Precos estimados', 'Requer transfer terrestre apos o voo']
                    : ['Precos estimados', 'Horarios nao confirmados'],
                collaborators,
                ops,
                distanciaKm: route.distanciaKm,
            }));
        });
    }

    // -------------------------------------------------------
    // PHASE 5: Vehicle alternative
    // -------------------------------------------------------
    if (route.vehicle) {
        const veh = route.vehicle;

        // Auto-calculate tolls via Google Routes API v2, with smart fallback
        let autoPedagios = 0;
        let pedagioSource = 'estimated';

        if (cityOrigem?.lat && cityDestino?.lat) {
            onProgress('Calculando pedagios via Google Routes API...');
            try {
                const tollResult = await fetchTollCost(
                    { lat: cityOrigem.lat, lng: cityOrigem.lng },
                    { lat: cityDestino.lat, lng: cityDestino.lng },
                );
                if (tollResult.success && tollResult.tollCostBRL > 0) {
                    autoPedagios = tollResult.tollCostBRL;
                    pedagioSource = 'google_routes_api';
                    onProgress(`Pedagios calculados: R$ ${autoPedagios.toFixed(2)} (Google Routes API)`);
                }
            } catch {
                // API unavailable — will use estimation below
            }
        }

        // Fallback: estimate tolls based on distance and region
        if (autoPedagios === 0 && veh.distanciaKm > 0) {
            const ufOrigem = cityOrigem?.uf || '';
            const ufDestino = cityDestino?.uf || '';
            autoPedagios = estimateTollByDistance(veh.distanciaKm, ufOrigem, ufDestino);
            pedagioSource = 'estimated';
            onProgress(`Pedagios estimados: R$ ${autoPedagios.toFixed(2)} (baseado em ${veh.distanciaKm} km)`);
        }

        // Apply custom vehicle config if provided
        let vehicleCost = veh.custoTotalVeiculo;
        let vehicleDetails = {
            distanciaKm: veh.distanciaKm,
            tempoEstimadoH: veh.tempoEstimadoH,
            combustivel: veh.combustivelEstimado,
            pedagios: autoPedagios,
            pedagioSource,
            aluguel: veh.custoAluguel,
            consumoMedioKmL: veh.consumoMedioKmL,
            precoLitro: veh.precoLitro,
            diasEstimados: veh.diasEstimados,
            trechos: veh.trecho,
            categoriaCustom: null,
        };

        // Recalculate base cost with auto tolls
        vehicleCost = round((veh.combustivelEstimado || 0) + (veh.custoAluguel || 0) + autoPedagios);

        if (vehicleConfig) {
            const distKm = veh.distanciaKm;
            const consumoKmL = vehicleConfig.consumoKmL;
            const precoLitro = vehicleConfig.precoLitro;
            const combustivel = round((distKm / consumoKmL) * precoLitro);
            const diasEstimados = veh.diasEstimados || Math.ceil(veh.tempoEstimadoH / 10);
            const aluguel = round(vehicleConfig.aluguelDia * diasEstimados);
            const pedagios = autoPedagios;
            vehicleCost = round(combustivel + aluguel + pedagios);

            vehicleDetails = {
                ...vehicleDetails,
                combustivel,
                pedagios,
                pedagioSource,
                aluguel,
                consumoMedioKmL: consumoKmL,
                precoLitro,
                categoriaCustom: vehicleConfig.categoria,
            };
        }

        alternatives.push(buildAlternative({
            id: 'vehicle-0',
            tipo: 'Veículo/Frota',
            icon: '🚗',
            descricao: veh.rotaDescricao,
            custoTransporte: vehicleCost,
            tempoViagemH: veh.tempoEstimadoH,
            isVehicle: true,
            detalhes: vehicleDetails,
            strengths: [
                'Flexibilidade total de horario e paradas',
                'Porta a porta sem transferencias',
                'Custo compartilhado entre a equipe',
                collaborators.length > 2 ? 'Custo-eficiente para equipes grandes' : null,
            ].filter(Boolean),
            limitations: [
                veh.tempoEstimadoH > 8 ? 'Fadiga do motorista em viagens longas' : null,
                veh.tempoEstimadoH > 12 ? 'Risco rodoviario elevado' : null,
                'Custo de combustivel e pedagios',
                'Dependencia de condicoes da estrada',
            ].filter(Boolean),
            collaborators,
            ops,
            distanciaKm: route.distanciaKm,
            custoVeiculoCompartilhado: true,
        }));
    }

    // -------------------------------------------------------
    // PHASE 6: Score, rank, and recommend
    // -------------------------------------------------------
    if (alternatives.length === 0) {
        return {
            success: true,
            noAlternativesFound: true,
            origem,
            destino,
            distanciaKm: route.distanciaKm || 0,
            estimado: true,
            multimodal: usedMultimodal,
            alternatives: [],
            rankings: { geral: [], menorCustoDireto: [], menorCustoOperacional: [], menorTempo: [], melhorCustoBeneficio: [] },
            executive: {
                paragraphs: [
                    `**Rota analisada:** ${origem} → ${destino} (${route.distanciaKm || '?'} km).`,
                    `**Exploração multimodal concluída:** Nenhuma rota direta simples encontrada. O motor de inteligência explorou rotas rodoviárias, aeroportos próximos (${multimodalExploration?.originContext?.nearbyAirportsCount || 0} na origem, ${multimodalExploration?.destinationContext?.nearbyAirportsCount || 0} no destino), hubs regionais e composições multimodais.`,
                    `**Este destino requer composição regional de acesso.** Nenhuma alternativa viável foi identificada dentro dos parâmetros de tempo e custo aceitáveis. Considere verificar as cidades informadas ou explorar opções de fretamento para destinos muito remotos.`,
                ],
                melhor: null,
                scoreTotal: 0,
                totalAlternativas: 0,
            },
            explorationLog: multimodalExploration?.explorationLog || [],
            params: ops,
            qtdColaboradores: collaborators.length,
            optimizationMode,
            optimizationModeLabel: OPTIMIZATION_MODE_LABELS[optimizationMode],
        };
    }

    onProgress('Calculando scores e gerando recomendacao...');
    const scored = scoreAlternatives(alternatives, optimizationMode);
    const rankings = generateRankings(scored);
    const executive = generateExecutiveRecommendation(scored, rankings, route, ops, collaborators.length, optimizationMode, usedMultimodal);

    return {
        success: true,
        origem,
        destino,
        distanciaKm: route.distanciaKm,
        estimado: route.estimado || false,
        multimodal: usedMultimodal || route.multimodal || false,
        cityOrigem,
        cityDestino,
        route,
        alternatives: scored,
        rankings,
        executive,
        params: ops,
        qtdColaboradores: collaborators.length,
        airSource,
        busSource,
        realtimeFlights,
        realtimeBus,
        flightPriceInsights,
        optimizationMode,
        optimizationModeLabel: OPTIMIZATION_MODE_LABELS[optimizationMode],
        explorationLog: multimodalExploration?.explorationLog || [],
        totalAlternativas: scored.length,
        // Provider metadata for source transparency
        providers: {
            flights: {
                source: airSource,
                label: airSource === 'realtime' ? 'Google Flights via SerpAPI' : 'Base de dados local',
                priceInsights: flightPriceInsights,
            },
            bus: {
                source: busSource,
                label: busSource === 'realtime' ? 'Quero Passagem' : 'Base de dados local',
            },
            tolls: {
                label: 'Google Routes API v2',
            },
        },
    };
}

// ============================================================
// HUB FLIGHT SEARCH — Search flights to nearby airports
// ============================================================

async function searchHubFlights(origem, destino, exploration, flightOptions, alternatives, collaborators, ops, distanciaKm, onProgress) {
    // If destination has nearby airports we can fly into, try those
    const destCtx = exploration.destinationContext;
    const originCtx = exploration.originContext;

    if (destCtx.nearbyAirportsCount === 0 && originCtx.nearbyAirportsCount === 0) return;

    // Rebuild contexts to get actual airport data
    const originContext = buildLocationContext(origem);
    const destContext = buildLocationContext(destino);

    // Try flying to nearby airports of the destination
    const nearbyDestAirports = destContext.nearbyAirports?.filter(a => a.distanceKm > 0 && a.distanceKm < 400) || [];

    for (const destAP of nearbyDestAirports.slice(0, 2)) {
        try {
            onProgress(`Buscando voos para ${destAP.city.nome} (aeroporto proximo ao destino)...`);
            const hubFlightResults = await searchFlights(origem, destAP.city.nome, flightOptions);

            if (hubFlightResults.success) {
                const hubAlts = convertToAlternatives(hubFlightResults);

                hubAlts.forEach((alt, idx) => {
                    const groundTransferH = destAP.estimatedTransferH;
                    const groundTransferKm = destAP.distanceKm;
                    const totalDoorToDoor = alt.tempoTotalPortaPortaH + groundTransferH + 1; // +1h for transfer

                    alternatives.push(buildAlternative({
                        id: `air-hub-${destAP.airports[0]}-${idx}`,
                        tipo: 'Aéreo + Terrestre',
                        icon: '✈️🚗',
                        descricao: `${alt.descricao} + transfer ${destAP.city.nome.split(' - ')[0]} → ${destino.split(' - ')[0]} (${groundTransferKm} km)`,
                        custoTransporte: alt.custoTotal + Math.round(groundTransferKm * 0.59), // Flight + fuel
                        tempoViagemH: totalDoorToDoor,
                        detalhes: {
                            trechos: alt.trechos,
                            conexoes: alt.conexoes,
                            tempoConexao: alt.tempoConexaoH,
                            deslocamentoOrigem: alt.deslocamentoAeroportoOrigemH,
                            deslocamentoDestino: groundTransferH,
                            trechoTerrestre: {
                                tipo: 'carro_alugado',
                                de: destAP.city.nome,
                                para: destino,
                                distanciaKm: groundTransferKm,
                                tempoH: groundTransferH,
                            },
                            cias: [...new Set(alt.trechos.map(t => t.cia))],
                            fonte: 'realtime',
                            fonteLabel: 'Google Flights via SerpAPI',
                            dataConsulta: alt.dataConsulta,
                            bookingOptions: alt.bookingOptions || [],
                            aeroportoOrigem: alt.aeroportoOrigem,
                            aeroportoDestino: alt.aeroportoDestino || destAP.airports[0],
                        },
                        strengths: [
                            'Combina velocidade aerea com acesso terrestre ao destino',
                            `Economiza tempo vs rota 100% terrestre`,
                            alt.bookingOptions?.length > 0 ? 'Reserva online disponivel' : null,
                        ].filter(Boolean),
                        limitations: [
                            `Requer ${groundTransferKm} km de transfer terrestre apos o voo`,
                            'Custo do aluguel de veiculo no destino',
                        ],
                        collaborators,
                        ops,
                        distanciaKm,
                    }));
                });

                onProgress(`${hubAlts.length} voo(s) via ${destAP.city.nome} encontrado(s)!`);
            }
        } catch {
            // Continue with other airports
        }
    }
}

// ============================================================
// BUILD ALTERNATIVE
// ============================================================

function buildAlternative({ id, tipo, icon, descricao, custoTransporte, tempoViagemH, detalhes, collaborators, ops, distanciaKm, isVehicle = false, custoVeiculoCompartilhado = false, strengths = [], limitations = [] }) {
    const qtd = collaborators.length || 1;

    const isDesmob = ops.apenasDesmobilizacao;

    // Transport cost per person (vehicle cost is shared)
    const custoTransportePessoa = custoVeiculoCompartilhado
        ? custoTransporte / qtd
        : custoTransporte;

    const custoTransporteTotal = custoVeiculoCompartilhado
        ? custoTransporte
        : custoTransporte * qtd;

    // Demobilization = one-way only; normal = round trip
    const tempoIdaVoltaH = isDesmob ? tempoViagemH : tempoViagemH * 2;

    // Calculate labor costs for all collaborators
    let custoMaoObraTotal = 0;
    let custoTransitoTotal = 0;
    const detalhesColaboradores = collaborators.map(collab => {
        const rates = calcHourlyRates(collab);

        const hours = isDesmob ? {
            horasNormais: 0,
            horasExtra50: 0,
            horasExtra100: 0,
            horasNoturnas: 0,
        } : {
            horasNormais: ops.horasNormaisDia * ops.diasCampo,
            horasExtra50: (ops.horasExtra50Dia || 0) * ops.diasCampo,
            horasExtra100: (ops.horasExtra100Dia || 0) * ops.diasCampo,
            horasNoturnas: (ops.horasNoturnasDia || 0) * ops.diasCampo,
        };
        const labor = calcLaborCost(rates, hours);
        const travel = calcTravelCost(rates, tempoViagemH, !isDesmob);

        custoMaoObraTotal += labor.custoTotalHoras;
        custoTransitoTotal += travel.custoTransito;

        return { colaborador: collab.nome, cargo: collab.cargo, rates, labor, travel };
    });

    // Per diem costs (zero in demobilization mode)
    const custoHospedagem = isDesmob ? 0 : ops.custoHospedagemDia * ops.diasCampo * qtd;
    const custoAlimentacao = isDesmob ? 0 : ops.custoAlimentacaoDia * ops.diasCampo * qtd;
    const custoDeslocamentoLocal = isDesmob ? 0 : (ops.custoDeslocamentoLocalDia || 0) * ops.diasCampo * qtd;

    // Overtime impact from travel hours
    const avgRate = collaborators.length > 0
        ? collaborators.reduce((s, c) => s + calcHourlyRates(c).horaExtra50, 0) / collaborators.length
        : 0;
    const horasExtraViagem = Math.max(0, tempoIdaVoltaH - (isDesmob ? 8 : 16));
    const impactoHorasExtras = horasExtraViagem * avgRate * qtd;

    // Night shift impact (bus trips > 8h usually travel overnight)
    const avgNightRate = collaborators.length > 0
        ? collaborators.reduce((s, c) => s + calcHourlyRates(c).horaNoturna, 0) / collaborators.length
        : 0;
    const isBusType = tipo === 'Ônibus' || tipo.toLowerCase().includes('onibus');
    const horasNoturnasCalc = isBusType && tempoViagemH > 8
        ? Math.min(tempoViagemH * 0.4, 8) * (isDesmob ? 1 : 2)
        : 0;
    const impactoNoturno = horasNoturnasCalc * avgNightRate * qtd;

    // Labor-only cost (transport + labor, no per diem)
    const custoTransporteLabor = round(
        custoTransporteTotal +
        custoMaoObraTotal +
        custoTransitoTotal +
        impactoHorasExtras +
        impactoNoturno
    );

    // Total mobilization cost
    const custoOperacionalTotal = round(
        custoTransporteTotal +
        custoMaoObraTotal +
        custoTransitoTotal +
        custoHospedagem +
        custoAlimentacao +
        custoDeslocamentoLocal +
        impactoHorasExtras +
        impactoNoturno
    );

    return {
        id,
        tipo,
        icon,
        descricao,
        tempoViagemH: round(tempoViagemH),
        tempoIdaVoltaH: round(tempoIdaVoltaH),
        custos: {
            transportePessoa: round(custoTransportePessoa),
            transporteTotal: round(custoTransporteTotal),
            maoObra: round(custoMaoObraTotal),
            transito: round(custoTransitoTotal),
            hospedagem: round(custoHospedagem),
            alimentacao: round(custoAlimentacao),
            deslocamentoLocal: round(custoDeslocamentoLocal),
            impactoHorasExtras: round(impactoHorasExtras),
            impactoNoturno: round(impactoNoturno),
            transporteLabor: custoTransporteLabor,
            operacionalTotal: custoOperacionalTotal,
        },
        detalhes,
        detalhesColaboradores,
        distanciaKm,
        isVehicle,
        strengths,
        limitations,
    };
}

// ============================================================
// SCORING & RANKING
// ============================================================

function scoreAlternatives(alternatives, optimizationMode = 'full-operational') {
    if (alternatives.length === 0) return [];

    const weights = RANKING_WEIGHTS[optimizationMode] || RANKING_WEIGHTS['full-operational'];

    const custosDiretos = alternatives.map(a => a.custos.transporteTotal);
    const custosOperacionais = alternatives.map(a =>
        optimizationMode === 'logistics-labor' ? a.custos.transporteLabor : a.custos.operacionalTotal
    );
    const tempos = alternatives.map(a => a.tempoViagemH);

    const maxCD = Math.max(...custosDiretos);
    const minCD = Math.min(...custosDiretos);
    const maxCO = Math.max(...custosOperacionais);
    const minCO = Math.min(...custosOperacionais);
    const maxT = Math.max(...tempos);
    const minT = Math.min(...tempos);

    return alternatives.map(alt => {
        const scoreCustoDireto = maxCD === minCD ? 100 :
            ((maxCD - alt.custos.transporteTotal) / (maxCD - minCD)) * 100;

        const custoOpRef = optimizationMode === 'logistics-labor' ? alt.custos.transporteLabor : alt.custos.operacionalTotal;
        const scoreCustoOperacional = maxCO === minCO ? 100 :
            ((maxCO - custoOpRef) / (maxCO - minCO)) * 100;

        const scoreTempo = maxT === minT ? 100 :
            ((maxT - alt.tempoViagemH) / (maxT - minT)) * 100;

        const horasProdutivas = alternatives[0]?.detalhesColaboradores[0]?.labor?.custoTotalHoras || 1;
        const horasComprometidas = horasProdutivas + alt.custos.transito;
        const eficiencia = horasComprometidas > 0 ? (horasProdutivas / horasComprometidas) : 0.5;
        const scoreCustoBeneficio = eficiencia * 100;

        const scoreTotal = Math.round(
            scoreCustoDireto * weights.custoDirecto +
            scoreCustoOperacional * weights.custoOperacional +
            scoreTempo * weights.tempo +
            scoreCustoBeneficio * weights.custoBeneficio
        );

        return {
            ...alt,
            scores: {
                custoDireto: Math.round(scoreCustoDireto),
                custoOperacional: Math.round(scoreCustoOperacional),
                tempo: Math.round(scoreTempo),
                custoBeneficio: Math.round(scoreCustoBeneficio),
                total: scoreTotal,
            },
        };
    });
}

function generateRankings(scored) {
    const byScore = [...scored].sort((a, b) => b.scores.total - a.scores.total);
    const byCustoDireto = [...scored].sort((a, b) => a.custos.transporteTotal - b.custos.transporteTotal);
    const byCustoOperacional = [...scored].sort((a, b) => a.custos.operacionalTotal - b.custos.operacionalTotal);
    const byTempo = [...scored].sort((a, b) => a.tempoViagemH - b.tempoViagemH);
    const byCustoBeneficio = [...scored].sort((a, b) => b.scores.custoBeneficio - a.scores.custoBeneficio);

    return {
        geral: byScore,
        menorCustoDireto: byCustoDireto,
        menorCustoOperacional: byCustoOperacional,
        menorTempo: byTempo,
        melhorCustoBeneficio: byCustoBeneficio,
    };
}

// ============================================================
// EXECUTIVE RECOMMENDATION
// ============================================================

function generateExecutiveRecommendation(scored, rankings, route, ops, qtdColaboradores, optimizationMode = 'full-operational', usedMultimodal = false) {
    const best = rankings.geral[0];
    const worst = rankings.geral[rankings.geral.length - 1];
    const cheapestDirect = rankings.menorCustoDireto[0];
    const cheapestOp = rankings.menorCustoOperacional[0];
    const fastest = rankings.menorTempo[0];
    const bestCB = rankings.melhorCustoBeneficio[0];

    const economiaDirecta = worst.custos.transporteTotal - cheapestDirect.custos.transporteTotal;
    const economiaOperacional = worst.custos.operacionalTotal - cheapestOp.custos.operacionalTotal;
    const tempoSalvo = rankings.menorTempo[rankings.menorTempo.length - 1].tempoViagemH - fastest.tempoViagemH;

    const paragraphs = [];

    // Route info with optimization mode
    const isDesmob = ops.apenasDesmobilizacao;
    const modeLabel = OPTIMIZATION_MODE_LABELS[optimizationMode];

    // Multimodal discovery notice
    if (usedMultimodal) {
        paragraphs.push(
            `**Rota complexa detectada:** Nenhuma rota direta simples encontrada para ${route.origem || ''} → ${route.destino || ''}. ` +
            `O motor de inteligencia multimodal explorou aeroportos proximos, hubs regionais e composicoes de transporte para construir **${scored.length} alternativa(s) viavel(is)**.`
        );
    }

    paragraphs.push(
        `**${isDesmob ? 'Desmobilização' : 'Rota analisada'}:** ${route.origem || best.descricao} → ${route.destino || ''} ` +
        `(${route.distanciaKm} km${route.estimado ? ', estimativa' : ''}). ` +
        `Equipe de ${qtdColaboradores} colaborador(es)${isDesmob ? ' — apenas retorno para casa (somente ida).' : `, ${ops.diasCampo} dias em campo.`} ` +
        `**Modo de otimização:** ${modeLabel}.`
    );

    // Main recommendation
    paragraphs.push(
        `**Recomendação principal:** ${best.icon} **${best.tipo} — ${best.descricao}** ` +
        `com pontuação geral de **${best.scores.total}/100**. ` +
        `Custo operacional total: **${formatCurrency(best.custos.operacionalTotal)}** ` +
        `(transporte: ${formatCurrency(best.custos.transporteTotal)}, ` +
        `tempo de viagem: ${formatHours(best.tempoViagemH)} só ida).`
    );

    // Financial analysis
    if (economiaOperacional > 0) {
        paragraphs.push(
            `**Impacto financeiro:** Economia operacional de **${formatCurrency(economiaOperacional)}** ` +
            `em relação à alternativa mais cara. ` +
            `Economia em transporte direto: **${formatCurrency(economiaDirecta)}**.`
        );
    }

    // Time analysis
    if (tempoSalvo > 1) {
        paragraphs.push(
            `**Tempo:** A opção mais rápida (${fastest.icon} ${fastest.tipo}) economiza ` +
            `**${tempoSalvo.toFixed(1)}h** de deslocamento comparado à mais lenta. ` +
            (fastest.id !== best.id
                ? `Porém, o custo operacional é ${formatCurrency(fastest.custos.operacionalTotal)} ` +
                  `vs ${formatCurrency(best.custos.operacionalTotal)} da opção recomendada.`
                : 'Esta também é a opção recomendada.')
        );
    }

    // Cost vs Speed trade-off
    if (cheapestDirect.id !== fastest.id) {
        const costDiff = fastest.custos.transporteTotal - cheapestDirect.custos.transporteTotal;
        const timeDiff = cheapestDirect.tempoViagemH - fastest.tempoViagemH;
        if (costDiff > 0 && timeDiff > 0) {
            const custoPorHoraSalva = costDiff / timeDiff;
            paragraphs.push(
                `**Custo vs Velocidade:** Cada hora economizada com ${fastest.icon} ${fastest.tipo} ` +
                `em vez de ${cheapestDirect.icon} ${cheapestDirect.tipo} custa ` +
                `**${formatCurrency(custoPorHoraSalva)}/h**. ` +
                (custoPorHoraSalva < 200
                    ? 'O investimento em velocidade é justificável considerando o custo-hora técnico da equipe.'
                    : 'Avalie se a urgência justifica o custo adicional por hora economizada.')
            );
        }
    }

    // Fatigue warning
    const busAlts = scored.filter(a => (a.tipo === 'Ônibus' || a.tipo.toLowerCase().includes('onibus')) && a.tempoViagemH > 16);
    if (busAlts.length > 0) {
        paragraphs.push(
            `**Fadiga operacional:** ${busAlts.length} alternativa(s) de ônibus excedem 16h de viagem, ` +
            `o que pode comprometer a disposição da equipe no primeiro dia de campo. ` +
            `Considere o impacto na produtividade ao optar por viagens longas de ônibus.`
        );
    }

    // Vehicle consideration
    const vehicleAlt = scored.find(a => a.isVehicle);
    if (vehicleAlt) {
        paragraphs.push(
            `**Veículo próprio/locado:** Custo compartilhado entre a equipe ` +
            `(${formatCurrency(vehicleAlt.custos.transportePessoa)}/pessoa). ` +
            `Inclui combustível (${formatCurrency(vehicleAlt.detalhes.combustivel)}), ` +
            `pedágios (${formatCurrency(vehicleAlt.detalhes.pedagios)}` +
            `${vehicleAlt.detalhes.pedagioSource === 'google_routes_api' ? ' — Google Routes API' : ' — estimativa por região'}) e ` +
            `aluguel (${formatCurrency(vehicleAlt.detalhes.aluguel)}). ` +
            `Oferece flexibilidade no destino mas adiciona fadiga ao motorista.`
        );
    }

    // Multimodal alternatives summary
    const multimodalAlts = scored.filter(a => a.tipo.includes('+') || a.tipo === 'Aéreo + Terrestre');
    if (multimodalAlts.length > 0) {
        paragraphs.push(
            `**Alternativas multimodais:** ${multimodalAlts.length} cenario(s) combinam diferentes modais de transporte ` +
            `(ex: voo + carro alugado, voo + onibus). Estas opcoes sao especialmente uteis para destinos sem aeroporto direto ` +
            `ou com acesso rodoviario limitado.`
        );
    }

    // AI operational trade-off analysis
    if (optimizationMode !== 'logistics' && cheapestDirect.id !== cheapestOp.id) {
        const directCostDiff = cheapestOp.custos.transporteTotal - cheapestDirect.custos.transporteTotal;
        const opCostDiff = cheapestDirect.custos.operacionalTotal - cheapestOp.custos.operacionalTotal;
        if (directCostDiff > 0 && opCostDiff > 0) {
            paragraphs.push(
                `**Analise de trade-off operacional:** ${cheapestOp.icon} **${cheapestOp.tipo}** tem passagem ` +
                `**${formatCurrency(directCostDiff)} mais cara** que ${cheapestDirect.icon} ${cheapestDirect.tipo}, ` +
                `porem o **custo operacional total e ${formatCurrency(opCostDiff)} menor** ` +
                `devido ao tempo de viagem reduzido e menor impacto em horas extras e fadiga. ` +
                `Uma passagem mais cara pode ser o investimento mais inteligente.`
            );
        }
    }

    // Bus vs Air operational comparison
    const busAlt = scored.find(a => a.tipo === 'Ônibus' || a.tipo.toLowerCase().includes('nibus'));
    const airAlt = scored.find(a => a.tipo === 'Aéreo' || a.tipo.toLowerCase().includes('reo'));
    if (busAlt && airAlt && optimizationMode !== 'logistics') {
        if (busAlt.custos.transporteTotal < airAlt.custos.transporteTotal &&
            busAlt.custos.operacionalTotal > airAlt.custos.operacionalTotal) {
            paragraphs.push(
                `**Onibus vs Aereo:** O onibus tem tarifa direta menor (${formatCurrency(busAlt.custos.transporteTotal)} vs ${formatCurrency(airAlt.custos.transporteTotal)}), ` +
                `mas o custo total de mobilizacao e maior (${formatCurrency(busAlt.custos.operacionalTotal)} vs ${formatCurrency(airAlt.custos.operacionalTotal)}) ` +
                `devido ao tempo de viagem excessivo e impacto em horas extras e fadiga.`
            );
        }
    }

    return {
        melhor: best,
        pior: worst,
        maisBaratoDireto: cheapestDirect,
        maisBaratoOperacional: cheapestOp,
        maisRapido: fastest,
        melhorCustoBeneficio: bestCB,
        economiaDirecta,
        economiaOperacional,
        tempoSalvo,
        paragraphs,
        veredicto: `${best.icon} ${best.tipo}`,
        scoreTotal: best.scores.total,
        totalAlternativas: scored.length,
        optimizationMode,
        optimizationModeLabel: modeLabel,
    };
}

// ============================================================
// HELPERS
// ============================================================

function round(val) {
    return Math.round(val * 100) / 100;
}
