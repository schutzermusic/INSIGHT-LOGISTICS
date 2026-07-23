-- ============================================================================
-- 0006 — Administrative configuration (§22), all changes audited
-- ----------------------------------------------------------------------------
-- Extends configuration for meals, hotels, local transport, connection buffers,
-- search limits, vehicle assumptions, fuel prices, holiday calendars and
-- approved providers. Every change is captured in config_audit_events via a
-- shared trigger (§22: "All configuration changes must be audited").
-- Monetary defaults are integer CENTAVOS, seeded from today's hardcoded values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generic config audit log + trigger.
-- ---------------------------------------------------------------------------
create table if not exists public.config_audit_events (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  row_id      uuid,
  operation   text not null,           -- INSERT | UPDATE | DELETE
  actor_id    uuid,                     -- auth.uid() at change time
  old_row     jsonb,
  new_row     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_config_audit_table on public.config_audit_events (table_name, created_at desc);

create or replace function public.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
begin
  v_row_id := coalesce(
    case when tg_op = 'DELETE' then (old).id else (new).id end,
    null
  );
  insert into public.config_audit_events (table_name, row_id, operation, actor_id, old_row, new_row)
  values (
    tg_table_name,
    v_row_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Attach audit + updated_at triggers and RLS to a config table in one call.
-- (Executed inline below per table; Postgres has no "for each table" macro.)

-- ---------------------------------------------------------------------------
-- Config tables. Common columns: scope (business_unit/project), value(s), data.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  daily_meal_cost_c bigint not null default 8000,      -- R$80,00
  business_unit text, project text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hotel_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  daily_hotel_cost_c bigint not null default 15000,    -- R$150,00
  business_unit text, project text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.local_transport_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  daily_local_transport_cost_c bigint not null default 4000,   -- R$40,00
  business_unit text, project text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connection_buffer_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  same_terminal_buffer_min integer not null default 60,
  bus_to_flight_buffer_min integer not null default 180,
  flight_to_bus_buffer_min integer not null default 90,
  different_terminal_transfer_min integer not null default 60,
  disembark_buffer_min integer not null default 20,
  airport_checkin_buffer_min integer not null default 90,
  business_unit text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_limit_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_total_trip_minutes integer not null default 2880,   -- 48h
  max_segments integer not null default 6,
  max_modal_changes integer not null default 3,
  max_connections integer not null default 4,
  max_wait_per_connection_min integer not null default 480,
  max_cumulative_wait_min integer not null default 720,
  max_backtracking_km integer not null default 150,
  max_price_deviation_pct numeric(6,2) not null default 60.00,
  max_duration_deviation_pct numeric(6,2) not null default 100.00,
  driver_max_continuous_drive_min integer not null default 330, -- 5h30
  mandatory_rest_min integer not null default 30,
  business_unit text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_assumptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'padrao',
  fuel_consumption_km_per_l numeric(6,2) not null default 10.00,
  rental_per_day_c bigint not null default 18000,         -- R$180,00
  avg_speed_kmh integer not null default 80,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  region text not null default 'BR',
  fuel_type text not null default 'gasolina',
  price_per_liter_c bigint not null default 589,          -- R$5,89
  effective_from date not null default '2000-01-01',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'national',   -- national | state:XX | municipal:city
  holiday_date date not null,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_holiday on public.holiday_calendars (scope, holiday_date);

create table if not exists public.approved_providers (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  adapter_kind text not null,       -- flight | bus | rental_car | road_route | transfer
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_provider on public.approved_providers (provider_id, adapter_kind);

-- ---------------------------------------------------------------------------
-- Seed default config rows (one each), matching current hardcoded assumptions.
-- ---------------------------------------------------------------------------
insert into public.meal_policies (name) values ('Padrão') on conflict do nothing;
insert into public.hotel_policies (name) values ('Padrão') on conflict do nothing;
insert into public.local_transport_policies (name) values ('Padrão') on conflict do nothing;
insert into public.connection_buffer_policies (name) values ('Padrão') on conflict do nothing;
insert into public.search_limit_policies (name) values ('Padrão') on conflict do nothing;
insert into public.vehicle_assumptions (name) values ('Padrão') on conflict do nothing;
insert into public.fuel_prices (region) values ('BR') on conflict do nothing;
insert into public.approved_providers (provider_id, adapter_kind) values
  ('serpapi_google_flights', 'flight'),
  ('quero_passagem', 'bus'),
  ('google_routes', 'road_route')
on conflict (provider_id, adapter_kind) do nothing;

-- ---------------------------------------------------------------------------
-- Attach updated_at + audit triggers and RLS to every config table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'meal_policies','hotel_policies','local_transport_policies',
    'connection_buffer_policies','search_limit_policies','vehicle_assumptions',
    'fuel_prices','holiday_calendars','approved_providers'
  ] loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$s;', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$s
                    for each row execute function public.touch_updated_at();', t);

    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit
                    after insert or update or delete on public.%1$s
                    for each row execute function public.audit_config_change();', t);

    execute format('alter table public.%1$s enable row level security;', t);

    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('create policy %1$s_read on public.%1$s
                    for select using (auth.uid() is not null);', t);

    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s
                    for all using (public.has_permission(''policy.edit''))
                    with check (public.has_permission(''policy.edit''));', t);
  end loop;
end$$;

alter table public.config_audit_events enable row level security;
drop policy if exists config_audit_read on public.config_audit_events;
create policy config_audit_read on public.config_audit_events
  for select using (public.has_permission('audit.view'));
