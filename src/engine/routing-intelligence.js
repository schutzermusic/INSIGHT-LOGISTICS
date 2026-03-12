/**
 * Routing Intelligence Engine
 * AI-powered logistics recommendation engine that:
 * - Analyzes all viable travel alternatives (bus, air, car)
 * - Calculates total mobilization cost (transport + labor + operational)
 * - Ranks options by cost, time, and cost-benefit
 * - Generates executive recommendations with justification
 *
 * Architecture supports future external API integration
 */
import { getRouteIntelligence, getCityInfo } from './routes-intelligence-db.js';
import { calcHourlyRates, calcLaborCost, calcTravelCost, formatCurrency, formatHours } from './calculator.js';
import { searchFlights, convertToAlternatives, isFlightsApiEnabled } from './flights-api.js';

// ============================================================
// RANKING WEIGHTS
// ============================================================
const RANKING_WEIGHTS = {
    custoDirecto: 0.30,      // Direct transport cost
    custoOperacional: 0.25,  // Total operational cost (transport + labor + per diem)
    tempo: 0.25,             // Travel time
    custoBeneficio: 0.20,    // Cost-benefit ratio
};

// ============================================================
// OPERATIONAL PARAMETERS
// ============================================================
const OPERATIONAL_DEFAULTS = {
    custoHospedagemDia: 150,
    custoAlimentacaoDia: 80,
    custoDeslocamentoLocalDia: 40,   // Uber/taxi at destination
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
 * Full routing intelligence analysis
 * @param {Object} params
 * @param {string} params.origem - Origin city
 * @param {string} params.destino - Destination city
 * @param {Array} params.collaborators - Team members
 * @param {number} params.diasCampo - Field days
 * @param {Object} params.operational - Operational parameters override
 * @returns {Object} Complete intelligence analysis
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

    const ops = { ...OPERATIONAL_DEFAULTS, ...operational, diasCampo, apenasDesmobilizacao };
    const route = getRouteIntelligence(origem, destino);

    if (!route) {
        return {
            success: false,
            error: 'Não foi possível encontrar ou estimar a rota. Verifique as cidades informadas.',
            origem,
            destino,
        };
    }

    const cityOrigem = getCityInfo(origem);
    const cityDestino = getCityInfo(destino);

    // Build all alternatives
    const alternatives = [];
    let realtimeFlights = null;

    // 1. Bus alternatives
    if (route.bus && route.bus.alternativas) {
        route.bus.alternativas.forEach((alt, idx) => {
            const tempoTotal = alt.tempoTotalH + alt.tempoEspera;
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
                    tempoEspera: alt.tempoEspera,
                    tempoViagem: alt.tempoTotalH,
                    operadores: [...new Set(alt.trechos.flatMap(t => t.operadores))],
                    tipoServico: alt.trechos.map(t => t.tipo).join(' + '),
                },
                collaborators,
                ops,
                distanciaKm: route.distanciaKm,
            }));
        });
    }

    // 2. Air alternatives — Try real-time API first, fallback to static
    onProgress('Consultando Google Flights em tempo real...');
    let airSource = 'static';

    if (isFlightsApiEnabled()) {
        try {
            const flightOptions = {
                adultos: collaborators.length || 1,
            };
            if (dateFilters.dataIda) flightOptions.dataIda = dateFilters.dataIda;
            if (dateFilters.dataVolta) flightOptions.dataVolta = dateFilters.dataVolta;

            const flightResults = await searchFlights(origem, destino, flightOptions);

            if (flightResults.success) {
                realtimeFlights = flightResults;
                airSource = 'realtime';
                const liveAlts = convertToAlternatives(flightResults);

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
                            dataConsulta: alt.dataConsulta,
                        },
                        collaborators,
                        ops,
                        distanciaKm: route.distanciaKm,
                    }));
                });

                onProgress(`${liveAlts.length} voo(s) em tempo real encontrado(s)!`);
            } else {
                onProgress(`API sem resultados: ${flightResults.message}. Usando dados locais...`);
            }
        } catch (err) {
            onProgress(`Erro na API (${err.message}). Usando dados locais...`);
        }
    }

    // Fallback to static air alternatives if no real-time data
    if (airSource === 'static' && route.air && route.air.alternativas) {
        route.air.alternativas.forEach((alt, idx) => {
            alternatives.push(buildAlternative({
                id: `air-${idx}`,
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
                    trechoTerrestre: alt.trechoTerrestreFinal,
                    cias: [...new Set(alt.trechos.map(t => t.cia))],
                    fonte: 'static',
                },
                collaborators,
                ops,
                distanciaKm: route.distanciaKm,
            }));
        });
    }

    // 3. Vehicle alternative
    if (route.vehicle) {
        const veh = route.vehicle;

        // Apply custom vehicle config if provided
        let vehicleCost = veh.custoTotalVeiculo;
        let vehicleDetails = {
            distanciaKm: veh.distanciaKm,
            tempoEstimadoH: veh.tempoEstimadoH,
            combustivel: veh.combustivelEstimado,
            pedagios: veh.pedagios,
            aluguel: veh.custoAluguel,
            consumoMedioKmL: veh.consumoMedioKmL,
            precoLitro: veh.precoLitro,
            diasEstimados: veh.diasEstimados,
            trechos: veh.trecho,
            categoriaCustom: null,
        };

        if (vehicleConfig) {
            const distKm = veh.distanciaKm;
            const consumoKmL = vehicleConfig.consumoKmL;
            const precoLitro = vehicleConfig.precoLitro;
            const combustivel = round((distKm / consumoKmL) * precoLitro);
            const diasEstimados = veh.diasEstimados || Math.ceil(veh.tempoEstimadoH / 10);
            const aluguel = round(vehicleConfig.aluguelDia * diasEstimados);
            const pedagios = vehicleConfig.pedagios || veh.pedagios || 0;
            vehicleCost = round(combustivel + aluguel + pedagios);

            vehicleDetails = {
                ...vehicleDetails,
                combustivel,
                pedagios,
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
            collaborators,
            ops,
            distanciaKm: route.distanciaKm,
            custoVeiculoCompartilhado: true,
        }));
    }

    // Score and rank alternatives
    const scored = scoreAlternatives(alternatives);
    const rankings = generateRankings(scored);
    const executive = generateExecutiveRecommendation(scored, rankings, route, ops, collaborators.length);

    return {
        success: true,
        origem,
        destino,
        distanciaKm: route.distanciaKm,
        estimado: route.estimado || false,
        cityOrigem,
        cityDestino,
        route,
        alternatives: scored,
        rankings,
        executive,
        params: ops,
        qtdColaboradores: collaborators.length,
        airSource,
        realtimeFlights,
    };
}

