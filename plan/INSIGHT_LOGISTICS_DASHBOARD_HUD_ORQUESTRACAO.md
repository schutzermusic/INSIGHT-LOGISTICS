# INSIGHT LOGISTICS — DASHBOARD HUD & REAL-TIME OPERATIONS ORCHESTRATION

## Objective

Upgrade the current **Insight Logistics Dashboard** into a real-time executive and operational command center with a premium HUD experience.

The new dashboard must provide:

- A **real-time HUD globe** showing active mobilizations.
- More complete executive and operational KPIs.
- Rich cost analytics by category, project, collaborator, and modal.
- Better drill-down capability.
- Live updates.
- Enterprise-grade backend aggregation, auditability, and scalability.
- Compatibility with the existing visual language and architecture.

This is not a decorative redesign only. The dashboard must become a true **logistics intelligence command center**.

---

# 1. Product vision

The dashboard should serve two complementary audiences:

## Executive view
For directors, managers, and decision-makers who want to understand:

- Total mobilization spend.
- Spend by category.
- Spend by project.
- Spend by collaborator.
- Savings from route intelligence and scenario comparison.
- Active versus completed mobilizations.
- Average cost and duration.
- Outliers and abnormal costs.
- Strategic distribution of current operations.

## Operational view
For coordinators and logistics analysts who need:

- Real-time active mobilizations.
- Where each team is now.
- Which routes are delayed or at risk.
- Which employees are traveling.
- Which project each mobilization belongs to.
- Which mobilizations are bus, air, fleet, rental, or multimodal.
- Expected arrivals.
- Operational alerts.
- Drill-down to the scenario and timeline.

The dashboard should support both layers without becoming visually noisy.

---

# 2. Primary UX direction

Preserve the current premium, clean, light, futuristic Insight Logistics language.

Target feel:

- Glass / HUD / command center aesthetic.
- Light enterprise base with refined green, cyan, orange, and soft accent usage.
- Advanced but clean.
- High information density without clutter.
- Smooth transitions and micro-interactions.
- Clear hierarchy.
- Operational trustworthiness.

The page should feel like:

```text
A real-time logistics intelligence center
```

and not just a static BI report.

---

# 3. Main dashboard structure

Recommended page structure:

## Section A — Hero command center
Large top section containing:

- Main title and status.
- Real-time indicator.
- Date/time / last sync.
- Quick CTA for new analysis.
- Main executive KPIs.
- HUD Globe / live mobilization map.

## Section B — Key KPI and analytics grid
Cards and charts such as:

- Spend by category.
- Spend by project.
- Top 20 collaborator spend.
- Modal mix.
- Savings vs baseline.
- Active mobilization status.
- Cost trend.
- Duration trend.
- SLA / deadline compliance.
- Alert summary.

## Section C — Operational intelligence
Components such as:

- Active mobilizations table.
- Latest mobilizations.
- High-cost alerts.
- Delayed or risky mobilizations.
- Project drill-down.
- Collaborator drill-down.
- Top origins and destinations.
- Cost composition heat or ranked list.

## Section D — Filters and drill-down
Persistent or sticky filtering by:

- Date range.
- Project.
- Contract.
- Business unit.
- Cost center.
- Employee.
- Modal.
- Status.
- Origin.
- Destination.
- Scenario source: manual or automatic.
- Recommendation status.

---


# 3.1 Dashboard data eligibility and confirmation gate

The dashboard must **never** be populated by drafts, incomplete simulations, temporary searches, preview calculations, or unconfirmed provider results.

A record may feed dashboard KPIs, charts, rankings, the HUD globe, maps, project spend, collaborator spend, savings, and operational alerts only after the user explicitly confirms the selected scenario or mobilization.

## Eligible source events

The dashboard may receive data only from one of these confirmed actions:

```text
Manual Simulation
→ user selects a scenario
→ user confirms the mobilization
→ confirmed record becomes dashboard-eligible
```

```text
Automatic Mobilization
→ user selects or accepts an itinerary
→ user confirms the mobilization
→ confirmed record becomes dashboard-eligible
```

The confirmation action must be transactional. The system must not publish partial dashboard data if the confirmation fails midway.

## Mandatory data before confirmation

The confirmation action must require:

