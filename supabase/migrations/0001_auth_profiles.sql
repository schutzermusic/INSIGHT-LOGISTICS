-- ============================================================================
-- 0001 — Auth profiles & permission helpers
-- ----------------------------------------------------------------------------
-- Foundation for §26 (permissions) and §25 (auditability: who did what).
-- The app currently has NO auth. This introduces a profiles table keyed to
-- Supabase auth.users plus a permission model consumed by RLS policies in later
-- migrations. Additive and backward compatible: existing anon reads of
-- collaborators/simulations are unaffected until RLS is explicitly enabled on
-- those tables (not done here).
-- ============================================================================

create extension if not exists pgcrypto;

-- Roles are coarse; fine-grained access is expressed as a permission array so we
-- can grant capabilities (e.g. view fully-loaded cost) without new roles (§26).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('viewer', 'operator', 'approver', 'admin');
  end if;
end$$;

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  role         public.app_role not null default 'viewer',
  -- Explicit permission slugs (§26), e.g.
  -- ["mobilization.search","cost.view","payroll.view","policy.edit",
  --  "recommendation.override","mobilization.approve","provider_prices.view","audit.view"]
  permissions  jsonb not null default '[]'::jsonb,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'App user profile + RBAC. One row per auth.users id.';

-- ---------------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER so RLS policies can call them safely).
-- ---------------------------------------------------------------------------

-- True when the current user is an admin (admins bypass permission checks).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- True when the current user holds the given permission slug (or is admin).
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.permissions ? perm
      );
$$;

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh (reused by later migrations via the same function).
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-provision a profile row when a new auth user is created.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS on profiles: a user sees/edits their own row; admins manage all.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
