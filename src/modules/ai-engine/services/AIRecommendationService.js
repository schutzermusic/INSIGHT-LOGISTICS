/**
 * AI Recommendation Service
 * Intelligent decision engine for logistics optimization
 * Goes beyond simple comparison — applies business rules, risk detection, and context-aware scoring
 */

import { formatCurrency } from '../../../engine/calculator.js';

/**
 * Generate AI recommendation for the best travel option
 * @param {Array} scenarios - Scored scenarios from routing intelligence
 * @param {Object} context - { teamSize, fieldDays, destination, origin }
 * @returns {Object} AI recommendation with justification
 */
export function generateAIRecommendation(scenarios, context = {}) {
  if (!scenarios || scenarios.length === 0) return null;

  const { teamSize = 1, fieldDays = 5 } = context;

  // Apply business rules to adjust scores
  const adjusted = scenarios.map(scenario => {
    let adjustedScore = scenario.scores?.total || 0;
    const type = scenario.tipo || scenario.modal || '';
    const travelTime = scenario.tempoViagemH || scenario.resumo?.horasTransito || 0;
    const operationalCost = scenario.custos?.operacionalTotal || scenario.resumo?.custoTotalEquipe || 0;

    // Rule: Above 10h road travel, penalize road/bus options
    if ((type.includes('Onibus') || type.includes('nibus')) && travelTime > 10) {
      adjustedScore -= Math.min(15, (travelTime - 10) * 2);
    }

    // Rule: Above 5 employees, vehicle becomes more attractive (shared cost)
    if (type.includes('culo') && teamSize >= 5) {
      adjustedScore += 8;
    }

    // Rule: Short trips (< 4h) favor vehicle
    if (type.includes('culo') && travelTime < 4) {
      adjustedScore += 10;
    }

    // Rule: Long bus trips (> 16h) get fatigue penalty
    if ((type.includes('Onibus') || type.includes('nibus')) && travelTime > 16) {
      adjustedScore -= 20;
    }

    // Rule: Air travel bonus for destinations > 800km
    if ((type.includes('reo') || type.includes('Air')) && (scenario.distanciaKm || 0) > 800) {
      adjustedScore += 5;
    }

    return {
      ...scenario,
      adjustedScore: Math.max(0, Math.min(100, Math.round(adjustedScore))),
      originalScore: scenario.scores?.total || 0,
    };
  });

  // Sort by adjusted score
  adjusted.sort((a, b) => b.adjustedScore - a.adjustedScore);
  const best = adjusted[0];
  const worst = adjusted[adjusted.length - 1];

  return {
    recommended: best,
    alternatives: adjusted.slice(1),
    all: adjusted,
    justification: buildJustification(best, adjusted, context),
    savings: worst.custos?.operacionalTotal - best.custos?.operacionalTotal || 0,
  };
}

/**
 * Generate executive summary for decision makers
 * @param {Object} analysis - Complete analysis result
 * @returns {Object} Executive summary with key findings
 */
export function generateExecutiveSummary(analysis) {
  if (!analysis || !analysis.alternatives || analysis.alternatives.length === 0) {
    return { paragraphs: [], keyFindings: [] };
  }

  const best = analysis.executive?.melhor || analysis.alternatives[0];
  const alts = analysis.alternatives;
  const keyFindings = [];

  // Find cheapest and fastest
  const cheapest = [...alts].sort((a, b) =>
    (a.custos?.operacionalTotal || 0) - (b.custos?.operacionalTotal || 0)
  )[0];
  const fastest = [...alts].sort((a, b) =>
    (a.tempoViagemH || 0) - (b.tempoViagemH || 0)
  )[0];

  // Key finding: Best option
  keyFindings.push({
    type: 'recommendation',
    title: `${best.tipo} e a opcao mais eficiente`,
    detail: `Score ${best.scores?.total || 0}/100 com custo operacional de ${formatCurrency(best.custos?.operacionalTotal || 0)}`,
  });

  // Key finding: Savings
  const maxCost = Math.max(...alts.map(a => a.custos?.operacionalTotal || 0));
  const minCost = Math.min(...alts.map(a => a.custos?.operacionalTotal || 0));
  if (maxCost - minCost > 100) {
    keyFindings.push({
      type: 'savings',
      title: `Economia potencial de ${formatCurrency(maxCost - minCost)}`,
      detail: `Diferenca entre a opcao mais cara e mais barata`,
    });
  }

  // Key finding: Time
  if (fastest.tipo !== best.tipo) {
    keyFindings.push({
      type: 'time',
      title: `${fastest.tipo} e mais rapido (${fastest.tempoViagemH}h)`,
      detail: `Mas o custo operacional e de ${formatCurrency(fastest.custos?.operacionalTotal || 0)}`,
    });
  }

  return {
    paragraphs: analysis.executive?.paragraphs || [],
    keyFindings,
    verdict: best.tipo,
    score: best.scores?.total || 0,
  };
}

/**
 * Detect operational risks in a scenario
 * @param {Object} scenario - Travel scenario
 * @param {Object} context - { teamSize, fieldDays }
 * @returns {Array} List of detected risks
 */
