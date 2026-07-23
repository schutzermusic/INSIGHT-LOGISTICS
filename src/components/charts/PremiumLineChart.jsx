import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { clsx } from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import {
  getBaseOption,
  makeCategoryAxis,
  makeValueAxis,
  getTooltipContainer,
  getLegendStyle,
  getGridDefaults,
  getAxisPointer,
  getSeriesEmphasisBlur,
  makeAxisTooltipFormatter,
  useResolvedSeriesColors,
} from '../../lib/echartsBase';
import { ChartSkeleton, ChartEmpty, ChartError } from './ChartStates';

/**
 * Premium line chart on Apache ECharts.
 *
 * Phase 5B — Visual enhancements
 * Phase 5C — Interaction polish
 * Phase 5D — Chart states (loading skeleton, empty, error)
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.data
 * @param {string} props.xKey
 * @param {Array<{ key: string, name?: string, color?: string }>} props.series
 * @param {(v: any) => string} [props.xFormatter]
 * @param {(v: number) => string} [props.yFormatter]
 * @param {(v: any) => string} [props.tooltipValueFormatter]
 * @param {(l: any) => string} [props.tooltipLabelFormatter]
 * @param {boolean} [props.smooth=true]
 * @param {boolean} [props.showLegend]
 * @param {number|string} [props.height=320]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.empty]
 * @param {string} [props.emptyMessage]
 * @param {boolean} [props.error]
 * @param {string} [props.errorMessage]
 * @param {() => void} [props.onRetry]
 * @param {{ label: string, onClick: () => void }} [props.emptyAction]
 * @param {string} [props.className]
 */
export function PremiumLineChart({
  data = [],
  xKey,
  series = [],
  xFormatter,
  yFormatter,
  tooltipValueFormatter,
  tooltipLabelFormatter,
  smooth = true,
  showLegend,
  height = 320,
  loading = false,
  empty,
  emptyMessage = 'Sem dados suficientes',
  error = false,
  errorMessage,
  onRetry,
  emptyAction,
  className,
}) {
  const { isDark } = useTheme();
  const palette = useResolvedSeriesColors(series);

  const isEmpty = empty ?? (!data || data.length === 0);

  const option = useMemo(() => {
    if (isEmpty || loading || error) return null;
    const xValues = data.map((row) => row?.[xKey]);
    const legend = showLegend ?? series.length > 1;
    const emphasisBlur = getSeriesEmphasisBlur(isDark);

    return {
      ...getBaseOption({ isDark, palette, dataLength: data.length }),
      tooltip: {
        trigger: 'axis',
        axisPointer: getAxisPointer(isDark),
        ...getTooltipContainer(),
        formatter: makeAxisTooltipFormatter({
          valueFormatter: tooltipValueFormatter,
          labelFormatter: tooltipLabelFormatter,
        }),
      },
      legend: legend ? getLegendStyle({ isDark }) : { show: false },
      grid: getGridDefaults({ legend }),
      xAxis: makeCategoryAxis({ isDark, formatter: xFormatter, data: xValues }),
      yAxis: makeValueAxis({ isDark, formatter: yFormatter }),
      series: series.map((s, i) => ({
        name: s.name ?? s.key,
        type: 'line',
        smooth,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        ...emphasisBlur,
        emphasis: {
          ...emphasisBlur.emphasis,
          lineStyle: { width: i === 0 ? 2.5 : 2 },
          itemStyle: {
            borderWidth: 2,
            borderColor: isDark ? '#1c222e' : '#fff',
          },
        },
        lineStyle: {
          width: i === 0 ? 2 : 1.5,
          color: palette[i],
          cap: 'round',
          join: 'round',
        },
        itemStyle: { color: palette[i] },
        data: data.map((row) => row?.[s.key]),
      })),
    };
  }, [data, xKey, series, palette, isDark, smooth, showLegend, xFormatter, yFormatter, tooltipValueFormatter, tooltipLabelFormatter, isEmpty, loading, error]);

  if (loading) {
    return <ChartSkeleton variant="line" height={height} className={className} />;
  }
  if (error) {
    return <ChartError message={errorMessage} onRetry={onRetry} height={height} className={className} />;
  }
  if (isEmpty) {
    return <ChartEmpty message={emptyMessage} variant="line" action={emptyAction} height={height} className={className} />;
  }
  return (
    <div className={clsx('w-full', className)} style={{ height }}>
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
