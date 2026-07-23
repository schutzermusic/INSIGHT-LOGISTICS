-- ============================================================================
-- 0010 — Confirmed mobilizations (Dashboard eligibility gate, §3.1)
-- ----------------------------------------------------------------------------
-- The dashboard, HUD globe, KPIs, rankings, project/collaborator/category spend
-- and savings may be fed ONLY by mobilizations a user explicitly CONFIRMED in
-- the Manual Simulation or Automatic Mobilization flow. Drafts, searches,
-- previews, provider quotes and unselected scenarios must NEVER appear.
--
-- This migration introduces the single governed dataset every dashboard query
-- starts from:
--   confirmed_mobilizations              — one row per confirmed operation
--   confirmed_mobilization_collaborators — attributed per-person spend (Top 20)
--
-- Eligibility is an EXPLICIT status + timestamp (never derived from loosely
-- related fields, §3.1). Confirmation stores immutable snapshots so historical
-- dashboard figures stay reproducible even if project/employee metadata changes.
--
-- Monetary fields are integer CENTAVOS. Timestamps are timestamptz (UTC).
-- Additive and backward compatible: no existing table is altered.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lifecycle status (§3.1). Dashboard inclusion is decided ONLY from this.
--   confirmed | in_progress | completed  -> included
--   cancelled | rejected | archived      -> excluded from active (archived kept
--                                            for historical views if it was
--                                            previously confirmed)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'confirmation_status') then
    create type public.confirmation_status as enum
      ('confirmed', 'in_progress', 'completed', 'cancelled', 'rejected', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'confirmed_source') then
    create type public.confirmed_source as enum ('manual_simulation', 'automatic_mobilization');
  end if;
  if not exists (select 1 from pg_type where typname = 'operational_status') then
    create type public.operational_status as enum
      ('awaiting_departure', 'in_transit', 'delayed', 'at_risk', 'arrived');
  end if;
end$$;

