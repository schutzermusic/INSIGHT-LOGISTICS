import { describe, it, expect } from 'vitest';
import { requiredBufferMinutes, evaluateConnection, DEFAULT_BUFFER_POLICY } from './ConnectionFeasibilityService.js';

describe('requiredBufferMinutes', () => {
  it('bus→bus requires the 2h operational minimum, even at the same terminal', () => {
    expect(requiredBufferMinutes({ mode: 'bus' }, { mode: 'bus' }, { sameTerminal: true })).toBe(120);
    expect(requiredBufferMinutes({ mode: 'bus' }, { mode: 'bus' }, { sameTerminal: false })).toBe(120);
  });

  it('bus→flight across terminals honors the bus→flight floor', () => {
    // disembark20 + transfer60 + checkin90 = 170, floored up to 180.
    expect(requiredBufferMinutes({ mode: 'bus' }, { mode: 'flight' }, { sameTerminal: false })).toBe(180);
  });

  it('flight→bus across terminals: disembark+transfer+boarding above the floor', () => {
    // disembark20 + transfer60 + boarding30 = 110 (> flight→bus floor 90).
    expect(requiredBufferMinutes({ mode: 'flight' }, { mode: 'bus' }, { sameTerminal: false })).toBe(110);
  });
});

describe('evaluateConnection', () => {
  const busTerm = 'bus_terminal';
  const airport = 'airport';

  it('accepts a connection with a sufficient buffer', () => {
    const prev = { mode: 'bus', arrivalAtUtc: '2026-07-30T08:30:00Z', toTerminalType: busTerm };
    const next = { mode: 'flight', departureAtUtc: '2026-07-30T12:00:00Z', fromTerminalType: airport };
    const r = evaluateConnection(prev, next);
    expect(r.feasible).toBe(true);
    expect(r.gapMin).toBe(210);
    expect(r.requiredMin).toBe(180);
  });

  it('rejects a too-short bus→flight connection', () => {
    const prev = { mode: 'bus', arrivalAtUtc: '2026-07-30T08:30:00Z', toTerminalType: busTerm };
    const next = { mode: 'flight', departureAtUtc: '2026-07-30T09:30:00Z', fromTerminalType: airport };
    const r = evaluateConnection(prev, next);
    expect(r.feasible).toBe(false);
    expect(r.reason).toBe('insufficient_transfer_buffer');
  });

  it('rejects an overlapping connection', () => {
    const prev = { mode: 'bus', arrivalAtUtc: '2026-07-30T10:00:00Z', toTerminalType: busTerm };
    const next = { mode: 'bus', departureAtUtc: '2026-07-30T09:00:00Z', fromTerminalType: busTerm };
    expect(evaluateConnection(prev, next).reason).toBe('connection_overlaps');
  });

  it('rejects when waiting exceeds the configured maximum', () => {
    const prev = { mode: 'bus', arrivalAtUtc: '2026-07-30T00:00:00Z', toTerminalType: busTerm };
    const next = { mode: 'bus', departureAtUtc: '2026-07-30T12:00:00Z', fromTerminalType: busTerm };
    const r = evaluateConnection(prev, next, { maxWaitPerConnectionMin: 480 });
    expect(r.feasible).toBe(false);
    expect(r.reason).toBe('wait_exceeds_maximum');
  });

  it('exposes the default policy for reference', () => {
    expect(DEFAULT_BUFFER_POLICY.busToFlightBufferMin).toBe(180);
  });
});
