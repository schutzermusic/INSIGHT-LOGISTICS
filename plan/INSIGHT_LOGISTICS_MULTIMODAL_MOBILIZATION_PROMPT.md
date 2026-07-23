# INSIGHT LOGISTICS — MULTIMODAL MOBILIZATION INTELLIGENCE

## Role

Act as a senior enterprise software architect, backend engineer, optimization engineer, and UI/UX specialist focused on logistics, employee mobilization, routing, workforce cost calculation, travel orchestration, auditability, and operational decision support.

Your task is to upgrade the existing **Insight Logistics — Inteligência de Rotas** module into a fully automated **Multimodal Mobilization Intelligence Engine**.

Do not treat this as a simple ticket-price comparator. The system must determine the best end-to-end mobilization option by comparing the **true total operational cost** of moving an employee from their current city to the final destination.

The final implementation must be deterministic, auditable, explainable, configurable, production-ready, and compatible with the current application architecture and design language.

---

# 1. Business problem

The current screen allows users to manually enter operational parameters such as:

- Normal hours per day.
- Overtime at 50%.
- Overtime at 100%.
- Overtime at 150%.
- Night hours.
- Accommodation per day.
- Meals per day.
- Local transportation per day.

This is not sufficient.

The user must not manually calculate how many hours belong to each labor category. The system must automatically calculate the employee's labor cost based on the real timeline of every route option.

A cheap bus ticket may require two days of travel and become more expensive than an airline ticket after considering:

- Normal work hours.
- Overtime.
- Night premium.
- Sunday premium.
- Connections and waiting time.
- Meals.
- Accommodation.
- Local transfers.
- Rental vehicle costs.
- Fuel.
- Tolls.
- Additional operational expenses.

The system must therefore optimize for:

```text
Lowest viable total mobilization cost
```

and not merely:

```text
Lowest ticket price
```

---

# 2. Primary user flow

The main user should provide only the operational input required to search and evaluate the mobilization:

1. Select one or more employees.
2. Confirm the employee's current city.
3. Enter the final destination.
4. Select the earliest allowed departure date and time.
5. Enter the required arrival deadline.
6. Configure baggage, tools, materials, or vehicle requirements when applicable.
7. Start the search.

The system must then automatically:

1. Search available flight options.
2. Search available bus options.
3. calculate rental-car alternatives.
4. Calculate company-vehicle alternatives when available.
5. Generate mixed and multimodal itineraries.
6. Include terminal transfers and connection times.
7. Retrieve the employee's hourly cost and work schedule.
8. Retrieve or request the employee's hours already worked on the departure day.
9. Calculate the complete labor cost of each itinerary.
10. Calculate meals, accommodation, transfers, fuel, tolls, rental charges, baggage, and other configured expenses.
11. Eliminate operationally invalid itineraries.
12. Rank the valid alternatives.
13. Recommend the best option.
14. Clearly explain why the recommendation is better.

---

# 3. Example of required multimodal behavior

The engine must support routes without a direct flight or direct bus connection.

Example:

```text
Alta Floresta
→ Bus to Cuiabá
→ Bus to Goiânia
→ Flight to Belém
→ Bus to Tucuruí
```

The user must not manually build this route.

The system must discover and evaluate valid combinations automatically.

It must also evaluate alternatives such as:

```text
Alta Floresta
→ Rental vehicle to Cuiabá Airport
→ Flight to Belém
→ Bus to Tucuruí
```

or:

```text
Alta Floresta
→ Bus to Cuiabá
→ Flight with connection
→ Rental vehicle or bus to Tucuruí
```

The recommendation must be based on the complete mobilization cost and operational viability.

---

# 4. Core decision formula

For each itinerary, calculate:

```text
Total mobilization cost =
transport cost
+ employee labor cost
+ baggage and booking fees
+ terminal transfers
+ rental vehicle cost
+ fuel
+ tolls
+ parking
+ meals
+ accommodation
+ local transportation
+ configurable operational expenses
+ optional risk cost
```

The recommendation engine must consider at least:

- Total mobilization cost.
- Total elapsed duration.
- Required arrival deadline.
- Number of connections.
- Connection risk.
- Employee fatigue and driving limits.
- Overnight travel.
- Availability.
- Price freshness.
- Operational policy compliance.

The cheapest commercial fare must not automatically be the recommended option.

---

# 5. Default labor policy

Implement a configurable, versioned labor policy engine.

Use the following as the initial default policy, but do not hardcode these values throughout the application:

## Monday to Friday

```text
First 8 hours in the day:
base hourly rate, multiplier 1.00

Next 2 hours:
50% overtime, multiplier 1.50

Any time after those first 2 overtime hours:
100% overtime, multiplier 2.00
```

