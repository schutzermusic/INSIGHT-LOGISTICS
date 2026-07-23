import { describe, it, expect } from 'vitest';
import { searchProviders, createCircuitBreaker } from './ProviderSearchOrchestrator.js';

const okResult = (providerId, n) => ({
  success: true,
  options: Array.from({ length: n }, (_, i) => ({ providerId, id: `${providerId}-${i}`, mode: 'bus', commercialCostC: 1000 })),
  meta: { providerId, errors: [] },
});

const noSleep = () => Promise.resolve();

describe('createCircuitBreaker', () => {
  it('opens after the failure threshold and closes after cooldown', () => {
    let t = 0;
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => t });
    expect(breaker.isOpen('p')).toBe(false);
    breaker.recordFailure('p');
    expect(breaker.isOpen('p')).toBe(false);
    breaker.recordFailure('p');
    expect(breaker.isOpen('p')).toBe(true); // opened
    t = 150; // past cooldown
    expect(breaker.isOpen('p')).toBe(false); // half-open trial
  });

  it('recordSuccess resets failures', () => {
    const breaker = createCircuitBreaker({ failureThreshold: 2 });
    breaker.recordFailure('p');
    breaker.recordSuccess('p');
    breaker.recordFailure('p');
    expect(breaker.isOpen('p')).toBe(false);
  });
});

describe('searchProviders', () => {
  it('runs providers in parallel and merges options', async () => {
    const res = await searchProviders({
      tasks: [
        { providerId: 'flights', run: async () => okResult('flights', 2) },
        { providerId: 'bus', run: async () => okResult('bus', 3) },
      ],
      correlationId: 'c1',
      sleep: noSleep,
    });
    expect(res.options).toHaveLength(5);
    expect(res.anySuccess).toBe(true);
    expect(res.partial).toBe(false);
    expect(res.providers.map((p) => p.status).sort()).toEqual(['ok', 'ok']);
  });

  it('returns partial results when one provider fails (isolation §18)', async () => {
    const res = await searchProviders({
      tasks: [
        { providerId: 'flights', run: async () => okResult('flights', 2) },
        { providerId: 'bus', run: async () => { throw new Error('provider down'); } },
      ],
      sleep: noSleep,
    });
    expect(res.options).toHaveLength(2);
    expect(res.partial).toBe(true);
    expect(res.anySuccess).toBe(true);
    expect(res.providers.find((p) => p.providerId === 'bus').status).toBe('failed');
  });

  it('reports anySuccess=false when all providers fail', async () => {
    const res = await searchProviders({
      tasks: [
        { providerId: 'a', run: async () => { throw new Error('x'); } },
        { providerId: 'b', run: async () => { throw new Error('y'); } },
      ],
      sleep: noSleep,
    });
    expect(res.anySuccess).toBe(false);
    expect(res.options).toHaveLength(0);
  });

  it('times out a slow provider without blocking others', async () => {
    const res = await searchProviders({
      tasks: [
        { providerId: 'fast', run: async () => okResult('fast', 1) },
        { providerId: 'slow', run: () => new Promise((r) => setTimeout(() => r(okResult('slow', 1)), 200)) },
      ],
      timeoutMs: 30,
      sleep: noSleep,
    });
    expect(res.options).toHaveLength(1);
    expect(res.providers.find((p) => p.providerId === 'slow').status).toBe('failed');
    expect(res.partial).toBe(true);
  });

  it('skips a provider whose circuit is already open', async () => {
    const breaker = createCircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure('bus'); // opens immediately
    const res = await searchProviders({
      tasks: [
        { providerId: 'flights', run: async () => okResult('flights', 1) },
        { providerId: 'bus', run: async () => okResult('bus', 5) },
      ],
      breaker,
      sleep: noSleep,
    });
    expect(res.options).toHaveLength(1); // bus skipped
    expect(res.providers.find((p) => p.providerId === 'bus').status).toBe('skipped');
  });

  it('retries on thrown errors then succeeds', async () => {
    let calls = 0;
    const res = await searchProviders({
      tasks: [{
        providerId: 'flaky',
        run: async () => { calls++; if (calls < 2) throw new Error('temp'); return okResult('flaky', 1); },
      }],
      retries: 2,
      backoffMs: 1,
      sleep: noSleep,
    });
    expect(calls).toBe(2);
    expect(res.options).toHaveLength(1);
    expect(res.anySuccess).toBe(true);
  });
});
