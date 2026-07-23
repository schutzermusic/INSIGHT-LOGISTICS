/**
 * Persistence & audit (§23, §25) — server-side, service-role only.
 *
 * Writes immutable calculation snapshots and audit/approval/override records
 * using a Supabase SERVICE-ROLE client (bypasses RLS). This keeps salary-derived
 * and audit data out of the browser and honors the permission model (§26).
 *
 * Env-gated: if SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_URL / VITE_SUPABASE_URL)
 * is not set, every function is a graceful no-op — the search still works, just
 * without an audit trail. Set the key to enable persistence.
 *
 * @module server/mobilization/persistence
 */

import { createClient } from '@supabase/supabase-js';

const LABOR_POLICY_ID = '00000000-0000-4000-a000-000000000001';
const TRAVEL_POLICY_ID = '00000000-0000-4000-a000-000000000002';

let _client;
let _resolved = false;

function client() {
  if (_resolved) return _client;
  _resolved = true;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!_client) console.warn('[persistence] SUPABASE_SERVICE_ROLE_KEY não configurada — auditoria desativada.');
  return _client;
}

export function isPersistenceEnabled() {
  return !!client();
}

const toC = (v) => (Number.isInteger(v) ? v : 0);

/**
 * Persist a full immutable snapshot of a search result (§23, §25).
 * Best-effort: returns { requestId } on success, or null on failure/disabled.
 */
export async function persistMobilizationSnapshot({ input, result }) {
  const sb = client();
  if (!sb) return null;
  try {
    // 1. Request
    const { data: req, error: reqErr } = await sb
      .from('mobilization_requests')
      .insert({
        status: result.recommended ? 'completed' : 'partial',
        origin_city: result.origin?.id || input.origin,
        destination_city: result.destination?.id || input.destination,
        earliest_departure_at: input.earliestDepartureUtc,
        required_arrival_at: input.deadlineUtc,
        employee_ids: (input.employees || []).map((e) => e.id).filter(isUuid),
        baggage_config: input.baggageConfig || {},
        vehicle_config: input.vehicleConfig || {},
        labor_policy_version_id: LABOR_POLICY_ID,
        travel_time_policy_id: TRAVEL_POLICY_ID,
        requested_by: input.actorId && isUuid(input.actorId) ? input.actorId : null,
        data: { reasonCodes: result.reasonCodes, stats: result.stats },
      })
      .select('id, correlation_id')
      .single();
    if (reqErr) throw reqErr;
    const requestId = req.id;

    // 2. Itineraries (one row each; keep insertion order to map children)
    const itRows = result.itineraries.map((it) => ({
      request_id: requestId,
      departure_at: it.departureAtUtc,
      arrival_at: it.arrivalAtUtc,
      duration_minutes: it.durationMinutes,
      connection_count: it.connectionCount,
      modal_change_count: it.modalChangeCount,
      commercial_cost_c: toC(it.commercialCostC),
      labor_cost_c: toC(it.laborCostC),
      permanence_cost_c: toC(it.permanenceCostC),
      local_mobility_cost_c: toC(it.localMobilityCostC),
      total_mobilization_cost_c: toC(it.totalMobilizationCostC),
      feasibility_status: it.feasibilityStatus,
      feasibility_reasons: it.feasibilityReasons || [],
      score: it.score || 0,
      ranking_category: it.rankingCategory || null,
      is_selected: false,
      data: { modeSequence: it.modeSequence, engineId: it.id },
    }));
    const { data: itineraries, error: itErr } = await sb.from('itineraries').insert(itRows).select('id');
    if (itErr) throw itErr;

    // 3. Children per itinerary (segments, cost breakdown, labor blocks, feasibility)
    const segRows = [];
    const breakdownRows = [];
    const laborRows = [];
    const feasibilityRows = [];
    result.itineraries.forEach((it, i) => {
      const itineraryId = itineraries[i].id;
      it.segments.forEach((s) => segRows.push({
        itinerary_id: itineraryId, sequence: s.sequence, mode: s.mode,
        origin_location_id: s.originLocationId, destination_location_id: s.destinationLocationId,
        departure_at: s.departureAtUtc, arrival_at: s.arrivalAtUtc,
        origin_timezone: s.originTimezone, destination_timezone: s.destinationTimezone,
        provider_id: s.providerId || null, commercial_cost_c: toC(s.commercialCostC),
        currency: 'BRL', availability_status: s.availabilityStatus || null,
        labor_counting_rule_id: s.laborCountingRuleId, metadata: s.metadata || {},
      }));
      const b = it.breakdown || {};
      breakdownRows.push({
        itinerary_id: itineraryId,
        ticket_c: toC(b.ticket_c), rental_c: toC(b.shared_vehicle_c), labor_c: toC(b.labor_c),
        meals_c: toC(b.transit_meals_c) + toC(b.field_meals_c),
        hotel_c: toC(b.transit_hotel_c) + toC(b.field_hotel_c),
        local_transport_c: toC(b.field_local_c), terminal_transfers_c: toC(b.terminal_transfers_c),
        total_c: toC(b.total_c), breakdown: b,
      });
      (it.laborByEmployee || []).forEach((emp) => {
        (emp.blocks || []).forEach((bl) => laborRows.push({
          itinerary_id: itineraryId,
          employee_id: isUuid(emp.employeeId) ? emp.employeeId : null,
          start_at: bl.startAtUtc, end_at: bl.endAtUtc, local_timezone: bl.localTimezone,
          counted_minutes: bl.countedMinutes, base_classification: bl.baseClassification,
          night_premium_applied: bl.nightPremiumApplied, holiday_premium_applied: bl.holidayPremiumApplied,
          hourly_rate_c: toC(bl.hourlyRateC), applied_multipliers: bl.appliedMultipliers || [],
          calculated_cost_c: toC(bl.calculatedCostC), policy_version_id: LABOR_POLICY_ID,
          explanation: bl.explanation || null,
        }));
      });
      feasibilityRows.push({
        itinerary_id: itineraryId, check_code: 'arrival_before_deadline',
        passed: it.feasibilityStatus === 'valid',
        detail: { arrivalAtUtc: it.arrivalAtUtc, deadlineUtc: input.deadlineUtc },
      });
    });

    if (segRows.length) await sb.from('itinerary_segments').insert(segRows);
    if (breakdownRows.length) await sb.from('cost_breakdowns').insert(breakdownRows);
    if (laborRows.length) await sb.from('labor_cost_blocks').insert(laborRows);
    if (feasibilityRows.length) await sb.from('feasibility_checks').insert(feasibilityRows);

    // 4. Recommendation
    if (result.recommended) {
      const recIdx = result.itineraries.findIndex((it) => it.id === result.recommended.id);
      if (recIdx >= 0) {
        await sb.from('recommendations').insert({
          request_id: requestId, itinerary_id: itineraries[recIdx].id,
          score: result.recommended.score || 0, ranking_category: 'recommended',
          reason_codes: result.reasonCodes || [], explanation: result.explanation?.summary || null,
          weighting_used: {},
        });
      }
    }

    // 5. Audit event
    await writeAuditEvent(requestId, req.correlation_id, 'search_completed', input.actorId, {
      origin: result.origin?.id, destination: result.destination?.id, itineraryCount: result.itineraries.length,
    });

    // Map engine itinerary ids → DB ids so the client can act on them.
    const idMap = {};
    result.itineraries.forEach((it, i) => { idMap[it.id] = itineraries[i].id; });
    return { requestId, correlationId: req.correlation_id, itineraryIdMap: idMap };
  } catch (err) {
    console.error('[persistence] snapshot falhou:', err.message);
    return null;
  }
}

