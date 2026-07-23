/**
 * MobilizationSearchService — orchestrates the full mobilization pipeline (§2):
 * resolve geo → expand candidate graph → generate itineraries → compute cost →
 * recommend. Returns a UI-ready payload. Deterministic and centavos-based.
 *
 * Employee hourly cost is computed from the salary/monthly-divisor sent by the
 * client (from collaborators) — no server DB/RLS dependency yet (§6). Policy and
 * cost config default to the seeded values; the client may override buffers,
 * search limits and cost config (edited on the Settings screen).
 *
 * @module server/mobilization/MobilizationSearchService
 */

import { resolveNode, selectHubs } from './geo.js';
import { makeQueryLegs } from './LegSynthesizer.js';
import { expandCandidateGraph } from './CandidateGraphExpander.js';
import { generateItineraries } from './ItineraryGenerator.js';
import { computeItineraryCost } from './OperationalCostEngine.js';
import { recommend } from './RecommendationEngine.js';
import { DEFAULT_LABOR_POLICY, DEFAULT_TRAVEL_TIME_POLICY } from './laborPolicyDefaults.js';
import { persistMobilizationSnapshot, isPersistenceEnabled } from './persistence.js';
import { newCorrelationId, createTimer, logEvent } from './observability.js';

function laborPolicySummary(p) {
  return {
    name: p.name,
    version: p.version,
    effectiveFrom: p.effectiveFrom,
    lines: [
      `${p.regularDailyMinutes / 60}h normais`,
      `+${p.weekdayFirstOvertimeMinutes / 60}h a +${Math.round((p.weekdayFirstOvertimeMultiplier - 1) * 100)}%`,
      `excedente a +${Math.round((p.weekdayExcessMultiplier - 1) * 100)}%`,
      `sábado após ${p.saturdayRegularMinutes / 60}h a +${Math.round((p.saturdayExcessMultiplier - 1) * 100)}%`,
      `domingo a ${p.sundayMultiplier}x`,
      `noturno ${p.nightStartLocalTime}–${p.nightEndLocalTime} a +${Math.round((p.nightMultiplier - 1) * 100)}%`,
    ],
    premiumStackingMode: p.premiumStackingMode,
  };
}

/**
 * @param {Object} input
 * @param {string} input.origin
 * @param {string} input.destination
 * @param {string} input.earliestDepartureUtc — ISO
 * @param {string} input.deadlineUtc — ISO
 * @param {Array<{id,nome,salarioBase,cargaHoraria,priorWorkedMinutes?}>} input.employees
 * @param {number} [input.daysInField]
 * @param {object} [input.config] — { bufferPolicy, constraints, costConfig }
 * @param {(msg:string)=>void} [input.onProgress]
 */
