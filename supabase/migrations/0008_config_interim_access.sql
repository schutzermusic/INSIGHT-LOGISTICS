-- ============================================================================
-- 0008 — INTERIM anon access to routing/cost configuration tables
-- ----------------------------------------------------------------------------
-- The app has no authentication yet (it uses the Supabase anon key, like the
-- existing collaborators/simulations tables). The admin Settings screen needs to
-- read and edit routing/cost configuration now. This migration adds permissive
-- policies so the anon role can read/write ONLY these non-sensitive config
-- tables. Salary/labor-sensitive tables (labor_policy_versions,
-- travel_time_policies, employee_cost_profiles, cost/audit) are intentionally
-- NOT relaxed and remain permission-gated.
--
-- ⚠️ INTERIM: when Supabase Auth + RBAC lands (Phase 8), DROP these *_anon_rw
-- policies so config editing again requires the `policy.edit` permission.
-- Additive and idempotent.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'connection_buffer_policies',
    'search_limit_policies',
    'meal_policies',
    'hotel_policies',
    'local_transport_policies',
    'vehicle_assumptions',
    'fuel_prices'
  ] loop
    execute format('drop policy if exists %1$s_anon_rw on public.%1$s;', t);
    execute format(
      'create policy %1$s_anon_rw on public.%1$s for all using (true) with check (true);', t
    );
  end loop;
end$$;