create table if not exists public.confirmed_mobilizations (
  id                      uuid primary key default gen_random_uuid(),
  correlation_id          uuid not null default gen_random_uuid(),

  -- Governance: the explicit gate (§3.1).
  confirmation_status     public.confirmation_status not null default 'confirmed',
  operational_status      public.operational_status not null default 'awaiting_departure',
  source                  public.confirmed_source not null,

  -- Provenance back to the flow that produced the confirmed record.
  request_id              uuid references public.mobilization_requests (id),
  simulation_id           uuid references public.manual_mobilization_simulations (id),
  selected_itinerary_id   uuid references public.itineraries (id),
  selected_scenario_id    uuid references public.manual_mobilization_scenarios (id),
  engine_scenario_id      text,               -- id from the in-memory engine payload

  -- Governed references (§3.1 — reuse existing project/schedule entities). Ids
  -- are opaque strings so the app can map them to the enterprise model later;
  -- name snapshots keep historical figures reproducible.
  project_id              text not null,
  project_name_snapshot   text not null,
  schedule_id             text not null,
  schedule_name_snapshot  text not null,
  schedule_activity_id    text,
  schedule_activity_name_snapshot text,
  contract                text,
  cost_center             text,
  business_unit           text,

  -- Route + timing.
  origin_label            text not null,
  origin_lat             double precision,
  origin_lng             double precision,
  destination_label       text not null,
  destination_lat        double precision,
  destination_lng        double precision,
  planned_departure_at    timestamptz not null,
  expected_arrival_at     timestamptz not null,
  actual_arrival_at       timestamptz,
  duration_minutes        integer not null default 0,
  modal_primary           text not null default 'multimodal',
  mode_sequence           jsonb not null default '[]'::jsonb,
  team_size               integer not null default 0,

  -- Cost snapshot (§3.1 immutability). Normalized category rollup in centavos +
  -- the full immutable breakdown/labor/policy snapshots in JSONB.
  total_cost_c            bigint not null default 0,
  labor_cost_c            bigint not null default 0,
  transport_cost_c        bigint not null default 0,
  accommodation_cost_c    bigint not null default 0,
  meals_cost_c            bigint not null default 0,
  local_cost_c            bigint not null default 0,
  overtime_cost_c         bigint not null default 0,
  night_premium_cost_c    bigint not null default 0,
  category_spend          jsonb not null default '{}'::jsonb,   -- normalized category -> centavos
  baseline_cost_c         bigint,                                -- most expensive viable alternative
  estimated_savings_c     bigint not null default 0,

  cost_snapshot           jsonb not null default '{}'::jsonb,    -- full breakdown (immutable)
  labor_snapshot          jsonb not null default '{}'::jsonb,    -- per-employee labor (immutable)
  route_snapshot          jsonb not null default '{}'::jsonb,    -- segments (immutable)
  employee_snapshot       jsonb not null default '[]'::jsonb,    -- [{id,name,role}] (immutable)
  labor_policy_version_id uuid references public.labor_policy_versions (id),

  -- Risk / SLA.
  risk_level              text not null default 'low',           -- low | medium | high
  on_time                 boolean,
  risk_flags              jsonb not null default '[]'::jsonb,

  -- Confirmation authorship (§3.1).
  confirmed_by            uuid references public.profiles (id),
  confirmed_by_name       text,
  confirmed_at            timestamptz not null default now(),
  superseded_by           uuid references public.confirmed_mobilizations (id),

  data                    jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.confirmed_mobilizations is
  'The ONLY dashboard-eligible dataset (§3.1). One row per explicitly confirmed mobilization with immutable snapshots.';

-- Dashboard reads always filter by status + confirmed_at window and group by
-- project / cost center; index those access paths.
create index if not exists idx_confirmed_status_time
  on public.confirmed_mobilizations (confirmation_status, confirmed_at desc);
create index if not exists idx_confirmed_project
  on public.confirmed_mobilizations (project_id, confirmed_at desc);
create index if not exists idx_confirmed_op_status
  on public.confirmed_mobilizations (operational_status)
  where confirmation_status in ('confirmed', 'in_progress');

drop trigger if exists trg_confirmed_touch on public.confirmed_mobilizations;
create trigger trg_confirmed_touch before update on public.confirmed_mobilizations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Per-collaborator attributed spend (§6.3 Top-20, §10 attribution). Denormalized
-- from the confirmation for fast ranking; snapshots keep it reproducible.
-- ---------------------------------------------------------------------------
create table if not exists public.confirmed_mobilization_collaborators (
  id                     uuid primary key default gen_random_uuid(),
  confirmed_id           uuid not null references public.confirmed_mobilizations (id) on delete cascade,
  employee_id            uuid,                       -- collaborators(id) / profiles(id) when known
  employee_id_text       text,                       -- fallback opaque id
  employee_name_snapshot text not null,
  role_snapshot          text,
  labor_spend_c          bigint not null default 0,
  transport_spend_c      bigint not null default 0,
  other_spend_c          bigint not null default 0,   -- accommodation + meals + local + transfers
  total_spend_c          bigint not null default 0,
  overtime_minutes       integer not null default 0,
  night_minutes          integer not null default 0,
  created_at             timestamptz not null default now()
);

comment on table public.confirmed_mobilization_collaborators is
  'Attributed per-person mobilization spend for confirmed operations (§6.3, §10).';
create index if not exists idx_confirmed_collab_emp
  on public.confirmed_mobilization_collaborators (employee_id, confirmed_id);
create index if not exists idx_confirmed_collab_conf
  on public.confirmed_mobilization_collaborators (confirmed_id);

-- ---------------------------------------------------------------------------
-- RLS (§3.1, §26): dashboard readers need mobilization.search or audit.view;
-- writing a confirmation needs mobilization.confirm (service-role bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.confirmed_mobilizations              enable row level security;
alter table public.confirmed_mobilization_collaborators enable row level security;

drop policy if exists confirmed_read on public.confirmed_mobilizations;
create policy confirmed_read on public.confirmed_mobilizations
  for select using (
    public.has_permission('mobilization.search') or public.has_permission('audit.view')
  );

drop policy if exists confirmed_write on public.confirmed_mobilizations;
create policy confirmed_write on public.confirmed_mobilizations
  for all
  using (public.has_permission('mobilization.confirm'))
  with check (public.has_permission('mobilization.confirm'));

drop policy if exists confirmed_collab_read on public.confirmed_mobilization_collaborators;
create policy confirmed_collab_read on public.confirmed_mobilization_collaborators
  for select using (
    public.has_permission('mobilization.search') or public.has_permission('audit.view')
  );

drop policy if exists confirmed_collab_write on public.confirmed_mobilization_collaborators;
create policy confirmed_collab_write on public.confirmed_mobilization_collaborators
  for all
  using (public.has_permission('mobilization.confirm'))
  with check (public.has_permission('mobilization.confirm'));

-- ---------------------------------------------------------------------------
-- §26 permission: grant mobilization.confirm to anyone who can already search,
-- so existing operators keep working.
-- ---------------------------------------------------------------------------
update public.profiles
  set permissions = (
    select jsonb_agg(distinct p)
    from jsonb_array_elements(
      permissions || '["mobilization.confirm"]'::jsonb
    ) as p
  )
  where permissions ? 'mobilization.search';
