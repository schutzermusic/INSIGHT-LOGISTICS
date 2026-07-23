/**
 * Shared helpers for provider adapters (§17): standard result/meta envelopes.
 * @module server/adapters/adapterUtil
 */

/**
 * Build the AdapterSearchMeta captured for auditability (§17).
 * @param {object} p
 * @returns {import('./contracts.js').AdapterSearchMeta}
 */
export function buildMeta({ providerId, requestedAtUtc, searchParams = {}, errors = [], partial = false, currency = 'BRL', sourceConfidence }) {
  return {
    providerId,
    requestedAtUtc,
    respondedAtUtc: new Date().toISOString(),
    searchParams,
    errors,
    partial,
    currency,
    sourceConfidence,
  };
}

/** A successful AdapterResult. */
export function ok(providerId, options, metaExtra = {}) {
  return {
    success: true,
    options,
    meta: buildMeta({ providerId, requestedAtUtc: metaExtra.requestedAtUtc || new Date().toISOString(), ...metaExtra }),
  };
}

/** A failed AdapterResult (provider error isolated — never throws to caller). */
export function fail(providerId, message, metaExtra = {}) {
  return {
    success: false,
    options: [],
    meta: buildMeta({ providerId, requestedAtUtc: metaExtra.requestedAtUtc || new Date().toISOString(), errors: [message], ...metaExtra }),
  };
}
