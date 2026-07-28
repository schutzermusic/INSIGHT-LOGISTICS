import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { clsx } from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import {
  getBaseOption,
  makeCategoryAxis,
  makeValueAxis,
  getTooltipContainer,
  getGridDefaults,
  getAxisPointer,
  makeAxisTooltipFormatter,
  makeAreaGradient,
  useResolvedSeriesColors,
} from '../../lib/echartsBase';
import { ChartSkeleton, ChartEmpty } from './ChartStates';

/* Hoisted: useResolvedSeriesColors memoizes on array identity, so an inline
   literal here would recompute on every render. */
const SERIES_COLORS = [{ color: 'var(--chart-1)' }, { color: 'var(--chart-5)' }];

/**
 * S-curve — cumulative spend against a constant-rate reference.
 *
 * The daily bars answer "how much today". This answers "how fast are we
 * burning the period", which is the question a controller actually asks.
 * Two series, deliberately:
 *
 *   • realizado  filled curve, accent — the running total
 *   • ritmo      dashed straight line, neutral — what the period would have
 *                cost at a constant daily rate
 *
 * The gap between them is the whole point: above the reference means spend is
 * running ahead of pace, below means behind. Without the reference a
 * cumulative curve always looks like healthy growth, because it can only ever
 * go up — that is why it is drawn, not optional.
 *
 * A classic S shape (flat, steep, flat) is the healthy signature: mobilization
 * ramps up, runs, then winds down. A curve still steepening at the right edge
 * means the period is not converging.
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.data
 * @param {string} props.xKey
 * @param {string} props.valueKey            cumulative actual
 * @param {string} [props.baselineKey]       constant-rate reference
 * @param {(v: number) => string} [props.yFormatter]
 * @param {(v: number) => string} [props.tooltipValueFormatter]
 * @param {number|string} [props.height=300]
 */
export function SCurveChart({
  data = [],
  xKey,
  valueKey,
  baselineKey,
  valueName = 'Realizado',
  baselineName = 'Ritmo constante',
  yFormatter,
  tooltipValueFormatter,
  height = 300,
  loading = false,
  empty,
  emptyMessage = 'Sem dados suficientes para a curva',
  className,
}) {
  const { isDark } = useTheme();
  const [accent, neutral] = useResolvedSeriesColors(SERIES_COLORS);

  const isEmpty = empty ?? data.length < 2;

  const option = useMemo(() => {
    const categories = data.map((d) => d[xKey]);
    const series = [
      {
        name: valueName,
        type: 'line',
        smooth: true,
        symbol: 'none',
        // The last point gets a marker: on a cumulative curve the right edge
        // is the number people are actually looking for.
        endLabel: { show: false },
        lineStyle: { width: 2, color: accent },
        areaStyle: { color: makeAreaGradient(accent, isDark) },
        data: data.map((d) => d[valueKey]),
        z: 3,
      },
    ];
    if (baselineKey) {
      series.push({
        name: baselineName,
        type: 'line',
        smooth: false,
        symbol: 'none',
        lineStyle: { width: 1, type: 'dashed', color: neutral, opacity: 0.7 },
        data: data.map((d) => d[baselineKey]),
        z: 2,
      });
    }
    return {
      ...getBaseOption({ isDark, palette: [accent, neutral], dataLength: data.length }),
      grid: getGridDefaults({ legend: false }),
      xAxis: makeCategoryAxis({ isDark, data: categories }),
      yAxis: makeValueAxis({ isDark, formatter: yFormatter }),
      tooltip: {
        ...getTooltipContainer(),
        trigger: 'axis',
        axisPointer: getAxisPointer(isDark),
        formatter: makeAxisTooltipFormatter({ valueFormatter: tooltipValueFormatter }),
      },
      series,
    };
  }, [data, xKey, valueKey, baselineKey, valueName, baselineName, accent, neutral, isDark, yFormatter, tooltipValueFormatter]);

  if (loading) return <ChartSkeleton height={height} />;
  if (isEmpty) return <ChartEmpty height={height} message={emptyMessage} />;

  return (
    <div className={clsx('w-full', className)}>
      <ReactECharts
        option={option}
        style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
