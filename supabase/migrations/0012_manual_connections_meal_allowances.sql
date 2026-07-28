-- 0012 — Derived manual connections and versioned per-employee meal allowances

create table if not exists public.meal_allowance_policy_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Diária de alimentação de mobilização',
  version integer not null,
  status public.policy_status not null default 'draft',
  effective_from timestamptz not null default now(),
  leader_daily_c bigint not null default 12000,
  standard_daily_c bigint not null default 9000,
  max_allowances_per_local_day integer not null default 1
    check (max_allowances_per_local_day = 1),
  traveling_counts boolean not null default true,
  connection_waiting_counts boolean not null default true,
  hotel_away_from_base_counts boolean not null default true,
  timezone_basis text not null default 'segment_local'
    check (timezone_basis = 'segment_local'),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (name, version)
);

insert into public.meal_allowance_policy_versions
  (id, name, version, status, effective_from, leader_daily_c, standard_daily_c)
values
  ('00000000-0000-4000-a000-000000000021',
   'Diária de alimentação de mobilização', 1, 'approved', '2000-01-01', 12000, 9000)
on conflict (id) do nothing;

alter table public.collaborators
  add column if not exists allowance_category text not null default 'standard'
  check (allowance_category in ('leader', 'standard'));

alter table public.employee_cost_profiles
  add column if not exists allowance_category text not null default 'standard'
  check (allowance_category in ('leader', 'standard'));

alter table public.confirmed_mobilizations
  add column if not exists allowance_policy_version_id uuid
    references public.meal_allowance_policy_versions (id),
  add column if not exists allowance_snapshot jsonb not null default '{}'::jsonb;

alter table public.confirmed_mobilization_collaborators
  add column if not exists allowance_category_snapshot text,
  add column if not exists allowance_total_c bigint not null default 0,
  add column if not exists allowance_snapshot jsonb not null default '{}'::jsonb;

alter table public.meal_allowance_policy_versions enable row level security;

drop policy if exists meal_allowance_policy_read on public.meal_allowance_policy_versions;
create policy meal_allowance_policy_read on public.meal_allowance_policy_versions
  for select using (true);

drop policy if exists meal_allowance_policy_write on public.meal_allowance_policy_versions;
create policy meal_allowance_policy_write on public.meal_allowance_policy_versions
  for insert with check (public.has_permission('policy.edit'));

comment on table public.meal_allowance_policy_versions is
  'Immutable, versioned daily meal allowance values and local-calendar counting rules.';
comment on column public.confirmed_mobilizations.allowance_snapshot is
  'Immutable policy + per-employee eligible dates, quantities, unit values, totals and overrides.';
