-- ============================================================================
-- 0009 — Manual Mobilization Simulator (§18, §19, §20)
-- ----------------------------------------------------------------------------
-- Persists manually-entered mobilization simulations, their scenarios, the
-- normalized segments, and the per-employee labor calculation blocks — as
-- immutable audit snapshots (§18/§23). Reuses the existing versioned
-- labor/travel-time policies (0002), the RBAC helper `has_permission` (0001)
-- and `touch_updated_at` (0001). Additive and backward compatible: no existing
-- table is altered.
--
-- Also: adds the Saturday-all-overtime policy flag to labor_policy_versions and
-- seeds an APPROVED v2 default policy where Saturday is +100% from the first
-- minute (§4.2 / Fase 2). The v1 seed row is retired (kept for historical
-- reproducibility — snapshots reference the version they were computed with).
--
-- Monetary fields are integer CENTAVOS. Timestamps are timestamptz (UTC); each
-- segment keeps its local IANA timezone for labor classification (§14).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Policy: Saturday-all-overtime flag (§4.2). Configurable + versioned (§5).
-- ---------------------------------------------------------------------------
alter table public.labor_policy_versions
  add column if not exists saturday_all_hours_overtime boolean not null default true;

comment on column public.labor_policy_versions.saturday_all_hours_overtime is
  '§4.2: when true, every counted Saturday minute is overtime (+100%) from the first minute — overrides saturday_regular_minutes.';

-- Retire the legacy v1 policy and seed the corrected approved v2 default with a
-- STABLE uuid so snapshots and the in-memory DEFAULT_LABOR_POLICY agree.
update public.labor_policy_versions
  set status = 'retired', effective_to = coalesce(effective_to, current_date)
  where id = '00000000-0000-4000-a000-000000000001'::uuid;

insert into public.labor_policy_versions
  (id, name, version, status, effective_from, approved_at,
   regular_daily_minutes, weekday_first_overtime_minutes, weekday_first_overtime_multiplier,
   weekday_excess_multiplier, saturday_regular_minutes, saturday_excess_multiplier,
   saturday_all_hours_overtime, sunday_multiplier, night_start_local_time, night_end_local_time,
   night_multiplier, premium_stacking_mode, data)
