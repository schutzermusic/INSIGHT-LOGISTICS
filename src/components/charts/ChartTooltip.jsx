/**
 * Premium chart tooltip.
 * Used as a `content` renderer for Recharts <Tooltip>. Designed to
 * match the cinematic dark theme: sharp edges, solid base for instant
 * readability, a left accent bar colored by the primary series, and
 * refined typography that mirrors the rest of the dashboard.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  // Optional prop-level overrides per chart
  accentColor,
  compact = false,
}) {
  if (!active || !payload?.length) return null;

  const primary = payload[0];
  const accent = accentColor || primary?.color || primary?.fill || '#49DC7A';
  const displayLabel = labelFormatter ? labelFormatter(label) : label;

  return (
    <div
      className="premium-tooltip"
      style={{
        // Expose accent to CSS for the left bar and glow
        '--accent': accent,
      }}
    >
      {/* Vertical accent bar */}
      <span className="premium-tooltip__bar" aria-hidden />

      <div className={compact ? 'px-3 py-2.5' : 'px-4 py-3'}>
        {displayLabel !== undefined && displayLabel !== null && displayLabel !== '' && (
          <div className="label-micro mb-2 whitespace-nowrap">
            {displayLabel}
          </div>
        )}

        <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
          {payload.map((entry, i) => {
            const color = entry.color || entry.fill || '#ffffff';
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-6 whitespace-nowrap"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-[4px] flex-shrink-0"
                    style={{
                      background: color,
                      boxShadow: `0 0 8px ${hexToRgba(color, 0.45)}`,
                    }}
                  />
                  <span
                    className="body truncate"
                    style={{ color: 'rgb(var(--ink) / 0.6)' }}
                  >
                    {entry.name}
                  </span>
                </div>
                <span
                  className="tabular-data text-[13px] font-semibold tracking-tight"
                  style={{ color: 'rgb(var(--ink))' }}
                >
                  {formatter ? formatter(entry.value, entry.name, entry, i) : entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Tiny helper: hex / rgb(a) → rgba with custom alpha for glow effects.
function hexToRgba(color, alpha) {
  if (!color) return `rgba(73, 220, 122, ${alpha})`;
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  const hex = color.replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
