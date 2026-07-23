/**
 * Observability (§27) — structured logs, correlation IDs and timing metrics.
 *
 * Emits one structured JSON log line per lifecycle event with a correlation ID
 * so a search can be traced end to end. Never logs salary values in plain text
 * (§27). Timing is captured with a lightweight monotonic timer.
 *
 * @module server/mobilization/observability
 */

export function newCorrelationId() {
  return globalThis.crypto?.randomUUID?.() || `corr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Monotonic timer that records labelled phase durations (ms). */
export function createTimer() {
  const start = performance.now();
  let last = start;
  const phases = {};
  return {
    mark(label) {
      const now = performance.now();
      phases[label] = Math.round(now - last);
      last = now;
      return phases[label];
    },
    total() {
      return Math.round(performance.now() - start);
    },
    phases() {
      return { ...phases };
    },
  };
}

/**
 * Emit a structured log line. Values are safe (counts/timings/ids) — never raw
 * salaries. Money, when logged, is already aggregated centavos.
 * @param {string} event
 * @param {object} fields
 */
export function logEvent(event, fields = {}) {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), scope: 'mobilization', event, ...fields }));
  } catch {
    console.log(`[mobilization] ${event}`);
  }
}
