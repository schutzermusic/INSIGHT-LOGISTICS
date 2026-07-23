/**
 * Normalized dashboard cost categories (§6.1, §10.3).
 *
 * The dashboard aggregates spend by a single normalized category vocabulary.
 * Rather than introduce a parallel cost model, this maps the EXISTING engine
 * breakdown keys (OperationalCostEngine / LaborCostEngine, see
 * ManualSimulationService `breakdown`) onto the required categories. Everything
 * is integer centavos.
 *
 * @module server/mobilization/dashboardCategories
 */

/** Canonical category slugs the dashboard groups by (§10.3). */
export const NORMALIZED_CATEGORIES = [
  'airfare',
  'bus_fare',
  'rental_vehicle',
  'company_vehicle',
  'fuel',
  'toll',
  'parking',
  'transfer',
  'accommodation',
  'meals',
  'labor_regular',
  'labor_overtime_50',
  'labor_overtime_100',
  'labor_saturday_100',
  'labor_sunday_150',
  'labor_night_premium',
  'allowance',
  'other',
];

/** Human labels (pt-BR) for the categories. */
export const CATEGORY_LABELS = {
  airfare: 'Passagem aérea',
  bus_fare: 'Passagem rodoviária',
  rental_vehicle: 'Veículo alugado',
  company_vehicle: 'Frota própria',
  fuel: 'Combustível',
  toll: 'Pedágio',
  parking: 'Estacionamento',
  transfer: 'Transfer',
  accommodation: 'Hospedagem',
  meals: 'Alimentação',
  labor_regular: 'Mão de obra (normal)',
  labor_overtime_50: 'HE +50%',
  labor_overtime_100: 'HE +100%',
  labor_saturday_100: 'Sábado +100%',
  labor_sunday_150: 'Domingo/Feriado +150%',
  labor_night_premium: 'Adicional noturno',
  allowance: 'Diárias',
  other: 'Outros',
};

/** Coarse grouping used by the "share" KPIs (labor / transport / stay). */
export const CATEGORY_GROUP = {
  airfare: 'transport',
  bus_fare: 'transport',
  rental_vehicle: 'transport',
  company_vehicle: 'transport',
  fuel: 'transport',
  toll: 'transport',
  parking: 'transport',
  transfer: 'transport',
  accommodation: 'accommodation',
  meals: 'meals',
  labor_regular: 'labor',
  labor_overtime_50: 'labor',
  labor_overtime_100: 'labor',
  labor_saturday_100: 'labor',
  labor_sunday_150: 'labor',
  labor_night_premium: 'labor',
  allowance: 'other',
  other: 'other',
};

const int = (v) => (Number.isFinite(v) ? Math.round(v) : 0);

/**
 * Map a costed scenario/itinerary onto the normalized category vocabulary.
 *
 * Transport modes are inferred from the mode sequence so an air itinerary lands
 * in `airfare` and a bus one in `bus_fare`; the shared-vehicle line maps to
 * rental/company vehicle. Labor is split by classification from the per-employee
 * labor blocks so overtime and night premium surface as their own categories.
 *
 * @param {object} scenario — a costed itinerary/scenario (has `breakdown`,
 *   `modeSequence`, `laborByEmployee`).
 * @returns {Record<string, number>} category slug -> centavos (only non-zero)
 */
export function normalizeCategorySpend(scenario) {
  const b = scenario.breakdown || {};
  const modes = new Set(scenario.modeSequence || []);
  const out = Object.create(null);
  const add = (cat, c) => {
    const v = int(c);
    if (v) out[cat] = (out[cat] || 0) + v;
  };

  // Commercial tickets → airfare vs bus_fare by the modes actually used.
  const ticket = int(b.ticket_c);
  if (ticket) {
    if (modes.has('flight') && modes.has('bus')) {
      add('airfare', Math.round(ticket / 2));
      add('bus_fare', ticket - Math.round(ticket / 2));
    } else if (modes.has('flight')) add('airfare', ticket);
    else add('bus_fare', ticket);
  }
  // Vehicle line → company car (own fleet) vs rental.
  const vehicle = int(b.shared_vehicle_c);
  if (vehicle) add(modes.has('company_car') ? 'company_vehicle' : 'rental_vehicle', vehicle);

  add('transfer', int(b.terminal_transfers_c));
  add('accommodation', int(b.transit_hotel_c) + int(b.field_hotel_c));
  add('meals', int(b.transit_meals_c) + int(b.field_meals_c));
  // field_local_c is on-site local mobility → treat as transfer-class transport.
  add('transfer', int(b.field_local_c));

  // Labor split by classification from the immutable per-employee blocks.
  const labor = splitLaborByClassification(scenario.laborByEmployee || []);
  add('labor_regular', labor.regular);
  add('labor_overtime_50', labor.overtime_50);
  add('labor_overtime_100', labor.overtime_100);
  add('labor_saturday_100', labor.saturday_100);
  add('labor_sunday_150', labor.sunday_150);
  add('labor_night_premium', labor.night_premium);

  return out;
}

/**
 * Split per-employee labor blocks into normalized labor categories (centavos).
 * Night premium is reported as its own category using the incremental premium
 * portion of night-flagged blocks so it is not double counted against the base
 * classification.
 */
export function splitLaborByClassification(laborByEmployee) {
  const acc = {
    regular: 0, overtime_50: 0, overtime_100: 0,
    saturday_100: 0, sunday_150: 0, night_premium: 0,
  };
  for (const emp of laborByEmployee) {
    for (const bl of emp.blocks || []) {
      const cost = int(bl.calculatedCostC);
      const base = classificationBucket(bl);
      // Incremental night premium (cost already includes it when additive).
      let nightPortion = 0;
      if (bl.nightPremiumApplied && Array.isArray(bl.appliedMultipliers)) {
        const nightMult = bl.appliedMultipliers.find((m) => /night|noturn/i.test(m.reason || m.code || ''));
        if (nightMult && nightMult.factor > 1) {
          nightPortion = Math.round(cost - cost / nightMult.factor);
        }
      }
      acc[base] += cost - nightPortion;
      acc.night_premium += nightPortion;
    }
  }
  return acc;
}

function classificationBucket(bl) {
  const c = bl.baseClassification;
  if (c === 'overtime_50') return 'overtime_50';
  if (c === 'overtime_100') return bl.dayType === 'saturday' ? 'saturday_100' : 'overtime_100';
  if (c === 'overtime_150') return 'sunday_150';
  return 'regular';
}