export async function writeAuditEvent(requestId, correlationId, eventType, actorId, payload = {}) {
  const sb = client();
  if (!sb) return;
  try {
    await sb.from('mobilization_audit_events').insert({
      request_id: requestId, correlation_id: correlationId || null, event_type: eventType,
      actor_id: actorId && isUuid(actorId) ? actorId : null, payload,
    });
  } catch (err) { console.error('[persistence] audit falhou:', err.message); }
}

export async function selectItinerary({ requestId, itineraryId, actorId }) {
  const sb = client();
  if (!sb) return { ok: false, reason: 'persistence_disabled' };
  try {
    await sb.from('itineraries').update({ is_selected: false }).eq('request_id', requestId);
    await sb.from('itineraries').update({ is_selected: true }).eq('id', itineraryId);
    await sb.from('mobilization_requests').update({ status: 'selected' }).eq('id', requestId);
    await writeAuditEvent(requestId, null, 'itinerary_selected', actorId, { itineraryId });
    return { ok: true };
  } catch (err) { return { ok: false, reason: err.message }; }
}

export async function recordOverride({ requestId, originalItineraryId, chosenItineraryId, reason, actorId }) {
  const sb = client();
  if (!sb) return { ok: false, reason: 'persistence_disabled' };
  if (!reason) return { ok: false, reason: 'reason_required' };
  try {
    await sb.from('override_history').insert({
      request_id: requestId, original_itinerary_id: originalItineraryId || null,
      chosen_itinerary_id: chosenItineraryId, actor_id: actorId && isUuid(actorId) ? actorId : null, reason,
    });
    await writeAuditEvent(requestId, null, 'recommendation_override', actorId, { chosenItineraryId, reason });
    return { ok: true };
  } catch (err) { return { ok: false, reason: err.message }; }
}

export async function submitForApproval({ requestId, itineraryId, actorId, note }) {
  const sb = client();
  if (!sb) return { ok: false, reason: 'persistence_disabled' };
  try {
    await sb.from('mobilization_requests').update({ status: 'pending_approval' }).eq('id', requestId);
    await sb.from('approval_history').insert({
      request_id: requestId, itinerary_id: itineraryId || null, action: 'submitted',
      actor_id: actorId && isUuid(actorId) ? actorId : null, note: note || null,
    });
    await writeAuditEvent(requestId, null, 'submitted_for_approval', actorId, { itineraryId });
    return { ok: true };
  } catch (err) { return { ok: false, reason: err.message }; }
}

export async function recordApprovalAction({ requestId, itineraryId, action, note, actorId }) {
  const sb = client();
  if (!sb) return { ok: false, reason: 'persistence_disabled' };
  const status = action === 'approved' ? 'approved' : 'rejected';
  try {
    await sb.from('mobilization_requests').update({ status }).eq('id', requestId);
    await sb.from('approval_history').insert({
      request_id: requestId, itinerary_id: itineraryId || null, action,
      actor_id: actorId && isUuid(actorId) ? actorId : null, note: note || null,
    });
    await writeAuditEvent(requestId, null, `mobilization_${action}`, actorId, { itineraryId });
    return { ok: true };
  } catch (err) { return { ok: false, reason: err.message }; }
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