- At least one identified collaborator.
- Collaborator ID and full name.
- Project reference.
- Schedule / project timeline reference.
- Selected scenario or itinerary.
- Origin.
- Final destination.
- Planned departure.
- Expected arrival.
- Cost snapshot.
- Labor-cost snapshot.
- Modal composition.
- Confirmation user.
- Confirmation date and time.

The user must not be able to confirm the mobilization without selecting:

```text
Projeto
Cronograma / etapa / frente de serviço
Colaborador ou equipe responsável
```

When multiple collaborators are involved, every person must be explicitly assigned to the confirmed mobilization.

## Project and schedule relationship

The dashboard must support drill-down and aggregation by:

- Project.
- Contract.
- Schedule.
- Schedule activity.
- Work package.
- Operational phase.
- Cost center.

Reuse the existing project and schedule entities when available.

Do not create a free-text project field when a governed project record already exists.

If the current application does not yet have a formal schedule entity, introduce a controlled reference that can later be mapped to the enterprise schedule model.

Suggested minimum structure:

```typescript
type ConfirmedMobilizationContext = {
  mobilizationId: string;
  source: "manual_simulation" | "automatic_mobilization";
  selectedScenarioId?: string;
  selectedItineraryId?: string;
  projectId: string;
  projectNameSnapshot: string;
  scheduleId: string;
  scheduleNameSnapshot: string;
  scheduleActivityId?: string;
  scheduleActivityNameSnapshot?: string;
  employeeIds: string[];
  employeeNameSnapshots: string[];
  confirmedBy: string;
  confirmedAt: string;
};
```

Snapshots are required so historical dashboard values remain reproducible if names or project metadata later change.

## Dashboard eligibility status

Add or reuse an explicit status such as:

```text
draft
calculated
selected
confirmed
in_progress
completed
cancelled
rejected
archived
```

Dashboard inclusion rules:

```text
draft:
excluded

calculated:
excluded

selected but not confirmed:
excluded

confirmed:
included

in_progress:
included

completed:
included in historical and financial metrics

cancelled:
excluded from active operations;
financial treatment depends on whether real costs were incurred

rejected:
excluded

archived:
included only in historical views when it was previously confirmed
```

The implementation must avoid deriving eligibility indirectly from loosely related fields.

Use an explicit confirmation state and timestamp.

## Confirmation UI

Before the final confirmation, open a review step or modal containing:

```text
Confirmar mobilização
```

Required fields:

- Project.
- Schedule / phase / activity.
- Collaborator or team.
- Selected scenario.
- Planned departure.
- Expected arrival.
- Total estimated cost.
- Confirmation acknowledgment.

Recommended confirmation text:

```text
Ao confirmar, esta mobilização passará a alimentar o Dashboard,
os indicadores financeiros, o mapa em tempo real e os rankings.
```

The confirm button remains disabled until all required references are valid.

## Immutability and audit

At confirmation, store immutable snapshots of:

- Selected employees.
- Project.
- Schedule.
- Scenario.
- Route.
- Cost breakdown.
- Labor calculation.
- Policy versions.
- Confirmation author.
- Confirmation timestamp.

Later edits must not silently rewrite historical dashboard figures.

If a confirmed mobilization is materially changed:

1. Record the previous version.
2. Create a revised confirmed version or auditable amendment.
3. Recalculate dashboard aggregates.
4. Preserve the original confirmation history.

## Dashboard aggregation rule

Every dashboard query must begin from the confirmed mobilization dataset.

Conceptually:

```sql
WHERE confirmation_status IN ('confirmed', 'in_progress', 'completed')
```

Do not aggregate directly from:

- Search results.
- Scenario drafts.
- Provider quotes.
- Manual segment drafts.
- Non-selected alternatives.
- Abandoned calculations.

Non-selected scenarios may be used only for auditable savings comparisons after the chosen mobilization is confirmed.

## HUD globe rule

The HUD globe must display only confirmed mobilizations that are currently:

```text
confirmed and awaiting departure
in progress
delayed
at risk
```

Draft simulations must never appear on the globe.

Each globe item must contain:

- Confirmed mobilization ID.
- Project.
- Schedule or project phase.
- Employee names or team summary.
- Origin.
- Destination.
- Selected itinerary.
- Current status.
- ETA.
- Last update.

## Cost attribution requirement

Project spend, schedule spend, and collaborator spend must use the confirmed assignment snapshot.

A mobilization without a valid project, schedule, and employee assignment must be rejected at confirmation and must not enter dashboard aggregates.