## Saturday

```text
First 8 hours:
base hourly rate, multiplier 1.00

After 8 hours:
100% overtime, multiplier 2.00
```

## Sunday

```text
All counted hours:
150% premium, multiplier 2.50
```

Interpretation:

```text
Sunday 150% = base hour + 150% premium = 2.50 total multiplier
```

## Night premium

```text
Night period:
22:00 through 05:00

Night premium:
20%
```

Night premium is an overlapping premium and must not be represented as an independent bucket that duplicates hours.

Example:

```text
23:00 to 00:00
Base classification: overtime 100%
Night premium: +20%
```

The calculation mode for overlapping premiums must be configurable:

```text
multiplicative:
base rate × overtime multiplier × night multiplier

additive:
base rate × (1 + overtime premium + night premium)
```

Set the default according to the current business rule, but store it in the labor policy configuration.

All labor policy values must support:

- Effective start date.
- Effective end date.
- Policy version.
- Employee group.
- Union or collective agreement.
- Contract type.
- Project or business unit override.
- Audit history.
- Approval status.

---

# 6. Employee hourly cost

The hourly cost must come from the employee or payroll profile.

Do not request the hourly value manually in the main route-search flow.

Support at least:

```text
hourly base cost = salary base ÷ configured monthly hour divisor
```

The divisor must be configurable and must not be globally hardcoded.

Also support an optional fully loaded hourly cost:

```text
fully loaded hourly cost =
salary
+ payroll taxes
+ benefits
+ employer charges
+ configurable labor burden
```

The route comparison must clearly identify which cost basis is being used:

- Base salary hourly cost.
- Fully loaded hourly cost.
- Custom project hourly cost.

The selected cost basis must be stored with the calculation snapshot.

---

# 7. Existing workday context

The engine must not restart the daily eight-hour counter when the employee begins traveling.

Example:

```text
Employee already worked: 6 hours
Travel begins: 18:00
Travel duration: 7 hours
```

Expected classification:

```text
2 hours normal
2 hours overtime at 50%
3 hours overtime at 100%
```

The system should retrieve the already-worked time from:

1. Timekeeping or Ponto module.
2. Employee schedule.
3. Shift planning.
4. Existing mobilization records.
5. Manual fallback only when no authoritative source is available.

The UI must show the source:

```text
Worked time source: Ponto
Last synchronization: ...
```

When automatic data is unavailable, show a clear warning and request only the missing context.

---

# 8. What counts as mobilization time

Create a configurable travel-time policy that defines which activities count toward labor cost.

Support separate policy flags for:

- Travel inside an airplane.
- Travel inside a bus.
- Travel inside a rental vehicle.
- Travel inside a company vehicle.
- Employee driving time.
- Employee passenger time.
- Waiting at an airport.
- Waiting at a bus terminal.
- Check-in and boarding time.
- Baggage claim.
- Connection waiting time.
- Transfer between terminals.
- Local transfer to the hotel.
- Local transfer to the final job site.
- Overnight bus travel.
- Overnight flight travel.
- Hotel rest.
- Meal breaks.
- Mandatory rest periods.
- Delays.
- Cancelled segments and rebooking time.

Do not assume every activity has the same labor treatment.

Each segment must contain a labor-counting classification.

---

# 9. Full itinerary timeline

The system must calculate the complete door-to-door timeline.

## Flight itinerary timeline

Include:

- Origin city departure.
- Transfer to airport.
- Recommended arrival-before-departure buffer.
- Check-in.
- Security.
- Boarding.
- Flight.
- Connections.
- Terminal changes.
- Baggage claim.
- Transfer from destination airport.
- Arrival at hotel, base, plant, worksite, or final operational destination.

## Bus itinerary timeline

Include:

- Transfer to bus terminal.
- Recommended boarding buffer.
- Bus trip.
- Scheduled stops.
- Connections.
- Waiting between bus segments.
- Transfer between terminal and airport when switching modes.
- Transfer to final operational destination.

## Rental or company vehicle timeline

Include:

- Vehicle pickup.
- Contract processing time.
- Road travel.
- Fuel stops.
- Meal stops.
- Mandatory driver rest.
- Overnight accommodation.
- Vehicle return.
- One-way return fee.
- Final local transfer when required.

The route ends only at the configured final destination, not at the nearest airport or bus station.

---

# 10. Multimodal route graph

Implement or evolve the backend into a time-dependent multimodal routing engine.

## Node types

Support:

- City.
- Airport.
- Bus terminal.
- Company base.
- Hotel.
- Worksite.
- Plant.
- Vehicle-rental pickup point.
- Vehicle-rental return point.
- Custom operational location.

## Edge types

Support:

- Flight.
- Bus.
- Rental vehicle.
- Company vehicle.
- Local transfer.
- Taxi or ride service.
- Walking transfer when relevant.
- Waiting.
- Check-in.
- Boarding.
- Baggage claim.
- Mandatory rest.
- Hotel stay.

Each edge must contain:

- Start location.
- End location.
- Start time.
- End time.
- Duration.
- Mode.
- Provider.
- Price.
- Currency.
- Availability.
- Booking link or provider reference when available.
- Baggage rules.
- Cancellation rules when available.
- Freshness timestamp.
- Reliability information when available.
- Labor-counting behavior.
- Source adapter.

---

# 11. Route search strategy

Use an algorithm suitable for a time-dependent multimodal graph.

Recommended approach:

```text
Time-dependent shortest path
+ K-shortest paths
+ Pareto frontier
+ aggressive pruning
```

Do not optimize by one dimension only.

Generate a manageable set of non-dominated alternatives based on:

- Total cost.
- Total duration.
- Number of connections.
- Arrival time.
- Risk.
- Fatigue.
- Operational complexity.

The system should normally return three to five meaningful alternatives, for example:

- Best total cost.
- Fastest.
- Lowest commercial fare.
- Lowest operational complexity.
- Recommended balance.

Avoid presenting many near-duplicate options.

---

# 12. Search pruning and constraints

To prevent route explosion, support configurable constraints:

- Maximum total trip duration.
- Maximum number of segments.
- Maximum number of modal changes.
- Maximum number of connections.
- Maximum waiting time per connection.
- Maximum cumulative waiting time.
- Minimum same-terminal connection buffer.
- Minimum bus-to-flight connection buffer.
- Minimum flight-to-bus connection buffer.
- Minimum transfer buffer between different terminals.
- Maximum allowed geographic backtracking.
- Maximum price deviation from the current best candidate.
- Maximum duration deviation from the fastest candidate.
- Required arrival deadline.
- Earliest departure.
- Employee-specific travel restrictions.
- Driver maximum continuous driving time.
- Mandatory rest periods.
- Night-driving restrictions.
- Vehicle category requirements.
- Baggage and equipment requirements.

Make these configurable by organization or policy.

---

# 13. Terminal transfer validation

A connection is not valid merely because two segments occur in the same city.

Example:

```text
Bus arrives at Goiânia Bus Terminal
Flight departs from Goiânia Airport
```

The engine must insert:

- Disembarkation buffer.
- Baggage handling.
- Transfer duration.
- Traffic buffer.
- Airport check-in buffer.
- Security and boarding buffer.

A connection is valid only when:

```text
previous arrival
+ required disembarkation time
+ transfer time
+ operational safety buffer
<= next segment check-in or boarding cutoff
```

If the connection is not feasible, remove the itinerary.

Do not show impossible connections as valid results.

---

# 14. Time zones and calendar boundaries

Calculate time using timezone-aware timestamps.

Handle:

- Local timezone per segment.
- Date changes.
- Midnight crossing.
- Saturday-to-Sunday transitions.
- Night-period boundaries at 22:00 and 05:00.
- Holiday calendars.
- Daylight-saving rules when applicable.
- Different time zones between origin, connections, and destination.

Store timestamps in UTC and preserve the local timezone used for display and labor classification.

---

# 15. Labor calculation engine

The labor calculation must be deterministic and explainable.

Do not use generative AI to calculate monetary values or hour classification.

Use either:

- Minute-level classification; or
- Event-boundary segmentation with minute-level precision.

For enterprise performance, prefer event-boundary segmentation.

Create calculation boundaries at:

- Segment start.
- Segment end.
- Midnight.
- 05:00.
- 22:00.
- End of regular hours.
- End of first overtime band.
- Saturday start.
- Sunday start.
- Holiday boundaries.
- Meal-break boundaries.
- Rest-period boundaries.
- Timezone changes.
- Policy effective-date changes.

For each generated time block, store:

- Start timestamp.
- End timestamp.
- Local timezone.
- Duration in minutes.
- Activity type.
- Whether the time counts as labor.
- Base classification.
- Overtime classification.
- Night premium.
- Sunday or holiday premium.
- Base hourly value.
- Applied multipliers.
- Calculated cost.
- Policy version.
- Explanation.

---

# 16. Suggested domain models

Adapt these concepts to the existing codebase instead of duplicating equivalent entities.

