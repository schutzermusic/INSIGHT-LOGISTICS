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
  getBarAxisPointer,
  getSeriesEmphasisBlur,
  makeAxisTooltipFormatter,
  makeBarGradient,
  useResolvedSeriesColors,
} from '../../lib/echartsBase';
import { ChartSkeleton, ChartEmpty, ChartError } from './ChartStates';

/**
 * Premium bar chart on Apache ECharts.
 *
 * Phase 5B — Visual enhancements
 * Phase 5C — Interaction polish
 * Phase 5D — Chart states (loading skeleton, empty, error)
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.data
 * @param {string} props.xKey
 * @param {Array<{ key: string, name?: string, color?: string }>} props.series
 * @param {boolean} [props.stacked=false]
 * @param {boolean} [props.horizontal=false]
 * @param {(v: any) => string} [props.xFormatter]
 * @param {(v: number) => string} [props.yFormatter]
 * @param {(v: any) => string} [props.tooltipValueFormatter]
 * @param {(l: any) => string} [props.tooltipLabelFormatter]
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
export function PremiumBarChart({
  data = [],
  xKey,
  series = [],
  stacked = false,
  horizontal = false,
  xFormatter,
  yFormatter,
  tooltipValueFormatter,
  tooltipLabelFormatter,
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

    const catAxis = makeCategoryAxis({ isDark, formatter: xFormatter, data: xValues });
    const valAxis = makeValueAxis({ isDark, formatter: yFormatter });

    const topIndex = series.length - 1;

    return {
      ...getBaseOption({ isDark, palette, dataLength: data.length }),
      tooltip: {
        trigger: 'axis',
        axisPointer: getBarAxisPointer(isDark),
        ...getTooltipContainer(),
        formatter: makeAxisTooltipFormatter({
          valueFormatter: tooltipValueFormatter,
          labelFormatter: tooltipLabelFormatter,
        }),
      },
      legend: legend ? getLegendStyle({ isDark }) : { show: false },
      grid: getGridDefaults({ legend }),
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: series.map((s, i) => {
        const baseColor = palette[i];
        const isTopStack = stacked && i === topIndex;
        const radius = isTopStack
          ? (horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0])
          : (stacked ? 0 : (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]));

        return {
          name: s.name ?? s.key,
          type: 'bar',
          stack: stacked ? 'total' : undefined,
          barMaxWidth: 32,
          ...emphasisBlur,
          emphasis: {
            ...emphasisBlur.emphasis,
            itemStyle: { opacity: 0.95 },
          },
          itemStyle: {
            color: makeBarGradient(baseColor, isDark),
            opacity: 0.82,
            borderRadius: radius,
          },
          data: data.map((row) => row?.[s.key]),
        };
      }),
    };
  }, [data, xKey, series, palette, isDark, stacked, horizontal, showLegend, xFormatter, yFormatter, tooltipValueFormatter, tooltipLabelFormatter, isEmpty, loading, error]);

  if (loading) {
    return <ChartSkeleton variant="bar" height={height} className={className} />;
  }
  if (error) {
    return <ChartError message={errorMessage} onRetry={onRetry} height={height} className={className} />;
  }
  if (isEmpty) {
    return <ChartEmpty message={emptyMessage} variant="bar" action={emptyAction} height={height} className={className} />;
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
