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
  /* Semantic names — prefer these. */
  primary: 'var(--chart-1)',    /* amber accent – primary series */
  secondary: 'var(--chart-2)',  /* muted teal */
  tertiary: 'var(--chart-3)',   /* muted violet */
  quaternary: 'var(--chart-4)', /* muted rose-mauve */
  neutral: 'var(--chart-5)',    /* benchmark / comparison / alternative */
  danger: 'var(--chart-6)',     /* danger only, never in the default sequence */

  /* Legacy hue names. The underlying values are no longer mint/cyan/etc —
     they now resolve to the desaturated set above. Kept so existing call
     sites keep working; migrate to the semantic names and delete these. */
  mint: 'var(--chart-1)',
  cyan: 'var(--chart-2)',
  violet: 'var(--chart-3)',
  magenta: 'var(--chart-4)',
  amber: 'var(--chart-5)',
  rose: 'var(--chart-6)',
};

/**
 * ACCENT_RAMP — for SINGLE-MEASURE magnitude comparisons: category spend,
 * project ranking, collaborator spend. One hue, varying weight by rank.
 *
 * Rotating hue across categories of a single measure implies a categorical
 * distinction that does not exist, and is the strongest "generic dashboard"
 * signal in a UI. Use CHART_SEQUENCE only when series are genuinely
 * categorical (modal mix, transport type).
 */
export const ACCENT_RAMP = [
  'rgb(var(--color-accent) / 1)',
  'rgb(var(--color-accent) / 0.85)',
  'rgb(var(--color-accent) / 0.70)',
  'rgb(var(--color-accent) / 0.55)',
  'rgb(var(--color-accent) / 0.42)',
  'rgb(var(--color-accent) / 0.32)',
  'rgb(var(--color-accent) / 0.24)',
  'rgb(var(--color-accent) / 0.18)',
];

/** Rank-indexed accent step; clamps to the faintest stop past the ramp end. */
export const accentByRank = (i) => ACCENT_RAMP[Math.min(i, ACCENT_RAMP.length - 1)];

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
 * Best/recommended scenario gets the interface accent; alternatives go
 * neutral. (Previously mint vs. amber — two saturated hues competing for
 * attention, which blunted the "this is the recommendation" signal.)
 */
export function getComparatorScenarioAccent(name, bestName) {
  return name === bestName ? CHART_PALETTE.primary : CHART_PALETTE.neutral;
}
