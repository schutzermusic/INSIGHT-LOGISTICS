-- Labor policy v3: weekday overtime remains +50%, night premium stacks
-- multiplicatively, and the urban reduced night hour is enabled by default.

update public.labor_policy_versions
set status = 'retired', effective_to = coalesce(effective_to, current_date)
where status = 'approved';

insert into public.labor_policy_versions
  (id, name, version, status, effective_from, approved_at,
   regular_daily_minutes, weekday_first_overtime_minutes, weekday_first_overtime_multiplier,
   weekday_excess_multiplier, saturday_regular_minutes, saturday_excess_multiplier,
   saturday_all_hours_overtime, sunday_multiplier, night_start_local_time, night_end_local_time,
   night_multiplier, premium_stacking_mode, data)
values
  ('00000000-0000-4000-a000-000000000012'::uuid,
   'Política CLT Padrão', 3, 'approved', current_date, now(),
   480, 120, 1.500, 1.500, 480, 1.500, true, 2.500, '22:00', '05:00',
   1.200, 'multiplicative',
   '{
      "interJourneyRestMinutes": 660,
      "compensatedSaturdayMultiplier": 2.0,
      "reducedNightHourEnabled": true,
      "reducedNightHourMinutes": 52.5,
      "maxDailyOvertimeMinutes": 120,
      "intervalRequiredAfterMinutes": 360,
      "minimumRegisteredIntervalMinutes": 30,
      "longDayMealThresholdMinutes": 960,
      "longDayLunchMinutes": 60,
      "longDayDinnerMinutes": 60
    }'::jsonb)
on conflict (id) do nothing;
