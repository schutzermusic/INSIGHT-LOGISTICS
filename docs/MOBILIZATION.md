# Multimodal Mobilization Intelligence

Upgrade of *Inteligência de Rotas* into an engine that recommends the **lowest
viable total mobilization cost** — not the cheapest ticket. Deterministic,
auditable, centavos-based, timezone-aware.

## Calculation rules

### Money
All monetary values are **integer centavos** (`src/domain/money.js`). Float is
never used for money. Conversion from BRL is the single rounding point
(`toCentavos`, round-half-away-from-zero with float-error correction).

### Labor (deterministic, `LaborCostEngine`)
Minute-level classification merged into event-boundary blocks. No AI, ever.

- **Weekday:** first 8h regular ×1.0, next 2h ×1.5 (HE 50%), excess ×2.0 (HE 100%).
- **Saturday:** first 8h ×1.0, excess ×2.0.
- **Sunday/holiday:** all hours ×2.5 (150% premium).
- **Night premium (22:00–05:00):** overlaps the base band, **never a duplicated
  bucket**. Stacking mode is configurable:
  - `additive` (default): `base × (1 + otPremium + nightPremium)` → OT100+night = ×2.2
  - `multiplicative`: `base × otMult × nightMult` → OT100+night = ×2.4
- **Existing worked hours** on the departure day continue the daily counter
  (they are not reset when travel starts).
- **Continuous journey:** the daily counter accumulates across midnight, so long
  trips correctly rack up overtime; it resets only after a real inter-journey
  **rest ≥ 11h**.
- **What counts** as paid time is governed by a versioned Travel-Time Policy
  (flight/bus/waiting/transfer count by default; meal breaks and hotel rest do
  not).

### Connection feasibility (`ConnectionFeasibilityService`)
A connection is valid only when `previous arrival + required buffer ≤ next
departure`. Operational minimums (business rule), regardless of terminal:

| Connection | Minimum |
|---|---|
| Bus → Bus | **120 min (2h)** |
| Bus → Flight | **180 min (3h)** |
| Flight → Bus | 90 min |

Plus disembark, inter-terminal transfer and airport check-in buffers. All
configurable per organization via `connection_buffer_policies` (Settings screen).

### Cost components (`OperationalCostEngine`, §19)
- **Commercial:** flight/bus fares are **per person** × team; rental/company
  vehicle is a **shared** cost.
- **Labor:** summed across the team from the labor engine.
- **Permanence:** transit meals (scale with duration), transit hotel (long night
  waits), optional destination field days.
- **Local mobility:** terminal transfers + destination local transport.
- `total = commercial + labor + permanence + local`.

### Recommendation (`RecommendationEngine`, §20)
Feasibility gate first (deadline-missers are `invalid` and never recommended),
then rank by **lowest total mobilization cost** (duration, then connections as
tie-breakers). Explanations are deterministic with exact figures; AI may reword
but never change numbers.

## Architecture

**Routing pipeline (server):** `geo` → `LegSynthesizer`/provider adapters →
`CandidateGraphExpander` → `MultimodalGraphBuilder` → `ItineraryGenerator`
(time-dependent DFS + pruning + Pareto) → `OperationalCostEngine` (+
`LaborCostEngine`) → `RecommendationEngine` → `persistence` (snapshot).

**Provider adapters (§17):** `FlightAdapter` (SerpAPI), `BusAdapter` (Quero
Passagem), `RoadRouteAdapter` (Google Routes), estimated `RentalCarAdapter` /
`TransferEstimateAdapter`. All normalized to `NormalizedOption` (centavos);
`ProviderSearchOrchestrator` runs them in parallel with timeout, retry, circuit
breaker and partial results.

**API (`/api/mobilization`):**
- `POST /search` — full pipeline, returns ranked itineraries + recommendation + audit ids.
- `POST /itineraries/:id/select` — record selection (override requires a reason).
- `POST /requests/:id/submit-for-approval`, `POST /requests/:id/decision`.
- `GET /status` — whether audit persistence is enabled.

**Data model (Supabase, `supabase/migrations/`):** versioned `labor_policy_versions`
& `travel_time_policies`; `employee_cost_profiles`; `mobilization_requests`,
`itineraries`, `itinerary_segments`, `mobilization_search_snapshots`;
`cost_breakdowns`, `labor_cost_blocks`, `recommendations`, `feasibility_checks`;
`mobilization_audit_events`, `approval_history`, `override_history`; admin config
tables. Money columns are `bigint` centavos; timestamps `timestamptz` (UTC) with
per-segment IANA local timezones.

## Observability (§27)
Every search carries a `correlationId`. Structured JSON logs
(`search_started` / `search_completed` / `search_no_route`) and a `metrics`
block in the response: phase durations (graph/generate/cost/recommend/persist),
candidates generated/pruned (+ reasons), legs added, pairs queried/failed, valid
vs presented counts. Salary values are never logged.

## Security & rollout
- **Feature flag:** `VITE_FEATURE_MOBILIZATION`; the new screen lives at
  `/mobilizacao` alongside the untouched legacy screen.
- **Audit persistence** requires a server `SUPABASE_SERVICE_ROLE_KEY` (bypasses
  RLS, keeps salary off the client). Without it, search still works and audit
  gracefully no-ops.
- **Interim RLS:** `0008_config_interim_access.sql` opens the routing/cost config
  tables to anon because the app has no auth yet. **When Supabase Auth + RBAC
  land, drop the `*_anon_rw` policies** so editing again requires `policy.edit`.
- **SerpAPI key** moved server-side (`SERPAPI_KEY`); the browser no longer needs it.

## §34 validation report — Alta Floresta → Tucuruí (no direct route)
Team: 2 collaborators @ R$60,00/h. Deadline 2026-07-31 02:00Z. Two viable
multimodal routes are discovered automatically (no direct flight/bus exists):

| Route | Commercial | Labor | Meals | Hotel | Transfers | **Total** | Duration | Conn. | Arrival |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--|
| ⭐ Bus + Flight + Bus | R$ 2.400,00 | R$ 5.544,00 | R$ 266,70 | R$ 0,00 | R$ 120,00 | **R$ 8.330,70** | 27h00 | 2 | 30/07 12:00Z |
| Bus + Bus + Flight + Bus | R$ 2.560,00 | R$ 7.968,00 | R$ 373,38 | R$ 0,00 | R$ 120,00 | **R$ 11.021,38** | 37h00 | 3 | 30/07 22:00Z |

**Recommendation:** *Bus + Flight + Bus* — R$ 8.330,70. Reason codes:
`within_deadline, also_lowest_ticket, lowest_total_cost, fastest,
fewest_connections`. The 4-leg chain (via Goiânia) is a valid alternative but
its longer 37h timeline produces higher labor and meal costs.

## Testing
96 unit/integration/e2e tests (`npm test`): 20 labor cases (§29), routing &
feasibility, provider normalization, orchestrator resilience, cost engine,
recommendation, and the §34 end-to-end scenario.
