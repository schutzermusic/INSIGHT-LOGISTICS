/**
 * ProviderSearchOrchestrator (§18) — runs option-producing provider adapters
 * (flight/bus/rental_car) in parallel with:
 *  - per-provider timeout,
 *  - retry with backoff (on thrown/timeout errors),
 *  - a circuit breaker per providerId (error isolation),
 *  - partial-result support (one provider failing never collapses the search §18),
 *  - progress callbacks + a correlation ID for observability (§27).
 *
 * The orchestrator is provider-agnostic: callers pass "tasks" that wrap
 * `adapter.search(input)`. Timers/clock are injectable for deterministic tests.
 *
 * @module server/mobilization/ProviderSearchOrchestrator
 */

/**
 * A per-providerId circuit breaker. Opens after `failureThreshold` consecutive
 * failures and stays open for `cooldownMs`, after which it half-opens (one try).
 * @param {{ failureThreshold?: number, cooldownMs?: number, now?: () => number }} [opts]
 */
export function createCircuitBreaker({ failureThreshold = 3, cooldownMs = 30000, now = Date.now } = {}) {
  const state = new Map(); // providerId -> { failures, openedAt }

  return {
    isOpen(providerId) {
      const s = state.get(providerId);
      if (!s || s.failures < failureThreshold) return false;
      if (now() - s.openedAt >= cooldownMs) {
        // Half-open: allow a single trial by clearing the openedAt window.
        s.failures = failureThreshold - 1;
        return false;
      }
      return true;
    },
    recordSuccess(providerId) {
      state.set(providerId, { failures: 0, openedAt: 0 });
    },
    recordFailure(providerId) {
      const s = state.get(providerId) || { failures: 0, openedAt: 0 };
      s.failures += 1;
      if (s.failures >= failureThreshold) s.openedAt = now();
      state.set(providerId, s);
    },
    _state: state,
  };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {Object} ProviderTask
 * @property {string} providerId
 * @property {string} [label]
 * @property {() => Promise<import('../adapters/contracts.js').AdapterResult>} run
 */

/**
 * Run all provider tasks in parallel and merge their normalized options.
 * @param {Object} p
 * @param {ProviderTask[]} p.tasks
 * @param {number} [p.timeoutMs]
 * @param {number} [p.retries]
 * @param {number} [p.backoffMs]
 * @param {ReturnType<typeof createCircuitBreaker>} [p.breaker]
 * @param {(msg: string) => void} [p.onProgress]
 * @param {string} [p.correlationId]
 * @param {(ms: number) => Promise<void>} [p.sleep]
 * @returns {Promise<{ correlationId: string, options: import('../../src/domain/types.js').NormalizedOption[], providers: object[], partial: boolean, anySuccess: boolean }>}
 */
export async function searchProviders({
  tasks,
  timeoutMs = 10000,
  retries = 0,
  backoffMs = 300,
  breaker = createCircuitBreaker(),
  onProgress = () => {},
  correlationId = (globalThis.crypto?.randomUUID?.() || `corr-${Date.now()}`),
  sleep = defaultSleep,
}) {
  const settled = await Promise.all(
    tasks.map(async (task) => {
      const label = task.label || task.providerId;

      if (breaker.isOpen(task.providerId)) {
        onProgress(`${label}: circuito aberto — provedor ignorado temporariamente`);
        return { providerId: task.providerId, label, status: 'skipped', optionCount: 0, errors: ['circuit_open'], meta: null };
      }

      onProgress(`Consultando ${label}...`);
      let lastError = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await withTimeout(task.run(), timeoutMs, label);
          if (result?.success) {
            breaker.recordSuccess(task.providerId);
            const optionCount = result.options?.length || 0;
            onProgress(`${label}: ${optionCount} opção(ões).`);
            return {
              providerId: task.providerId, label,
              status: optionCount > 0 ? 'ok' : 'empty',
              optionCount, errors: result.meta?.errors || [], meta: result.meta,
              options: result.options || [],
            };
          }
          // Adapter handled the error internally (no throw): don't retry.
          breaker.recordFailure(task.providerId);
          onProgress(`${label}: sem resultados (${result?.meta?.errors?.[0] || 'desconhecido'}).`);
          return { providerId: task.providerId, label, status: 'failed', optionCount: 0, errors: result?.meta?.errors || ['no_results'], meta: result?.meta || null };
        } catch (err) {
          lastError = err;
          if (attempt < retries) {
            await sleep(backoffMs * 2 ** attempt);
          }
        }
      }

      breaker.recordFailure(task.providerId);
      onProgress(`${label}: falha (${lastError?.message || 'erro'}).`);
      return { providerId: task.providerId, label, status: 'failed', optionCount: 0, errors: [lastError?.message || 'error'], meta: null };
    })
  );

  const options = settled.flatMap((s) => s.options || []);
  const anySuccess = settled.some((s) => s.status === 'ok' || s.status === 'empty');
  const anyFailure = settled.some((s) => s.status === 'failed' || s.status === 'skipped');
  // Strip internal options array from the per-provider summary.
  const providers = settled.map(({ options: _o, ...rest }) => rest);

  return { correlationId, options, providers, partial: anySuccess && anyFailure, anySuccess };
}
