-- ============================================================================
-- 0002 — Versioned labor policy & travel-time counting policy (§5, §8)
-- ----------------------------------------------------------------------------
-- Labor rules must be configurable and versioned, never hardcoded (§5, §32).
-- Policies are immutable once approved: to change a rule, insert a new version.
-- Time durations are stored in MINUTES; multipliers are absolute decimals.
-- Seeds one approved default policy matching §5 and a default travel-time policy.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'policy_status') then
    create type public.policy_status as enum ('draft', 'approved', 'retired');
  end if;
  if not exists (select 1 from pg_type where typname = 'premium_stacking_mode') then
    create type public.premium_stacking_mode as enum ('multiplicative', 'additive');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- Labor policy versions (§5).
-- ---------------------------------------------------------------------------
create table if not exists public.labor_policy_versions (
  id                                uuid primary key default gen_random_uuid(),
  name                              text not null,
  version                           integer not null default 1,
  status                            public.policy_status not null default 'draft',
  effective_from                    date not null,
  effective_to                      date,

  -- Weekday bands
  regular_daily_minutes             integer not null default 480,   -- 8h
  weekday_first_overtime_minutes    integer not null default 120,   -- next 2h
  weekday_first_overtime_multiplier numeric(6,3) not null default 1.500,
  weekday_excess_multiplier         numeric(6,3) not null default 2.000,

  -- Saturday
  saturday_regular_minutes          integer not null default 480,
  saturday_excess_multiplier        numeric(6,3) not null default 2.000,

  -- Sunday (all counted hours at this multiplier: base + 150% premium = 2.50)
  sunday_multiplier                 numeric(6,3) not null default 2.500,

  -- Night premium (overlapping, never a duplicated bucket §5)
  night_start_local_time            time not null default '22:00',
  night_end_local_time              time not null default '05:00',
  night_multiplier                  numeric(6,3) not null default 1.200, -- +20%

  -- How night stacks on top of overtime/weekend (§5). See seed note below.
  premium_stacking_mode             public.premium_stacking_mode not null default 'additive',

  -- Scope / applicability (§5): group, union, contract type, project override.
  employee_group                    text,
  union_agreement                   text,
  contract_type                     text,
  business_unit                     text,

  -- Approval trail (§5, §25)
  approved_by                       uuid references public.profiles (id),
  approved_at                       timestamptz,

  data                              jsonb not null default '{}'::jsonb,
  created_by                        uuid references public.profiles (id),
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now()
);

comment on table public.labor_policy_versions is
  'Versioned CLT-style labor policy (§5). Immutable once approved; new rules = new version.';
comment on column public.labor_policy_versions.premium_stacking_mode is
  'additive: base*(1 + otPremium + nightPremium). multiplicative: base*otMult*nightMult. Default additive per CLT add-on interpretation — CONFIRM with business.';

create index if not exists idx_labor_policy_effective
  on public.labor_policy_versions (status, effective_from desc);

drop trigger if exists trg_labor_policy_touch on public.labor_policy_versions;
create trigger trg_labor_policy_touch
  before update on public.labor_policy_versions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Travel-time counting policy (§8): which activities count as paid labor.
-- ---------------------------------------------------------------------------
create table if not exists public.travel_time_policies (
  id                              uuid primary key default gen_random_uuid(),
  name                            text not null,
  version                         integer not null default 1,
  status                          public.policy_status not null default 'draft',
  effective_from                  date not null,
  effective_to                    date,

  flight_time_counts              boolean not null default true,
  bus_time_counts                 boolean not null default true,
  passenger_vehicle_time_counts   boolean not null default true,
  driver_vehicle_time_counts      boolean not null default true,
  airport_waiting_counts          boolean not null default true,
  bus_terminal_waiting_counts     boolean not null default true,
  connection_waiting_counts       boolean not null default true,
  terminal_transfer_counts        boolean not null default true,
  check_in_counts                 boolean not null default true,
  baggage_claim_counts            boolean not null default true,
  overnight_bus_counts            boolean not null default true,
  overnight_flight_counts         boolean not null default true,
  hotel_rest_counts               boolean not null default false,
  meal_break_counts               boolean not null default false,

  business_unit                   text,
  data                            jsonb not null default '{}'::jsonb,
  created_by                      uuid references public.profiles (id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

comment on table public.travel_time_policies is
  'Per-activity labor-counting flags (§8). Versioned like labor policies.';

create index if not exists idx_travel_time_effective
  on public.travel_time_policies (status, effective_from desc);

drop trigger if exists trg_travel_time_touch on public.travel_time_policies;
create trigger trg_travel_time_touch
  before update on public.travel_time_policies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: default approved policies (§5). Stable UUIDs so later migrations and
-- backfills can reference them deterministically.
-- ---------------------------------------------------------------------------
insert into public.labor_policy_versions
  (id, name, version, status, effective_from, approved_at)
values
  ('00000000-0000-4000-a000-000000000001'::uuid,
   'Política CLT Padrão', 1, 'approved', '2000-01-01', now())
on conflict (id) do nothing;

insert into public.travel_time_policies
  (id, name, version, status, effective_from)
values
  ('00000000-0000-4000-a000-000000000002'::uuid,
   'Contagem de Tempo Padrão', 1, 'approved', '2000-01-01')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: everyone authenticated may read policies; only policy.edit may write.
-- ---------------------------------------------------------------------------
alter table public.labor_policy_versions enable row level security;
alter table public.travel_time_policies  enable row level security;

drop policy if exists labor_policy_read on public.labor_policy_versions;
create policy labor_policy_read on public.labor_policy_versions
  for select using (auth.uid() is not null);

drop policy if exists labor_policy_write on public.labor_policy_versions;
create policy labor_policy_write on public.labor_policy_versions
  for all using (public.has_permission('policy.edit'))
  with check (public.has_permission('policy.edit'));

drop policy if exists travel_policy_read on public.travel_time_policies;
create policy travel_policy_read on public.travel_time_policies
  for select using (auth.uid() is not null);

drop policy if exists travel_policy_write on public.travel_time_policies;
create policy travel_policy_write on public.travel_time_policies
  for all using (public.has_permission('policy.edit'))
  with check (public.has_permission('policy.edit'));
