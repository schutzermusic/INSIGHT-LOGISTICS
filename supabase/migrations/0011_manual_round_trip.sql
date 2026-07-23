-- ============================================================================
-- 0011 — Revised manual simulator context, round trip and audit
-- ----------------------------------------------------------------------------
-- Additive extension of the normalized manual domain introduced by 0009.
-- Project/schedule intentionally remain outside the draft context and are still
-- mandatory only at the confirmation gate (0010).
-- ============================================================================

alter table public.manual_mobilization_simulations
  add column if not exists trip_type text not null default 'oneway',
  add column if not exists outbound_date date,
  add column if not exists return_date date;

alter table public.manual_mobilization_simulations
  drop constraint if exists manual_simulation_trip_type_check;
alter table public.manual_mobilization_simulations
  add constraint manual_simulation_trip_type_check
  check (trip_type in ('oneway', 'roundtrip'));

alter table public.manual_mobilization_simulations
  drop constraint if exists manual_simulation_return_date_check;
alter table public.manual_mobilization_simulations
  add constraint manual_simulation_return_date_check
  check (
    (trip_type = 'oneway' and return_date is null)
    or
    (trip_type = 'roundtrip' and return_date is not null and (outbound_date is null or return_date >= outbound_date))
  );

alter table public.manual_itinerary_segments
  add column if not exists direction text not null default 'outbound';

alter table public.manual_itinerary_segments
  drop constraint if exists manual_segment_direction_check;
alter table public.manual_itinerary_segments
  add constraint manual_segment_direction_check
  check (direction in ('outbound', 'return'));

create index if not exists idx_manual_segments_direction
  on public.manual_itinerary_segments (scenario_id, direction, sequence);

-- Append-only audit stream for manual draft/calculation lifecycle. Calculation
-- snapshots keep the detailed segment, labor and cost data in their normalized
-- tables; this stream records who performed each relevant action.
create table if not exists public.manual_simulation_audit_events (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.manual_mobilization_simulations (id) on delete cascade,
  event_type    text not null,
  actor_id      uuid references public.profiles (id),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_manual_audit_simulation
  on public.manual_simulation_audit_events (simulation_id, created_at);

alter table public.manual_simulation_audit_events enable row level security;

drop policy if exists manual_audit_read on public.manual_simulation_audit_events;
create policy manual_audit_read on public.manual_simulation_audit_events
  for select using (public.has_permission('audit.view'));

drop policy if exists manual_audit_insert on public.manual_simulation_audit_events;
create policy manual_audit_insert on public.manual_simulation_audit_events
  for insert with check (
    public.has_permission('mobilization.create')
    or public.has_permission('mobilization.search')
  );

comment on column public.manual_mobilization_simulations.trip_type is
  'oneway or roundtrip; return timeline remains independently editable.';
comment on column public.manual_itinerary_segments.direction is
  'Normalized timeline direction: outbound or return.';
comment on table public.manual_simulation_audit_events is
  'Append-only manual simulator lifecycle audit events.';
