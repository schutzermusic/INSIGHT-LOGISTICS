-- Meal allowance policy v2: local-day coverage determines zero, half or full
-- allowance per employee.

alter table public.meal_allowance_policy_versions
  add column if not exists no_allowance_below_minutes integer not null default 360,
  add column if not exists full_allowance_from_minutes integer not null default 1080,
  add column if not exists partial_allowance_ratio numeric(4,3) not null default 0.500;

update public.meal_allowance_policy_versions
set status = 'retired'
where status = 'approved';

insert into public.meal_allowance_policy_versions
  (id, name, version, status, effective_from,
   leader_daily_c, standard_daily_c, max_allowances_per_local_day,
   traveling_counts, connection_waiting_counts, hotel_away_from_base_counts,
   timezone_basis, no_allowance_below_minutes, full_allowance_from_minutes,
   partial_allowance_ratio)
values
  ('00000000-0000-4000-a000-000000000022'::uuid,
   'Diária de alimentação de mobilização', 2, 'approved', now(),
   12000, 9000, 1, true, true, true, 'segment_local', 360, 1080, 0.500)
on conflict (id) do nothing;
