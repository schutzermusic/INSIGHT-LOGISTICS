/**
 * Labor Cost Service
 * Comprehensive labor cost calculation for field mobilization
 * Follows Brazilian CLT labor law standards
 */

import { calcHourlyRates, calcLaborCost, calcTravelCost } from '../../../engine/calculator.js';

/**
 * Calculate travel labor cost for team during transit
 * @param {Array} collaborators - Team members
 * @param {number} travelDurationH - Travel duration in hours (one way)
 * @param {boolean} roundTrip - Whether it's round trip
 * @returns {Object} Travel labor cost breakdown
 */
export function calculateTravelLaborCost(collaborators, travelDurationH, roundTrip = true) {
  let totalCost = 0;
  const breakdown = collaborators.map(collab => {
    const rates = calcHourlyRates(collab);
    const travel = calcTravelCost(rates, travelDurationH, roundTrip);
    totalCost += travel.custoTransito;
    return {
      collaborator: collab.nome,
      role: collab.cargo,
      technicalRate: rates.horaTecnica,
      hoursInTransit: travel.horasTransito,
      transitCost: travel.custoTransito,
    };
  });

  return {
    totalCost: round(totalCost),
    totalHours: roundTrip ? travelDurationH * 2 : travelDurationH,
    perPerson: breakdown,
    averageCostPerPerson: collaborators.length > 0 ? round(totalCost / collaborators.length) : 0,
  };
}

/**
 * Calculate field labor cost for team during field work
 * @param {Array} collaborators - Team members
 * @param {Object} fieldParams - { daysInField, regularHoursPerDay, overtime50PerDay, overtime100PerDay, nightShiftHoursPerDay }
 * @returns {Object} Field labor cost breakdown
 */
export function calculateFieldLaborCost(collaborators, fieldParams) {
  const {
    daysInField = 5,
    regularHoursPerDay = 8,
    overtime50PerDay = 0,
    overtime100PerDay = 0,
    nightShiftHoursPerDay = 0,
  } = fieldParams;

  let totalCost = 0;
  const breakdown = collaborators.map(collab => {
    const rates = calcHourlyRates(collab);
    const hours = {
      horasNormais: regularHoursPerDay * daysInField,
      horasExtra50: overtime50PerDay * daysInField,
      horasExtra100: overtime100PerDay * daysInField,
      horasNoturnas: nightShiftHoursPerDay * daysInField,
    };
    const labor = calcLaborCost(rates, hours);
    totalCost += labor.custoTotalHoras;

    return {
      collaborator: collab.nome,
      role: collab.cargo,
      rates,
      hours,
      laborCost: labor,
    };
  });

  return {
    totalCost: round(totalCost),
    daysInField,
    totalRegularHours: regularHoursPerDay * daysInField,
    totalOvertimeHours: (overtime50PerDay + overtime100PerDay) * daysInField,
    totalNightHours: nightShiftHoursPerDay * daysInField,
    perPerson: breakdown,
    averageCostPerPerson: collaborators.length > 0 ? round(totalCost / collaborators.length) : 0,
  };
}

/**
 * Calculate lodging cost
 * @param {number} daysInField
 * @param {number} dailyLodgingCost
 * @param {number} numberOfPeople
 * @returns {Object}
 */
export function calculateLodgingCost(daysInField, dailyLodgingCost, numberOfPeople) {
  const total = round(daysInField * dailyLodgingCost * numberOfPeople);
  return {
    total,
    perDay: dailyLodgingCost,
    perPerson: round(daysInField * dailyLodgingCost),
    days: daysInField,
    people: numberOfPeople,
  };
}

/**
 * Calculate meal cost
 * @param {number} daysInField
 * @param {number} dailyMealCost
 * @param {number} numberOfPeople
 * @returns {Object}
 */
export function calculateMealCost(daysInField, dailyMealCost, numberOfPeople) {
  const total = round(daysInField * dailyMealCost * numberOfPeople);
  return {
    total,
    perDay: dailyMealCost,
    perPerson: round(daysInField * dailyMealCost),
    days: daysInField,
    people: numberOfPeople,
  };
}

/**
 * Calculate local transport cost at destination
 * @param {number} daysInField
 * @param {number} dailyTransportCost
 * @param {number} numberOfPeople
 * @returns {Object}
 */
export function calculateLocalTransportCost(daysInField, dailyTransportCost, numberOfPeople) {
  const total = round(daysInField * dailyTransportCost * numberOfPeople);
  return {
    total,
    perDay: dailyTransportCost,
    days: daysInField,
    people: numberOfPeople,
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}