export async function searchMobilization(input) {
  const onProgress = input.onProgress || (() => {});
  const correlationId = input.correlationId || newCorrelationId();
  const timer = createTimer();
  logEvent('search_started', { correlationId, origin: input.origin, destination: input.destination, team: (input.employees || []).length });

  const origin = resolveNode(input.origin);
  const destination = resolveNode(input.destination);

  if (!origin || !destination) {
    logEvent('search_unresolved', { correlationId, origin: input.origin, destination: input.destination });
    return {
      success: false,
      reason: 'unresolved_cities',
      message: 'Não foi possível localizar coordenadas para origem e/ou destino.',
      origin: origin?.city || input.origin,
      destination: destination?.city || input.destination,
    };
  }

  onProgress('Selecionando hubs e aeroportos no corredor...');
  const hubs = selectHubs(origin, destination);
  const nodesById = Object.fromEntries([origin, destination, ...hubs].map((n) => [n.id, n]));

  onProgress('Consultando trechos e montando o grafo multimodal...');
  const queryLegs = makeQueryLegs({
    nodesById,
    earliestDepartureUtc: input.earliestDepartureUtc,
    deadlineUtc: input.deadlineUtc,
  });
  const { graph, stats: graphStats } = await expandCandidateGraph({
    origin, destination, hubs, queryLegs, onProgress,
  });
  timer.mark('graph');

  onProgress('Gerando e filtrando itinerários viáveis...');
  const cfg = input.config || {};
  const { valid, pareto, stats: genStats } = generateItineraries({
    graph,
    originCity: origin.id,
    destinationCity: destination.id,
    earliestDepartureUtc: input.earliestDepartureUtc,
    deadlineUtc: input.deadlineUtc,
    constraints: cfg.constraints || {},
    bufferPolicy: cfg.bufferPolicy || {},
  });
  timer.mark('generate');

  const employees = (input.employees || []).map((e) => ({
    id: e.id,
    name: e.nome || e.name || 'Colaborador',
    hourlyRateC: e.salarioBase && e.cargaHoraria ? Math.round((e.salarioBase / e.cargaHoraria) * 100) : 0,
    priorWorkedMinutes: e.priorWorkedMinutes || 0,
  }));

  if (valid.length === 0) {
    logEvent('search_no_route', { correlationId, ...graphStats, ...genStats, totalMs: timer.total() });
    return {
      success: true,
      origin, destination, hubsCount: hubs.length,
      itineraries: [], recommended: null, reasonCodes: ['no_viable_itinerary'],
      explanation: { summary: 'Nenhuma rota viável dentro do prazo.', paragraphs: [] },
      stats: { ...graphStats, ...genStats },
      metrics: { correlationId, totalMs: timer.total(), durationsMs: timer.phases() },
      policySummary: laborPolicySummary(DEFAULT_LABOR_POLICY),
      employees: employees.map(({ id, name, hourlyRateC }) => ({ id, name, hourlyRateC })),
    };
  }

  onProgress('Calculando custo de mobilização (mão de obra, permanência, transporte)...');
  const laborContext = { policy: DEFAULT_LABOR_POLICY, travelTimePolicy: DEFAULT_TRAVEL_TIME_POLICY };
  const nameById = Object.fromEntries(employees.map((e) => [e.id, e.name]));
  const toCost = (pareto.length ? pareto : valid).slice(0, 6);
  const costed = toCost.map((it) => {
    const r = computeItineraryCost({
      itinerary: it, employees, laborContext,
      config: cfg.costConfig || {},
      fieldContext: { daysInField: input.daysInField || 0 },
    });
    const laborByEmployee = r.laborByEmployee.map((l) => ({ ...l, employeeName: nameById[l.employeeId] || l.employeeId }));
    return { ...r.itinerary, breakdown: r.breakdown, laborByEmployee };
  });

  // Drop near-duplicates (same shape/cost/duration, e.g. different departure
  // slots of the same flight) so the UI shows meaningful choices (§11).
  const seen = new Set();
  const deduped = costed.filter((it) => {
    const k = `${it.modeSequence.join('>')}|${it.totalMobilizationCostC}|${it.durationMinutes}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  timer.mark('cost');
  onProgress('Ranqueando e gerando recomendação...');
  const rec = recommend({ itineraries: deduped });
  timer.mark('recommend');

  const metrics = {
    correlationId,
    totalMs: 0,
    durationsMs: timer.phases(),
    candidatesGenerated: genStats.generated,
    candidatesPruned: genStats.pruned,
    prunedReasons: genStats.prunedReasons,
    legsAdded: graphStats.legsAdded,
    pairsQueried: graphStats.pairsQueried,
    pairsFailed: graphStats.pairsFailed,
    validCount: valid.length,
    presentedCount: rec.ranked.length,
  };

  const result = {
    success: true,
    origin, destination, hubsCount: hubs.length,
    itineraries: rec.ranked,
    recommended: rec.recommended,
    reasonCodes: rec.reasonCodes,
    explanation: rec.explanation,
    comparison: rec.comparison,
    stats: { ...graphStats, ...genStats, validCount: valid.length },
    metrics,
    policySummary: laborPolicySummary(DEFAULT_LABOR_POLICY),
    employees: employees.map(({ id, name, hourlyRateC }) => ({ id, name, hourlyRateC })),
  };

  // Immutable audit snapshot (§23, §25) — best-effort; never blocks the result.
  onProgress('Registrando snapshot de auditoria...');
  const persist = await persistMobilizationSnapshot({ input, result });
  timer.mark('persist');
  result.audit = {
    enabled: isPersistenceEnabled(),
    requestId: persist?.requestId || null,
    correlationId: persist?.correlationId || correlationId,
    itineraryIdMap: persist?.itineraryIdMap || {},
  };
  metrics.totalMs = timer.total();
  metrics.durationsMs = timer.phases();

  logEvent('search_completed', {
    correlationId, requestId: result.audit.requestId,
    totalMs: metrics.totalMs, durationsMs: metrics.durationsMs,
    validCount: valid.length, presentedCount: rec.ranked.length,
    candidatesGenerated: genStats.generated, candidatesPruned: genStats.pruned,
    recommended: rec.recommended?.modeSequence?.join('+') || null,
    auditEnabled: result.audit.enabled,
  });

  return result;
}