values
  ('00000000-0000-4000-a000-000000000011'::uuid,
   'Política CLT Padrão', 2, 'approved', current_date, now(),
   480, 120, 1.500, 2.000, 480, 2.000, true, 2.500, '22:00', '05:00',
   1.200, 'additive', '{"interJourneyRestMinutes": 660}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Simulation lifecycle + scenario lifecycle enums (§18).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'manual_simulation_status') then
    create type public.manual_simulation_status as enum
      ('draft', 'calculated', 'selected', 'submitted', 'approved', 'rejected', 'expired', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'manual_scenario_status') then
    create type public.manual_scenario_status as enum
      ('draft', 'valid', 'warning', 'invalid', 'selected', 'superseded');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- Manual simulation (§6.1 context).
-- ---------------------------------------------------------------------------
create table if not exists public.manual_mobilization_simulations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  status                 public.manual_simulation_status not null default 'draft',
  origin                 text,
  destination            text,
  earliest_departure_at  timestamptz,
  required_arrival_at    timestamptz,
  employee_ids           uuid[] not null default '{}',
  project                text,
  contract               text,
  cost_center            text,
  business_unit          text,
  labor_policy_version_id  uuid references public.labor_policy_versions (id),
  travel_time_policy_id    uuid references public.travel_time_policies (id),
  created_by             uuid references public.profiles (id),
  data                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.manual_mobilization_simulations is 'Manual mobilization simulation context (§6, §18).';
create index if not exists idx_manual_sim_creator on public.manual_mobilization_simulations (created_by, created_at desc);

drop trigger if exists trg_manual_sim_touch on public.manual_mobilization_simulations;
create trigger trg_manual_sim_touch before update on public.manual_mobilization_simulations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Manual scenario (§6.2) — a costed alternative of a simulation.
-- ---------------------------------------------------------------------------
create table if not exists public.manual_mobilization_scenarios (
  id                        uuid primary key default gen_random_uuid(),
  simulation_id             uuid not null references public.manual_mobilization_simulations (id) on delete cascade,
  name                      text not null,
  status                    public.manual_scenario_status not null default 'draft',
  departure_at              timestamptz,
  arrival_at                timestamptz,
  duration_minutes          integer not null default 0,
  commercial_cost_c         bigint not null default 0,
  labor_cost_c              bigint not null default 0,
  permanence_cost_c         bigint not null default 0,
  local_mobility_cost_c     bigint not null default 0,
  total_mobilization_cost_c bigint not null default 0,
  feasibility_status        public.feasibility_status not null default 'valid',
  is_recommended            boolean not null default false,
  data                      jsonb not null default '{}'::jsonb,   -- breakdown, checks, rest, gaps
  created_at                timestamptz not null default now()
);
comment on table public.manual_mobilization_scenarios is 'Costed manual scenario (§6.2, §13). Costs in centavos.';
create index if not exists idx_manual_scenario_sim on public.manual_mobilization_scenarios (simulation_id);

-- ---------------------------------------------------------------------------
-- Manual itinerary segments (§7, §10). UTC times + local zones (§14).
-- ---------------------------------------------------------------------------
create table if not exists public.manual_itinerary_segments (
  id                     uuid primary key default gen_random_uuid(),
  scenario_id            uuid not null references public.manual_mobilization_scenarios (id) on delete cascade,
  sequence               integer not null,
  segment_type           text not null,
  mode                   text not null,
  origin_location_id     text not null,
  destination_location_id text not null,
  departure_at           timestamptz,
  arrival_at             timestamptz,
  origin_timezone        text not null,
  destination_timezone   text not null,
  provider_name          text,
  price_amount_c         bigint not null default 0,   -- RESOLVED total for the segment (§7.2)
  price_allocation       text not null default 'none',
  currency               text not null default 'BRL',
  passenger_ids          uuid[] not null default '{}',
  labor_counting_rule_id text not null,
  counts_as_labor        boolean,
  qualifies_as_rest      boolean,
  source                 text not null default 'manual',   -- manual | derived
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
comment on table public.manual_itinerary_segments is 'Normalized manual segments (§7, §10). price_amount_c is the resolved segment total.';
create unique index if not exists uq_manual_segment_seq on public.manual_itinerary_segments (scenario_id, sequence);

-- ---------------------------------------------------------------------------
-- Per-employee labor calculation blocks (§11, §19) — reproducible snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.manual_labor_calculation_blocks (
  id                     uuid primary key default gen_random_uuid(),
  scenario_id            uuid not null references public.manual_mobilization_scenarios (id) on delete cascade,
  employee_id            uuid references public.profiles (id),
  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  local_timezone         text not null,
  counted_minutes        integer not null,
  day_type               text,                         -- weekday | saturday | sunday | holiday
  base_classification    text not null,
  night_premium_applied  boolean not null default false,
  holiday_premium_applied boolean not null default false,
  hourly_rate_c          bigint not null default 0,
  applied_multipliers    jsonb not null default '[]'::jsonb,
  calculated_cost_c      bigint not null default 0,
  explanation            text,
  created_at             timestamptz not null default now()
);
comment on table public.manual_labor_calculation_blocks is 'Immutable per-minute labor blocks per employee (§11, §19).';
create index if not exists idx_manual_labor_scenario on public.manual_labor_calculation_blocks (scenario_id, employee_id);

-- ---------------------------------------------------------------------------
-- RLS (§20, §26): create readable by creator or mobilization.search; hourly
-- rate columns in labor blocks additionally gated by cost.view / payroll.view
-- at the application layer (masked in the API for users without permission).
-- ---------------------------------------------------------------------------
alter table public.manual_mobilization_simulations enable row level security;
alter table public.manual_mobilization_scenarios   enable row level security;
alter table public.manual_itinerary_segments       enable row level security;
alter table public.manual_labor_calculation_blocks enable row level security;

drop policy if exists manual_sim_rw on public.manual_mobilization_simulations;
create policy manual_sim_rw on public.manual_mobilization_simulations
  for all
  using (created_by = auth.uid() or public.has_permission('mobilization.search') or public.has_permission('audit.view'))
  with check (public.has_permission('mobilization.create') or public.has_permission('mobilization.search'));

drop policy if exists manual_scenario_read on public.manual_mobilization_scenarios;
create policy manual_scenario_read on public.manual_mobilization_scenarios
  for select using (public.has_permission('mobilization.search') or public.has_permission('audit.view'));

drop policy if exists manual_segment_read on public.manual_itinerary_segments;
create policy manual_segment_read on public.manual_itinerary_segments
  for select using (public.has_permission('mobilization.search') or public.has_permission('audit.view'));

drop policy if exists manual_labor_read on public.manual_labor_calculation_blocks;
create policy manual_labor_read on public.manual_labor_calculation_blocks
  for select using (public.has_permission('labor_breakdown.view') or public.has_permission('audit.view'));

-- ---------------------------------------------------------------------------
-- §20 permissions: register the new capability slugs on admin/operator profiles
-- so existing users keep working. Slugs used by the app + RLS above:
--   mobilization.create, labor_breakdown.view, recommendation.override,
--   mobilization.approve  (existing: mobilization.search, cost.view,
--   payroll.view, policy.edit, provider_prices.view, audit.view).
-- Grant the manual-simulator slugs to anyone who can already search.
-- ---------------------------------------------------------------------------
update public.profiles
  set permissions = (
    select jsonb_agg(distinct p)
    from jsonb_array_elements(
      permissions || '["mobilization.create","labor_breakdown.view"]'::jsonb
    ) as p
  )
  where permissions ? 'mobilization.search';
