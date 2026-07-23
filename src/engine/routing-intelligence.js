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
import { fetchRouteV2, fetchTollCost } from '../services/BackendApiClient.js';
import { buildLocationContext, generateMultimodalScenarios, convertScenariosToRouteFormat } from './multimodal-scenario-builder.js';

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
    horasExtra150Dia: 0,
    horasNoturnasDia: 0,
    diasCampo: 5,
};

const PROVIDER_TIMEOUT_MS = {
    bus: 9000,
    flights: 10000,
    vehicle: 6000,
    tolls: 3500,
};

async function withProviderTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timeoutId);
    }
}

function parseGoogleDurationHours(duration = '') {
    const seconds = Number(String(duration).replace('s', ''));
    return Number.isFinite(seconds) && seconds > 0
        ? Math.round((seconds / 3600) * 10) / 10
        : 0;
}

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
    onProgress('Preparando contexto da rota...');
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
    let busSource = 'unavailable';
    let vehicleSource = 'unavailable';

    // -------------------------------------------------------
    // PHASE 3: Build bus alternatives — real-time API only
    // Provider-level resilience: never stop the search if bus fails
    // -------------------------------------------------------

    // 3a. Try real-time Quero Passagem API
    if (await isBusApiEnabled()) {
        try {
            const busOptions = {};
            if (dateFilters.dataIda) busOptions.travelDate = dateFilters.dataIda;
            if (collaborators.length > 0) busOptions.passengers = collaborators.length;

            onProgress('Consultando Quero Passagem em tempo real...');
            const busResults = await withProviderTimeout(
                searchBusTrips(origem, destino, busOptions),
                PROVIDER_TIMEOUT_MS.bus,
                'Consulta de onibus',
            );

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
                onProgress(`Quero Passagem: ${busResults.message || 'sem resultados concretos para a rota'}.`);
            }
        } catch (err) {
            onProgress(`Erro na API de onibus (${err.message}). Modal onibus ignorado por falta de dado concreto.`);
        }
    } else {
        onProgress('API Quero Passagem indisponivel. Modal onibus ignorado por falta de dado concreto.');
    }

    // -------------------------------------------------------
    // PHASE 4: Air alternatives — real-time API only
    // Provider-level resilience: never stop the search if flights fail
    // -------------------------------------------------------
    onProgress('Consultando alternativas aereas...');
    let airSource = 'unavailable';
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
            const flightResults = await withProviderTimeout(
                searchFlights(origem, destino, flightOptions),
                PROVIDER_TIMEOUT_MS.flights,
                'Consulta de voos',
            );

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
                onProgress('Google Flights nao retornou voo direto concreto para esta rota.');
            }
        } catch (err) {
            onProgress(`Erro na API de voos (${err.message}). Modal aereo ignorado por falta de dado concreto.`);
        }
    } else {
        onProgress('API Google Flights/SerpAPI indisponivel. Modal aereo ignorado por falta de dado concreto.');
    }

    // -------------------------------------------------------
    // PHASE 5: Vehicle alternative — Google Routes API only
    // -------------------------------------------------------
    if (cityOrigem?.lat && cityDestino?.lat) {
        onProgress('Calculando rota de veiculo via Google Routes API...');
        try {
            const routeResult = await withProviderTimeout(
                fetchRouteV2(
                    { lat: cityOrigem.lat, lng: cityOrigem.lng },
                    { lat: cityDestino.lat, lng: cityDestino.lng },
                    { includeTolls: true, alternatives: false },
                ),
                PROVIDER_TIMEOUT_MS.vehicle,
                'Consulta de rota de veiculo',
            );
            const googleRoute = routeResult.success && routeResult.routes?.[0];
            if (!googleRoute || !googleRoute.distanceKm) {
                throw new Error(routeResult.reason || 'Google Routes nao retornou rota');
            }

            vehicleSource = 'google_routes_api';
            route.distanciaKm = googleRoute.distanceKm;

            const tempoEstimadoH = parseGoogleDurationHours(googleRoute.duration);
            const diasEstimadosGoogle = Math.max(1, Math.ceil(tempoEstimadoH / 10));

            // Toll values also come from Google Routes. If Google does not expose
            // a BRL price for this route, keep tolls as unavailable instead of estimating locally.
            let autoPedagios = 0;
            let pedagioSource = 'google_routes_api_unavailable';

            onProgress('Calculando pedagios via Google Routes API...');
            try {
                const tollResult = await withProviderTimeout(
                    fetchTollCost(
                        { lat: cityOrigem.lat, lng: cityOrigem.lng },
                        { lat: cityDestino.lat, lng: cityDestino.lng },
                    ),
                    PROVIDER_TIMEOUT_MS.tolls,
                    'Consulta de pedagios',
                );
                if (tollResult.success && tollResult.tollCostBRL > 0) {
                    autoPedagios = tollResult.tollCostBRL;
                    pedagioSource = 'google_routes_api';
                    onProgress(`Pedagios calculados: R$ ${autoPedagios.toFixed(2)} (Google Routes API)`);
                }
            } catch {
                onProgress('Google Routes nao retornou pedagio em tempo habil. Veiculo segue sem estimativa local de pedagio.');
            }

            // Apply custom vehicle config if provided
            let consumoMedioKmL = 10;
            let precoLitro = 5.5;
            let aluguelDia = 180;
            let categoriaCustom = null;
            if (vehicleConfig) {
                consumoMedioKmL = vehicleConfig.consumoKmL || consumoMedioKmL;
                precoLitro = vehicleConfig.precoLitro || precoLitro;
                aluguelDia = vehicleConfig.aluguelDia || aluguelDia;
                categoriaCustom = vehicleConfig.categoria || null;
            }

            const combustivel = round((googleRoute.distanceKm / consumoMedioKmL) * precoLitro);
            const aluguel = round(aluguelDia * diasEstimadosGoogle);
            const vehicleCost = round(combustivel + aluguel + autoPedagios);
            const vehicleDetails = {
                distanciaKm: googleRoute.distanceKm,
                tempoEstimadoH,
                pedagios: autoPedagios,
                pedagioSource,
                pedagiosDisponiveis: pedagioSource === 'google_routes_api',
                combustivel,
                aluguel,
                consumoMedioKmL,
                precoLitro,
                diasEstimados: diasEstimadosGoogle,
                trechos: [],
                categoriaCustom,
                fonte: 'google_routes_api',
                fonteLabel: 'Google Routes API',
            };

            alternatives.push(buildAlternative({
                id: 'vehicle-0',
                tipo: 'Veículo/Frota',
                icon: '🚗',
                descricao: `${origem} → ${destino} (Google Routes API)`,
                custoTransporte: vehicleCost,
                tempoViagemH: tempoEstimadoH,
                isVehicle: true,
                detalhes: vehicleDetails,
                strengths: [
                    'Rota calculada via Google Routes API',
                    'Flexibilidade total de horario e paradas',
                    'Porta a porta sem transferencias',
                    'Custo compartilhado entre a equipe',
                    collaborators.length > 2 ? 'Custo-eficiente para equipes grandes' : null,
                ].filter(Boolean),
                limitations: [
                    tempoEstimadoH > 8 ? 'Fadiga do motorista em viagens longas' : null,
                    tempoEstimadoH > 12 ? 'Risco rodoviario elevado' : null,
                    pedagioSource !== 'google_routes_api' ? 'Google Routes nao retornou valor de pedagio para esta consulta' : null,
                    'Custo de combustivel e pedagios',
                    'Dependencia de condicoes da estrada',
                ].filter(Boolean),
                collaborators,
                ops,
                distanciaKm: googleRoute.distanceKm,
                custoVeiculoCompartilhado: true,
            }));
        } catch (err) {
            onProgress(`Erro na Google Routes API (${err.message}). Modal veiculo ignorado por falta de dado concreto.`);
        }
    } else {
        onProgress('Coordenadas indisponiveis. Modal veiculo ignorado por falta de dado concreto.');
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
                    `**Consulta com dados concretos:** Quero Passagem, Google Flights/SerpAPI e Google Routes nao retornaram alternativas utilizaveis dentro do limite de resposta.`,
                    `**Sem fallback local:** nenhuma alternativa estimada ou defasada foi usada no ranking. Verifique as credenciais/provedores ou tente outra data/rota.`,
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
                label: airSource === 'realtime' ? 'Google Flights via SerpAPI' : 'Indisponivel',
                priceInsights: flightPriceInsights,
            },
            bus: {
                source: busSource,
                label: busSource === 'realtime' ? 'Quero Passagem' : 'Indisponivel',
            },
            vehicle: {
                source: vehicleSource,
                label: vehicleSource === 'google_routes_api' ? 'Google Routes API' : 'Indisponivel',
            },
            tolls: {
                label: 'Google Routes API v2',
            },
        },
    };
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
            horasExtra150: 0,
            horasNoturnas: 0,
        } : {
            horasNormais: ops.horasNormaisDia * ops.diasCampo,
            horasExtra50: (ops.horasExtra50Dia || 0) * ops.diasCampo,
            horasExtra100: (ops.horasExtra100Dia || 0) * ops.diasCampo,
            horasExtra150: (ops.horasExtra150Dia || 0) * ops.diasCampo,
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
