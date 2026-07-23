/**
 * Domain types — canonical shapes for the Multimodal Mobilization engine.
 *
 * These are the single source of truth for the domain model (spec §16). They are
 * expressed as JSDoc typedefs because the project is plain JS (see jsconfig.json)
 * and has no TypeScript build step — but editors still get autocomplete and the
 * shapes are documented in one place.
 *
 * Conventions:
 * - All monetary fields are integer centavos (see ./money.js), suffixed `C`.
 * - All timestamps are ISO-8601 UTC strings, suffixed `AtUtc`. Local timezone is
 *   carried alongside (IANA name) for labor classification and display (§14).
 * - Durations are in minutes unless otherwise noted.
 *
 * This module intentionally exports no runtime values — importing it is a no-op
 * used only to anchor the typedefs. Do NOT duplicate these shapes elsewhere;
 * adapt existing entities onto them via adapters (§16, §32).
 *
 * @module domain/types
 */

/**
 * @typedef {'flight'|'bus'|'rental_car'|'company_car'|'local_transfer'|'taxi'|'walking'|'waiting'|'hotel_rest'} TransportMode
 */

/**
 * How a segment's time is treated for labor cost (§8). References a
 * TravelTimePolicy flag; resolved to counts/does-not-count at classification.
 * @typedef {'flight_time'|'bus_time'|'passenger_vehicle_time'|'driver_vehicle_time'|'airport_waiting'|'bus_terminal_waiting'|'connection_waiting'|'terminal_transfer'|'check_in'|'baggage_claim'|'overnight_bus'|'overnight_flight'|'hotel_rest'|'meal_break'} LaborCountingRuleId
 */

/**
 * A single leg of an itinerary (§16). Timestamps are UTC; timezones are the
 * local IANA zone at each endpoint, used for night/weekend classification.
 * @typedef {Object} ItinerarySegment
 * @property {string} id
 * @property {number} sequence — 0-based order within the itinerary
 * @property {TransportMode} mode
 * @property {string} originLocationId
 * @property {string} destinationLocationId
 * @property {string} departureAtUtc
 * @property {string} arrivalAtUtc
 * @property {string} originTimezone — IANA zone, e.g. "America/Cuiaba"
 * @property {string} destinationTimezone
 * @property {string} [providerId]
 * @property {string} [providerReference]
 * @property {import('./money.js').Centavos} commercialCostC
 * @property {string} currency — always "BRL" for now
 * @property {string} availabilityStatus
 * @property {LaborCountingRuleId} laborCountingRuleId
 * @property {Record<string, unknown>} metadata
 */

/**
 * A complete door-to-door itinerary with its cost decomposition and ranking (§16).
 * @typedef {Object} MultimodalItinerary
 * @property {string} id
 * @property {string} requestId
 * @property {string} departureAtUtc
 * @property {string} arrivalAtUtc
 * @property {number} durationMinutes
 * @property {ItinerarySegment[]} segments
 * @property {number} connectionCount
 * @property {number} modalChangeCount
 * @property {import('./money.js').Centavos} commercialCostC
 * @property {import('./money.js').Centavos} laborCostC
 * @property {import('./money.js').Centavos} permanenceCostC
 * @property {import('./money.js').Centavos} localMobilityCostC
 * @property {import('./money.js').Centavos} [riskCostC]
 * @property {import('./money.js').Centavos} totalMobilizationCostC
 * @property {'valid'|'invalid'|'warning'} feasibilityStatus
 * @property {string[]} feasibilityReasons — reason codes (§20)
 * @property {number} score
 * @property {string} [rankingCategory] — e.g. "recommended", "lowest_total", "fastest"
 */

