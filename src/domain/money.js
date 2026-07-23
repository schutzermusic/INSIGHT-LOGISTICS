/**
 * Money — integer-centavos arithmetic for the Mobilization engine.
 *
 * Domain rule (§32): monetary values must NOT be computed with floating-point.
 * The whole mobilization engine reasons in integer centavos (BRL cents) and
 * only converts to a human/BRL string at the very edge (UI, reports).
 *
 * A "centavos" value is always a safe integer. Constructing one from a float
 * (toCentavos) is the single rounding point; every downstream operation stays
 * in integers and never re-introduces float drift.
 */

/** @typedef {number} Centavos — integer count of BRL cents (100 = R$ 1,00) */

const CENTS_PER_UNIT = 100;

// Intermediate precision used to correct binary floating-point representation
// error before the final integer rounding. Scaling a lossy float like
// 1.005 (stored as 1.00499999…) straight to an integer would round the wrong
// way; rounding at ~9 significant decimals first recovers the intended decimal.
const PRECISION_FACTOR = 1e9;

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer centavos value, received: ${value}`);
  }
}

/**
 * Round a scaled value to the nearest integer, half away from zero, correcting
 * for float representation error at PRECISION_FACTOR precision first.
 * @param {number} scaled
 * @returns {number}
 */
function roundHalfAwayFromZero(scaled) {
  const corrected = Math.round(scaled * PRECISION_FACTOR) / PRECISION_FACTOR;
  const rounded = Math.sign(corrected) * Math.round(Math.abs(corrected));
  return rounded === 0 ? 0 : rounded; // normalize -0
}

/**
 * Convert a BRL amount (float or numeric string) into integer centavos.
 * This is the ONLY place rounding from float happens. Uses round-half-away
 * from zero to match currency conventions.
 * @param {number|string} brl
 * @returns {Centavos}
 */
export function toCentavos(brl) {
  const n = typeof brl === 'string' ? Number(brl) : brl;
  if (!Number.isFinite(n)) {
    throw new TypeError(`toCentavos received a non-finite value: ${brl}`);
  }
  return roundHalfAwayFromZero(n * CENTS_PER_UNIT);
}

/**
 * Convert integer centavos back to a BRL float. Use only at the UI/report edge.
 * @param {Centavos} centavos
 * @returns {number}
 */
export function fromCentavos(centavos) {
  assertInteger(centavos, 'fromCentavos input');
  return centavos / CENTS_PER_UNIT;
}

/**
 * Sum any number of centavos values.
 * @param {...Centavos} values
 * @returns {Centavos}
 */
export function addC(...values) {
  return values.reduce((acc, v) => {
    assertInteger(v, 'addC operand');
    return acc + v;
  }, 0);
}

/**
 * Subtract b from a (both centavos).
 * @param {Centavos} a
 * @param {Centavos} b
 * @returns {Centavos}
 */
export function subC(a, b) {
  assertInteger(a, 'subC minuend');
  assertInteger(b, 'subC subtrahend');
  return a - b;
}

/**
 * Multiply a centavos value by a (possibly fractional) factor, rounding the
 * result back to whole centavos. Used for multipliers, per-person splits, and
 * rate math. Rounds half away from zero.
 * @param {Centavos} centavos
 * @param {number} factor
 * @returns {Centavos}
 */
export function mulC(centavos, factor) {
  assertInteger(centavos, 'mulC base');
  if (!Number.isFinite(factor)) {
    throw new TypeError(`mulC factor must be finite, received: ${factor}`);
  }
  return roundHalfAwayFromZero(centavos * factor);
}

/**
 * Compute an hourly rate cost: rate (centavos/hour) applied to a duration in
 * minutes, rounded to whole centavos. Centralizes the minute→hour conversion
 * used across the labor engine so rounding is consistent.
 * @param {Centavos} hourlyRateC — cost of one hour, in centavos
 * @param {number} minutes — duration in minutes (may be fractional)
 * @returns {Centavos}
 */
export function costForMinutes(hourlyRateC, minutes) {
  assertInteger(hourlyRateC, 'costForMinutes rate');
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new TypeError(`costForMinutes minutes must be a non-negative finite number, received: ${minutes}`);
  }
  return mulC(hourlyRateC, minutes / 60);
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Format integer centavos as a BRL string (e.g. 129000 → "R$ 1.290,00").
 * @param {Centavos} centavos
 * @returns {string}
 */
export function formatBRL(centavos) {
  assertInteger(centavos, 'formatBRL input');
  return BRL_FORMATTER.format(fromCentavos(centavos));
}