// ============================================================
// BUILD ALTERNATIVE
// ============================================================

function buildAlternative({ id, tipo, icon, descricao, custoTransporte, tempoViagemH, detalhes, collaborators, ops, distanciaKm, isVehicle = false, custoVeiculoCompartilhado = false }) {
    const qtd = collaborators.length || 1;

    const isDesmob = ops.apenasDesmobilizacao;

    // Transport cost per person (vehicle cost is shared)
    // In demobilization mode, only one-way ticket
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

        // In demobilization mode, no field work hours — only transit
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
        // In demob mode, one-way travel only
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
    const horasNoturnasCalc = tipo === 'Ônibus' && tempoViagemH > 8
        ? Math.min(tempoViagemH * 0.4, 8) * (isDesmob ? 1 : 2)
        : 0;
    const impactoNoturno = horasNoturnasCalc * avgNightRate * qtd;

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
            operacionalTotal: custoOperacionalTotal,
        },
        detalhes,
        detalhesColaboradores,
        distanciaKm,
        isVehicle,
    };
}

// ============================================================
// SCORING & RANKING
// ============================================================

function scoreAlternatives(alternatives) {
    if (alternatives.length === 0) return [];

    const custosDiretos = alternatives.map(a => a.custos.transporteTotal);
    const custosOperacionais = alternatives.map(a => a.custos.operacionalTotal);
    const tempos = alternatives.map(a => a.tempoViagemH);

    const maxCD = Math.max(...custosDiretos);
    const minCD = Math.min(...custosDiretos);
    const maxCO = Math.max(...custosOperacionais);
    const minCO = Math.min(...custosOperacionais);
    const maxT = Math.max(...tempos);
    const minT = Math.min(...tempos);

    return alternatives.map(alt => {
        // Normalize 0-100 (lower is better, so invert)
        const scoreCustoDireto = maxCD === minCD ? 100 :
            ((maxCD - alt.custos.transporteTotal) / (maxCD - minCD)) * 100;

        const scoreCustoOperacional = maxCO === minCO ? 100 :
            ((maxCO - alt.custos.operacionalTotal) / (maxCO - minCO)) * 100;

        const scoreTempo = maxT === minT ? 100 :
            ((maxT - alt.tempoViagemH) / (maxT - minT)) * 100;

        // Cost-benefit = operational efficiency (productive hours / total hours committed)
        const horasProdutivas = alternatives[0]?.detalhesColaboradores[0]?.labor?.custoTotalHoras || 1;
        const horasComprometidas = horasProdutivas + alt.custos.transito;
        const eficiencia = horasComprometidas > 0 ? (horasProdutivas / horasComprometidas) : 0.5;
        const scoreCustoBeneficio = eficiencia * 100;

        const scoreTotal = Math.round(
            scoreCustoDireto * RANKING_WEIGHTS.custoDirecto +
            scoreCustoOperacional * RANKING_WEIGHTS.custoOperacional +
            scoreTempo * RANKING_WEIGHTS.tempo +
            scoreCustoBeneficio * RANKING_WEIGHTS.custoBeneficio
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

function generateExecutiveRecommendation(scored, rankings, route, ops, qtdColaboradores) {
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

    // Route info
    const isDesmob = ops.apenasDesmobilizacao;
    paragraphs.push(
        `**${isDesmob ? 'Desmobilização' : 'Rota analisada'}:** ${route.origem || best.descricao} → ${route.destino || ''} ` +
        `(${route.distanciaKm} km${route.estimado ? ', estimativa' : ''}). ` +
        `Equipe de ${qtdColaboradores} colaborador(es)${isDesmob ? ' — apenas retorno para casa (somente ida).' : `, ${ops.diasCampo} dias em campo.`}`
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
    const busAlts = scored.filter(a => a.tipo === 'Ônibus' && a.tempoViagemH > 16);
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
            `pedágios (${formatCurrency(vehicleAlt.detalhes.pedagios)}) e ` +
            `aluguel (${formatCurrency(vehicleAlt.detalhes.aluguel)}). ` +
            `Oferece flexibilidade no destino mas adiciona fadiga ao motorista.`
        );
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
    };
}

// ============================================================
// HELPERS
// ============================================================

function round(val) {
    return Math.round(val * 100) / 100;
}
