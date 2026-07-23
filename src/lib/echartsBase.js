import { useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';
import { CHART_SEQUENCE } from './chartTheme';

/* ────────────────────────────────────────────────────────────────
 * Shared Apache ECharts option builders for Premium* chart wrappers.
 * All styling rules live here; wrappers compose them with their data.
 *
 * Phase 5B — Premium Visual System
 * Phase 5C — Interaction Polish
 * ─────────────────────────────────
 * • No heavy axis lines or default chart borders
 * • Subtle dashed grid (3,3 dash, very low opacity)
 * • Clean readable labels with tabular-nums
 * • Refined Outfit / system-ui typography at 11px
 * • Minimal legends — small circle icons, restrained spacing
 * • Restrained visual density, consistent padding
 * • No noisy decorations
 * • Premium tooltip with semantic color dots & clean formatting
 * • Hover emphasis: hovered series full, others dim to ~30%
 * • Mint/accent axis pointer (1px dashed [4,4])
 * • Motion-system-aware animation durations
 * • Reduced-motion support
 *
 * TODO: switch to tree-shaken `echarts/core` registrations if the
 * aggregated bundle cost ever becomes a concern.
 * ──────────────────────────────────────────────────────────────── */

/* ═══════ Color utilities ═══════ */

export function resolveColor(color) {
  if (!color) return '#49DC9C';
  if (typeof color !== 'string') return color;
  const match = color.trim().match(/^var\((--[\w-]+)\)$/);
  if (!match) return color;
  if (typeof window === 'undefined') return '#49DC9C';
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim();
  return value || '#49DC9C';
}

export function hexToRgba(color, alpha) {
  if (!color) return `rgba(73, 220, 156, ${alpha})`;
  const c = color.trim();
  if (c.startsWith('rgba')) return c.replace(/[\d.]+\)$/, `${alpha})`);
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  const hex = c.replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map((ch) => ch + ch).join('')
    : hex.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Lighten a color by mixing it towards white.
 * `amount` 0 = no change, 1 = pure white.
 * Handles hex (#abc, #aabbcc), rgb(), and rgba() formats.
 */
export function lightenColor(color, amount = 0.2) {
  if (!color) return `rgba(73, 220, 156, 1)`;
  const s = color.trim();
  let r, g, b;

  // Try rgb(a) first
  const rgbMatch = s.match(/rgba?\(\s*([\d.]+)\s*[,/]\s*([\d.]+)\s*[,/]\s*([\d.]+)/);
  if (rgbMatch) {
    r = parseInt(rgbMatch[1], 10);
    g = parseInt(rgbMatch[2], 10);
    b = parseInt(rgbMatch[3], 10);
  } else {
    // Treat as hex
    const hex = s.replace('#', '');
    const full = hex.length === 3
      ? hex.split('').map((ch) => ch + ch).join('')
      : hex.padEnd(6, '0').slice(0, 6);
    r = parseInt(full.slice(0, 2), 16);
    g = parseInt(full.slice(2, 4), 16);
    b = parseInt(full.slice(4, 6), 16);
  }

  if (isNaN(r)) r = 73;
  if (isNaN(g)) g = 220;
  if (isNaN(b)) b = 156;

  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

/* ═══════ Palette hooks ═══════ */

export function useResolvedSeriesColors(series) {
  const { theme } = useTheme();
  return useMemo(
    () => series.map((s, i) => resolveColor(s?.color || CHART_SEQUENCE[i % CHART_SEQUENCE.length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, theme],
  );
}

export function useResolvedColors(colors) {
  const { theme } = useTheme();
  return useMemo(
    () => (colors && colors.length ? colors : CHART_SEQUENCE).map(resolveColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, theme],
  );
}

/* ═══════ Motion-aware animation ═══════
 * Reads the `data-motion` attribute set by the app's motion preference system
 * (useMotionPreference / Phase 4C). Provides sensible defaults for ECharts
 * animation config that respects the user's choice.                         */

function getMotionMode() {
  if (typeof document === 'undefined') return 'full';
  return document.documentElement.getAttribute('data-motion') || 'full';
}

/**
 * Returns ECharts animation properties tuned to the data size and the user's
 * motion preference. Large datasets (>50 points) get shorter durations.
 */
export function getAnimationConfig(dataLength = 0) {
  const mode = getMotionMode();

  if (mode === 'off') {
    return {
      animation: false,
    };
  }

  const isLarge = dataLength > 50;

  if (mode === 'reduced') {
    return {
      animation: true,
      animationDuration: isLarge ? 0 : 200,
      animationDurationUpdate: 150,
      animationEasing: 'linear',
      animationEasingUpdate: 'linear',
    };
  }

  // full mode
  return {
    animation: true,
    animationDuration: isLarge ? 300 : 600,
    animationDurationUpdate: 300,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    animationDelay: (idx) => (isLarge ? 0 : Math.min(idx * 30, 300)),
  };
}

/* ═══════ Tooltip HTML builders ═══════ */

function escapeHtml(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the premium tooltip HTML string.
 * Shared by all chart types for visual consistency.
 *
 *  - Light/dark aware via CSS custom properties (--ink, --surface-*, etc.)
 *  - Semantic color dots with subtle glow
 *  - Tabular-nums for numeric values
 *  - Left accent bar colored by the primary series
 */
export function premiumTooltipHtml({ label, rows, accentColor }) {
  const accent = accentColor || rows?.[0]?.color || 'rgb(73,220,156)';
  const labelBlock = (label !== undefined && label !== null && label !== '')
    ? `<div class="premium-tooltip__label">${escapeHtml(label)}</div>`
    : '';
  const body = (rows || []).map(({ color, name, value }) => {
    const c = color || '#ffffff';
    const glow = hexToRgba(c, 0.30);
    return `<div class="premium-tooltip__row">`
      + `<div class="premium-tooltip__row-left">`
      + `<span class="premium-tooltip__dot" style="background:${c};box-shadow:0 0 5px ${glow}"></span>`
      + `<span class="premium-tooltip__name">${escapeHtml(name)}</span>`
      + `</div>`
      + `<span class="premium-tooltip__value">${escapeHtml(value)}</span>`
      + `</div>`;
  }).join('');
  return `<div class="premium-tooltip" style="--accent:${accent}">`
    + `<span class="premium-tooltip__bar" aria-hidden></span>`
    + `<div class="premium-tooltip__body">${labelBlock}<div class="premium-tooltip__rows">${body}</div></div>`
    + `</div>`;
}

export function makeAxisTooltipFormatter({ valueFormatter, labelFormatter } = {}) {
  return (params) => {
    if (!Array.isArray(params) || params.length === 0) return '';
    const rawLabel = params[0].axisValueLabel ?? params[0].axisValue;
    const label = labelFormatter ? labelFormatter(rawLabel) : rawLabel;
    const rows = params
      .filter((p) => p.value != null && p.value !== '' && p.value !== '-')
      .map((p) => ({
        color: p.color,
        name: p.seriesName,
        value: valueFormatter ? valueFormatter(p.value) : formatAutoValue(p.value),
      }));
    return premiumTooltipHtml({ label, rows, accentColor: rows[0]?.color });
  };
}

export function makeItemTooltipFormatter({ valueFormatter, labelFormatter } = {}) {
  return (p) => {
    const rawLabel = p.name;
    const label = labelFormatter ? labelFormatter(rawLabel) : rawLabel;
    const rows = [{
      color: p.color,
      name: p.seriesName || p.name,
      value: valueFormatter ? valueFormatter(p.value) : formatAutoValue(p.value),
    }];
    return premiumTooltipHtml({ label, rows, accentColor: p.color });
  };
}

/* ═══════ Smart value formatters ═══════
 * Used when the consumer doesn't supply a custom valueFormatter. */

function formatAutoValue(v) {
  if (v == null) return '—';
  const num = Number(v);
  if (isNaN(num)) return String(v);
  // Use locale thousands-separators, max 2 decimal places.
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/* ═══════ Theme-aware base tokens ═══════ */

const FONT_FAMILY_STACK = "'Outfit', system-ui, -apple-system, sans-serif";

export function getBaseTextColor(isDark) {
  return isDark ? 'rgba(245,247,250,0.48)' : 'rgba(15,30,24,0.48)';
}

export function getSplitLineColor(isDark) {
  return isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,30,24,0.07)';
}

/**
 * Mint accent color for axis pointer guideline.
 * Slightly dimmed to stay subtle but clearly branded.
 */
function getAccentPointerColor(isDark) {
  return isDark ? 'rgba(73, 220, 156, 0.35)' : 'rgba(12, 122, 60, 0.28)';
}

/* ═══════ Base option — applied to every chart ═══════ */

export function getBaseOption({ isDark, palette, dataLength }) {
  return {
    color: palette,
    textStyle: {
      fontFamily: FONT_FAMILY_STACK,
      fontSize: 11,
      fontWeight: 400,
      color: getBaseTextColor(isDark),
    },
    ...getAnimationConfig(dataLength),
  };
}

/* ═══════ Axis builders ═══════
 * No axis lines, no tick marks. Labels are small, tabular, and soft. */

export function makeCategoryAxis({ isDark, formatter, data }) {
  return {
    type: 'category',
    boundaryGap: true,
    data,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: getBaseTextColor(isDark),
      fontSize: 11,
      fontFamily: FONT_FAMILY_STACK,
      fontWeight: 400,
      formatter,
      margin: 12,
    },
  };
}

export function makeValueAxis({ isDark, formatter }) {
  return {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      show: true,
      lineStyle: {
        color: getSplitLineColor(isDark),
        type: [3, 3],       // subtle dashed grid
        width: 1,
        cap: 'round',
      },
    },
    axisLabel: {
      color: getBaseTextColor(isDark),
      fontSize: 11,
      fontFamily: FONT_FAMILY_STACK,
      fontWeight: 400,
      formatter,
      margin: 12,
    },
  };
}

/* ═══════ Tooltip container ═══════
 * Transparent container — all visual styling is in the HTML template
 * and the CSS `.premium-tooltip` class. */

export function getTooltipContainer() {
  return {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    extraCssText: 'box-shadow:none;pointer-events:none;z-index:9999;',
    appendToBody: true,
    confine: true,
    transitionDuration: 0.15,   // smooth follow, not jumpy
  };
}

/* ═══════ Legend ═══════
 * Minimal: small circles, restrained gap, soft label color. */

export function getLegendStyle({ isDark }) {
  return {
    show: true,
    bottom: 0,
    itemWidth: 6,
    itemHeight: 6,
    itemGap: 18,
    icon: 'circle',
    textStyle: {
      color: getBaseTextColor(isDark),
      fontSize: 11,
      fontFamily: FONT_FAMILY_STACK,
      fontWeight: 400,
      padding: [0, 0, 0, 2],   // tiny breathing room after dot
    },
  };
}

/* ═══════ Emphasis / blur ═══════
 * Phase 5C — When hovering a series:
 *   • The hovered series stays fully visible (emphasis)
 *   • All other series dim to ~30% opacity (blur)
 * This creates a clear visual affordance without being distracting. */

/**
 * Returns `emphasis` + series-level config for cartesian series
 * (line, area, bar). Use `focus: 'series'` with `blurScope: 'global'`
 * so the entire chart dims except the hovered series.
 */
export function getSeriesEmphasisBlur(isDark) {
  return {
    emphasis: {
      focus: 'series',
      blurScope: 'coordinateSystem',
    },
    blur: {
      lineStyle: { opacity: 0.15 },
      areaStyle: { opacity: 0.08 },
      itemStyle: { opacity: 0.15 },
    },
  };
}

/* ═══════ Gradient builders ═══════ */

/**
 * Area chart linear gradient: accent at ~60% opacity on top → transparent bottom.
 */
export function makeAreaGradient(color, isDark) {
  const topAlpha = isDark ? 0.55 : 0.35;
  return {
    type: 'linear',
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: hexToRgba(color, topAlpha) },
      { offset: 0.7, color: hexToRgba(color, topAlpha * 0.3) },
      { offset: 1, color: hexToRgba(color, 0) },
    ],
  };
}

/**
 * Bar chart vertical gradient: slightly lighter top → base color bottom.
 * Returns an ECharts LinearGradient-compatible object.
 */
export function makeBarGradient(color, isDark) {
  const topColor = lightenColor(color, isDark ? 0.25 : 0.18);
  return {
    type: 'linear',
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0,    color: topColor },
      { offset: 0.12, color: topColor },
      { offset: 0.14, color },          // subtle 1px highlight band
      { offset: 1,    color },
    ],
  };
}

/* ═══════ Grid defaults ═══════ */

export function getGridDefaults({ legend }) {
  return {
    left: 8,
    right: 12,
    top: 20,
    bottom: legend ? 32 : 8,
    containLabel: true,
  };
}

/* ═══════ Axis pointer ═══════
 * Phase 5C — Mint/accent colored, 1px dashed [4,4], subtle opacity.
 * For line and area charts: vertical guideline.
 * For bar charts: shadow pointer (handled separately). */

export function getAxisPointer(isDark) {
  return {
    type: 'line',
    snap: true,
    lineStyle: {
      color: getAccentPointerColor(isDark),
      type: [4, 4],
      width: 1,
      cap: 'round',
    },
    label: { show: false },
  };
}

/**
 * Shadow-style axis pointer for bar charts — barely-visible column highlight.
 */
export function getBarAxisPointer(isDark) {
  return {
    type: 'shadow',
    shadowStyle: {
      color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,30,24,0.03)',
    },
    label: { show: false },
  };
}
