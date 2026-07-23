import { clsx } from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import { BarChart2, PieChart, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
 * Chart state components — Phase 5D
 *
 * Shared loading, empty, and error states for all Premium* charts.
 * Each state should feel premium and intentional, never a blank block.
 * ──────────────────────────────────────────────────────────────── */

/* ═══════ Loading skeleton with ghost chart shape ═══════ */

/**
 * Chart loading state that previews the chart structure:
 *   - Faint ghost grid lines
 *   - Faint chart shape silhouette (area/bar/donut)
 *   - Shimmer animation over the ghost
 *
 * @param {'area' | 'bar' | 'line' | 'donut'} [variant='area']
 */
export function ChartSkeleton({ variant = 'area', height = 320, className }) {
  const { isDark } = useTheme();
  const ghostColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,24,0.04)';
  const gridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,24,0.035)';
  const shimmerFrom = isDark ? 'rgba(255,255,255,0)' : 'rgba(15,30,24,0)';
  const shimmerVia = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,30,24,0.03)';

  if (variant === 'donut') {
    return (
      <div
        className={clsx('chart-skeleton relative w-full flex items-center justify-center overflow-hidden rounded-xl', className)}
        style={{ height }}
      >
        {/* Ghost donut ring */}
        <div
          className="rounded-full border-[6px] opacity-60"
          style={{
            width: Math.min(typeof height === 'number' ? height * 0.65 : 100, 120),
            height: Math.min(typeof height === 'number' ? height * 0.65 : 100, 120),
            borderColor: ghostColor,
          }}
        />
        {/* Shimmer sweep */}
        <div
          className="chart-skeleton__shimmer absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${shimmerFrom} 0%, ${shimmerVia} 50%, ${shimmerFrom} 100%)`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx('chart-skeleton relative w-full overflow-hidden rounded-xl', className)}
      style={{ height }}
    >
      {/* Ghost grid lines */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {[0.2, 0.4, 0.6, 0.8].map((y) => (
          <line
            key={y}
            x1="10%"
            x2="95%"
            y1={`${y * 100}%`}
            y2={`${y * 100}%`}
            stroke={gridColor}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}
      </svg>

      {/* Ghost chart shape */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {variant === 'bar' ? (
          /* Ghost bar rectangles */
          <>
            {[0.15, 0.35, 0.55, 0.75].map((x, i) => {
              const barHeight = [0.45, 0.65, 0.35, 0.55][i];
              return (
                <rect
                  key={x}
                  x={`${x * 100}%`}
                  y={`${(1 - barHeight) * 85}%`}
                  width="8%"
                  height={`${barHeight * 85}%`}
                  rx="3"
                  fill={ghostColor}
                />
              );
            })}
          </>
        ) : (
          /* Ghost area/line curve */
          <path
            d="M10,85 Q20,75 30,60 T50,50 T70,35 T85,45 L85,90 L10,90 Z"
            fill={ghostColor}
            stroke="none"
          />
        )}
      </svg>

      {/* Shimmer sweep */}
      <div
        className="chart-skeleton__shimmer absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${shimmerFrom} 0%, ${shimmerVia} 50%, ${shimmerFrom} 100%)`,
        }}
      />
    </div>
  );
}

/* ═══════ Empty state ═══════ */

/**
 * Premium empty state for charts — minimal and restrained.
 * Shows a muted icon + short caption. Optional action button.
 *
 * @param {'area' | 'bar' | 'line' | 'donut'} [variant='area']
 */
export function ChartEmpty({
  message = 'Sem dados suficientes',
  variant = 'area',
  action,
  height = 320,
  className,
}) {
  const { isDark } = useTheme();
  const Icon = variant === 'donut' ? PieChart
    : variant === 'bar' ? BarChart2
    : TrendingUp;

  const iconColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,30,24,0.12)';
  const textColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,30,24,0.3)';

  return (
    <div
      className={clsx('w-full flex items-center justify-center', className)}
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2.5">
        <Icon
          className="w-6 h-6"
          strokeWidth={1.5}
          style={{ color: iconColor }}
        />
        <span
          className="text-[12px] font-medium tracking-wide"
          style={{ color: textColor }}
        >
          {message}
        </span>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: isDark ? 'rgba(73,220,156,0.7)' : 'rgba(12,122,60,0.7)',
              background: isDark ? 'rgba(73,220,156,0.06)' : 'rgba(12,122,60,0.06)',
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════ Error state ═══════ */

/**
 * Friendly chart error state — no stack traces, just a clean message
 * with optional retry. Only shows retry if `onRetry` is provided.
 */
export function ChartError({
  message = 'Erro ao carregar dados',
  onRetry,
  height = 320,
  className,
}) {
  const { isDark } = useTheme();
  const iconColor = isDark ? 'rgba(240,98,127,0.5)' : 'rgba(220,60,90,0.5)';
  const textColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,30,24,0.35)';

  return (
    <div
      className={clsx('w-full flex items-center justify-center', className)}
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2.5">
        <AlertCircle
          className="w-6 h-6"
          strokeWidth={1.5}
          style={{ color: iconColor }}
        />
        <span
          className="text-[12px] font-medium tracking-wide"
          style={{ color: textColor }}
        >
          {message}
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: isDark ? 'rgba(73,220,156,0.7)' : 'rgba(12,122,60,0.7)',
              background: isDark ? 'rgba(73,220,156,0.06)' : 'rgba(12,122,60,0.06)',
            }}
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
