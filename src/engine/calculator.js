/**
 * Motor de Cálculo — Mobilização de Campo
 * Lógica central para cálculos trabalhistas e de mobilização
 */

/**
 * Calcula os valores de hora para um colaborador
 */
export function calcHourlyRates(collaborator) {
    const { salarioBase, cargaHoraria, valorHoraTecnica, multHE50, multHE100, percNoturno } = collaborator;

    const horaNormal = salarioBase / cargaHoraria;
    const horaExtra50 = horaNormal * (multHE50 || 1.5);
    const horaExtra100 = horaNormal * (multHE100 || 2.0);
    const horaNoturna = horaNormal * (1 + (percNoturno || 20) / 100);
    const horaTecnica = valorHoraTecnica || horaNormal;

    return {
        horaNormal: round(horaNormal),
        horaExtra50: round(horaExtra50),
        horaExtra100: round(horaExtra100),
        horaNoturna: round(horaNoturna),
        horaTecnica: round(horaTecnica),
    };
}

/**
 * Calcula o custo total de horas trabalhadas para um colaborador em uma mobilização
 */
export function calcLaborCost(rates, hours) {
    const {
        horasNormais = 0,
        horasExtra50 = 0,
        horasExtra100 = 0,
        horasNoturnas = 0,
    } = hours;

    const custoNormal = horasNormais * rates.horaNormal;
    const custoHE50 = horasExtra50 * rates.horaExtra50;
    const custoHE100 = horasExtra100 * rates.horaExtra100;
    const custoNoturno = horasNoturnas * rates.horaNoturna;

    return {
        custoNormal: round(custoNormal),
        custoHE50: round(custoHE50),
        custoHE100: round(custoHE100),
        custoNoturno: round(custoNoturno),
        custoTotalHoras: round(custoNormal + custoHE50 + custoHE100 + custoNoturno),
    };
}

/**
 * Calcula o custo de deslocamento (tempo de viagem × hora técnica)
 */
export function calcTravelCost(rates, horasTransito, idaEVolta = true) {
    const totalHorasTransito = idaEVolta ? horasTransito * 2 : horasTransito;
    const custo = totalHorasTransito * rates.horaTecnica;
    return {
        horasTransito: totalHorasTransito,
        custoTransito: round(custo),
    };
}

/**
 * Calcula o custo total de um colaborador na mobilização
 */
export function calcCollaboratorMobilization(collaborator, params) {
    const rates = calcHourlyRates(collaborator);

    const {
        horasNormaisDia = 8,
        horasExtra50Dia = 0,
        horasExtra100Dia = 0,
        horasNoturnasDia = 0,
        diasCampo = 1,
        horasTransito = 0,
        custoPassagem = 0,
        custoHospedagemDia = 0,
        custoAlimentacaoDia = 0,
        idaEVolta = true,
    } = params;

    // Horas totais
    const hours = {
        horasNormais: horasNormaisDia * diasCampo,
        horasExtra50: horasExtra50Dia * diasCampo,
        horasExtra100: horasExtra100Dia * diasCampo,
        horasNoturnas: horasNoturnasDia * diasCampo,
    };

    const labor = calcLaborCost(rates, hours);
    const travel = calcTravelCost(rates, horasTransito, idaEVolta);

    const custoHospedagem = round(custoHospedagemDia * diasCampo);
    const custoAlimentacao = round(custoAlimentacaoDia * diasCampo);

    const custoTotalColaborador = round(
        labor.custoTotalHoras +
        travel.custoTransito +
        custoPassagem +
        custoHospedagem +
        custoAlimentacao
    );

    return {
        colaborador: collaborator.nome,
        cargo: collaborator.cargo,
        rates,
        hours,
        labor,
        travel,
        custoPassagem: round(custoPassagem),
        custoHospedagem,
        custoAlimentacao,
        custoTotal: custoTotalColaborador,
    };
}

/**
 * Calcula a mobilização completa para um cenário
 */
