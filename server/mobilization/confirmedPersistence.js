/**
 * Confirmed-mobilization persistence (§3.1) — server-side, service-role only.
 *
 * Writes the confirmation transactionally-enough for our best-effort model and
 * reads back the governed dashboard dataset. Follows the same env-gated,
 * service-role pattern as ./persistence.js: with no SUPABASE_SERVICE_ROLE_KEY
 * every function is a graceful no-op, and reads fall back to an empty dataset so
 * the dashboard renders (empty) instead of crashing.
 *
 * @module server/mobilization/confirmedPersistence
 */

import { createClient } from '@supabase/supabase-js';
import { writeAuditEvent } from './persistence.js';

let _client;
let _resolved = false;

function client() {
  if (_resolved) return _client;
  _resolved = true;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!_client) console.warn('[confirmedPersistence] SUPABASE_SERVICE_ROLE_KEY não configurada — confirmação/dashboard sem persistência.');
  return _client;
}

export function isConfirmationPersistenceEnabled() {
  return !!client();
}

/**
 * Persist a confirmed mobilization + its attributed collaborators.
 *
 * Transactional guarantee (§3.1): the parent row is inserted first; the
 * collaborator rows follow. If the collaborator insert fails the parent is
 * rolled back (deleted) so the dashboard never sees a half-published record.
 *
 * @param {{ record: object, collaborators: object[], actorId?: string }} p
 * @returns {Promise<{ confirmedId: string } | null>}
 */
export async function persistConfirmation({ record, collaborators, actorId }) {
  const sb = client();
  if (!sb) return null;
  let confirmedId = null;
  try {
    const { data, error } = await sb.from('confirmed_mobilizations').insert(record).select('id, correlation_id').single();
    if (error) throw error;
    confirmedId = data.id;

    const collabRows = (collaborators || []).map((c) => ({
      confirmed_id: confirmedId,
      employee_id: isUuid(c.employeeId) ? c.employeeId : null,
      employee_id_text: isUuid(c.employeeId) ? null : String(c.employeeId ?? ''),
      employee_name_snapshot: c.employeeName,
      role_snapshot: c.role || null,
      labor_spend_c: c.laborSpendC || 0,
      transport_spend_c: c.transportSpendC || 0,
      other_spend_c: c.otherSpendC || 0,
      total_spend_c: c.totalSpendC || 0,
      overtime_minutes: c.overtimeMinutes || 0,
      night_minutes: c.nightMinutes || 0,
    }));
    if (collabRows.length) {
      const { error: cErr } = await sb.from('confirmed_mobilization_collaborators').insert(collabRows);
      if (cErr) throw cErr;
    }

    await writeAuditEvent(record.request_id || null, data.correlation_id, 'mobilization_confirmed', actorId, {
      confirmedId, projectId: record.project_id, scheduleId: record.schedule_id,
      totalCostC: record.total_cost_c, teamSize: record.team_size, source: record.source,
    });
    return { confirmedId };
  } catch (err) {
    console.error('[confirmedPersistence] confirmação falhou:', err.message);
    // Roll back the parent so no partial record feeds the dashboard (§3.1).
    if (confirmedId) {
      await sb.from('confirmed_mobilizations').delete().eq('id', confirmedId).then(() => {}, () => {});
    }
    const e = new Error(err.message);
    e.code = 'CONFIRMATION_PERSIST_FAILED';
    throw e;
  }
}

/**
 * Read the governed dashboard dataset: eligible confirmed mobilizations with
 * their attributed collaborators embedded. The eligibility filter is applied in
 * SQL (belt) and again in the pure aggregations (suspenders).
 *
 * @param {{ since?: string }} [opts]
 * @returns {Promise<object[]>} rows with embedded `collaborators`
 */
export async function fetchConfirmedDataset({ since } = {}) {
  const sb = client();
  if (!sb) return [];
  try {
    let q = sb
      .from('confirmed_mobilizations')
      .select('*, collaborators:confirmed_mobilization_collaborators(*)')
      .in('confirmation_status', ['confirmed', 'in_progress', 'completed'])
      .order('confirmed_at', { ascending: false })
      .limit(5000);
    if (since) q = q.gte('confirmed_at', since);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[confirmedPersistence] leitura do dataset falhou:', err.message);
    return [];
  }
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
