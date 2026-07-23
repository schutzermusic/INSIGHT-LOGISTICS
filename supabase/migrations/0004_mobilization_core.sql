-- ============================================================================
-- 0004 — Mobilization core: requests, provider snapshots, itineraries, segments
-- ----------------------------------------------------------------------------
-- Maps the §16 domain shapes to storage. Timestamps are timestamptz (UTC);
-- per-segment local timezone is preserved for labor classification (§14).
-- Monetary fields are integer CENTAVOS. Provider snapshots are immutable (§23).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feasibility_status') then
    create type public.feasibility_status as enum ('valid', 'invalid', 'warning');
  end if;
  if not exists (select 1 from pg_type where typname = 'mobilization_request_status') then
    create type public.mobilization_request_status as enum
      ('searching', 'completed', 'partial', 'failed', 'selected', 'pending_approval', 'approved', 'rejected');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- Mobilization request — the §2 primary flow inputs.
-- ---------------------------------------------------------------------------
create table if not exists public.mobilization_requests (
  id                     uuid primary key default gen_random_uuid(),
  correlation_id         uuid not null default gen_random_uuid(),  -- observability (§27)
  status                 public.mobilization_request_status not null default 'searching',

  origin_city            text not null,
  destination_city       text not null,
  earliest_departure_at  timestamptz not null,
  required_arrival_at    timestamptz not null,                     -- deadline (§20 feasibility)

  employee_ids           uuid[] not null default '{}',             -- collaborators(id)
  baggage_config         jsonb not null default '{}'::jsonb,
  vehicle_config         jsonb not null default '{}'::jsonb,

  labor_policy_version_id  uuid references public.labor_policy_versions (id),
  travel_time_policy_id    uuid references public.travel_time_policies (id),

  requested_by           uuid references public.profiles (id),      -- §25
  data                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.mobilization_requests is 'A mobilization search request (§2) with pinned policy versions.';

-- §23: index for search and audit queries.
create index if not exists idx_mob_request_requester on public.mobilization_requests (requested_by, created_at desc);
create index if not exists idx_mob_request_status on public.mobilization_requests (status, created_at desc);

drop trigger if exists trg_mob_request_touch on public.mobilization_requests;
create trigger trg_mob_request_touch
  before update on public.mobilization_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Provider search snapshots (§17, §23) — immutable capture of what each adapter
-- returned, with freshness/params/errors for auditability and reproducibility.
-- ---------------------------------------------------------------------------
create table if not exists public.mobilization_search_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.mobilization_requests (id) on delete cascade,
  provider_id        text not null,
  adapter_kind       text not null,                 -- flight | bus | rental_car | road_route | transfer
  requested_at       timestamptz not null,
  responded_at       timestamptz not null,
  price_fresh_at     timestamptz,
  cache_expires_at   timestamptz,
  success            boolean not null default false,
  partial            boolean not null default false,
  currency           text not null default 'BRL',
  search_params      jsonb not null default '{}'::jsonb,
  errors             jsonb not null default '[]'::jsonb,
  normalized_options jsonb not null default '[]'::jsonb,  -- NormalizedOption[] (§17)
  raw                jsonb not null default '{}'::jsonb,   -- original payload for audit
  created_at         timestamptz not null default now()
);

comment on table public.mobilization_search_snapshots is 'Immutable provider result capture (§17, §23).';
create index if not exists idx_snapshot_request on public.mobilization_search_snapshots (request_id, provider_id);

-- ---------------------------------------------------------------------------
-- Itineraries (§16 MultimodalItinerary).
-- ---------------------------------------------------------------------------
create table if not exists public.itineraries (
  id                        uuid primary key default gen_random_uuid(),
  request_id                uuid not null references public.mobilization_requests (id) on delete cascade,
  departure_at              timestamptz not null,
  arrival_at                timestamptz not null,
  duration_minutes          integer not null,
  connection_count          integer not null default 0,
  modal_change_count        integer not null default 0,

  commercial_cost_c         bigint not null default 0,
  labor_cost_c              bigint not null default 0,
  permanence_cost_c         bigint not null default 0,
  local_mobility_cost_c     bigint not null default 0,
  risk_cost_c               bigint,
  total_mobilization_cost_c bigint not null default 0,

  feasibility_status        public.feasibility_status not null default 'valid',
  feasibility_reasons       jsonb not null default '[]'::jsonb,   -- reason codes (§20)
  score                     numeric(8,3) not null default 0,
  ranking_category          text,
  is_selected               boolean not null default false,
  data                      jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now()
);

comment on table public.itineraries is 'Ranked door-to-door itineraries (§16). Costs in centavos.';
create index if not exists idx_itinerary_request on public.itineraries (request_id, score desc);

-- ---------------------------------------------------------------------------
-- Itinerary segments (§16 ItinerarySegment). UTC times + local zones (§14).
-- ---------------------------------------------------------------------------
create table if not exists public.itinerary_segments (
  id                     uuid primary key default gen_random_uuid(),
  itinerary_id           uuid not null references public.itineraries (id) on delete cascade,
  sequence               integer not null,
  mode                   text not null,                 -- TransportMode
  origin_location_id     text not null,
  destination_location_id text not null,
  departure_at           timestamptz not null,
  arrival_at             timestamptz not null,
  origin_timezone        text not null,                 -- IANA zone
  destination_timezone   text not null,
  provider_id            text,
  provider_reference     text,
  commercial_cost_c      bigint not null default 0,
  currency               text not null default 'BRL',
  availability_status    text,
  labor_counting_rule_id text not null,                 -- LaborCountingRuleId (§8)
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

comment on table public.itinerary_segments is 'Segments of an itinerary (§16). Times UTC, local zones preserved (§14).';
create unique index if not exists uq_segment_sequence on public.itinerary_segments (itinerary_id, sequence);

-- ---------------------------------------------------------------------------
-- RLS: search results readable by requester or audit.view; provider prices in
-- snapshots additionally gated by provider_prices.view (§26).
-- ---------------------------------------------------------------------------
alter table public.mobilization_requests         enable row level security;
alter table public.mobilization_search_snapshots enable row level security;
alter table public.itineraries                   enable row level security;
alter table public.itinerary_segments            enable row level security;

drop policy if exists mob_request_rw on public.mobilization_requests;
create policy mob_request_rw on public.mobilization_requests
  for all
  using (requested_by = auth.uid() or public.has_permission('audit.view') or public.has_permission('mobilization.search'))
  with check (public.has_permission('mobilization.search'));

drop policy if exists snapshot_read on public.mobilization_search_snapshots;
create policy snapshot_read on public.mobilization_search_snapshots
  for select using (public.has_permission('provider_prices.view') or public.has_permission('audit.view'));

drop policy if exists itinerary_read on public.itineraries;
create policy itinerary_read on public.itineraries
  for select using (
    public.has_permission('mobilization.search') or public.has_permission('audit.view')
  );

drop policy if exists segment_read on public.itinerary_segments;
create policy segment_read on public.itinerary_segments
  for select using (
    public.has_permission('mobilization.search') or public.has_permission('audit.view')
  );
