/**
 * HudGlobe — the real-time HUD map for CONFIRMED active mobilizations (§4).
 *
 * Renders only the confirmed operational mobilizations the backend returns as
 * `activeMapItems` (awaiting departure, in transit, delayed, at risk). Drafts,
 * previews and completed operations never reach this component.
 *
 * It is a self-contained SVG "globe" HUD (glass sphere + lat/long graticule +
 * animated great-circle-style arcs + pulsing origin/destination nodes + a live
 * position marker interpolated from the timeline). Being pure SVG it has no
 * WebGL dependency, so it degrades gracefully on any device — the §18 fallback
 * requirement — while keeping the premium command-center look.
 *
 * Interactions: hover shows a route summary; click opens the detail drawer via
 * `onSelect(item)`.
 */

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { latLngToSvg } from './BrazilMap';

const STATUS_COLOR = {
  on_track: '#49DC7A',   // green — on track
  in_transit: '#22F2EF', // cyan — in transit
  warning: '#F97316',    // orange — attention / risk
  delayed: '#F43F5E',    // red — delayed / compliance
  completed: '#8A94A6',  // gray
  multimodal: '#A855F7', // purple — complex route
};
const STATUS_LABEL = {
  on_track: 'No prazo', in_transit: 'Em trânsito', warning: 'Atenção', delayed: 'Atrasada', completed: 'Concluída',
};

const colorFor = (item) => (item.modal === 'multimodal' && item.status !== 'delayed'
  ? STATUS_COLOR.multimodal
  : STATUS_COLOR[item.status] || STATUS_COLOR.on_track);

/** Quadratic-bezier point at t, used for the live progress marker. */
function bezier(p0, cp, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  };
}

export default function HudGlobe({ items = [], onSelect, className }) {
  const [hover, setHover] = useState(null);

  const arcs = useMemo(() => items.map((it, idx) => {
    const o = latLngToSvg(it.origin.lat, it.origin.lng);
    const d = latLngToSvg(it.destination.lat, it.destination.lng);
    const midX = (o.x + d.x) / 2;
    const midY = (o.y + d.y) / 2;
    const dx = d.x - o.x, dy = d.y - o.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const curv = Math.min(dist * 0.28, 70);
    const cp = { x: midX + (-dy / dist) * curv, y: midY + (dx / dist) * curv };
    const t = Math.max(0, Math.min(1, (it.progressPercentage || 0) / 100));
    return {
      key: it.mobilizationId || idx,
      item: it,
      o, d, cp,
      pos: bezier(o, cp, d, t),
      color: colorFor(it),
      path: `M${o.x},${o.y} Q${cp.x},${cp.y} ${d.x},${d.y}`,
    };
  }), [items]);

  return (
    <div className={clsx('relative select-none text-white', className)}>
      <svg viewBox="60 80 560 450" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 24px rgba(34,242,239,0.06))' }}>
        <defs>
          <radialGradient id="hud-sphere" cx="42%" cy="38%" r="70%">
            <stop offset="0%" stopColor="rgba(34,242,239,0.10)" />
            <stop offset="45%" stopColor="rgba(73,220,122,0.04)" />
            <stop offset="100%" stopColor="rgba(10,14,22,0.0)" />
          </radialGradient>
          <filter id="hud-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Glass sphere + graticule (lat/long HUD lines) */}
        <circle cx="340" cy="305" r="215" fill="url(#hud-sphere)" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        <g stroke="currentColor" strokeOpacity="0.05" strokeWidth="0.6" fill="none">
          {[-150, -75, 0, 75, 150].map((oy) => (
            <ellipse key={`lat${oy}`} cx="340" cy={305 + oy} rx={Math.max(20, Math.sqrt(Math.max(0, 215 * 215 - oy * oy)))} ry="14" />
          ))}
          {[-160, -80, 0, 80, 160].map((ox) => (
            <ellipse key={`lng${ox}`} cx={340 + ox} cy="305" rx="18" ry="212" transform={`rotate(${ox / 6} 340 305)`} />
          ))}
        </g>

        {/* Route arcs */}
        {arcs.map((a) => (
          <g key={a.key} onMouseEnter={() => setHover(a)} onMouseLeave={() => setHover((h) => (h?.key === a.key ? null : h))}
            onClick={() => onSelect?.(a.item)} style={{ cursor: 'pointer' }}>
            <path d={a.path} fill="none" stroke={a.color} strokeWidth="3.2" opacity="0.12" filter="url(#hud-glow)" />
            <path d={a.path} fill="none" stroke={a.color} strokeWidth="1.4" opacity="0.55" strokeDasharray="6 5" className="hud-dash" />
            {/* origin + destination nodes */}
            <circle cx={a.o.x} cy={a.o.y} r="3.4" fill={a.color} opacity="0.9" />
            <circle cx={a.d.x} cy={a.d.y} r="3.4" fill="none" stroke={a.color} strokeWidth="1.4" opacity="0.9" />
            {/* live position marker */}
            <circle cx={a.pos.x} cy={a.pos.y} r="7" fill="none" stroke={a.color} strokeWidth="1" opacity="0.4" className="hud-pulse" />
            <circle cx={a.pos.x} cy={a.pos.y} r="3" fill={a.color} filter="url(#hud-glow)" />
          </g>
        ))}

        {/* Hover tooltip */}
        {hover && (
          <g pointerEvents="none">
            <rect x={hover.pos.x + 10} y={hover.pos.y - 30} width={Math.max(120, (hover.item.projectName || '').length * 5 + 40)} height="34" rx="5"
              fill="rgb(var(--surface-3))" fillOpacity="0.96" stroke={hover.color} strokeOpacity="0.3" strokeWidth="0.6" />
            <text x={hover.pos.x + 16} y={hover.pos.y - 17} fill="currentColor" fillOpacity="0.95" fontSize="7.5" fontFamily="Outfit, system-ui" fontWeight="700">
              {hover.item.projectName}
            </text>
            <text x={hover.pos.x + 16} y={hover.pos.y - 7} fill={hover.color} fontSize="7" fontFamily="Outfit, system-ui" fontWeight="600">
              {hover.item.origin.label?.split(' - ')[0]} → {hover.item.destination.label?.split(' - ')[0]} · {STATUS_LABEL[hover.item.status] || hover.item.status}
            </text>
          </g>
        )}
      </svg>

      <style>{`
        @keyframes hud-dash-flow { to { stroke-dashoffset: -22; } }
        .hud-dash { animation: hud-dash-flow 1.6s linear infinite; }
        @keyframes hud-pulse-k { 0% { r: 4; opacity: 0.5; } 100% { r: 13; opacity: 0; } }
        .hud-pulse { animation: hud-pulse-k 2s cubic-bezier(0,0,0.2,1) infinite; }
        @media (prefers-reduced-motion: reduce) { .hud-dash, .hud-pulse { animation: none; } }
      `}</style>
    </div>
  );
}

export { STATUS_COLOR, STATUS_LABEL };
