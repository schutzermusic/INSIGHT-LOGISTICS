import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { clsx } from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import {
  getBaseOption,
  getTooltipContainer,
  getLegendStyle,
  makeItemTooltipFormatter,
  useResolvedColors,
} from '../../lib/echartsBase';
import { ChartSkeleton, ChartEmpty, ChartError } from './ChartStates';

/**
 * Premium donut chart on Apache ECharts.
 *
 * Phase 5B — Visual enhancements
 * Phase 5C — Interaction polish
 * Phase 5D — Chart states (loading skeleton, empty, error)
 *
 * @param {object} props
 * @param {Array<Record<string, any>>} props.data
 * @param {string} [props.nameKey='name']
 * @param {string} [props.valueKey='value']
 * @param {Array<string>} [props.colors]
 * @param {number} [props.innerRadius=52]
 * @param {number} [props.outerRadius=66]
 * @param {number} [props.paddingAngle=3]
 * @param {boolean} [props.showLegend=false]
 * @param {(v: any) => string} [props.tooltipValueFormatter]
 * @param {(l: any) => string} [props.tooltipLabelFormatter]
 * @param {string} [props.centerLabel]
 * @param {string|number} [props.centerValue]
 * @param {number|string} [props.height=160]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.empty]
 * @param {string} [props.emptyMessage]
 * @param {boolean} [props.error]
 * @param {string} [props.errorMessage]
 * @param {() => void} [props.onRetry]
 * @param {{ label: string, onClick: () => void }} [props.emptyAction]
 * @param {string} [props.className]
 */
export function PremiumDonutChart({
  data = [],
  nameKey = 'name',
  valueKey = 'value',
  colors,
  innerRadius = 52,
  outerRadius = 66,
  paddingAngle = 3,
  showLegend = false,
  tooltipValueFormatter,
  tooltipLabelFormatter,
  centerLabel,
  centerValue,
  height = 160,
  loading = false,
  empty,
  emptyMessage = 'Sem dados',
  error = false,
  errorMessage,
  onRetry,
  emptyAction,
  className,
}) {
  const { isDark } = useTheme();
  const palette = useResolvedColors(colors);

  const isEmpty = empty ?? (!data || data.length === 0);

  const option = useMemo(() => {
    if (isEmpty || loading || error) return null;

    // Compute total for center label
    const total = data.reduce((sum, row) => sum + (Number(row?.[valueKey]) || 0), 0);
    const displayValue = centerValue !== undefined
      ? String(centerValue)
      : total.toLocaleString('pt-BR');
    const displayLabel = centerLabel || 'Total';

    const textColor = isDark ? 'rgba(245,247,250,0.88)' : 'rgba(15,30,24,0.88)';
    const subtextColor = isDark ? 'rgba(245,247,250,0.4)' : 'rgba(15,30,24,0.4)';

    return {
      ...getBaseOption({ isDark, palette, dataLength: data.length }),
      tooltip: {
        trigger: 'item',
        ...getTooltipContainer(),
        formatter: makeItemTooltipFormatter({
          valueFormatter: tooltipValueFormatter,
          labelFormatter: tooltipLabelFormatter,
        }),
      },
      legend: showLegend ? getLegendStyle({ isDark }) : { show: false },
      graphic: [{
        type: 'group',
        left: 'center',
        top: 'center',
        children: [
          {
            type: 'text',
            style: {
              text: displayValue,
              textAlign: 'center',
              fill: textColor,
              fontSize: 18,
              fontWeight: 600,
              fontFamily: "'Outfit', system-ui, sans-serif",
            },
            top: -6,
          },
          {
            type: 'text',
            style: {
              text: displayLabel,
              textAlign: 'center',
              fill: subtextColor,
              fontSize: 10,
              fontWeight: 500,
              fontFamily: "'Outfit', system-ui, sans-serif",
              textTransform: 'uppercase',
            },
            top: 16,
          },
        ],
      }],
      series: [{
        type: 'pie',
        radius: [`${innerRadius}%`, `${outerRadius}%`],
        padAngle: paddingAngle,
        avoidLabelOverlap: false,
        itemStyle: {
          borderWidth: 0,
          borderColor: 'transparent',
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 2,
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.12)',
            opacity: 1,
          },
        },
        blur: {
          itemStyle: {
            opacity: 0.35,
          },
        },
        selectedMode: false,
        data: data.map((row, i) => {
          const baseColor = palette[i % palette.length];
          return {
            name: row?.[nameKey],
            value: row?.[valueKey],
            itemStyle: {
              color: baseColor,
              opacity: 0.88,
            },
          };
        }),
      }],
    };
  }, [data, nameKey, valueKey, palette, innerRadius, outerRadius, paddingAngle, showLegend, isDark, tooltipValueFormatter, tooltipLabelFormatter, isEmpty, loading, error, centerLabel, centerValue]);

  if (loading) {
    return <ChartSkeleton variant="donut" height={height} className={className} />;
  }
  if (error) {
    return <ChartError message={errorMessage} onRetry={onRetry} height={height} className={className} />;
  }
  if (isEmpty) {
    return <ChartEmpty message={emptyMessage} variant="donut" action={emptyAction} height={height} className={className} />;
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