```typescript
type TransportMode =
  | "flight"
  | "bus"
  | "rental_car"
  | "company_car"
  | "local_transfer"
  | "taxi"
  | "walking"
  | "waiting"
  | "hotel_rest";

type ItinerarySegment = {
  id: string;
  sequence: number;
  mode: TransportMode;
  originLocationId: string;
  destinationLocationId: string;
  departureAtUtc: string;
  arrivalAtUtc: string;
  originTimezone: string;
  destinationTimezone: string;
  providerId?: string;
  providerReference?: string;
  commercialCost: number;
  currency: string;
  availabilityStatus: string;
  laborCountingRuleId: string;
  metadata: Record<string, unknown>;
};

type MultimodalItinerary = {
  id: string;
  requestId: string;
  departureAtUtc: string;
  arrivalAtUtc: string;
  durationMinutes: number;
  segments: ItinerarySegment[];
  connectionCount: number;
  modalChangeCount: number;
  commercialCost: number;
  laborCost: number;
  permanenceCost: number;
  localMobilityCost: number;
  riskCost?: number;
  totalMobilizationCost: number;
  feasibilityStatus: "valid" | "invalid" | "warning";
  feasibilityReasons: string[];
  score: number;
  rankingCategory?: string;
};

type LaborPolicyVersion = {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string;
  regularDailyMinutes: number;
  weekdayFirstOvertimeMinutes: number;
  weekdayFirstOvertimeMultiplier: number;
  weekdayExcessMultiplier: number;
  saturdayRegularMinutes: number;
  saturdayExcessMultiplier: number;
  sundayMultiplier: number;
  nightStartLocalTime: string;
  nightEndLocalTime: string;
  nightMultiplier: number;
  premiumStackingMode: "multiplicative" | "additive";
  status: "draft" | "approved" | "retired";
  version: number;
};

type LaborCostBlock = {
  startAtUtc: string;
  endAtUtc: string;
  localTimezone: string;
  countedMinutes: number;
  baseClassification:
    | "regular"
    | "overtime_50"
    | "overtime_100"
    | "overtime_150"
    | "custom";
  nightPremiumApplied: boolean;
  holidayPremiumApplied: boolean;
  hourlyRate: number;
  appliedMultipliers: number[];
  calculatedCost: number;
  policyVersionId: string;
  explanation: string;
};

type EmployeeMobilizationCostProfile = {
  employeeId: string;
  hourlyCostBasis: "base" | "fully_loaded" | "project_custom";
  baseHourlyRate: number;
  fullyLoadedHourlyRate?: number;
  monthlyHourDivisor: number;
  laborPolicyVersionId: string;
  workScheduleId?: string;
  source: string;
  effectiveAt: string;
};

type TravelTimePolicy = {
  id: string;
  flightTimeCounts: boolean;
  busTimeCounts: boolean;
  passengerVehicleTimeCounts: boolean;
  driverVehicleTimeCounts: boolean;
  airportWaitingCounts: boolean;
  busTerminalWaitingCounts: boolean;
  connectionWaitingCounts: boolean;
  terminalTransferCounts: boolean;
  checkInCounts: boolean;
  baggageClaimCounts: boolean;
  overnightBusCounts: boolean;
  overnightFlightCounts: boolean;
  hotelRestCounts: boolean;
  mealBreakCounts: boolean;
};
```

---

# 17. Provider adapter architecture

Do not tightly couple the domain logic to a specific travel provider.

Create a provider-adapter layer.

Suggested interfaces:

```typescript
interface FlightSearchProvider {
  search(input: FlightSearchInput): Promise<NormalizedFlightOption[]>;
}

interface BusSearchProvider {
  search(input: BusSearchInput): Promise<NormalizedBusOption[]>;
}

interface RentalCarProvider {
  search(input: RentalCarSearchInput): Promise<NormalizedRentalOption[]>;
}

interface RoadRouteProvider {
  calculate(input: RoadRouteInput): Promise<NormalizedRoadRoute>;
}

interface TransferEstimateProvider {
  estimate(input: TransferEstimateInput): Promise<NormalizedTransferEstimate>;
}
```

The existing flight integration must be wrapped behind this adapter pattern.

For bus routes, support multiple providers because inventory coverage may vary by region.

Normalize all provider responses before sending them to the route graph.

Capture:

- Provider.
- Request timestamp.
- Response timestamp.
- Cache expiration.
- Price freshness.
- Search parameters.
- Provider errors.
- Partial availability.
- Currency.
- Source confidence.

Do not expose provider-specific structures to the recommendation engine.

---

# 18. Caching and asynchronous search

Travel search is latency-sensitive and provider-dependent.

Implement:

- Parallel provider searches.
- Timeouts per adapter.
- Retry policy with backoff.
- Circuit breaker.
- Provider-level error isolation.
- Partial-result support.
- Search-result caching.
- Price-expiration timestamps.
- Background enrichment.
- Search progress updates.
- Idempotent search requests.
- Correlation IDs.
- Structured logging.

