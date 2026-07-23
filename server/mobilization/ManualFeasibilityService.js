/**
 * ManualFeasibilityService (§15, §22).
 *
 * Validates a normalized manual itinerary before it can be recommended (§16):
 * chronology, geographic continuity/transfers, deadline, inter-journey rest
 * compliance (§4.5), price sanity and passenger consistency. Produces a status
 * (valid | warning | requires_approval | invalid) plus actionable checks and a
 * per-rest compliance report. Deterministic — no side effects, no engine forks.
 *
 * @module server/mobilization/ManualFeasibilityService
 */

const MS_PER_MINUTE = 60000;
const REST_MODES = new Set(['hotel_rest']);

function isValidTz(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute inter-journey rest compliance (§4.5). Rest begins at the effective
 * release (metadata.releaseAtUtc) — hotel arrival alone does not start it — and
 * must reach the policy minimum of consecutive minutes to permit a journey
 * reset. Insufficient rest never resets silently; it registers a deficit.
 * @param {object} itinerary
 * @param {number} minimumRestMinutes
 * @returns {{ rests: object[], totalRestMinutes: number, restDeficitMinutes: number, journeyResetCount: number, critical: boolean }}
 */
export function evaluateRest(itinerary, minimumRestMinutes = 660) {
  const rests = [];
  let totalRestMinutes = 0;
  let restDeficitMinutes = 0;
  let journeyResetCount = 0;
  let critical = false;

  for (const seg of itinerary.segments) {
    if (!REST_MODES.has(seg.mode) && seg.segmentType !== 'mandatory_rest') continue;
    if (seg.qualifiesAsRest === false) continue;

    const effectiveStart = seg.metadata?.releaseAtUtc || seg.departureAtUtc;
    const effectiveEnd = seg.metadata?.restEndAtUtc || seg.arrivalAtUtc;
    const restMin = Math.max(0, Math.round((Date.parse(effectiveEnd) - Date.parse(effectiveStart)) / MS_PER_MINUTE));
    totalRestMinutes += restMin;
    const qualifies = restMin >= minimumRestMinutes;
    const deficit = qualifies ? 0 : minimumRestMinutes - restMin;
    if (qualifies) journeyResetCount += 1;
    else { restDeficitMinutes += deficit; critical = true; }

    rests.push({
      segmentId: seg.id,
      effectiveStartAtUtc: effectiveStart,
      endAtUtc: effectiveEnd,
      restMinutes: restMin,
      qualifies,
      deficitMinutes: deficit,
      complianceStatus: qualifies ? 'compliant' : 'critical_warning',
    });
  }

  return { rests, totalRestMinutes, restDeficitMinutes, journeyResetCount, critical };
}

/**
 * @param {Object} p
 * @param {object} p.itinerary — normalized manual itinerary
 * @param {object[]} [p.continuityIssues] — from ManualItineraryAdapter
 * @param {string[]} [p.employeeIds]
 * @param {string} [p.deadlineUtc]
 * @param {number} [p.minimumRestMinutes]
 * @returns {{ status: string, checks: object[], rest: object }}
 */
export function evaluateManualFeasibility(p) {
  const {
    itinerary,
    continuityIssues = [],
    employeeIds = [],
    deadlineUtc = null,
    minimumRestMinutes = 660,
  } = p;

  const checks = [];
  const add = (code, passed, severity, message) => checks.push({ code, passed, severity, message });
  const segs = itinerary.segments || [];

  // §15: at least one employee.
  add('has_employees', employeeIds.length > 0, 'error',
    employeeIds.length > 0 ? `${employeeIds.length} colaborador(es)` : 'Selecione ao menos um colaborador.');

  // §15: at least one leg.
  add('has_segments', segs.length > 0, 'error',
    segs.length > 0 ? `${segs.length} trecho(s)` : 'Adicione ao menos um trecho.');

  // §22: arrival after departure + chronological order.
  let chronoOk = true;
  let orderOk = true;
  let prevEnd = null;
  for (const s of segs) {
    const dep = Date.parse(s.departureAtUtc);
    const arr = Date.parse(s.arrivalAtUtc);
    if (!(arr >= dep)) chronoOk = false;
    if (prevEnd !== null && dep < prevEnd) orderOk = false;
    prevEnd = arr;
  }
  add('arrival_after_departure', chronoOk, 'error',
    chronoOk ? 'Horários coerentes' : 'Há trecho com chegada anterior à saída.');
  add('chronological_order', orderOk, 'error',
    orderOk ? 'Sequência cronológica válida' : 'Há trechos que se sobrepõem no tempo (impossível para o mesmo colaborador).');

  // §9/§22: geographic continuity — missing terminal transfers.
  const missing = continuityIssues.filter((c) => c.code === 'missing_transfer');
  add('geographic_continuity', missing.length === 0, 'warning',
    missing.length === 0
      ? 'Rota contínua'
      : `Transferência ausente: ${missing.map((m) => `${m.from} → ${m.to}`).join('; ')}. Inclua o transfer e a antecedência de embarque.`);

  // §20: arrival within deadline.
  const arrivalMs = itinerary.arrivalAtUtc ? Date.parse(itinerary.arrivalAtUtc) : null;
  const withinDeadline = deadlineUtc && arrivalMs != null ? arrivalMs <= Date.parse(deadlineUtc) : true;
  add('within_deadline', withinDeadline, 'error',
    withinDeadline ? 'Dentro do prazo de chegada' : 'Chega após o prazo máximo de chegada.');

  // §22: valid timezones.
  const tzOk = segs.every((s) => isValidTz(s.originTimezone) && isValidTz(s.destinationTimezone));
  add('valid_timezones', tzOk, 'error', tzOk ? 'Fusos válidos' : 'Fuso horário inválido em algum trecho.');

  // §22: non-negative monetary values.
  const moneyOk = segs.every((s) => (s.commercialCostC || 0) >= 0);
  add('valid_prices', moneyOk, 'error', moneyOk ? 'Valores válidos' : 'Valor monetário negativo em algum trecho.');

  // §4.5: rest compliance.
  const rest = evaluateRest(itinerary, minimumRestMinutes);
  add('rest_compliance', !rest.critical, 'warning',
    rest.critical
      ? `Descanso interjornada insuficiente (déficit ${Math.round(rest.restDeficitMinutes / 60 * 10) / 10}h). Não reinicia a jornada.`
      : (rest.rests.length ? 'Descanso suficiente para reinício' : 'Sem descanso interjornada no cenário'));

  // Aggregate status (§15): any failed error → invalid; a failed warning →
  // requires_approval (rest) or warning (continuity).
  const failedErrors = checks.filter((c) => !c.passed && c.severity === 'error');
  const failedWarnings = checks.filter((c) => !c.passed && c.severity === 'warning');
  let status = 'valid';
  if (failedErrors.length) status = 'invalid';
  else if (failedWarnings.some((c) => c.code === 'rest_compliance')) status = 'requires_approval';
  else if (failedWarnings.length) status = 'warning';

  return { status, checks, rest };
}
