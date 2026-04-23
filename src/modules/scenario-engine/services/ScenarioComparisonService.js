/**
 * Scenario Comparison Service
 * Compares bus, air, and vehicle scenarios with multiple ranking strategies
 */

import { formatCurrency } from '../../../engine/calculator.js';

/**
 * Compare all available scenarios
 * @param {Array} scenarios - Array of scenario objects with costs and time
 * @returns {Object} Comparison results with rankings
 */
export function compareScenarios(scenarios) {
  if (!scenarios || scenarios.length === 0) return null;

  const rankings = {
    lowestDirectCost: rankByLowestDirectCost(scenarios),
    lowestOperationalCost: rankByLowestOperationalCost(scenarios),
    fastest: rankByFastestOption(scenarios),
    bestCostBenefit: rankByBestCostBenefit(scenarios),
  };

  const differences = generateScenarioDifferences(scenarios, rankings);

  return {
    scenarios,
    rankings,
    differences,
    summary: {
      cheapest: rankings.lowestOperationalCost[0],
      fastest: rankings.fastest[0],
      recommended: rankings.bestCostBenefit[0],
      totalScenarios: scenarios.length,
    },
  };
}

/**
 * Rank scenarios by lowest direct transport cost
 */
export function rankByLowestDirectCost(scenarios) {
  return [...scenarios].sort((a, b) => {
    const costA = a.custos?.transporteTotal ?? a.resumo?.custoEquipePassagens ?? 0;
    const costB = b.custos?.transporteTotal ?? b.resumo?.custoEquipePassagens ?? 0;
    return costA - costB;
  });
}

/**
 * Rank by lowest total operational cost
 */
export function rankByLowestOperationalCost(scenarios) {
  return [...scenarios].sort((a, b) => {
    const costA = a.custos?.operacionalTotal ?? a.resumo?.custoTotalEquipe ?? 0;
    const costB = b.custos?.operacionalTotal ?? b.resumo?.custoTotalEquipe ?? 0;
    return costA - costB;
  });
}

/**
 * Rank by fastest end-to-end travel time
 */
export function rankByFastestOption(scenarios) {
  return [...scenarios].sort((a, b) => {
    const timeA = a.tempoViagemH ?? a.resumo?.horasTransito ?? 0;
    const timeB = b.tempoViagemH ?? b.resumo?.horasTransito ?? 0;
    return timeA - timeB;
  });
}

/**
 * Rank by best cost-benefit (weighted score)
 */
export function rankByBestCostBenefit(scenarios) {
  return [...scenarios].sort((a, b) => {
    const scoreA = a.scores?.total ?? calculateQuickScore(a);
    const scoreB = b.scores?.total ?? calculateQuickScore(b);
    return scoreB - scoreA; // Higher score = better
  });
}

/**
 * Generate differences between scenarios
 */
export function generateScenarioDifferences(scenarios, rankings) {
  if (scenarios.length < 2) return [];

  const cheapest = rankings.lowestOperationalCost[0];
  const fastest = rankings.fastest[0];

  return scenarios.map(scenario => {
    const cheapestCost = cheapest.custos?.operacionalTotal ?? cheapest.resumo?.custoTotalEquipe ?? 0;
    const scenarioCost = scenario.custos?.operacionalTotal ?? scenario.resumo?.custoTotalEquipe ?? 0;
    const costDiff = scenarioCost - cheapestCost;

    const fastestTime = fastest.tempoViagemH ?? fastest.resumo?.horasTransito ?? 0;
    const scenarioTime = scenario.tempoViagemH ?? scenario.resumo?.horasTransito ?? 0;
    const timeDiff = scenarioTime - fastestTime;

    return {
      scenario: scenario.tipo || scenario.nome || scenario.modal,
      costVsCheapest: costDiff,
      costVsCheapestFormatted: costDiff > 0 ? `+${formatCurrency(costDiff)}` : formatCurrency(costDiff),
      timeVsFastest: timeDiff,
      timeVsFastestFormatted: timeDiff > 0 ? `+${timeDiff.toFixed(1)}h` : `${timeDiff.toFixed(1)}h`,
      isCheapest: costDiff === 0,
      isFastest: timeDiff === 0,
      additionalOperationalBurden: timeDiff > 8 ? 'high' : timeDiff > 4 ? 'medium' : 'low',
    };
  });
}

function calculateQuickScore(scenario) {
  const cost = scenario.custos?.operacionalTotal ?? scenario.resumo?.custoTotalEquipe ?? 0;
  const time = scenario.tempoViagemH ?? scenario.resumo?.horasTransito ?? 0;
  // Simple inverse score: lower cost and lower time = higher score
  const costScore = cost > 0 ? (1 / cost) * 100000 : 0;
  const timeScore = time > 0 ? (1 / time) * 100 : 0;
  return Math.round(costScore * 0.6 + timeScore * 0.4);
}
