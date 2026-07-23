# Supabase migrations — Multimodal Mobilization Intelligence

Migrations are plain SQL, ordered by filename. They are **additive and backward
compatible** — the existing `collaborators` and `simulations` tables are never
altered, and RLS is only enabled on the new tables (plus `profiles`).

| File | Adds |
|------|------|
| `0001_auth_profiles.sql` | `profiles`, `app_role`, `has_permission()`/`is_admin()`, auto-provision trigger (§25/§26) |
| `0002_labor_policies.sql` | `labor_policy_versions`, `travel_time_policies` + seeded default policy (§5/§8) |
| `0003_employee_cost_profiles.sql` | `employee_cost_profiles` + backfill from `collaborators` (§6) |
| `0004_mobilization_core.sql` | `mobilization_requests`, `mobilization_search_snapshots`, `itineraries`, `itinerary_segments` (§16) |
| `0005_cost_audit.sql` | `cost_breakdowns`, `labor_cost_blocks`, `feasibility_checks`, `recommendations`, audit/approval/override (§15/§19/§25) |
| `0006_config.sql` | admin config tables + audited via `config_audit_events` (§22) |

## How to apply

**Option A — Supabase SQL Editor (no tooling):**
Open your project → SQL Editor → paste each file **in order 0001→0006** → Run.
Re-running is safe (guards use `if not exists` / `on conflict do nothing` /
`drop policy if exists`).

**Option B — Supabase CLI:**
```bash
supabase link --project-ref <your-ref>
supabase db push        # applies everything in supabase/migrations/
```

## Conventions

- **Money is integer centavos** (`*_c` / `*_cost_c` columns, `bigint`). Mirrors
  `src/domain/money.js`. Never store BRL floats.
- **Timestamps are `timestamptz` (UTC)**; per-segment IANA local timezones are
  stored as text for labor classification (§14).
- **Policies are versioned, never mutated** — to change a rule, insert a new
  version and retire the old one.
- **RLS + permissions**: reads of salary-derived and audit data require the
  matching permission slug (`cost.view`, `payroll.view`, `audit.view`,
  `provider_prices.view`); policy writes require `policy.edit`. Grant slugs by
  editing `profiles.permissions` (a JSON array) or setting `role = 'admin'`.

## Seeded default IDs (referenced by code)

- Default labor policy: `00000000-0000-4000-a000-000000000001`
- Default travel-time policy: `00000000-0000-4000-a000-000000000002`

## Open business decision

`labor_policy_versions.premium_stacking_mode` defaults to **`additive`**
(base × (1 + overtimePremium + nightPremium)), matching the CLT add-on
interpretation. The spec (§5) allows `multiplicative` (base × otMult × nightMult).
Confirm which your collective agreements require before approving the policy.