The UI must be able to show progressive states such as:

```text
Searching flights...
Searching buses...
Calculating rental-car options...
Building multimodal combinations...
Calculating employee labor cost...
Ranking alternatives...
```

Do not block all results because one provider failed.

---

# 19. Cost engine

Create separate cost components.

## Commercial transport cost

- Flight ticket.
- Bus ticket.
- Rental daily rate.
- One-way vehicle return fee.
- Baggage.
- Booking fees.
- Taxes.
- Seat or class upgrade when required.

## Road vehicle cost

- Rental charge.
- Fuel consumption.
- Fuel price.
- Distance.
- Tolls.
- Parking.
- Extra kilometer fee.
- Vehicle return charge.
- Driver accommodation.
- Driver meals.

## Permanence cost

- Hotel.
- Meals.
- Daily allowance.
- Local transportation.
- Project-specific allowances.

## Labor cost

- Normal hours.
- Overtime at 50%.
- Overtime at 100%.
- Sunday premium.
- Night premium.
- Holiday rules.
- Overlapping premiums.
- Existing hours worked.
- Work at destination on the same day when configured.

Every cost must be available as a structured breakdown, not only as a final total.

---

# 20. Recommendation engine

The recommendation engine must first determine feasibility and only then rank options.

## Feasibility checks

- Arrival before deadline.
- Valid connection times.
- Available seats or vehicles.
- Correct baggage capacity.
- Driver-rest compliance.
- Maximum journey duration.
- Employee travel restrictions.
- Vehicle-category requirements.
- No impossible terminal changes.
- Price data not expired beyond configured tolerance.

## Ranking

Rank valid options according to configurable business priorities.

Default ranking priority:

1. Lowest total mobilization cost.
2. Arrival within required deadline.
3. Lower operational risk.
4. Lower total duration.
5. Fewer connections.
6. Lower employee fatigue.
7. Better price freshness.

Support organization-defined weighting, but always show the raw values.

Do not hide a more expensive recommendation. Explain why it won.

Example explanation:

```text
Recommended: Flight + bus.

The bus-only option has a lower ticket price, but its 34-hour duration produces
higher labor, meal, and night-premium costs.

Estimated total:
Flight + bus: R$ 1,290.00
Bus only: R$ 1,640.00

Estimated savings: R$ 350.00
Time saved: 26 hours
```

The explanation may be generated from deterministic reason codes. Generative AI may improve wording, but must not alter figures or conclusions.

---

# 21. UI/UX redesign

Preserve the current clean, premium, light enterprise visual language shown in the existing **Inteligência de Rotas** screen.

Do not redesign the entire application.

Improve the current experience so the primary workflow becomes automated.

## Search header

Keep or improve:

- Origin city.
- Destination city.
- Employee selection.
- Departure date and time.
- Required arrival date and time.
- Vehicle and baggage requirements.
- Search button.

Make the arrival deadline visually prominent because it affects feasibility.

## Replace manual labor inputs

Remove the following editable fields from the main search flow:

- Normal hours/day.
- HE 50%/day.
- HE 100%/day.
- HE 150%/day.
- Night hours/day.

Replace them with a read-only policy summary:

```text
Applied labor policy

8h regular
Next 2h at +50%
Excess at +100%
Saturday after 8h at +100%
Sunday at +150%
Night premium 22:00–05:00 at +20%
```

Add:

- Policy name.
- Policy version.
- Effective date.
- Source.
- Link or drawer: “View full policy”.

Policy editing belongs in an administration screen, not inside every route search.

## Employee context card

Show:

- Employee.
- Current city.
- Hourly cost basis.
- Hourly cost.
- Existing worked hours on departure day.
- Work schedule.
- Source of worked time.
- Labor policy.
- Last synchronization time.
- Data-quality warning when information is missing.

## Search progress

Show an enterprise-quality progress flow with independent statuses for each source.

## Result summary

At the top of the result area, present:

- Recommended option.
- Estimated total cost.
- Estimated savings compared with the next relevant option.
- Total duration.
- Arrival status.
- Number of connections.
- Risk indicator.
- Price freshness.

## Comparison cards

Each route card must show:

- Transport composition.
- Departure.
- Arrival.
- Total duration.
- Number of connections.
- Commercial transport cost.
- Labor cost.
- Meals.
- Accommodation.
- Transfers.
- Vehicle expenses.
- Total mobilization cost.
- Feasibility.
- Warnings.
- Recommendation label.

Suggested labels:

- Recommended.
- Lowest total cost.
- Fastest.
- Lowest ticket price.
- Lowest complexity.
- Invalid — misses arrival deadline.

## Comparison table

Provide a normalized table:

| Option | Commercial | Labor | Meals/Hotel | Local/Vehicle | Total | Duration | Arrival |
|---|---:|---:|---:|---:|---:|---:|---|

Highlight the total, not only the ticket price.

## Timeline

Provide an expandable vertical or horizontal timeline for each itinerary.

Example:

```text
Alta Floresta
06:00
↓ Bus — 12h
Cuiabá
18:00
↓ Connection — 2h
↓ Transfer to airport — 40m
Cuiabá Airport
20:40
↓ Flight
Belém
...
Tucuruí
03:00
```

Every segment should show:

- Mode.
- Provider.
- Departure and arrival.
- Duration.
- Price.
- Labor classification summary.
- Connection margin.
- Warning status.

## Labor breakdown drawer

Show:

```text
8h00 regular
2h00 overtime +50%
14h30 overtime +100%
5h20 with night premium
```

Clarify:

```text
Night-premium hours overlap the labor categories above and are not duplicated.
```

Allow users to inspect the minute-accurate blocks.

## Empty, loading, partial, and error states

Create dedicated states for:

- No direct route found.
- Building multimodal routes.
- Bus provider unavailable.
- Flight provider unavailable.
- Partial results available.
- Missing employee cost data.
- Missing workday data.
- No itinerary reaches the destination before the deadline.
- Search result price expired.

---

# 22. Administrative configuration

Create or extend administrative configuration for:

- Labor policies.
- Travel-time counting policies.
- Meal cost policies.
- Hotel cost policies.
- Local transportation policies.
- Connection safety buffers.
- Search limits.
- Vehicle consumption assumptions.
- Fuel prices.
- Toll provider configuration.
- Approved transport providers.
- Employee restrictions.
- Project and business-unit overrides.
- Holiday calendars.
- Currency and exchange-rate policy.
- Cost-basis selection.
- Approval thresholds.

All configuration changes must be audited.

---

# 23. Database and migration requirements

Before creating migrations:

1. Inspect the current schema.
2. Reuse existing employee, route, vehicle, project, cost, travel, and audit entities when possible.
3. Avoid duplicated concepts.
4. Keep migrations backward-compatible.
5. Add indexes for search and audit queries.
6. Preserve existing route records.
7. Version policies instead of overwriting historical values.
8. Store immutable calculation snapshots.

At minimum, confirm whether equivalent entities exist for:

- Mobilization requests.
- Itineraries.
- Itinerary segments.
- Provider search snapshots.
- Employee cost profiles.
- Labor policy versions.
- Travel-time policies.
- Cost breakdowns.
- Labor calculation blocks.
- Recommendations.
- Feasibility checks.
- Approval history.
- Audit events.

Every saved recommendation must retain the exact inputs and policy versions used at the time of calculation.

---

# 24. API and service boundaries

Suggested internal services:

```text
MobilizationRequestService
EmployeeCostProfileService
ProviderSearchOrchestrator
MultimodalGraphBuilder
ItineraryGenerator
ConnectionFeasibilityService
LaborCostEngine
OperationalCostEngine
RecommendationEngine
MobilizationAuditService
```

Suggested API flow:

```text
POST /mobilization/search
GET  /mobilization/search/:searchId/status
GET  /mobilization/search/:searchId/results
GET  /mobilization/itineraries/:itineraryId
GET  /mobilization/itineraries/:itineraryId/labor-breakdown
POST /mobilization/itineraries/:itineraryId/select
POST /mobilization/requests/:requestId/submit-for-approval
```

Adapt naming and transport style to the existing backend conventions.

Do not introduce a parallel API architecture if the project already has established patterns.

---

# 25. Auditability and explainability

For every calculation, store:

- Employee.
- Origin.
- Destination.
- Requested departure.
- Required arrival.
- Existing hours worked.
- Source of worked hours.
- Hourly rate.
- Hourly-rate basis.
- Monthly divisor.
- Labor policy version.
- Travel-time policy version.
- Provider results used.
- Price timestamps.
- Route segments.
- Connection assumptions.
- Cost breakdown.
- Labor blocks.
- Feasibility checks.
- Recommendation score.
- Recommendation reason codes.
- User who requested the calculation.
- User who selected the route.
- Approval history.
- Manual overrides.
- Override justification.

Manual overrides must require a reason and must not silently alter the original recommendation.

---

# 26. Security and permissions

Respect the existing authentication and authorization model.

Create or reuse permissions for:

- Search mobilization options.
- View employee hourly cost.
- View fully loaded labor cost.
- View sensitive payroll-derived data.
- Edit mobilization policies.
- Override recommendations.
- Approve mobilization.
- View provider prices.
- View audit records.

Sensitive salary data should not be exposed unnecessarily.

A user may see:

