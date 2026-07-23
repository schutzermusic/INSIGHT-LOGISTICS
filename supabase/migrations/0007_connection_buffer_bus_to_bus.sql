-- ============================================================================
-- 0007 — Connection buffer: bus→bus minimum (operational rule)
-- ----------------------------------------------------------------------------
-- Business rule (§13): a bus→bus connection must allow at least 2h, and a
-- bus→flight connection at least 3h (bus_to_flight_buffer_min already = 180).
-- Adds the bus_to_bus_buffer_min column and seeds it to 120 minutes.
-- Additive and idempotent.
-- ============================================================================

alter table public.connection_buffer_policies
  add column if not exists bus_to_bus_buffer_min integer not null default 120;

-- Ensure existing rows carry the intended minimums.
update public.connection_buffer_policies
   set bus_to_bus_buffer_min = 120
 where bus_to_bus_buffer_min is distinct from 120;

update public.connection_buffer_policies
   set bus_to_flight_buffer_min = 180
 where bus_to_flight_buffer_min < 180;
