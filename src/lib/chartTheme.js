export const CHART_PALETTE = {
  mint: 'var(--chart-1)',
  cyan: 'var(--chart-2)',
  violet: 'var(--chart-3)',
  magenta: 'var(--chart-4)',
  amber: 'var(--chart-5)',
};

export const CHART_SEQUENCE = [
  CHART_PALETTE.mint,
  CHART_PALETTE.cyan,
  CHART_PALETTE.violet,
  CHART_PALETTE.magenta,
  CHART_PALETTE.amber,
];

export const COST_BREAKDOWN_COLORS = {
  'Horas Trabalhadas': CHART_PALETTE.mint,
  'Deslocamento': CHART_PALETTE.cyan,
  'Passagens': CHART_PALETTE.violet,
  'Hosp + Alim': CHART_PALETTE.magenta,
  'Hospedagem': CHART_PALETTE.magenta,
  'Alimentacao': CHART_PALETTE.cyan,
  'Logistico': CHART_PALETTE.amber,
};

export function getComparatorScenarioAccent(name, bestName) {
  return name === bestName ? CHART_PALETTE.mint : CHART_PALETTE.amber;
}
