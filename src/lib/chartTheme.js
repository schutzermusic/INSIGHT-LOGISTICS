/* ────────────────────────────────────────────────────────────────
 * Chart Theme — Premium Harmonic Palette
 *
 * Phase 5B — All charts pull colors from this single source.
 * The sequence is a carefully curated five-tone harmonic palette:
 *   mint → cyan → violet → magenta → amber
 *
 * Semantic usage for comparison charts:
 *   mint  = recommended / positive / better
 *   amber = neutral / alternative
 *   rose  = danger / error / negative (chart-6, NOT in default sequence)
 *
 * Colors are defined as CSS custom property references so they
 * automatically adapt to light/dark themes. The dark-mode values
 * are brighter; the light-mode values are saturated but slightly
 * deeper to maintain contrast against white surfaces.
 * ──────────────────────────────────────────────────────────────── */

export const CHART_PALETTE = {
  mint: 'var(--chart-1)',       /* mint – primary / positive */
  cyan: 'var(--chart-2)',       /* cyan – secondary */
  violet: 'var(--chart-3)',     /* violet – tertiary */
  magenta: 'var(--chart-4)',    /* magenta */
  amber: 'var(--chart-5)',      /* amber – neutral / alternative */
  rose: 'var(--chart-6)',       /* rose – danger only, never in default sequence */
};

/**
 * Default color sequence — used when consumers don't specify per-series colors.
 * Order: mint → cyan → violet → magenta → amber.
 * Rose is excluded from the default sequence; use it only for
 * explicit danger/error/negative semantics.
 */
export const CHART_SEQUENCE = [
  CHART_PALETTE.mint,
  CHART_PALETTE.cyan,
  CHART_PALETTE.violet,
  CHART_PALETTE.magenta,
  CHART_PALETTE.amber,
];

/**
 * Cost breakdown mapping — consistent colors for cost categories
 * across all pages (Dashboard composition bars, Comparator stacked bars, etc.)
 */
export const COST_BREAKDOWN_COLORS = {
  'Horas Trabalhadas': CHART_PALETTE.mint,
  'Deslocamento': CHART_PALETTE.cyan,
  'Passagens': CHART_PALETTE.violet,
  'Hosp + Alim': CHART_PALETTE.magenta,
  'Hospedagem': CHART_PALETTE.magenta,
  'Alimentacao': CHART_PALETTE.cyan,
  'Logistico': CHART_PALETTE.amber,
};

/**
 * Comparator scenario accent selector.
 * Best/recommended scenario gets mint; alternatives get amber.
 */
export function getComparatorScenarioAccent(name, bestName) {
  return name === bestName ? CHART_PALETTE.mint : CHART_PALETTE.amber;
}
