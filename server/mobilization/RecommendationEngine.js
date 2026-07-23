/**
 * RecommendationEngine (§20).
 *
 * Feasibility first, then ranking. Only itineraries that passed feasibility
 * (valid: within deadline, feasible connections, …) can be recommended; a
 * deadline-misser is never recommended. Among valid options the recommendation
 * is driven by LOWEST TOTAL MOBILIZATION COST (§20 default priority 1), with
 * duration then connections as tie-breakers — so a cheaper ticket can correctly
 * lose to a pricier ticket whose total is lower.
 *
 * Explanations are deterministic and built from reason codes with EXACT figures.
 * Generative AI may later reword them but must never change the numbers (§20).
 *
 * @module server/mobilization/RecommendationEngine
 */

import { formatBRL } from '../../src/domain/money.js';

/** Weights are used only for the display score, not to pick the winner. */
export const DEFAULT_WEIGHTS = Object.freeze({ cost: 0.6, duration: 0.25, connections: 0.15 });

function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function displayScores(valid, weights) {
  const range = (vals) => {
    const min = Math.min(...vals); const max = Math.max(...vals);
    return { min, max, span: max - min };
  };
  const cost = range(valid.map((v) => v.totalMobilizationCostC));
  const dur = range(valid.map((v) => v.durationMinutes));
  const con = range(valid.map((v) => v.connectionCount));
  const norm = (v, r) => (r.span === 0 ? 100 : ((r.max - v) / r.span) * 100);

  for (const it of valid) {
    it.score = Math.round(
      norm(it.totalMobilizationCostC, cost) * weights.cost +
      norm(it.durationMinutes, dur) * weights.duration +
      norm(it.connectionCount, con) * weights.connections
    );
  }
  return valid;
}

/**
 * Rank valid itineraries: lowest total cost, then duration, then connections.
 * @param {object[]} valid
 * @param {object} [weights]
 * @returns {object[]}
 */
export function rankItineraries(valid, weights = DEFAULT_WEIGHTS) {
  const ranked = [...valid].sort(
    (a, b) =>
      a.totalMobilizationCostC - b.totalMobilizationCostC ||
      a.durationMinutes - b.durationMinutes ||
      a.connectionCount - b.connectionCount
  );
  displayScores(ranked, weights);
  return ranked;
}

/**
 * Produce a recommendation from a set of itineraries (already cost-computed).
 * @param {Object} p
 * @param {object[]} p.itineraries — with feasibilityStatus + totalMobilizationCostC
 * @param {object} [p.weights]
 * @returns {object}
 */
export function recommend({ itineraries, weights = DEFAULT_WEIGHTS }) {
  const valid = itineraries.filter((it) => it.feasibilityStatus === 'valid');

  if (valid.length === 0) {
    const anyDeadlineMiss = itineraries.some((it) => it.feasibilityReasons?.includes('misses_arrival_deadline'));
    return {
      recommended: null,
      ranked: [],
      reasonCodes: [anyDeadlineMiss ? 'no_option_before_deadline' : 'no_viable_itinerary'],
      explanation: {
        summary: anyDeadlineMiss
          ? 'Nenhuma alternativa chega dentro do prazo exigido.'
          : 'Nenhuma alternativa viável foi encontrada.',
        paragraphs: [
          anyDeadlineMiss
            ? '**Sem opção no prazo:** todas as rotas encontradas chegam após o horário de chegada exigido.'
            : '**Sem rota viável:** nenhuma composição de transporte atendeu às restrições operacionais.',
        ],
      },
    };
  }

  const ranked = rankItineraries(valid, weights);
  const recommended = ranked[0];
  recommended.rankingCategory = 'recommended';

  const lowestTicket = valid.reduce((a, b) => (a.commercialCostC <= b.commercialCostC ? a : b));
  const fastest = valid.reduce((a, b) => (a.durationMinutes <= b.durationMinutes ? a : b));

  const reasonCodes = ['within_deadline'];
  if (recommended.id === lowestTicket.id) reasonCodes.push('also_lowest_ticket');
  reasonCodes.push('lowest_total_cost');
  if (recommended.id === fastest.id) reasonCodes.push('fastest');
  if (recommended.connectionCount === Math.min(...valid.map((v) => v.connectionCount))) {
    reasonCodes.push('fewest_connections');
  }

  const paragraphs = [];
  const seq = recommended.modeSequence ? recommended.modeSequence.join(' + ') : 'rota';
  paragraphs.push(
    `**Recomendado:** ${seq}. Custo total de mobilização **${formatBRL(recommended.totalMobilizationCostC)}** ` +
    `(passagens ${formatBRL(recommended.commercialCostC)}, mão de obra ${formatBRL(recommended.laborCostC || 0)}), ` +
    `duração ${formatDuration(recommended.durationMinutes)}, ${recommended.connectionCount} conexão(ões).`
  );

  let savingsC = 0;
  let timeSavedMinutes = 0;
  const cheaperTicketButHigherTotal =
    lowestTicket.id !== recommended.id &&
    lowestTicket.totalMobilizationCostC > recommended.totalMobilizationCostC;

  if (cheaperTicketButHigherTotal) {
    reasonCodes.push('cheaper_ticket_higher_total');
    savingsC = lowestTicket.totalMobilizationCostC - recommended.totalMobilizationCostC;
    timeSavedMinutes = lowestTicket.durationMinutes - recommended.durationMinutes;
    const ticketSeq = lowestTicket.modeSequence ? lowestTicket.modeSequence.join(' + ') : 'rota';
    paragraphs.push(
      `**Por que não a passagem mais barata:** a opção ${ticketSeq} tem passagem menor ` +
      `(${formatBRL(lowestTicket.commercialCostC)}), mas sua duração de ${formatDuration(lowestTicket.durationMinutes)} ` +
      `gera mais mão de obra e refeições, resultando em custo total maior ` +
      `(${formatBRL(lowestTicket.totalMobilizationCostC)}).`
    );
    paragraphs.push(
      `**Economia estimada:** ${formatBRL(savingsC)}` +
      (timeSavedMinutes > 0 ? ` — tempo economizado ${formatDuration(timeSavedMinutes)}.` : '.')
    );
  }

  const summary =
    `${seq} — ${formatBRL(recommended.totalMobilizationCostC)}` +
    (savingsC > 0 ? ` (economia ${formatBRL(savingsC)})` : '');

  return {
    recommended,
    ranked,
    reasonCodes,
    explanation: { summary, paragraphs, savingsC, timeSavedMinutes },
    comparison: { lowestTicket, fastest },
  };
}