# 4. HUD Globe / Real-Time Map

## Core concept

Add a large hero visual component:

# **HUD Globe de Mobilizações em Tempo Real**

It should show:

- Current active mobilizations.
- Origin and destination nodes.
- Animated travel arcs.
- Route direction.
- Modal indicator.
- Risk or delay state.
- Pulsing live points.
- Cluster behavior when zoomed out.
- Hover or click details.

## Visual behavior

The globe should feel premium and futuristic but still useful.

Suggested elements:

- Semi-transparent glass card container.
- 3D or pseudo-3D globe.
- Soft grid lines or latitude/longitude HUD lines.
- Animated arcs for active routes.
- Pulsing nodes for origin and destination.
- Micro glow at active movement points.
- Subtle rotation or controlled idle motion.
- Tooltip on hover.
- Click to open route detail drawer.
- Real-time legend.

## What should appear

For every active mobilization:

- Mobilization ID.
- Origin.
- Destination.
- Current position when available.
- Planned route.
- Modal.
- Team size.
- Project.
- Current status.
- Start time.
- ETA / required arrival.
- Cost accumulated or estimated.
- Risk flag.

## If exact GPS is not available

If live coordinates are not available, show:

- Origin node.
- Destination node.
- Arc between them.
- Progress indicator on arc based on timeline estimate.
- Current “simulated position” using elapsed time percentage.

## Status colors

Suggested state system:

- Green: on track.
- Cyan: in transit.
- Orange: attention / risk.
- Red: delayed / compliance issue.
- Purple: multimodal / complex route.
- Gray: completed / archived when included in some filters.

## Interactions

On hover:

- Show basic route summary.

On click:

Open a drawer or modal with:

- Route timeline.
- Employees involved.
- Project.
- Cost breakdown.
- Current stage.
- ETA.
- Scenario source.
- Recommendation / selected scenario.
- Alerts and exceptions.

## Suggested implementation options

Depending on stack and performance goals, evaluate:

- Mapbox GL + custom globe layer.
- deck.gl GlobeView.
- Three.js or react-three-fiber for custom globe HUD.
- A lighter 2.5D vector map if 3D globe performance becomes excessive.

The feature should prioritize:

- Fluidity.
- Data readability.
- Practical value.
- Responsiveness.

Do not build a heavy 3D toy that hurts usability.

---

# 5. KPI redesign

The current KPI area should become more meaningful.

Recommended top KPI cards:

## Primary KPI cards

1. **Mobilizações Ativas**
   - Count of currently active mobilizations.
   - Delta vs previous period.
   - Subtext: automatic vs manual / by modal.

2. **Custo Total no Período**
   - Total mobilization spend in selected range.
   - Delta vs previous period.

3. **Custo Médio por Mobilização**
   - Average total spend.
   - Optionally show median too.

4. **Tempo Médio de Mobilização**
   - Average total duration.

5. **Economia Gerada**
   - Estimated savings from recommended scenario vs non-selected alternatives or baseline.

6. **Taxa de Viabilidade no Prazo**
   - Percentage arriving within required deadline.

7. **Alertas Operacionais**
   - Count by severity.

8. **Colaboradores em Trânsito**
   - Total people currently mobilized.

## Secondary KPI cards

9. **Custo Médio por Colaborador**
10. **Projetos Ativos com Mobilização**
11. **Rotas Multimodais**
12. **Percentual Manual vs Automático**
13. **Viagens com Risco de Conexão**
14. **Viagens com Descanso Insuficiente**
15. **HE Estimada no Período**
16. **Noturno Estimado no Período**

Use progressive disclosure. Not all secondary cards need to be above the fold.

---

# 6. Critical analytics components

## 6.1 Spend by category

A chart and summary card for:

- Airfare.
- Bus.
- Rental vehicle.
- Fleet / company vehicle.
- Fuel.
- Tolls.
- Parking.
- Transfers.
- Accommodation.
- Meals.
- Labor.
- Night premium.
- Overtime.
- Other.

Recommended visuals:

- Horizontal bar chart.
- Stacked bar by period.
- Treemap as an optional advanced view.
- Small percentage indicators.

Must show:

- Total value.
- Percentage share.
- Trend.

## 6.2 Spend by project

Show:

- Top projects by total mobilization spend.
- Spend per project.
- Spend per mobilization.
- Active vs completed mobilizations per project.
- Cost distribution by category inside a project.
- Project trend in time.