/**
 * A versioned, auditable labor policy (§5). Values live in configuration, not
 * hardcoded. Multipliers are absolute (e.g. 2.5 for Sunday), durations in minutes.
 * @typedef {Object} LaborPolicyVersion
 * @property {string} id
 * @property {string} name
 * @property {string} effectiveFrom — ISO date
 * @property {string} [effectiveTo]
 * @property {number} regularDailyMinutes — e.g. 480 (8h)
 * @property {number} weekdayFirstOvertimeMinutes — e.g. 120 (2h)
 * @property {number} weekdayFirstOvertimeMultiplier — e.g. 1.5
 * @property {number} weekdayExcessMultiplier — e.g. 2.0
 * @property {number} saturdayRegularMinutes — e.g. 480
 * @property {number} saturdayExcessMultiplier — e.g. 2.0
 * @property {number} sundayMultiplier — e.g. 2.5
 * @property {string} nightStartLocalTime — "22:00"
 * @property {string} nightEndLocalTime — "05:00"
 * @property {number} nightMultiplier — e.g. 1.2 (the +20% premium)
 * @property {'multiplicative'|'additive'} premiumStackingMode — night × OT, or additive (§5)
 * @property {'draft'|'approved'|'retired'} status
 * @property {number} version
 */

/**
 * One classified time block emitted by the labor engine (§15). Immutable input
 * to the audit snapshot; the total labor cost is reproducible from these blocks.
 * @typedef {Object} LaborCostBlock
 * @property {string} startAtUtc
 * @property {string} endAtUtc
 * @property {string} localTimezone
 * @property {number} countedMinutes — minutes that count as paid labor
 * @property {'regular'|'overtime_50'|'overtime_100'|'overtime_150'|'custom'} baseClassification
 * @property {boolean} nightPremiumApplied
 * @property {boolean} holidayPremiumApplied
 * @property {import('./money.js').Centavos} hourlyRateC — base hourly rate used
 * @property {number[]} appliedMultipliers — e.g. [2.0, 1.2] for OT100 + night
 * @property {import('./money.js').Centavos} calculatedCostC
 * @property {string} policyVersionId
 * @property {string} explanation — deterministic, human-readable
 */

/**
 * The cost basis used to value an employee's time (§6). Snapshotted with each
 * calculation so results are reproducible even if payroll later changes.
 * @typedef {Object} EmployeeMobilizationCostProfile
 * @property {string} employeeId
 * @property {'base'|'fully_loaded'|'project_custom'} hourlyCostBasis
 * @property {import('./money.js').Centavos} baseHourlyRateC
 * @property {import('./money.js').Centavos} [fullyLoadedHourlyRateC]
 * @property {number} monthlyHourDivisor — e.g. 220 (configurable, §6)
 * @property {string} laborPolicyVersionId
 * @property {string} [workScheduleId]
 * @property {string} source — where the rate came from (payroll, manual, …)
 * @property {string} effectiveAt
 */

/**
 * Which activities count toward labor cost (§8). Versioned like labor policies.
 * @typedef {Object} TravelTimePolicy
 * @property {string} id
 * @property {boolean} flightTimeCounts
 * @property {boolean} busTimeCounts
 * @property {boolean} passengerVehicleTimeCounts
 * @property {boolean} driverVehicleTimeCounts
 * @property {boolean} airportWaitingCounts
 * @property {boolean} busTerminalWaitingCounts
 * @property {boolean} connectionWaitingCounts
 * @property {boolean} terminalTransferCounts
 * @property {boolean} checkInCounts
 * @property {boolean} baggageClaimCounts
 * @property {boolean} overnightBusCounts
 * @property {boolean} overnightFlightCounts
 * @property {boolean} hotelRestCounts
 * @property {boolean} mealBreakCounts
 */

/**
 * A normalized transport option returned by any provider adapter (§17). This is
 * the ONLY provider-facing shape the graph builder consumes — provider-specific
 * structures never reach the routing/recommendation engines.
 * @typedef {Object} NormalizedOption
 * @property {TransportMode} mode
 * @property {string} providerId
 * @property {string} [providerReference]
 * @property {string} originLocationId
 * @property {string} destinationLocationId
 * @property {string} [departureAtUtc]
 * @property {string} [arrivalAtUtc]
 * @property {number} [durationMinutes]
 * @property {import('./money.js').Centavos} commercialCostC
 * @property {string} currency
 * @property {string} availabilityStatus
 * @property {boolean} estimated — true when values are modeled, not live-quoted (§6, §32)
 * @property {string} priceFreshnessAtUtc — when the price was captured
 * @property {Record<string, unknown>} raw — original provider payload, for audit
 */

export {};