```text
Estimated labor cost: R$ 680.00
```

without necessarily seeing:

```text
Employee salary: R$ ...
```

Use permission-based masking.

---

# 27. Observability

Implement:

- Correlation ID for every search.
- Provider latency metrics.
- Provider error rates.
- Cache-hit ratio.
- Number of generated route candidates.
- Number of pruned candidates.
- Labor calculation duration.
- Recommendation duration.
- Search completion duration.
- Partial-result frequency.
- Invalid-connection frequency.
- Recommendation override rate.
- Cost-estimate versus actual-cost variance.

Use structured logs.

Do not log sensitive payroll values in plain text unless the existing observability policy explicitly permits it.

---

# 28. Performance expectations

The route search must feel responsive even when several providers are queried.

Target behavior:

- Immediate search acknowledgment.
- Progressive search status.
- Partial options displayed when safe.
- Cached results reused within their freshness period.
- Expensive multimodal generation executed asynchronously.
- UI remains interactive.
- Avoid rendering hundreds of duplicate alternatives.
- Use pagination or virtualization for detailed histories when needed.

Do not trade calculation correctness for superficial speed.

---

# 29. Testing requirements

Create automated tests for the calculation engine and the complete search flow.

## Unit tests — labor policy

Cover at least:

1. Eight regular weekday hours.
2. Ten weekday hours: 8 regular + 2 at 50%.
3. Twelve weekday hours: 8 regular + 2 at 50% + 2 at 100%.
4. Saturday below eight hours.
5. Saturday above eight hours.
6. Sunday hours at the configured 150% premium.
7. Night hours between 22:00 and 05:00.
8. Overtime plus night premium.
9. Trip crossing midnight.
10. Trip crossing Friday into Saturday.
11. Trip crossing Saturday into Sunday.
12. Existing worked hours before departure.
13. Meal breaks excluded.
14. Waiting periods included or excluded according to policy.
15. Hotel rest excluded.
16. Multiple time zones.
17. Policy version change.
18. Holiday override.
19. Decimal-minute rounding.
20. Premium-stacking modes.

## Unit tests — multimodal routing

Cover:

1. Direct flight.
2. Direct bus.
3. Rental vehicle.
4. Bus + flight.
5. Bus + bus + flight + bus.
6. Transfer between bus terminal and airport.
7. Invalid short connection.
8. Valid connection with safety buffer.
9. Arrival after deadline.
10. Route with excessive backtracking.
11. Provider failure with partial results.
12. Duplicate itinerary elimination.
13. Pareto-frontier filtering.
14. No direct route but valid multimodal route.
15. No valid route.

## Integration tests

Cover:

- Provider normalization.
- Employee cost retrieval.
- Timekeeping integration.
- Route search orchestration.
- Cost aggregation.
- Result persistence.
- Audit snapshot.
- Approval handoff.

## End-to-end tests

Create at least one complete scenario:

```text
Origin: Alta Floresta
Destination: Tucuruí
No direct route
System produces a multimodal route
System calculates commercial and labor costs
System compares against a slower bus-heavy route
System recommends the lower total-cost option
User opens the detailed timeline
User opens the labor breakdown
User submits the selected route for approval
```

Use deterministic provider fixtures for automated tests.

---

# 30. Acceptance criteria

The implementation is complete only when all criteria below are satisfied.

## Automation

- The user does not manually enter normal, overtime, or night-hour quantities in the primary flow.
- Labor categories are calculated automatically from the route timeline.
- Existing worked time is considered.
- The hourly cost comes from the employee cost profile.

## Multimodal routing

- The system supports routes with multiple buses, flights, vehicles, and transfers.
- The system can find a route even when no direct flight or bus exists.
- Terminal changes are explicitly represented.
- Invalid connections are removed.

## Cost accuracy

- The system calculates commercial, labor, permanence, local, and vehicle costs separately.
- Night premium overlaps correctly with overtime.
- Multi-day trips are split correctly.
- Saturday, Sunday, and timezone boundaries are handled.
- The total cost is reproducible from the stored breakdown.

## Recommendation

- The recommended option is based on total mobilization cost and feasibility.
- A cheaper ticket may correctly lose to a more expensive ticket with lower total cost.
- The system explains the recommendation using exact values.
- Options missing the required arrival deadline are not recommended.

## UX

- The current premium visual language is preserved.
- Manual labor-hour inputs are removed from the main search flow.
- The result clearly distinguishes ticket price from total mobilization cost.
- Every itinerary has a readable multimodal timeline.
- The user can inspect the labor-cost breakdown.
- Partial provider failures are clearly communicated.

## Enterprise readiness