export function detectOperationalRisk(scenario, context = {}) {
  const risks = [];
  const travelTime = scenario.tempoViagemH || scenario.tempoIdaVoltaH || 0;
  const type = scenario.tipo || '';

  // Excessive duration
  if (travelTime > 12) {
    risks.push({
      severity: travelTime > 20 ? 'high' : 'medium',
      type: 'excessive_duration',
      message: `Duracao de ${travelTime.toFixed(1)}h de viagem pode comprometer produtividade`,
      recommendation: 'Considere modais mais rapidos para preservar horas produtivas',
    });
  }

  // Overnight requirement
  if ((type.includes('Onibus') || type.includes('nibus')) && travelTime > 8) {
    risks.push({
      severity: 'medium',
      type: 'overnight',
      message: 'Viagem de onibus noturna impacta descanso e adicional noturno',
      recommendation: 'Fatore o custo de adicional noturno e fadiga operacional',
    });
  }

  // High overtime impact
  const overtimeHours = Math.max(0, travelTime - 8);
  if (overtimeHours > 4) {
    risks.push({
      severity: overtimeHours > 8 ? 'high' : 'medium',
      type: 'overtime_impact',
      message: `${overtimeHours.toFixed(1)}h de horas extras potenciais durante transito`,
      recommendation: 'Avalie se o custo de HE justifica o modal escolhido',
    });
  }

  // Night shift impact
  if ((type.includes('Onibus') || type.includes('nibus')) && travelTime > 6) {
    const nightHours = Math.min(travelTime * 0.4, 8);
    risks.push({
      severity: nightHours > 6 ? 'high' : 'low',
      type: 'night_shift',
      message: `Estimativa de ${nightHours.toFixed(1)}h de adicional noturno`,
      recommendation: 'Considere o impacto no custo de adicional noturno CLT',
    });
  }

  // Large team in expensive mode
  if ((context.teamSize || 1) > 5 && (type.includes('reo') || type.includes('Air'))) {
    const ticketEstimate = (scenario.custos?.transportePessoa || 800) * context.teamSize;
    risks.push({
      severity: 'medium',
      type: 'team_size_cost',
      message: `Equipe de ${context.teamSize} pessoas via aereo: ${formatCurrency(ticketEstimate)} em passagens`,
      recommendation: 'Compare com veiculo proprio/locado para equipes grandes',
    });
  }

  return risks;
}

/**
 * Suggest best mode by context using business rules
 * @param {Object} context - { distanceKm, teamSize, urgency, fieldDays }
 * @returns {Object} Suggested mode with reasoning
 */
export function suggestBestModeByContext(context) {
  const { distanceKm = 0, teamSize = 1, urgency = 'normal', fieldDays = 5 } = context;

  // Short distance: always vehicle
  if (distanceKm < 200) {
    return { mode: 'vehicle', reason: 'Distancia curta favorece veiculo proprio/locado', confidence: 0.9 };
  }

  // Medium distance: depends on team size
  if (distanceKm < 500) {
    if (teamSize >= 4) {
      return { mode: 'vehicle', reason: 'Distancia media com equipe grande favorece veiculo compartilhado', confidence: 0.7 };
    }
    if (urgency === 'high') {
      return { mode: 'air', reason: 'Urgencia alta favorece aereo mesmo em distancia media', confidence: 0.8 };
    }
    return { mode: 'bus', reason: 'Distancia media com equipe pequena favorece onibus', confidence: 0.6 };
  }

  // Long distance: depends on urgency and destination
  if (distanceKm > 800) {
    if (urgency === 'high' || fieldDays < 3) {
      return { mode: 'air', reason: 'Distancia longa com urgencia/curta permanencia favorece aereo', confidence: 0.85 };
    }
    if (teamSize >= 5) {
      return { mode: 'vehicle', reason: 'Equipe grande em distancia longa: compare veiculo vs aereo', confidence: 0.5 };
    }
    return { mode: 'air', reason: 'Distancia longa geralmente favorece aereo pelo custo-oportunidade', confidence: 0.7 };
  }

  // Default medium-long
  return { mode: 'bus', reason: 'Distancia media-longa com custo competitivo via onibus', confidence: 0.5 };
}

/**
 * Generate a decision score combining all factors
 * @param {Object} scenario - Scored scenario
 * @param {Array} risks - Detected risks
 * @returns {Object} Final decision score
 */
export function generateDecisionScore(scenario, risks = []) {
  const baseScore = scenario.scores?.total || scenario.adjustedScore || 50;

  // Risk penalty
  const riskPenalty = risks.reduce((sum, risk) => {
    if (risk.severity === 'high') return sum + 10;
    if (risk.severity === 'medium') return sum + 5;
    return sum + 2;
  }, 0);

  const finalScore = Math.max(0, Math.min(100, baseScore - riskPenalty));

  return {
    score: finalScore,
    baseScore,
    riskPenalty,
    riskCount: risks.length,
    highRisks: risks.filter(r => r.severity === 'high').length,
    grade: finalScore >= 80 ? 'A' : finalScore >= 60 ? 'B' : finalScore >= 40 ? 'C' : 'D',
    recommendation: finalScore >= 70 ? 'recommended' : finalScore >= 50 ? 'acceptable' : 'not_recommended',
  };
}

// Internal

function buildJustification(best, all, context) {
  const parts = [];
  const type = best.tipo || '';
  const cost = best.custos?.operacionalTotal || 0;

  parts.push(`A analise recomenda ${type} como melhor opcao com score ajustado de ${best.adjustedScore}/100.`);

  if (cost > 0) {
    parts.push(`Custo operacional total estimado: ${formatCurrency(cost)}.`);
  }

  if (all.length > 1) {
    const savings = (all[all.length - 1].custos?.operacionalTotal || 0) - cost;
    if (savings > 0) {
      parts.push(`Economia de ${formatCurrency(savings)} em relacao a opcao mais cara.`);
    }
  }

  return parts.join(' ');
}
