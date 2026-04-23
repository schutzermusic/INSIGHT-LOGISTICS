/**
 * History Service
 * Handles persistence, retrieval, and analysis of past scenarios
 */

import { getSimulations } from '../../../data/store.js';

/**
 * Get complete scenario history
 * @param {Object} filters - { type, modal, search, dateFrom, dateTo }
 * @returns {Array} Filtered simulations
 */
export async function getScenarioHistory(filters = {}) {
  const simulations = await getSimulations();
  const { type, modal, search, dateFrom, dateTo } = filters;

  return simulations.filter(sim => {
    if (type && (sim.type || 'simulation') !== type) return false;
    if (modal && !(sim.modal || '').includes(modal)) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchSearch = (sim.origem || '').toLowerCase().includes(q) ||
        (sim.destino || '').toLowerCase().includes(q) ||
        (sim.modal || '').toLowerCase().includes(q) ||
        (sim.nome || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    if (dateFrom && sim.createdAt && new Date(sim.createdAt) < new Date(dateFrom)) return false;
    if (dateTo && sim.createdAt && new Date(sim.createdAt) > new Date(dateTo)) return false;
    return true;
  });
}

/**
 * Find similar past mobilizations
 * @param {string} origin
 * @param {string} destination
 * @param {string} modal
 * @returns {Array} Similar past analyses
 */
export async function getSimilarMobilizations(origin, destination, modal = null) {
  const simulations = await getSimulations();
  const originLower = (origin || '').toLowerCase();
  const destLower = (destination || '').toLowerCase();

  return simulations.filter(sim => {
    const simOrigin = (sim.origem || '').toLowerCase();
    const simDest = (sim.destino || '').toLowerCase();
    const matchRoute = (simOrigin.includes(originLower) || originLower.includes(simOrigin)) &&
      (simDest.includes(destLower) || destLower.includes(simDest));
    const matchModal = !modal || (sim.modal || '').includes(modal);
    return matchRoute && matchModal;
  });
}

/**
 * Compare planned vs actual costs
 * @param {string} origin
 * @param {string} destination
 * @returns {Object} Planned vs actual comparison
 */
export async function comparePlannedVsActual(origin, destination) {
  const similar = await getSimilarMobilizations(origin, destination);

  const planned = similar.filter(s => s.type === 'ai-analysis');
  const actual = similar.filter(s => s.type !== 'ai-analysis');

  const avgPlanned = planned.length > 0
    ? planned.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0) / planned.length
    : null;
  const avgActual = actual.length > 0
    ? actual.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0) / actual.length
    : null;

  return {
    route: `${origin} → ${destination}`,
    plannedCount: planned.length,
    actualCount: actual.length,
    avgPlannedCost: avgPlanned ? Math.round(avgPlanned) : null,
    avgActualCost: avgActual ? Math.round(avgActual) : null,
    variance: avgPlanned && avgActual ? Math.round(avgActual - avgPlanned) : null,
    variancePercent: avgPlanned && avgActual
      ? Math.round(((avgActual - avgPlanned) / avgPlanned) * 100)
      : null,
  };
}

/**
 * Group simulations by date for timeline view
 * @param {Array} simulations
 * @returns {Object} Grouped by date string
 */
export function groupByDate(simulations) {
  const groups = {};
  simulations.forEach(sim => {
    const date = sim.createdAt ? new Date(sim.createdAt).toLocaleDateString('pt-BR') : 'Sem data';
    if (!groups[date]) groups[date] = [];
    groups[date].push(sim);
  });
  return groups;
}
