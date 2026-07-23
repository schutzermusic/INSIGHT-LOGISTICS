import { describe, it, expect } from 'vitest';
import { resolveHourlyRate, buildCostSnapshot } from './EmployeeCostProfileService.js';

const baseProfile = {
  employee_id: 'emp-1',
  hourly_cost_basis: 'base',
  base_hourly_rate_c: 2727, // R$27,27 (e.g. 6000/220)
  fully_loaded_hourly_rate_c: 4090,
  monthly_hour_divisor: 220,
  labor_policy_version_id: '00000000-0000-4000-a000-000000000001',
  source: 'backfill_collaborators',
  effective_at: '2026-01-01T00:00:00Z',
  data: { project_hourly_rate_c: 5000 },
};

describe('resolveHourlyRate', () => {
  it('uses the requested basis when available', () => {
    expect(resolveHourlyRate(baseProfile, 'base')).toEqual({ basis: 'base', hourlyRateC: 2727 });
    expect(resolveHourlyRate(baseProfile, 'fully_loaded')).toEqual({ basis: 'fully_loaded', hourlyRateC: 4090 });
    expect(resolveHourlyRate(baseProfile, 'project_custom')).toEqual({ basis: 'project_custom', hourlyRateC: 5000 });
  });

  it('falls back deterministically when requested basis is missing', () => {
    const noFullyLoaded = { ...baseProfile, fully_loaded_hourly_rate_c: null, data: {} };
    // requested fully_loaded → falls back through project_custom (absent) → base
    expect(resolveHourlyRate(noFullyLoaded, 'fully_loaded')).toEqual({ basis: 'base', hourlyRateC: 2727 });
  });

  it('defaults to the profile basis when none requested', () => {
    expect(resolveHourlyRate(baseProfile)).toEqual({ basis: 'base', hourlyRateC: 2727 });
  });

  it('throws when no usable rate exists', () => {
    const empty = { employee_id: 'x', base_hourly_rate_c: 0, data: {} };
    expect(() => resolveHourlyRate(empty)).toThrow();
  });

  it('throws without a profile', () => {
    expect(() => resolveHourlyRate(null)).toThrow();
  });
});

describe('buildCostSnapshot', () => {
  it('captures the basis, rate, divisor and policy version', () => {
    const snap = buildCostSnapshot(baseProfile, 'fully_loaded');
    expect(snap.hourlyCostBasis).toBe('fully_loaded');
    expect(snap.hourlyRateC).toBe(4090);
    expect(snap.monthlyHourDivisor).toBe(220);
    expect(snap.laborPolicyVersionId).toBe('00000000-0000-4000-a000-000000000001');
    expect(snap.employeeId).toBe('emp-1');
    expect(typeof snap.snapshotAt).toBe('string');
  });

  it('is immutable', () => {
    const snap = buildCostSnapshot(baseProfile);
    expect(() => { snap.hourlyRateC = 0; }).toThrow();
  });
});
