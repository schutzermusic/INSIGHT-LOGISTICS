import { describe, it, expect } from 'vitest';
import {
  validateConfirmation, buildConfirmationRecord, attributeCollaboratorSpend,
  computeSavings, deriveModal, CONFIRMATION_ELIGIBLE_STATUSES,
} from './ConfirmedMobilizationService.js';

/** A minimal but complete costed scenario as produced by the engines. */
function scenario(overrides = {}) {
  return {
    id: 'sc-1',
    departureAtUtc: '2026-07-20T09:00:00Z',
    arrivalAtUtc: '2026-07-20T18:00:00Z',
    durationMinutes: 540,
    modeSequence: ['bus', 'flight'],
    totalMobilizationCostC: 300000, // R$3.000
    breakdown: {
      ticket_c: 120000, shared_vehicle_c: 0, labor_c: 160000,
      transit_meals_c: 8000, transit_hotel_c: 12000, field_meals_c: 0, field_hotel_c: 0,
      terminal_transfers_c: 0, field_local_c: 0,
    },
    laborByEmployee: [
      { employeeId: 'e1', totalCostC: 100000, blocks: [{ baseClassification: 'regular', countedMinutes: 480, calculatedCostC: 80000 }, { baseClassification: 'overtime_50', countedMinutes: 60, calculatedCostC: 20000, nightPremiumApplied: false }] },
      { employeeId: 'e2', totalCostC: 60000, blocks: [{ baseClassification: 'regular', countedMinutes: 480, calculatedCostC: 60000 }] },
    ],
    segments: [{ sequence: 0, mode: 'bus' }],
    feasibilityStatus: 'valid',
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    source: 'automatic_mobilization',
    selectedItineraryId: 'it-db-1',
    project: { id: 'p1', name: 'Usina Norte' },
    schedule: { id: 's1', name: 'Montagem eletromecânica' },
    employees: [{ id: 'e1', name: 'Ana Souza', role: 'Eletricista' }, { id: 'e2', name: 'Bruno Lima', role: 'Mecânico' }],
    scenario: scenario(),
    origin: 'São Paulo - SP',
    destination: 'Recife - PE',
    actorId: null,
    ...overrides,
  };
}

describe('validateConfirmation (§3.1 gate)', () => {
  it('accepts a fully specified confirmation', () => {
    expect(validateConfirmation(validInput())).toEqual([]);
  });

  it('rejects a missing project', () => {
    const errs = validateConfirmation(validInput({ project: undefined }));
    expect(errs.some((e) => /Projeto/.test(e))).toBe(true);
  });

  it('rejects a missing schedule / frente de serviço', () => {
    const errs = validateConfirmation(validInput({ schedule: { id: '', name: '' } }));
    expect(errs.some((e) => /Cronograma/.test(e))).toBe(true);
  });

  it('rejects when no collaborator is identified', () => {
    const errs = validateConfirmation(validInput({ employees: [] }));
    expect(errs.some((e) => /colaborador/.test(e))).toBe(true);
  });

  it('rejects a collaborator missing id or name', () => {
    const errs = validateConfirmation(validInput({ employees: [{ id: 'e1', name: '' }] }));
    expect(errs.some((e) => /id e nome/.test(e))).toBe(true);
  });

  it('rejects when no scenario/itinerary is selected', () => {
    const errs = validateConfirmation(validInput({ selectedItineraryId: '', selectedScenarioId: '', scenario: undefined }));
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a scenario without a valid cost snapshot', () => {
    const errs = validateConfirmation(validInput({ scenario: scenario({ totalMobilizationCostC: 0 }) }));
    expect(errs.some((e) => /Custo total/.test(e))).toBe(true);
  });
});

describe('buildConfirmationRecord', () => {
  it('throws on invalid input so partial dashboard data is never published', () => {
    expect(() => buildConfirmationRecord(validInput({ project: undefined }))).toThrow(/Confirmação inválida/);
  });

  it('builds an immutable, eligible confirmed record with snapshots', () => {
    const { record, collaborators } = buildConfirmationRecord(validInput());
    expect(CONFIRMATION_ELIGIBLE_STATUSES).toContain(record.confirmation_status);
    expect(record.confirmation_status).toBe('confirmed');
    expect(record.project_id).toBe('p1');
    expect(record.project_name_snapshot).toBe('Usina Norte');
    expect(record.schedule_id).toBe('s1');
    expect(record.team_size).toBe(2);
    expect(record.total_cost_c).toBe(300000);
    expect(record.modal_primary).toBe('multimodal');
    // Immutable snapshots captured.
    expect(record.employee_snapshot).toHaveLength(2);
    expect(record.route_snapshot).toEqual(scenario().segments);
    expect(Object.keys(record.cost_snapshot)).toContain('ticket_c');
    expect(collaborators).toHaveLength(2);
    // Category rollup present and consistent with the coarse rollups.
    expect(record.labor_cost_c).toBeGreaterThan(0);
    expect(record.category_spend.accommodation).toBe(12000);
    expect(record.category_spend.meals).toBe(8000);
  });

  it('resolves origin/destination coordinates for the HUD globe', () => {
    const { record } = buildConfirmationRecord(validInput());
    expect(typeof record.origin_lat).toBe('number');
    expect(typeof record.destination_lat).toBe('number');
  });
});

describe('attributeCollaboratorSpend (§10)', () => {
  it('assigns labor individually and splits shared cost per person', () => {
    const sc = scenario();
    const rows = attributeCollaboratorSpend(sc, [{ id: 'e1', name: 'Ana' }, { id: 'e2', name: 'Bruno' }]);
    const ana = rows.find((r) => r.employeeId === 'e1');
    const bruno = rows.find((r) => r.employeeId === 'e2');
    // labor is individual
    expect(ana.laborSpendC).toBe(100000);
    expect(bruno.laborSpendC).toBe(60000);
    // shared = 300000 total - 160000 labor = 140000, split equally = 70000 each
    expect(ana.transportSpendC + bruno.transportSpendC).toBe(140000);
    expect(bruno.transportSpendC).toBe(70000);
    // total spend fully attributed
    const attributed = rows.reduce((s, r) => s + r.totalSpendC, 0);
    expect(attributed).toBe(sc.totalMobilizationCostC);
    // overtime minutes captured for Ana
    expect(ana.overtimeMinutes).toBe(60);
  });
});

describe('computeSavings (§6.5)', () => {
  it('is the most expensive viable alternative minus the chosen total', () => {
    const chosen = scenario({ id: 'chosen', totalMobilizationCostC: 300000 });
    const alts = [
      { id: 'a1', totalMobilizationCostC: 350000, feasibilityStatus: 'valid' },
      { id: 'a2', totalMobilizationCostC: 500000, feasibilityStatus: 'valid' },
      { id: 'a3', totalMobilizationCostC: 900000, feasibilityStatus: 'invalid' }, // ignored
    ];
    expect(computeSavings(chosen, alts)).toEqual({ baselineCostC: 500000, estimatedSavingsC: 200000 });
  });

  it('is zero (no baseline) when there are no viable alternatives', () => {
    expect(computeSavings(scenario(), [])).toEqual({ baselineCostC: null, estimatedSavingsC: 0 });
  });
});

describe('deriveModal (§6.4)', () => {
  it('classifies single-mode vs multimodal', () => {
    expect(deriveModal(['flight'])).toBe('air');
    expect(deriveModal(['bus'])).toBe('bus');
    expect(deriveModal(['bus', 'flight'])).toBe('multimodal');
    expect(deriveModal(['company_car'])).toBe('fleet');
  });
});
