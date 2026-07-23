/**
 * Manual simulation persistence & audit (§18, §19) — server-side, service-role.
 *
 * Writes an immutable snapshot of a manual mobilization simulation: the
 * simulation context, each scenario, its normalized segments, per-employee labor
 * calculations + blocks, cost breakdown, feasibility checks and recommendation.
 * Reuses the shared Supabase service-role client pattern of ./persistence.js and
 * is env-gated: with no SUPABASE_SERVICE_ROLE_KEY every function is a graceful
 * no-op so calculation still works without an audit trail.
 *
 * @module server/mobilization/manualPersistence
 */

import { createClient } from '@supabase/supabase-js';

let _client;
let _resolved = false;

function client() {
  if (_resolved) return _client;
  _resolved = true;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!_client) console.warn('[manualPersistence] SUPABASE_SERVICE_ROLE_KEY não configurada — auditoria manual desativada.');
  return _client;
}

export function isManualPersistenceEnabled() {
  return !!client();
}

const toC = (v) => (Number.isInteger(v) ? v : 0);
const isUuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Persist a full immutable snapshot of a manual simulation result.
 * Best-effort: returns { simulationId } on success or null on failure/disabled.
 * @param {{ input: object, result: object }} p
 */
export async function persistManualSimulation({ input, result }) {
  const sb = client();
  if (!sb) return null;
  try {
    const ctx = input.simulation || {};
    const { data: sim, error: simErr } = await sb
      .from('manual_mobilization_simulations')
      .insert({
        name: ctx.name || 'Simulação manual',
        status: result.recommended ? 'calculated' : 'draft',
        origin: ctx.origin || null,
        destination: ctx.destination || null,
        trip_type: ctx.tripType || 'oneway',
        outbound_date: ctx.outboundDate || null,
        return_date: ctx.returnDate || null,
        earliest_departure_at: ctx.earliestDepartureUtc || null,
        required_arrival_at: input.deadlineUtc || ctx.deadlineUtc || null,
        employee_ids: (result.employees || []).map((e) => e.id).filter(isUuid),
        project: ctx.project || null,
        contract: ctx.contract || null,
        cost_center: ctx.costCenter || null,
        business_unit: ctx.businessUnit || null,
        labor_policy_version_id: '00000000-0000-4000-a000-000000000011',
        created_by: isUuid(input.actorId) ? input.actorId : null,
        data: {
          policySummary: result.policySummary,
          reasonCodes: result.reasonCodes,
          commonParametersSnapshot: {
            name: ctx.name || 'Simulação manual',
            origin: ctx.origin || null,
            destination: ctx.destination || null,
            tripType: ctx.tripType || 'oneway',
            outboundDate: ctx.outboundDate || null,
            returnDate: ctx.returnDate || null,
          },
        },
      })
      .select('id')
      .single();
    if (simErr) throw simErr;
    const simulationId = sim.id;

    for (const sc of result.scenarios) {
      const { data: scenarioRow, error: scErr } = await sb
        .from('manual_mobilization_scenarios')
        .insert({
          simulation_id: simulationId,
          name: sc.scenarioName || 'Cenário',
          status: sc.feasibilityStatus === 'invalid' ? 'invalid'
            : sc.feasibilityDetail === 'requires_approval' ? 'warning'
            : (result.recommended && result.recommended.id === sc.id) ? 'selected' : 'valid',
          departure_at: sc.departureAtUtc,
          arrival_at: sc.arrivalAtUtc,
          duration_minutes: sc.durationMinutes,
          commercial_cost_c: toC(sc.commercialCostC),
          labor_cost_c: toC(sc.laborCostC),
          permanence_cost_c: toC(sc.permanenceCostC),
          local_mobility_cost_c: toC(sc.localMobilityCostC),
          total_mobilization_cost_c: toC(sc.totalMobilizationCostC),
          feasibility_status: sc.feasibilityStatus,
          is_recommended: !!(result.recommended && result.recommended.id === sc.id),
          data: {
            breakdown: sc.breakdown, checks: sc.feasibilityChecks, rest: sc.rest,
            derivedGaps: sc.derivedGaps, continuityIssues: sc.continuityIssues,
            modeSequence: sc.modeSequence, tripType: sc.tripType, timelines: sc.timelines,
          },
        })
        .select('id')
        .single();
      if (scErr) throw scErr;
      const scenarioId = scenarioRow.id;

      const segRows = (sc.segments || []).map((s) => ({
        scenario_id: scenarioId, sequence: s.sequence, segment_type: s.segmentType, mode: s.mode,
        direction: s.direction || s.metadata?.direction || 'outbound',
        origin_location_id: s.originLocationId, destination_location_id: s.destinationLocationId,
        departure_at: s.departureAtUtc, arrival_at: s.arrivalAtUtc,
        origin_timezone: s.originTimezone, destination_timezone: s.destinationTimezone,
        provider_name: s.providerId || null, price_amount_c: toC(s.commercialCostC),
        price_allocation: s.priceAllocation || 'none', currency: s.currency || 'BRL',
        passenger_ids: (s.passengerIds || []).filter(isUuid),
        labor_counting_rule_id: s.laborCountingRuleId, counts_as_labor: s.countsAsLabor ?? null,
        qualifies_as_rest: s.qualifiesAsRest ?? null, source: s.source || 'manual',
        metadata: s.metadata || {},
      }));
      if (segRows.length) await sb.from('manual_itinerary_segments').insert(segRows);

      const laborRows = [];
      for (const emp of sc.laborByEmployee || []) {
        for (const bl of emp.blocks || []) {
          laborRows.push({
            scenario_id: scenarioId, employee_id: isUuid(emp.employeeId) ? emp.employeeId : null,
            start_at: bl.startAtUtc, end_at: bl.endAtUtc, local_timezone: bl.localTimezone,
            counted_minutes: bl.countedMinutes, day_type: bl.dayType || null,
            base_classification: bl.baseClassification, night_premium_applied: bl.nightPremiumApplied,
            holiday_premium_applied: bl.holidayPremiumApplied, hourly_rate_c: toC(bl.hourlyRateC),
            applied_multipliers: bl.appliedMultipliers || [], calculated_cost_c: toC(bl.calculatedCostC),
            explanation: bl.explanation || null,
          });
        }
      }
      if (laborRows.length) await sb.from('manual_labor_calculation_blocks').insert(laborRows);
    }

    await sb.from('mobilization_audit_events').insert({
      request_id: null, event_type: 'manual_simulation_calculated',
      actor_id: isUuid(input.actorId) ? input.actorId : null,
      payload: { simulationId, scenarios: result.scenarios.length, recommended: result.recommended?.scenarioName || null },
    }).then(() => {}, () => {}); // audit table may not accept null request_id in older schemas — ignore

    await sb.from('manual_simulation_audit_events').insert({
      simulation_id: simulationId,
      event_type: 'calculated',
      actor_id: isUuid(input.actorId) ? input.actorId : null,
      payload: {
        scenarioCount: result.scenarios.length,
        recommendedScenarioId: result.recommended?.scenarioId || null,
        tripType: ctx.tripType || 'oneway',
        employeeIds: (result.employees || []).map((employee) => employee.id),
      },
    }).then(() => {}, () => {});

    return { simulationId };
  } catch (err) {
    console.error('[manualPersistence] snapshot falhou:', err.message);
    return null;
  }
}
