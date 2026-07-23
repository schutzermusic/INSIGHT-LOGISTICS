const cents = (value) => (Number.isFinite(value) ? Math.round(value) : 0);
const reais = (value) => cents(value) / 100;

/**
 * Adapts the normalized manual-mobilization cost snapshot to the legacy
 * History summary fields. Values returned here are reais, as expected by
 * formatCurrency and the existing simulations store.
 */
export function mobilizationDraftHistorySummary(scenario = {}) {
  const breakdown = scenario.breakdown || {};
  const segments = Array.isArray(scenario.segments) ? scenario.segments : [];
  const segmentCost = (modes) => segments
    .filter((segment) => modes.has(segment.mode || segment.segmentType))
    .reduce((sum, segment) => sum + cents(segment.commercialCostC), 0);
  const hasSegmentCosts = segments.some((segment) => cents(segment.commercialCostC) !== 0);
  const laborC = cents(scenario.laborCostC ?? breakdown.labor_c);
  const ticketsC = hasSegmentCosts
    ? segmentCost(new Set(['flight', 'bus']))
    : cents(breakdown.ticket_c);
  const accommodationC = hasSegmentCosts
    ? segmentCost(new Set(['hotel_rest']))
    : cents(breakdown.transit_hotel_c) + cents(breakdown.field_hotel_c);
  const mealsC = hasSegmentCosts
    ? segmentCost(new Set(['meal_break']))
    : cents(breakdown.transit_meals_c) + cents(breakdown.field_meals_c);
  const explicitLogisticsC = hasSegmentCosts
    ? segmentCost(new Set(['rental_car', 'company_car', 'local_transfer', 'transfer']))
    : cents(breakdown.shared_vehicle_c) +
      cents(breakdown.terminal_transfers_c) +
      cents(breakdown.field_local_c);
  const totalC = cents(scenario.totalMobilizationCostC ?? breakdown.total_c);

  // Any future/unknown engine category stays visible under Logístico instead
  // of disappearing from the History detail or breaking total reconciliation.
  const categorizedC = laborC + ticketsC + accommodationC + mealsC + explicitLogisticsC;
  const logisticsC = explicitLogisticsC + Math.max(0, totalC - categorizedC);

  return {
    custoEquipeHoras: reais(laborC),
    // The normalized labor snapshot already includes counted travel time.
    // Keeping it in Mão de Obra avoids double-counting the total.
    custoEquipeTransito: 0,
    custoEquipePassagens: reais(ticketsC),
    custoEquipeHospedagem: reais(accommodationC),
    custoEquipeAlimentacao: reais(mealsC),
    custoLogistico: reais(logisticsC),
    custoTotalEquipe: reais(totalC),
    horasTransito: (Number(scenario.durationMinutes) || 0) / 60,
  };
}
