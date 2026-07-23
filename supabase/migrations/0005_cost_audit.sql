-- ============================================================================
-- 0005 — Cost breakdowns, labor blocks, recommendations, feasibility, audit
-- ----------------------------------------------------------------------------
-- Structured, reproducible cost decomposition (§19) and minute-accurate labor
-- blocks (§15). Every recommendation retains exact inputs and policy versions
-- (§23, §25). Audit events, approvals and overrides are append-only.
-- All monetary fields are integer CENTAVOS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cost breakdown per itinerary (§19) — components, not just a total.
-- ---------------------------------------------------------------------------
create table if not exists public.cost_breakdowns (
  id                    uuid primary key default gen_random_uuid(),
  itinerary_id          uuid not null references public.itineraries (id) on delete cascade,

  -- Commercial transport (§19)
  ticket_c              bigint not null default 0,
  baggage_fees_c        bigint not null default 0,
  booking_fees_c        bigint not null default 0,
  taxes_c               bigint not null default 0,

  -- Road vehicle (§19)
  rental_c              bigint not null default 0,
  fuel_c                bigint not null default 0,
  tolls_c               bigint not null default 0,
  parking_c             bigint not null default 0,
  one_way_return_fee_c  bigint not null default 0,

  -- Permanence (§19)
  hotel_c               bigint not null default 0,
  meals_c               bigint not null default 0,
  daily_allowance_c     bigint not null default 0,
  local_transport_c     bigint not null default 0,

  -- Labor + local + risk
  labor_c               bigint not null default 0,
  terminal_transfers_c  bigint not null default 0,
  risk_c                bigint not null default 0,
  other_expenses_c      bigint not null default 0,

  total_c               bigint not null default 0,
  breakdown             jsonb not null default '{}'::jsonb,   -- full structured detail
  created_at            timestamptz not null default now()
);

comment on table public.cost_breakdowns is 'Per-itinerary cost components in centavos (§19).';
create index if not exists idx_cost_breakdown_itinerary on public.cost_breakdowns (itinerary_id);

-- ---------------------------------------------------------------------------
-- Labor cost blocks (§15) — minute-accurate, reproducible classification.
-- ---------------------------------------------------------------------------
create table if not exists public.labor_cost_blocks (
  id                     uuid primary key default gen_random_uuid(),
  itinerary_id           uuid not null references public.itineraries (id) on delete cascade,
  employee_id            uuid references public.collaborators (id),
  segment_id             uuid references public.itinerary_segments (id),

  start_at               timestamptz not null,
  end_at                 timestamptz not null,
  local_timezone         text not null,
  counted_minutes        integer not null,
  base_classification    text not null,          -- regular | overtime_50 | overtime_100 | overtime_150 | custom
  night_premium_applied  boolean not null default false,
  holiday_premium_applied boolean not null default false,
  hourly_rate_c          bigint not null,
  applied_multipliers    jsonb not null default '[]'::jsonb,
  calculated_cost_c      bigint not null,
  policy_version_id      uuid references public.labor_policy_versions (id),
  explanation            text,
  created_at             timestamptz not null default now()
);

comment on table public.labor_cost_blocks is 'Minute-accurate labor classification blocks (§15). Total is reproducible from these.';
create index if not exists idx_labor_block_itinerary on public.labor_cost_blocks (itinerary_id, employee_id);

-- ---------------------------------------------------------------------------
-- Feasibility checks (§20) — one row per rule evaluated per itinerary.
-- ---------------------------------------------------------------------------
create table if not exists public.feasibility_checks (
  id            uuid primary key default gen_random_uuid(),
  itinerary_id  uuid not null references public.itineraries (id) on delete cascade,
  check_code    text not null,          -- e.g. arrival_before_deadline, valid_connections
  passed        boolean not null,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_feasibility_itinerary on public.feasibility_checks (itinerary_id);

-- ---------------------------------------------------------------------------
-- Recommendations (§20) — the ranked verdict with reason codes.
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid not null references public.mobilization_requests (id) on delete cascade,
  itinerary_id         uuid not null references public.itineraries (id),
  score                numeric(8,3) not null default 0,
  ranking_category     text,
  reason_codes         jsonb not null default '[]'::jsonb,      -- deterministic (§20)
  explanation          text,                                    -- may be AI-worded, never AI-figured (§20)
  weighting_used       jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists idx_recommendation_request on public.recommendations (request_id);

-- ---------------------------------------------------------------------------
-- Audit events, approvals, overrides (§25) — append-only.
-- ---------------------------------------------------------------------------
create table if not exists public.mobilization_audit_events (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid references public.mobilization_requests (id) on delete cascade,
  correlation_id uuid,
  event_type     text not null,     -- search_started, results_ready, itinerary_selected, override, ...
  actor_id       uuid references public.profiles (id),
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_request on public.mobilization_audit_events (request_id, created_at);

create table if not exists public.approval_history (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.mobilization_requests (id) on delete cascade,
  itinerary_id uuid references public.itineraries (id),
  action       text not null,       -- submitted | approved | rejected
  actor_id     uuid references public.profiles (id),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_approval_request on public.approval_history (request_id, created_at);

create table if not exists public.override_history (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.mobilization_requests (id) on delete cascade,
  original_itinerary_id uuid references public.itineraries (id),
  chosen_itinerary_id   uuid references public.itineraries (id),
  actor_id            uuid references public.profiles (id),
  reason              text not null,   -- overrides MUST carry a reason (§25)
  created_at          timestamptz not null default now()
);
create index if not exists idx_override_request on public.override_history (request_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS. Labor/cost figures require cost.view; audit tables require audit.view;
-- approvals require mobilization.approve to write.
-- ---------------------------------------------------------------------------
alter table public.cost_breakdowns           enable row level security;
alter table public.labor_cost_blocks         enable row level security;
alter table public.feasibility_checks        enable row level security;
alter table public.recommendations           enable row level security;
alter table public.mobilization_audit_events enable row level security;
alter table public.approval_history          enable row level security;
alter table public.override_history          enable row level security;

drop policy if exists cost_breakdown_read on public.cost_breakdowns;
create policy cost_breakdown_read on public.cost_breakdowns
  for select using (public.has_permission('cost.view') or public.has_permission('audit.view'));

drop policy if exists labor_block_read on public.labor_cost_blocks;
create policy labor_block_read on public.labor_cost_blocks
  for select using (public.has_permission('cost.view') or public.has_permission('audit.view'));

drop policy if exists feasibility_read on public.feasibility_checks;
create policy feasibility_read on public.feasibility_checks
  for select using (public.has_permission('mobilization.search') or public.has_permission('audit.view'));

drop policy if exists recommendation_read on public.recommendations;
create policy recommendation_read on public.recommendations
  for select using (public.has_permission('mobilization.search') or public.has_permission('audit.view'));

drop policy if exists audit_read on public.mobilization_audit_events;
create policy audit_read on public.mobilization_audit_events
  for select using (public.has_permission('audit.view'));

drop policy if exists approval_read on public.approval_history;
create policy approval_read on public.approval_history
  for select using (public.has_permission('mobilization.approve') or public.has_permission('audit.view'));

drop policy if exists approval_write on public.approval_history;
create policy approval_write on public.approval_history
  for insert with check (public.has_permission('mobilization.approve'));

drop policy if exists override_read on public.override_history;
create policy override_read on public.override_history
  for select using (public.has_permission('recommendation.override') or public.has_permission('audit.view'));

drop policy if exists override_write on public.override_history;
create policy override_write on public.override_history
  for insert with check (public.has_permission('recommendation.override'));
