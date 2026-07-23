/**
 * EmployeeCostProfileService (§6)
 *
 * Resolves which hourly cost basis to use for an employee and produces an
 * immutable cost snapshot that is stored with every calculation (§6, §23) so a
 * result stays reproducible even if payroll later changes.
 *
 * This module is PURE — it takes an already-loaded cost-profile row and returns
 * the effective rate + snapshot. Database access (reading
 * employee_cost_profiles, honoring RLS) is added with the server Supabase data
 * layer in a later phase; keeping resolution pure makes it unit-testable now and
 * keeps salary-derived logic on the server (§26).
 *
 * All rates are integer centavos (see src/domain/money.js).
 *
 * @module server/mobilization/EmployeeCostProfileService
 */

/**
 * @typedef {import('../../src/domain/types.js').EmployeeMobilizationCostProfile} EmployeeMobilizationCostProfile
 */

/** Basis values in preference order when a requested basis is unavailable. */
const BASIS_FALLBACK_ORDER = ['project_custom', 'fully_loaded', 'base'];

/**
 * Pick the effective hourly rate (centavos) for a requested basis, falling back
 * deterministically when the requested basis has no value on the profile.
 *
 * @param {object} profileRow — a row from employee_cost_profiles
 * @param {'base'|'fully_loaded'|'project_custom'} [requestedBasis]
 * @returns {{ basis: string, hourlyRateC: number }}
 */
export function resolveHourlyRate(profileRow, requestedBasis) {
  if (!profileRow) {
    throw new Error('resolveHourlyRate: cost profile is required (§6 — hourly cost must come from the profile).');
  }

  const rateByBasis = {
    base: profileRow.base_hourly_rate_c,
    fully_loaded: profileRow.fully_loaded_hourly_rate_c,
    project_custom: profileRow.data?.project_hourly_rate_c,
  };

  const preferred = requestedBasis || profileRow.hourly_cost_basis || 'base';
  const order = [preferred, ...BASIS_FALLBACK_ORDER.filter((b) => b !== preferred)];

  for (const basis of order) {
    const rate = rateByBasis[basis];
    if (Number.isInteger(rate) && rate > 0) {
      return { basis, hourlyRateC: rate };
    }
  }

  throw new Error(`resolveHourlyRate: no usable hourly rate for employee ${profileRow.employee_id}.`);
}

/**
 * Build the immutable cost snapshot recorded with a calculation (§6, §23, §25).
 * Captures exactly which basis, rate, divisor and policy version were used.
 *
 * @param {object} profileRow — a row from employee_cost_profiles
 * @param {'base'|'fully_loaded'|'project_custom'} [requestedBasis]
 * @returns {object} snapshot — safe to persist alongside labor blocks
 */
export function buildCostSnapshot(profileRow, requestedBasis) {
  const { basis, hourlyRateC } = resolveHourlyRate(profileRow, requestedBasis);
  return Object.freeze({
    employeeId: profileRow.employee_id,
    hourlyCostBasis: basis,
    hourlyRateC,
    monthlyHourDivisor: profileRow.monthly_hour_divisor,
    laborPolicyVersionId: profileRow.labor_policy_version_id,
    source: profileRow.source,
    profileEffectiveAt: profileRow.effective_at,
    snapshotAt: new Date().toISOString(),
  });
}
