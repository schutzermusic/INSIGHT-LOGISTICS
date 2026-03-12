/**
 * AI Advisor — Intelligent logistics recommendation engine
 * Analyzes routes, compares modals, generates executive recommendations
 */
import { findRoute, estimateVehicleCost } from './routes-db.js';
import { calcScenario, compareScenarios, formatCurrency, formatHours } from './calculator.js';

/**
 * Score weights for modal ranking
 */
const WEIGHTS = {
    custo: 0.50,
    tempo: 0.30,
    eficiencia: 0.20,
};

/**
 * Full AI analysis for a route
 * @param {Object} params - { origem, destino, collaborators, diasCampo, horasNormaisDia, horasExtra50Dia, horasExtra100Dia, horasNoturnasDia, custoHospedagemDia, custoAlimentacaoDia }
 * @returns {Object} Complete analysis with scenarios, scores, and recommendation
 */
export function analyzeRoute(params) {
    const {
        origem,
        destino,
        collaborators,
        diasCampo = 5,
        horasNormaisDia = 8,
        horasExtra50Dia = 2,
        horasExtra100Dia = 0,
        horasNoturnasDia = 0,
        custoHospedagemDia = 150,
        custoAlimentacaoDia = 80,
    } = params;

    const route = findRoute(origem, destino);
    const vehicleCost = route ? estimateVehicleCost(route) : null;

    // Build 3 scenarios
    const commonParams = {
        origem,
        destino,
        diasCampo,
        horasNormaisDia,
        horasExtra50Dia,
        horasExtra100Dia,
        horasNoturnasDia,
        custoHospedagemDia,
        custoAlimentacaoDia,
        idaEVolta: true,
    };

    const scenarios = [];

    // Scenario 1: Bus
    const busParams = {
        ...commonParams,
        nome: 'Ônibus',
        modal: 'Ônibus',
        horasTransito: route ? route.tempoOnibusH : 24,
        custoPassagem: route ? route.custoOnibus : 300,
    };
    scenarios.push(calcScenario(collaborators, busParams));

    // Scenario 2: Air
    const airParams = {
        ...commonParams,
        nome: 'Aéreo',
        modal: 'Aéreo',
        horasTransito: route ? route.tempoAereoH : 3,
        custoPassagem: route ? route.custoAereo : 800,
    };
    scenarios.push(calcScenario(collaborators, airParams));

    // Scenario 3: Vehicle
    const hasVehicle = route && route.tempoVeiculoH > 0;
    const vehParams = {
        ...commonParams,
        nome: 'Veículo/Frota',
        modal: 'Veículo/Frota',
        horasTransito: hasVehicle ? route.tempoVeiculoH : 12,
        custoPassagem: 0,
        custoVeiculo: vehicleCost ? vehicleCost.aluguel : 500,
        custoCombustivel: vehicleCost ? vehicleCost.combustivel : 400,
        custoPedagios: vehicleCost ? vehicleCost.pedagios : 100,
    };
    scenarios.push(calcScenario(collaborators, vehParams));

    // Calculate scores for each scenario
    const scoredScenarios = calculateScores(scenarios);

    // Generate comparison
    const comparison = compareScenarios(scenarios);

    // Generate executive recommendation
    const executive = generateExecutiveAnalysis(scoredScenarios, route, collaborators.length, diasCampo);

    return {
        route,
        routeFound: !!route,
        scenarios: scoredScenarios,
        comparison,
        executive,
        params: commonParams,
    };
}

/**
 * Calculate weighted scores for each scenario
 */
function calculateScores(scenarios) {
    if (scenarios.length === 0) return [];

    const costs = scenarios.map(s => s.resumo.custoTotalEquipe);
    const times = scenarios.map(s => s.resumo.horasTransito);

    const maxCost = Math.max(...costs);
    const minCost = Math.min(...costs);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    return scenarios.map((s, i) => {
        // Normalize 0-100 (lower is better, so invert)
        const costScore = maxCost === minCost ? 100 :
            ((maxCost - costs[i]) / (maxCost - minCost)) * 100;

        const timeScore = maxTime === minTime ? 100 :
            ((maxTime - times[i]) / (maxTime - minTime)) * 100;

        // Efficiency = hours productive vs total hours committed
        const totalHoursCommitted = s.resumo.horasTransito + (s.resultados[0]?.hours.horasNormais || 0);
        const productiveHours = s.resultados[0]?.hours.horasNormais || 0;
        const efficiencyRatio = totalHoursCommitted > 0 ? (productiveHours / totalHoursCommitted) : 0;
        const efficiencyScore = efficiencyRatio * 100;

        const totalScore = Math.round(
            costScore * WEIGHTS.custo +
            timeScore * WEIGHTS.tempo +
            efficiencyScore * WEIGHTS.eficiencia
        );

        return {
            ...s,
            scores: {
                custo: Math.round(costScore),
                tempo: Math.round(timeScore),
                eficiencia: Math.round(efficiencyScore),
                total: totalScore,
            },
        };
    });
}