- Policies are versioned.
- Calculations are auditable.
- Sensitive employee-cost data is permission-protected.
- Provider failures do not collapse the entire search.
- Automated tests cover the major labor and routing cases.

---

# 31. Implementation sequence

Execute the work in safe phases.

## Phase 1 — Discovery

- Inspect the existing module.
- Map current components, services, database entities, providers, and calculation logic.
- Identify what can be reused.
- Document gaps.
- Produce a concise implementation plan before editing.

## Phase 2 — Domain and policies

- Introduce or refine domain models.
- Create versioned labor policies.
- Create travel-time counting policies.
- Add immutable calculation snapshots.

## Phase 3 — Labor engine

- Build the deterministic labor classification engine.
- Add comprehensive unit tests.
- Validate edge cases before integrating providers.

## Phase 4 — Provider normalization

- Wrap the existing flight integration.
- Add bus-provider adapters.
- Add road, rental, toll, and transfer estimation adapters.
- Normalize all provider output.

## Phase 5 — Multimodal graph

- Build time-dependent route candidates.
- Insert transfer and waiting edges.
- Add feasibility checks.
- Add pruning and Pareto filtering.

## Phase 6 — Cost and recommendation

- Calculate commercial cost.
- Calculate labor cost.
- Calculate permanence and local costs.
- Rank options.
- Generate deterministic explanations.

## Phase 7 — UI/UX

- Replace manual hour inputs.
- Add employee and policy context.
- Add progressive search states.
- Add comparison cards and table.
- Add multimodal timeline.
- Add labor breakdown.
- Add partial-result and error states.

## Phase 8 — Audit and approvals

- Save calculation snapshots.
- Save selected itinerary.
- Save overrides and reasons.
- Integrate with the existing approval workflow.

## Phase 9 — Quality and rollout

- Run tests.
- Add observability.
- Add feature flags.
- Validate against real historical mobilizations.
- Compare estimated cost with actual cost.
- Roll out gradually.

---

# 32. Engineering constraints

- Inspect before changing.
- Reuse current architecture and conventions.
- Do not create duplicate domain entities.
- Do not hardcode labor rules in UI components.
- Do not calculate money using floating-point arithmetic.
- Use decimal or integer minor units.
- Do not calculate labor cost with generative AI.
- Do not rely on route duration alone; use the complete timeline.
- Do not treat arrival in an airport or bus terminal as arrival at the final destination.
- Do not assume all waiting time counts as paid time.
- Do not expose salary information without permission.
- Do not silently fall back to mock results in production.
- Do not mark an itinerary as valid without connection-feasibility validation.
- Do not remove or regress current vehicle-cost functionality.
- Preserve existing route history where possible.
- Keep the current UI responsive and accessible.
- Use clear types and avoid `any`.
- Add comments only where they explain non-obvious domain rules.
- Maintain backward compatibility unless a migration plan explicitly covers the change.

---

# 33. Final deliverables

Deliver:

1. Discovery summary.
2. Architecture and implementation plan.
3. Database migrations.
4. Versioned labor-policy model.
5. Travel-time policy model.
6. Deterministic labor-cost engine.
7. Provider adapter layer.
8. Multimodal route graph and itinerary generator.
9. Feasibility validator.
10. Operational cost engine.
11. Recommendation engine.
12. Updated Inteligência de Rotas UI.
13. Multimodal itinerary timeline.
14. Labor-cost breakdown UI.
15. Audit trail.
16. Permission controls.
17. Unit, integration, and end-to-end tests.
18. Documentation describing the calculation rules.
19. A migration and rollout note.
20. A final validation report showing how the Alta Floresta → Tucuruí scenario is solved.

---

# 34. Required final validation scenario

Use a controlled test fixture for the following case:

```text
Employee current city: Alta Floresta
Final destination: Tucuruí
No direct flight available
No direct bus available
```

At least one generated option must include:

```text
Alta Floresta
→ Bus to Cuiabá
→ Bus to Goiânia
→ Flight to Belém
→ Bus to Tucuruí
```

The engine must:

- Build the full timeline.
- Include all connection waits.
- Include terminal transfers.
- Apply the employee labor policy.
- Calculate night hours.
- Calculate overtime.
- Calculate meals and accommodation when triggered.
- Calculate the full cost.
- Compare this option with at least two alternatives.
- Recommend the best viable total-cost option.
- Explain why the cheapest ticket combination may not be the cheapest mobilization.

The validation report must show:

```text
Commercial transport cost
Labor cost
Meals
Accommodation
Transfers
Vehicle costs
Total mobilization cost
Total duration
Arrival status
Connection count
Recommendation reason
```

Do not finish with only a visual prototype. The backend calculation and routing behavior must be fully functional, testable, auditable, and connected to the existing system.
