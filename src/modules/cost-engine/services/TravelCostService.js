/**
 * Travel Cost Service
 * Calculates transport costs for each travel mode
 */

/**
 * Calculate vehicle scenario cost
 * @param {Object} params - { distanceKm, fuelConsumptionKmL, fuelPricePerLiter, rentalPerDay, tolls, drivingDays }
 * @returns {Object} Vehicle cost breakdown
 */
export function calculateVehicleScenarioCost(params) {
  const {
    distanceKm = 0,
    fuelConsumptionKmL = 10,
    fuelPricePerLiter = 5.50,
    rentalPerDay = 180,
    tolls = 0,
    drivingDays = 1,
    wearEstimate = 0,
  } = params;

  const fuelLiters = distanceKm / fuelConsumptionKmL;
  const fuelCost = round(fuelLiters * fuelPricePerLiter);
  const rentalCost = round(rentalPerDay * drivingDays);
  const total = round(fuelCost + rentalCost + tolls + wearEstimate);

  return {
    fuel: fuelCost,
    fuelLiters: round(fuelLiters),
    rental: rentalCost,
    tolls: round(tolls),
    wearEstimate: round(wearEstimate),
    total,
    isSharedCost: true, // Vehicle cost is shared among team
  };
}

/**
 * Calculate bus scenario cost
 * @param {Object} params - { farePerPerson, numberOfPeople, travelDurationH }
 * @returns {Object} Bus cost breakdown
 */
export function calculateBusScenarioCost(params) {
  const {
    farePerPerson = 0,
    numberOfPeople = 1,
    travelDurationH = 0,
  } = params;

  const totalFare = round(farePerPerson * numberOfPeople);

  // Long travel penalty: productivity loss for trips > 12h
  const longTravelPenalty = travelDurationH > 12 ? round((travelDurationH - 12) * 15 * numberOfPeople) : 0;

  return {
    farePerPerson: round(farePerPerson),
    totalFare,
    longTravelPenalty,
    total: round(totalFare + longTravelPenalty),
    isPerPerson: true,
  };
}

/**
 * Calculate flight scenario cost
 * @param {Object} params - { ticketPerPerson, numberOfPeople, baggageCostPerPerson, airportTransferPerPerson }
 * @returns {Object} Flight cost breakdown
 */
export function calculateFlightScenarioCost(params) {
  const {
    ticketPerPerson = 0,
    numberOfPeople = 1,
    baggageCostPerPerson = 0,
    airportTransferPerPerson = 60,
  } = params;

  const totalTickets = round(ticketPerPerson * numberOfPeople);
  const totalBaggage = round(baggageCostPerPerson * numberOfPeople);
  const totalTransfer = round(airportTransferPerPerson * numberOfPeople * 2); // round trip transfer

  return {
    ticketPerPerson: round(ticketPerPerson),
    totalTickets,
    baggageCostPerPerson: round(baggageCostPerPerson),
    totalBaggage,
    airportTransferPerPerson: round(airportTransferPerPerson),
    totalTransfer,
    total: round(totalTickets + totalBaggage + totalTransfer),
    isPerPerson: true,
  };
}

/**
 * Calculate total scenario cost combining all components
 * @param {Object} components
 * @returns {Object} Consolidated total
 */
export function calculateScenarioTotalCost(components) {
  const {
    transportCost = 0,
    travelLaborCost = 0,
    fieldLaborCost = 0,
    lodgingCost = 0,
    mealCost = 0,
    localTransportCost = 0,
    extras = 0,
  } = components;

  const total = round(
    transportCost +
    travelLaborCost +
    fieldLaborCost +
    lodgingCost +
    mealCost +
    localTransportCost +
    extras
  );

  return {
    transport: round(transportCost),
    travelLabor: round(travelLaborCost),
    fieldLabor: round(fieldLaborCost),
    lodging: round(lodgingCost),
    meals: round(mealCost),
    localTransport: round(localTransportCost),
    extras: round(extras),
    total,
    breakdown: {
      transportPercent: total > 0 ? round((transportCost / total) * 100) : 0,
      laborPercent: total > 0 ? round(((travelLaborCost + fieldLaborCost) / total) * 100) : 0,
      perDiemPercent: total > 0 ? round(((lodgingCost + mealCost + localTransportCost) / total) * 100) : 0,
    },
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}
