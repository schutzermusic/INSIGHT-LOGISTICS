import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '../../hooks/useTheme';
import { resolveColor, hexToRgba, getAnimationConfig } from '../../lib/echartsBase';
import { CHART_PALETTE } from '../../lib/chartTheme';

/* ────────────────────────────────────────────────────────────────
 * KpiSparkline — Phase 5D
 *
 * Tiny inline ECharts sparkline for KPI cards:
 *   • ~60×24 default size
 *   • Last 7 data points
 *   • No axes, no labels, no legend
 *   • Subtle area or line
 *   • Theme-aware via CSS vars
 *   • Does not dominate the KPI value
 *
 * Usage:
 *   <KpiSparkline data={[10, 20, 15, 30, 25, 40, 35]} />
 *   <KpiSparkline data={trendArray} color="var(--chart-2)" variant="line" />
 * ──────────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {number[]} props.data               Raw numeric values (last N points).
 * @param {string} [props.color]              CSS var or hex. Defaults to mint.
 * @param {'area' | 'line'} [props.variant='area']
 * @param {number} [props.width=60]
 * @param {number} [props.height=24]
 * @param {string} [props.className]
 */
export function KpiSparkline({
  data,
  color = CHART_PALETTE.mint,
  variant = 'area',
  width = 60,
  height = 24,
  className,
}) {
  const { isDark } = useTheme();

  const resolved = useMemo(() => resolveColor(color), [color, isDark]);

  const option = useMemo(() => {
    if (!data || data.length < 2) return null;

    // Take last 7 points max
    const points = data.slice(-7);

    const areaGradient = variant === 'area' ? {
      type: 'linear',
      x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: hexToRgba(resolved, isDark ? 0.35 : 0.2) },
        { offset: 1, color: hexToRgba(resolved, 0) },
      ],
    } : undefined;

    return {
      animation: false,   // sparklines should be instant
      grid: {
        left: 0,
        right: 0,
        top: 1,
        bottom: 1,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        show: false,
        boundaryGap: false,
        data: points.map((_, i) => i),
      },
      yAxis: {
        type: 'value',
        show: false,
        min: (value) => value.min - (value.max - value.min) * 0.15,
      },
      tooltip: { show: false },
      series: [{
        type: 'line',
        smooth: 0.4,
        showSymbol: false,
        lineStyle: {
          width: 1.5,
          color: resolved,
          cap: 'round',
          join: 'round',
        },
        areaStyle: areaGradient ? { color: areaGradient } : undefined,
        itemStyle: { color: resolved },
        data: points,
      }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, resolved, isDark, variant]);

  if (!option) return null;

  return (
    <div className={className} style={{ width, height }}>
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        notMerge
        lazyUpdate
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
