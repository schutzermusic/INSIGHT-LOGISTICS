-- ============================================================================
-- 0003 — Employee mobilization cost profiles (§6)
-- ----------------------------------------------------------------------------
-- The hourly cost must come from the employee/payroll profile, never entered by
-- hand in the search flow (§6). Rates are stored in integer CENTAVOS. The
-- selected basis (base / fully_loaded / project_custom) is snapshotted with each
-- calculation so results stay reproducible if payroll later changes.
--
-- Backfills one profile per existing collaborator from collaborators.data:
--   base_hourly_rate_c = round(salarioBase / cargaHoraria * 100)
--   monthly_hour_divisor = cargaHoraria
-- Sensitive: readable only with the cost.view permission (§26).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hourly_cost_basis') then
    create type public.hourly_cost_basis as enum ('base', 'fully_loaded', 'project_custom');
  end if;
end$$;

create table if not exists public.employee_cost_profiles (
  id                        uuid primary key default gen_random_uuid(),
  employee_id               uuid not null references public.collaborators (id) on delete cascade,
  hourly_cost_basis         public.hourly_cost_basis not null default 'base',
  base_hourly_rate_c        bigint not null,                 -- centavos
  fully_loaded_hourly_rate_c bigint,                         -- centavos, optional (§6)
  monthly_hour_divisor      integer not null default 220,    -- configurable (§6)
  labor_policy_version_id   uuid references public.labor_policy_versions (id),
  work_schedule_id          text,
  source                    text not null default 'backfill_collaborators',
  effective_at              timestamptz not null default now(),
  data                      jsonb not null default '{}'::jsonb,
  created_by                uuid references public.profiles (id),
  created_at                timestamptz not null default now()
);

comment on table public.employee_cost_profiles is
  'Per-employee hourly cost basis in centavos (§6). Snapshotted per calculation.';

create unique index if not exists uq_employee_cost_profile_effective
  on public.employee_cost_profiles (employee_id, effective_at);
create index if not exists idx_employee_cost_profile_employee
  on public.employee_cost_profiles (employee_id, effective_at desc);

-- ---------------------------------------------------------------------------
-- Backfill from existing collaborators (idempotent: skip employees that already
-- have a profile). Guards divide-by-zero and missing salary gracefully.
-- ---------------------------------------------------------------------------
insert into public.employee_cost_profiles
  (employee_id, hourly_cost_basis, base_hourly_rate_c, monthly_hour_divisor,
   labor_policy_version_id, source)
select
  c.id,
  'base',
  round(
    (nullif(c.data ->> 'salarioBase', '')::numeric)
    / nullif((c.data ->> 'cargaHoraria')::numeric, 0)
    * 100
  )::bigint,
  coalesce(nullif(c.data ->> 'cargaHoraria', '')::integer, 220),
  '00000000-0000-4000-a000-000000000001'::uuid,
  'backfill_collaborators'
from public.collaborators c
where (c.data ->> 'salarioBase') is not null
  and nullif((c.data ->> 'cargaHoraria')::numeric, 0) is not null
  and not exists (
    select 1 from public.employee_cost_profiles ecp
    where ecp.employee_id = c.id
  );

-- ---------------------------------------------------------------------------
-- RLS: reading a cost profile requires cost.view; writing requires policy.edit
-- (payroll-derived data is administered, not user-editable in the search flow).
-- ---------------------------------------------------------------------------
alter table public.employee_cost_profiles enable row level security;

drop policy if exists cost_profile_read on public.employee_cost_profiles;
create policy cost_profile_read on public.employee_cost_profiles
  for select using (public.has_permission('cost.view'));

drop policy if exists cost_profile_write on public.employee_cost_profiles;
create policy cost_profile_write on public.employee_cost_profiles
  for all using (public.has_permission('policy.edit'))
  with check (public.has_permission('policy.edit'));