Recommended visuals:

- Ranked bar chart.
- Drill-down table.
- Project cards with sparkline.

## 6.3 Top 20 collaborator spend

Important feature explicitly requested.

Show ranking with:

- Collaborator name.
- Role.
- Project.
- Number of mobilizations.
- Total spend attributed.
- Labor cost attributed.
- Transport cost attributed.
- Average cost per mobilization.
- Average duration.
- Active or inactive status.

Recommended visuals:

- Ranked table.
- Horizontal bar chart.
- Searchable and exportable table.
- Filter by period, project, and role.

Clarify methodology for attributing shared costs such as:

- Per-person fare.
- Split team transfer.
- Shared hotel room.
- Shared vehicle.

## 6.4 Spend by modal

Show distribution across:

- Bus.
- Air.
- Fleet.
- Rental.
- Multimodal.

Include:

- Count.
- Spend.
- Avg duration.
- Avg cost per employee.
- Avg labor share.

Recommended visuals:

- Donut or ring chart.
- Segmented KPI cards.
- Trend over time.

## 6.5 Savings intelligence

Show estimated savings generated by the system, for example:

- Recommended scenario total vs other viable scenarios.
- Total savings in period.
- Average savings per mobilization.
- Savings by project.
- Savings by modal.
- Savings from faster scenario selection.

Important note:
Make methodology explicit and auditable.

## 6.6 Cost trend and duration trend

Time-based analytics:

- Daily / weekly / monthly spend.
- Daily / weekly / monthly mobilization count.
- Average duration trend.
- Labor-cost trend.
- Category trend.

Recommended visuals:

- Line chart.
- Area chart.
- Toggle between metrics.

## 6.7 SLA / arrival compliance

Show:

- On-time arrival rate.
- Late arrival count.
- Average delay.
- Routes at risk.
- Routes that would miss deadline if current trend persists.

Recommended visuals:

- Gauge or progress card.
- Trend line.
- Severity breakdown.

## 6.8 Alerts and compliance

Show:

- Rest deficit count.
- Connection-risk count.
- Provider/manual quote expiry issues.
- Budget overrun.
- Missing cost data.
- High overtime exposure.
- High night-premium exposure.
- Invalid or overridden recommendations.

Recommended visuals:

- Alert list with severity.
- Small stacked severity bars.
- Drill-down drawer.

---

# 7. Recommended dashboard layout

Suggested layout, top to bottom:

## Row 1 — Hero command center
Left:
- Dashboard title and subtitle.
- Status badges.
- Quick KPIs.

Right:
- HUD globe / map.
- New analysis button.
- Last sync and live status.

## Row 2 — Core KPI strip
6–8 compact KPI cards:
- Active mobilizations.
- Total spend.
- Avg cost.
- Avg duration.
- Savings.
- On-time rate.
- Employees in transit.
- Alerts.

## Row 3 — Major analytics split
Left:
- Spend trend / cost evolution.
Right:
- Spend by category.

## Row 4 — Major analytics split
Left:
- Spend by project.
Right:
- Top 20 collaborator spend.

## Row 5 — Operations split
Left:
- Active mobilizations table.
Right:
- Alerts / SLA / risks.

## Row 6 — Supporting analytics
- Modal mix.
- Top destinations.
- Top origins.
- Cost composition.
- AI / recommendation summary.

---

# 8. Data model and backend aggregation

The dashboard must be data-driven and not computed only in the client.

Create or refine a backend dashboard aggregation layer.

## Suggested aggregation domains

1. **Mobilization activity**
   - Active mobilizations.
   - Completed mobilizations.
   - Failed or invalid mobilizations.
   - By date range.

2. **Cost aggregation**
   - Total cost.
   - Cost by category.
   - Cost by project.
   - Cost by collaborator.
   - Cost by modal.
   - Cost by source: manual vs automatic.
   - Cost by recommendation status.

3. **Operational intelligence**
   - Average duration.
   - Route count.
   - Deadline compliance.
   - Active employees.
   - In-transit positions.
   - Risk flags.

4. **Savings intelligence**
   - Recommended scenario savings.
   - Baseline comparison.
   - Override analysis.

5. **Compliance**
   - Rest deficit.
   - Risk events.
   - Overtime and night exposure.
   - Approval / override stats.

## Suggested backend services