/**
 * Generate executive analysis with justification
 */
function generateExecutiveAnalysis(scoredScenarios, route, qtdColaboradores, diasCampo) {
    const sorted = [...scoredScenarios].sort((a, b) => b.scores.total - a.scores.total);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const cheapest = [...scoredScenarios].sort((a, b) => a.resumo.custoTotalEquipe - b.resumo.custoTotalEquipe)[0];
    const fastest = [...scoredScenarios].sort((a, b) => a.resumo.horasTransito - b.resumo.horasTransito)[0];

    const economia = worst.resumo.custoTotalEquipe - best.resumo.custoTotalEquipe;
    const tempoSalvo = worst.resumo.horasTransito - fastest.resumo.horasTransito;

    // Cost of opportunity - hours lost in transit that could be productive
    const avgHoraTecnica = scoredScenarios[0].resultados.length > 0
        ? scoredScenarios[0].resultados[0].rates.horaTecnica
        : 0;
    const custoOportunidadePior = worst.resumo.horasTransito * avgHoraTecnica * qtdColaboradores;
    const custoOportunidadeMelhor = best.resumo.horasTransito * avgHoraTecnica * qtdColaboradores;
    const custoOportunidadeSalvo = custoOportunidadePior - custoOportunidadeMelhor;

    // Build analysis paragraphs
    const paragraphs = [];

    // Route info
    if (route) {
        paragraphs.push(
            `📍 **Rota analisada:** ${route.origem} → ${route.destino} (${route.distanciaKm} km). ` +
            `Tempos estimados: Ônibus ${route.tempoOnibusH}h, Aéreo ${route.tempoAereoH}h` +
            (route.tempoVeiculoH > 0 ? `, Veículo ${route.tempoVeiculoH}h.` : '.')
        );
    }

    // Best option
    paragraphs.push(
        `✅ **Recomendação:** O modal **${best.nome}** obteve a maior pontuação geral ` +
        `(${best.scores.total}/100), considerando custo (${best.scores.custo}pts), ` +
        `tempo (${best.scores.tempo}pts) e eficiência operacional (${best.scores.eficiencia}pts).`
    );

    // Financial impact
    paragraphs.push(
        `💰 **Impacto financeiro:** Custo total de **${formatCurrency(best.resumo.custoTotalEquipe)}** ` +
        `para ${qtdColaboradores} colaborador(es) em ${diasCampo} dias. ` +
        `Economia de **${formatCurrency(economia)}** comparado ao cenário mais caro (${worst.nome}).`
    );

    // Time impact
    if (tempoSalvo > 0) {
        paragraphs.push(
            `⏱️ **Tempo:** O modal mais rápido (${fastest.nome}) economiza **${tempoSalvo.toFixed(1)}h** ` +
            `de deslocamento comparado ao mais lento. ` +
            (custoOportunidadeSalvo > 0
                ? `O custo de oportunidade do tempo em trânsito é de **${formatCurrency(custoOportunidadeSalvo)}** em horas técnicas não utilizadas.`
                : '')
        );
    }

    // Cost vs speed trade-off
    if (cheapest.nome !== fastest.nome) {
        const costDiff = fastest.resumo.custoTotalEquipe - cheapest.resumo.custoTotalEquipe;
        const timeDiff = cheapest.resumo.horasTransito - fastest.resumo.horasTransito;
        paragraphs.push(
            `⚖️ **Custo vs Velocidade:** O modal mais barato (${cheapest.nome}, ${formatCurrency(cheapest.resumo.custoTotalEquipe)}) ` +
            `custa **${formatCurrency(Math.abs(costDiff))} ${costDiff > 0 ? 'menos' : 'mais'}** que o mais rápido (${fastest.nome}), ` +
            `porém demanda **${timeDiff.toFixed(1)}h adicionais** de deslocamento.`
        );
    }

    // Fatigue / safety consideration
    const busScenario = scoredScenarios.find(s => s.nome === 'Ônibus');
    if (busScenario && busScenario.resumo.horasTransito > 16) {
        paragraphs.push(
            `⚠️ **Fadiga e segurança:** O deslocamento via ônibus (${busScenario.resumo.horasTransito}h) excede 16h, ` +
            `o que pode impactar a disposição da equipe no primeiro dia de campo. Considere fatores de fadiga operacional na decisão.`
        );
    }

    return {
        melhor: best,
        pior: worst,
        maisBarato: cheapest,
        maisRapido: fastest,
        economia,
        tempoSalvo,
        custoOportunidadeSalvo,
        paragraphs,
        veredicto: best.nome,
        scoreTotal: best.scores.total,
    };
}
