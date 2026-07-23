import { describe, expect, it } from 'vitest';
import { mobilizationDraftHistorySummary } from './mobilizationDraftSummary.js';

describe('mobilizationDraftHistorySummary', () => {
  it('maps the normalized scenario breakdown to the History detail in reais', () => {
    const summary = mobilizationDraftHistorySummary({
      durationMinutes: 360,
      laborCostC: 12000,
      totalMobilizationCostC: 55000,
      breakdown: {
        ticket_c: 20000,
        shared_vehicle_c: 5000,
        transit_hotel_c: 8000,
        field_hotel_c: 2000,
        transit_meals_c: 3000,
        field_meals_c: 1000,
        terminal_transfers_c: 4000,
      },
    });

    expect(summary).toEqual({
      custoEquipeHoras: 120,
      custoEquipeTransito: 0,
      custoEquipePassagens: 200,
      custoEquipeHospedagem: 100,
      custoEquipeAlimentacao: 40,
      custoLogistico: 90,
      custoTotalEquipe: 550,
      horasTransito: 6,
    });
  });

  it('keeps uncategorized cost visible under Logístico', () => {
    const summary = mobilizationDraftHistorySummary({
      laborCostC: 1000,
      totalMobilizationCostC: 2500,
      breakdown: {},
    });

    expect(summary.custoEquipeHoras).toBe(10);
    expect(summary.custoLogistico).toBe(15);
    expect(Object.values(summary).slice(0, 6).reduce((sum, value) => sum + value, 0)).toBe(25);
  });

  it('uses manual segment modes to separate tickets, hotel, meals and vehicles', () => {
    const summary = mobilizationDraftHistorySummary({
      laborCostC: 5000,
      totalMobilizationCostC: 35000,
      segments: [
        { mode: 'flight', commercialCostC: 10000 },
        { mode: 'rental_car', commercialCostC: 8000 },
        { mode: 'hotel_rest', commercialCostC: 7000 },
        { mode: 'meal_break', commercialCostC: 5000 },
      ],
      breakdown: { ticket_c: 18000 },
    });

    expect(summary.custoEquipePassagens).toBe(100);
    expect(summary.custoEquipeHospedagem).toBe(70);
    expect(summary.custoEquipeAlimentacao).toBe(50);
    expect(summary.custoLogistico).toBe(80);
    expect(summary.custoEquipeHoras).toBe(50);
  });
});