- DashboardOverviewService
- DashboardRealtimeService
- DashboardCostAnalyticsService
- DashboardProjectAnalyticsService
- DashboardCollaboratorAnalyticsService
- DashboardOperationsService
- DashboardSavingsService
- DashboardAlertService
- DashboardMapProjectionService

These may be implemented inside existing service boundaries if similar patterns already exist.

Do not create unnecessary duplicated architecture.

---

# 9. Realtime strategy

The dashboard should support near-real-time updates.

## Live update sources

Potential event sources:

- New mobilization created.
- Mobilization status changed.
- Scenario selected.
- Approval completed.
- Active route advanced.
- ETA updated.
- Cost updated.
- Compliance alert triggered.
- Manual simulation submitted.
- Provider sync updated.

## Realtime mechanisms

Depending on current stack, consider:

- Supabase Realtime.
- WebSocket.
- SSE (Server-Sent Events).
- Polling fallback for non-critical parts.

## Recommended split

### Realtime / frequent refresh
- Active mobilizations count.
- HUD globe active routes.
- Active employees in transit.
- Alerts.
- ETA and route status.

### Cached / periodic refresh
- Spend by project.
- Top 20 collaborator spend.
- Trend charts.
- Savings analytics.
- Category breakdown.

This avoids overloading the database and the client.

---

# 10. Cost attribution rules

Because several dashboard metrics depend on proper attribution, establish clear rules.

## Cost by collaborator
Each collaborator should receive attributed values based on:

- Per-person fare directly assigned.
- Shared transfer split by assigned passengers.
- Shared accommodation split by assigned room occupancy or configured strategy.
- Shared vehicle cost split by passengers or configured rule.
- Labor cost always individual.

## Cost by project
A mobilization belongs to one project, contract, or cost center by:

- Primary linked project.
- Allocation override if supported.
- Shared split if future multi-project mobilizations become supported.

## Cost by category
Every cost item must have a normalized category.

Required normalized categories:

- airfare
- bus_fare
- rental_vehicle
- company_vehicle
- fuel
- toll
- parking
- transfer
- accommodation
- meals
- labor_regular
- labor_overtime_50
- labor_overtime_100
- labor_saturday_100
- labor_sunday_150
- labor_night_premium
- allowance
- other

If equivalent categories already exist, reuse them.

---

# 11. Drill-down behavior

Every dashboard component should support drill-down.

Examples:

## KPI card click
Open filtered view or drawer.

Example:
“Custo total no período” click →
- category breakdown
- project ranking
- recent mobilizations contributing most

## Spend by project click
Open project drill-down with:
- project summary
- mobilization list
- spend trend
- category composition
- top collaborators

## Collaborator ranking click
Open collaborator drawer:
- mobilization count
- total spend
- cost breakdown
- projects
- avg duration
- active mobilizations
- route history
- overtime and night exposure

## Globe click
Open active mobilization detail:
- timeline
- selected scenario
- current stage
- ETA
- total cost
- labor summary
- project
- alerts

---

# 12. Filters

The dashboard must support global filters.

Required filters:

- Date range.
- Project.
- Contract.
- Cost center.
- Business unit.
- Employee.
- Modal.
- Status.
- Source (manual / automatic / mixed).
- Project manager or area.
- Route status (on track / delayed / alert).
- Category.
- Recommendation / override status.

Behavior:

- Filters affect all components unless specifically scoped.
- Display applied filters clearly.
- Provide quick reset.
- Persist recent selections when useful.

---

# 13. Suggested UI components

## Hero card
- Large summary section.
- Command-center feel.
- Badge: “Real-time intelligence”.
- CTA: “Nova análise”.

## Globe card
- Large interactive glass card.
- Full height hero visual.

## Compact KPI cards
- Minimal but high signal.
- Delta indicators.
- Small sparkline.

## Analytics cards
- Clean title.
- Clear metric summary.
- Expand / drill-down action.

## Operations table
Columns:
- ID
- Project
- Origin
- Destination
- Modal
- Team size
- Status
- ETA
- Total cost
- Risk
- Last update

## Alerts panel
- Severity chips.
- Most urgent first.
- Click to detail.

---

# 14. Visual style recommendations

To match the requested HUD/globe concept without breaking the brand:

- Use a subtle neon-HUD language, not a dark cyberpunk takeover.
- Keep white or very light base surfaces.
- Use glassmorphism lightly.
- Use clean shadows and soft glows.
- Use green as primary operational-success color.
- Use cyan for realtime / map / neutral route movement.
- Use orange for warning / comparative engine / attention.
- Use red only for critical states.
- Use purple only sparingly for multimodal or advanced AI indicators.

Animation guidelines:

- Small pulse on live badges.
- Gentle glow on active map nodes.
- Animated path progress on arcs.
- Smooth KPI number transitions.
- Subtle chart entrance animations.

Keep motion purposeful and restrained.

---

# 15. Metrics catalogue

At minimum, support these indicators.

## Activity
- Active mobilizations
- Completed mobilizations
- Total mobilizations in range
- Employees in transit
- Projects with mobilization
- Active routes

## Cost
- Total spend
- Avg cost per mobilization
- Median cost per mobilization
- Avg cost per collaborator
- Spend by category
- Spend by project
- Spend by collaborator
- Spend by modal
- Labor share
- Transport share
- Accommodation share
- Meal share

## Performance
- Avg duration
- Avg ETA variance
- On-time rate
- Delay count
- Avg connections per route
- Multimodal share

## Intelligence
- Savings total
- Savings average
- Recommendation adoption rate
- Manual override count
- Manual override rate
- Automatic vs manual source share

## Compliance
- Rest deficit count
- Overtime exposure
- Night-premium exposure
- High-risk mobilizations
- Quote expiry count
- Invalid scenario count

---

# 16. Technical implementation strategy

## Phase 1 — Discovery
- Inspect current dashboard code.
- Inspect current data sources.
- Identify reusable KPI and chart components.
- Identify current mobilization, cost, and employee entities.
- Identify whether location coordinates exist.
- Identify existing realtime infrastructure.

## Phase 2 — Data contracts
- Define or refine dashboard DTOs.
- Define normalized cost categories.
- Define active mobilization map payload.
- Define top collaborator spend payload.
- Define project spend payload.

## Phase 3 — Aggregation backend
- Build overview aggregations.
- Build cost analytics aggregations.
- Build project analytics.
- Build collaborator analytics.
- Build map/live-route data.
- Build alerts aggregation.

## Phase 4 — Realtime layer
- Add active mobilization streaming.
- Add live status updates.
- Add fallback refresh logic.

## Phase 5 — UI foundation
- Redesign hero section.
- Implement improved KPI strip.
- Implement globe / map card.
- Implement chart grid.
- Implement active mobilizations table.
- Implement alert center.

## Phase 6 — Drill-down and filters
- Add filter state.
- Add drawer / modal drill-down flows.
- Ensure chart-to-detail linking.

## Phase 7 — Quality and performance
- Optimize queries.
- Add caching.
- Add indexes if required.
- Add tests.
- Validate mobile/responsive degradation strategy.

---

# 17. Suggested data contracts

Adapt to existing patterns.

## Overview response

```typescript
type DashboardOverview = {
  activeMobilizations: number;
  completedMobilizations: number;
  totalMobilizationsInRange: number;
  totalSpendMinor: number;
  averageSpendPerMobilizationMinor: number;
  medianSpendPerMobilizationMinor?: number;
  averageDurationMinutes: number;
  activeEmployeesInTransit: number;
  estimatedSavingsMinor: number;
  onTimeRate: number;
  alertCount: number;
  lastUpdatedAt: string;
};
```

## Category spend

```typescript
type CategorySpendItem = {
  category: string;
  amountMinor: number;
  percentage: number;
  mobilizationCount: number;
  deltaPercentage?: number;
};
```

## Project spend

```typescript
type ProjectSpendItem = {
  projectId: string;
  projectName: string;
  amountMinor: number;
  mobilizationCount: number;
  averageSpendMinor: number;
  activeMobilizations: number;
  onTimeRate?: number;
};
```

## Collaborator ranking

```typescript
type CollaboratorSpendItem = {
  employeeId: string;
  employeeName: string;
  role?: string;
  totalSpendMinor: number;
  laborSpendMinor: number;
  transportSpendMinor: number;
  mobilizationCount: number;
  averageSpendMinor: number;
  averageDurationMinutes?: number;
  activeMobilizationCount?: number;
};
```

## Active mobilization map item