export function calcScenario(collaborators, params) {
    const {
        nome = 'Cenário',
        modal = '',
        origem = '',
        destino = '',
        custoVeiculo = 0,
        custoCombustivel = 0,
        custoPedagios = 0,
        ...mobilizationParams
    } = params;

    const resultados = collaborators.map(c =>
        calcCollaboratorMobilization(c, mobilizationParams)
    );

    const custoEquipeHoras = round(resultados.reduce((s, r) => s + r.labor.custoTotalHoras, 0));
    const custoEquipeTransito = round(resultados.reduce((s, r) => s + r.travel.custoTransito, 0));
    const custoEquipePassagens = round(resultados.reduce((s, r) => s + r.custoPassagem, 0));
    const custoEquipeHospedagem = round(resultados.reduce((s, r) => s + r.custoHospedagem, 0));
    const custoEquipeAlimentacao = round(resultados.reduce((s, r) => s + r.custoAlimentacao, 0));
    const custoLogistico = round(custoVeiculo + custoCombustivel + custoPedagios);

    const custoTotalEquipe = round(
        custoEquipeHoras +
        custoEquipeTransito +
        custoEquipePassagens +
        custoEquipeHospedagem +
        custoEquipeAlimentacao +
        custoLogistico
    );

    const horasTotalTransito = resultados.length > 0
        ? resultados[0].travel.horasTransito
        : 0;

    return {
        nome,
        modal,
        origem,
        destino,
        qtdColaboradores: collaborators.length,
        resultados,
        resumo: {
            custoEquipeHoras,
            custoEquipeTransito,
            custoEquipePassagens,
            custoEquipeHospedagem,
            custoEquipeAlimentacao,
            custoLogistico,
            custoTotalEquipe,
            horasTransito: horasTotalTransito,
        },
    };
}

/**
 * Compara múltiplos cenários e retorna análise
 */
export function compareScenarios(scenarios) {
    if (scenarios.length === 0) return null;

    const sorted = [...scenarios].sort(
        (a, b) => a.resumo.custoTotalEquipe - b.resumo.custoTotalEquipe
    );

    const melhor = sorted[0];
    const pior = sorted[sorted.length - 1];
    const economia = round(pior.resumo.custoTotalEquipe - melhor.resumo.custoTotalEquipe);

    const sortedByTime = [...scenarios].sort(
        (a, b) => a.resumo.horasTransito - b.resumo.horasTransito
    );
    const maisRapido = sortedByTime[0];

    let recomendacao = '';
    if (melhor.nome === maisRapido.nome) {
        recomendacao = `O cenário "${melhor.nome}" (${melhor.modal}) é a melhor opção tanto em custo quanto em tempo. Economia de ${formatCurrency(economia)} comparado ao cenário mais caro.`;
    } else {
        const diffTempo = maisRapido.resumo.horasTransito - melhor.resumo.horasTransito;
        if (diffTempo <= 0 || economia > melhor.resumo.custoTotalEquipe * 0.15) {
            recomendacao = `Recomendação: "${melhor.nome}" (${melhor.modal}) com economia de ${formatCurrency(economia)}. Apesar do cenário "${maisRapido.nome}" ser mais rápido (${maisRapido.resumo.horasTransito}h vs ${melhor.resumo.horasTransito}h), o custo-benefício favorece o cenário mais econômico.`;
        } else {
            recomendacao = `Considere "${maisRapido.nome}" (${maisRapido.modal}) para maior eficiência operacional (${maisRapido.resumo.horasTransito}h). O cenário "${melhor.nome}" é mais barato por ${formatCurrency(economia)}, mas o tempo adicional de ${melhor.resumo.horasTransito - maisRapido.resumo.horasTransito}h pode impactar a produtividade.`;
        }
    }

    return {
        cenarios: sorted,
        melhor,
        pior,
        maisRapido,
        economia,
        recomendacao,
    };
}

// Helpers
function round(val) {
    return Math.round(val * 100) / 100;
}

export function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatHours(val) {
    return `${val.toFixed(1)}h`;
}
