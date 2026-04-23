/**
 * Route Intelligence Service
 * Orchestrates multimodal route analysis combining:
 * - Backend Google Routes (driving via server-side key)
 * - Internal route database (bus, air, vehicle)
 * - Flight API (real-time air pricing)
 * - Cost engine (full operational cost)
 */

import { getDrivingRoutes, estimateVehicleCosts } from './GoogleRoutesService';
import { getRouteIntelligence, getCityInfo } from '../../../engine/routes-intelligence-db.js';
import { detectLocationContext } from '../../locations/services/GoogleGeocodingService';

/**
 * Build complete multimodal scenario from origin to destination
 * This is the orchestration layer that ties everything together
 * @param {Object} params
 * @param {Object} params.origin - { lat, lng, name, formattedAddress }
 * @param {Object} params.destination - { lat, lng, name, formattedAddress }
 * @param {Object} params.vehicleConfig - Vehicle configuration
 * @returns {Promise<Object>} Complete route intelligence
 */
export async function buildMultimodalScenarios(params) {
  const { origin, destination, vehicleConfig = {} } = params;

  const scenarios = {
    driving: null,
    drivingAlternatives: [],
    bus: [],
    air: [],
    vehicle: null,
  };

  // 1. Try Google Routes via backend for accurate driving data
  if (origin.lat && destination.lat) {
    try {
      const drivingResult = await getDrivingRoutes(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        { alternatives: true }
      );

      if (drivingResult.success && drivingResult.routes.length > 0) {
        scenarios.driving = drivingResult.routes[0];
        scenarios.drivingAlternatives = drivingResult.routes.slice(1);

        scenarios.vehicle = {
          route: scenarios.driving,
          costs: estimateVehicleCosts(scenarios.driving, vehicleConfig),
          alternatives: scenarios.drivingAlternatives.map(r => ({
            route: r,
            costs: estimateVehicleCosts(r, vehicleConfig),
          })),
        };
      }
    } catch (err) {
      console.warn('Google Routes error:', err);
    }
  }

  // 2. Get internal route intelligence (bus/air/vehicle fallback)
  const originName = origin.name || origin.formattedAddress;
  const destName = destination.name || destination.formattedAddress;
  const internalRoute = getRouteIntelligence(originName, destName);

  if (internalRoute) {
    if (internalRoute.bus?.alternativas) {
      scenarios.bus = internalRoute.bus.alternativas;
    }
    if (internalRoute.air?.alternativas) {
      scenarios.air = internalRoute.air.alternativas;
    }
    if (!scenarios.vehicle && internalRoute.vehicle) {
      scenarios.vehicle = {
        route: {
          distanceKm: internalRoute.vehicle.distanciaKm,
          durationHours: internalRoute.vehicle.tempoEstimadoH,
          summary: internalRoute.vehicle.rotaDescricao,
        },
        costs: {
          fuel: { total: internalRoute.vehicle.combustivelEstimado },
          rental: { total: internalRoute.vehicle.custoAluguel },
          tolls: internalRoute.vehicle.pedagios,
          total: internalRoute.vehicle.custoTotalVeiculo,
        },
      };
    }
  }

  // 3. Detect mobility context
  const originContext = detectLocationContext(origin);
  const destContext = detectLocationContext(destination);

  return {
    success: true,
    origin: { ...origin, context: originContext },
    destination: { ...destination, context: destContext },
    scenarios,
    internalRoute,
    googleRoutesUsed: !!scenarios.driving,
    distanceKm: scenarios.driving?.distanceKm || internalRoute?.distanciaKm || null,
  };
}

/**
 * Compare full door-to-door time for each mode
 */
export function calculateDoorToDoorTime(scenario, mode) {
  switch (mode) {
    case 'air': {
      const groundToAirport = 1.5;
      const checkIn = 1.5;
      const flightTime = scenario.tempoVooH || 2;
      const connections = (scenario.conexoes || 0) * 1.5;
      const airportToDestination = 1.0;
      return groundToAirport + checkIn + flightTime + connections + airportToDestination;
    }
    case 'bus': {
      const toTerminal = 0.5;
      const boardingTime = 0.5;
      const busTime = scenario.tempoTotalH || 12;
      const transfers = (scenario.baldeacoes || 0) * 1.0;
      const fromTerminal = 0.5;
      return toTerminal + boardingTime + busTime + transfers + fromTerminal;
    }
    case 'vehicle': {
      const drivingTime = scenario.durationHours || scenario.tempoEstimadoH || 12;
      const breaks = Math.floor(drivingTime / 3) * 0.25;
      return drivingTime + breaks;
    }
    default:
      return 0;
  }
}