```typescript
type ActiveMobilizationMapItem = {
  mobilizationId: string;
  projectId?: string;
  projectName?: string;
  origin: {
    label: string;
    lat: number;
    lng: number;
  };
  destination: {
    label: string;
    lat: number;
    lng: number;
  };
  currentPosition?: {
    lat: number;
    lng: number;
  };
  progressPercentage?: number;
  modal: string;
  status: "on_track" | "in_transit" | "warning" | "delayed" | "completed";
  teamSize: number;
  estimatedArrivalAt?: string;
  totalCostMinor?: number;
  riskLevel?: "low" | "medium" | "high";
  source: "manual" | "automatic" | "mixed";
  lastUpdatedAt: string;
};
```

---

# 18. Performance and scalability

Because some analytics may become expensive:

- Cache non-realtime aggregations.
- Pre-aggregate when useful.
- Use materialized views if needed.
- Refresh analytics on event-driven updates or scheduled jobs.
- Paginate heavy tables.
- Lazy-load drill-down details.
- Virtualize long ranked tables if needed.
- Limit Top 20 collaborator ranking by default, with “see more”.

The globe should degrade gracefully on lower-performance devices:

- Static map fallback.
- 2D fallback.
- Reduced animation mode.
- Reduced number of arcs in view.

---

# 19. Observability and QA

Track:

- Dashboard query latency.
- Realtime stream latency.
- Map render performance.
- Cache hit ratio.
- Drill-down open rate.
- Filter usage.
- Most used KPIs.
- Error rate on active-route payload.
- Coordinate completeness.
- Savings calculation coverage.

QA must validate:

- Filter accuracy.
- Cost totals matching source data.
- Collaborator attribution correctness.
- Project attribution correctness.
- Globe route correctness.
- Realtime updates.
- Drill-down consistency.
- Responsive behavior.

---

# 20. Acceptance criteria

The dashboard improvement is complete only when:

## UX
- The dashboard clearly feels more strategic and operational.
- A HUD-style globe or equivalent live route visualization is present.
- The dashboard remains clean and premium.
- Information density increases without clutter.

## Confirmation and data governance
- Draft simulations and unconfirmed mobilizations never populate the dashboard.
- Confirmation requires a valid project, schedule or project phase, and identified collaborator(s).
- Dashboard eligibility is controlled by an explicit confirmation status and timestamp.
- Confirmation stores immutable employee, project, schedule, route, cost, and policy snapshots.
- The HUD globe displays only confirmed operational mobilizations.

## Data
- Active mobilizations can be visualized in real time or near real time.
- Costs by category are available.
- Costs by project are available.
- Top 20 collaborator spend is available.
- Modal distribution is available.
- Savings and compliance metrics are available.

## Drill-down
- Users can drill from high-level KPI to operational details.
- Globe routes can be opened for more information.
- Project and collaborator analytics support deeper inspection.

## Technical quality
- Queries are performant.
- Heavy analytics are cached or aggregated appropriately.
- Realtime updates do not overload the app.
- Metrics are auditable and consistent with source mobilization data.

## Business value
- The dashboard helps understand where money is being spent.
- The dashboard helps understand who is traveling, where, and why.
- The dashboard helps identify risk, delay, overtime exposure, and savings.
- The dashboard supports both operational monitoring and executive decision-making.

---

# 21. Final recommendation summary

The dashboard should evolve into three coordinated layers:

## Layer 1 — Command center
A striking real-time hero with:

- HUD globe.
- Live mobilizations.
- Primary KPI snapshot.
- “Nova análise” CTA.

## Layer 2 — Financial intelligence
Focused on:

- Spend by category.
- Spend by project.
- Spend by collaborator.
- Modal mix.
- Savings.

## Layer 3 — Operational intelligence
Focused on:

- Active routes.
- Route detail.
- Risks and alerts.
- Deadline compliance.
- Timeline drill-down.

This combination will make the Insight Logistics dashboard feel significantly more premium, more useful, and much closer to an enterprise control tower.

---

# 22. Delivery expectation for implementation

When implementing this dashboard upgrade:

1. Inspect the current code and data model first.
2. Reuse the existing design system and architecture.
3. Produce a concise file-level implementation plan.
4. Implement in safe phases.
5. Add tests for critical aggregation logic.
6. Validate drill-down consistency.
7. Ensure the globe or live-map feature has a graceful fallback.
8. Provide a final validation summary with:
   - changed files
   - new services
   - queries / migrations if any
   - performance notes
   - known limitations
   - screenshots or test evidence
