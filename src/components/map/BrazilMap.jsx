import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

/**
 * Futuristic Brazil Map Component
 * A premium SVG-based Brazil map visualization for the logistics command center.
 * Shows states, route corridors, origin/destination points, and analytics overlays.
 *
 * Uses a simplified but accurate Brazil state boundary SVG.
 */

// Brazilian states with centroid coordinates (projected to SVG viewBox)
const STATES = [
  { uf: 'AC', name: 'Acre', cx: 115, cy: 282 },
  { uf: 'AL', name: 'Alagoas', cx: 560, cy: 280 },
  { uf: 'AM', name: 'Amazonas', cx: 175, cy: 210 },
  { uf: 'AP', name: 'Amapa', cx: 330, cy: 130 },
  { uf: 'BA', name: 'Bahia', cx: 505, cy: 310 },
  { uf: 'CE', name: 'Ceara', cx: 530, cy: 215 },
  { uf: 'DF', name: 'Distrito Federal', cx: 420, cy: 345 },
  { uf: 'ES', name: 'Espirito Santo', cx: 500, cy: 385 },
  { uf: 'GO', name: 'Goias', cx: 400, cy: 350 },
  { uf: 'MA', name: 'Maranhao', cx: 440, cy: 210 },
  { uf: 'MG', name: 'Minas Gerais', cx: 455, cy: 380 },
  { uf: 'MS', name: 'Mato Grosso do Sul', cx: 330, cy: 400 },
  { uf: 'MT', name: 'Mato Grosso', cx: 310, cy: 310 },
  { uf: 'PA', name: 'Para', cx: 330, cy: 200 },
  { uf: 'PB', name: 'Paraiba', cx: 560, cy: 252 },
  { uf: 'PE', name: 'Pernambuco', cx: 545, cy: 262 },
  { uf: 'PI', name: 'Piaui', cx: 475, cy: 240 },
  { uf: 'PR', name: 'Parana', cx: 370, cy: 435 },
  { uf: 'RJ', name: 'Rio de Janeiro', cx: 470, cy: 408 },
  { uf: 'RN', name: 'Rio Grande do Norte', cx: 560, cy: 238 },
  { uf: 'RO', name: 'Rondonia', cx: 200, cy: 300 },
  { uf: 'RR', name: 'Roraima', cx: 195, cy: 140 },
  { uf: 'RS', name: 'Rio Grande do Sul', cx: 360, cy: 490 },
  { uf: 'SC', name: 'Santa Catarina', cx: 380, cy: 460 },
  { uf: 'SE', name: 'Sergipe', cx: 548, cy: 290 },
  { uf: 'SP', name: 'Sao Paulo', cx: 410, cy: 410 },
  { uf: 'TO', name: 'Tocantins', cx: 400, cy: 275 },
];

// Simplified Brazil outline path (SVG)
const BRAZIL_PATH = `M330,100 L350,95 L380,105 L400,100 L410,120 L390,130 L370,125 L345,140
L330,155 L360,165 L400,160 L440,170 L470,165 L500,175 L530,180 L550,190
L565,205 L575,225 L580,245 L575,260 L570,275 L560,290 L545,300
L530,310 L520,330 L510,350 L505,370 L500,385 L490,400 L475,410
L460,415 L445,420 L430,430 L415,440 L400,445 L385,455 L375,465
L365,475 L355,485 L345,495 L338,505 L330,498 L325,485 L320,470
L310,455 L300,440 L290,430 L280,420 L275,410 L265,400 L260,385
L255,370 L248,355 L240,340 L230,325 L220,315 L210,305 L200,300
L185,295 L170,290 L155,285 L140,280 L125,278 L110,282 L100,288
L95,295 L100,305 L110,300 L120,295 L130,290 L140,285 L150,290
L160,295 L170,300 L175,310 L170,320 L160,315 L150,310 L140,305
L130,305 L120,310 L115,320 L120,330 L130,325 L140,318 L155,312
L168,318 L180,320 L190,315 L200,310 L210,315 L215,325 L210,335
L200,340 L190,345 L185,355 L195,360 L210,355 L225,350 L235,345
L245,350 L255,355 L265,365 L270,375 L275,385 L280,390 L285,395
L275,380 L265,370 L260,360 L250,348 L245,340 L240,335 L235,328
L240,320 L250,310 L260,305 L275,300 L290,296 L300,290 L310,285
L315,275 L310,265 L300,260 L290,255 L280,250 L268,248 L255,250
L245,255 L235,260 L225,265 L215,268 L205,265 L195,260 L185,255
L175,252 L165,250 L155,248 L150,240 L155,230 L165,225 L175,220
L185,218 L195,215 L205,210 L220,205 L235,200 L250,195 L260,190
L270,185 L280,178 L290,170 L300,160 L310,150 L315,138 L320,125
L325,115 Z`;

// State boundaries (simplified inner borders)
const STATE_BORDERS = `M310,285 L340,280 L370,290 L400,285 L430,275 L450,270 L460,280
M400,285 L410,310 L420,340 L430,355 L440,370
M310,310 L340,320 L370,330 L400,340
M370,330 L380,360 L385,390 L390,420
M440,370 L470,380 L490,390
M430,355 L460,360 L490,370 L510,375
M460,280 L480,290 L510,300 L530,310
M530,180 L540,200 L550,220 L560,240
M470,165 L475,190 L480,215 L485,240
M400,160 L420,180 L440,200 L455,220
M260,250 L280,260 L300,270
M175,252 L190,260 L210,270 L230,275 L250,280
M320,125 L330,155 L340,180 L350,200 L360,220 L370,240 L375,260
M195,215 L210,230 L225,245 L240,255`;

export default function BrazilMap({
  routes = [],
  highlights = [],
  activePoints = [],
  onStateClick,
  className,
  showLabels = false,
  glowIntensity = 'medium',
  variant = 'default', // 'default' | 'minimal' | 'heatmap'
}) {
  const [hoveredState, setHoveredState] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Map highlight data to states
  const stateHighlights = useMemo(() => {
    const map = {};
    highlights.forEach(h => {
      map[h.uf] = { ...h };
    });
    return map;
  }, [highlights]);

  // Generate route arcs between points
  const routeArcs = useMemo(() => {
    return routes.map((route, idx) => {
      const fromState = STATES.find(s => s.uf === route.fromUf);
      const toState = STATES.find(s => s.uf === route.toUf);
      if (!fromState || !toState) return null;

      // Calculate curved arc
      const midX = (fromState.cx + toState.cx) / 2;
      const midY = (fromState.cy + toState.cy) / 2;
      const dx = toState.cx - fromState.cx;
      const dy = toState.cy - fromState.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curvature = Math.min(dist * 0.3, 60);

      // Perpendicular offset for arc
      const nx = -dy / dist;
      const ny = dx / dist;
      const cpX = midX + nx * curvature;
      const cpY = midY + ny * curvature;

      return {
        key: `${route.fromUf}-${route.toUf}-${idx}`,
        path: `M${fromState.cx},${fromState.cy} Q${cpX},${cpY} ${toState.cx},${toState.cy}`,
        from: fromState,
        to: toState,
        color: route.color || '#49DC7A',
        intensity: route.intensity || 1,
        label: route.label || '',
      };
    }).filter(Boolean);
  }, [routes]);

  const glowOpacity = glowIntensity === 'high' ? 0.15 : glowIntensity === 'low' ? 0.04 : 0.08;

  return (
    <div
      className={clsx('relative select-none text-white', className)}
      style={{ '--brazil-ink': 'currentColor' }}
    >
      <svg
        viewBox="60 80 560 450"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 0 20px rgba(73, 220, 122, 0.05))' }}
      >
        <defs>
          {/* Gradient uses currentColor (inherits text-white → themed ink) */}
          <linearGradient id="brazil-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.025" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>

          {/* Glow filter for active points */}
          <filter id="point-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Route arc glow */}
          <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Animated dash pattern */}
          <pattern id="dash-pattern" patternUnits="userSpaceOnUse" width="12" height="1">
            <line x1="0" y1="0" x2="8" y2="0" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Background glow */}
        <ellipse
          cx="350"
          cy="300"
          rx="200"
          ry="180"
          fill={`rgba(73, 220, 122, ${glowOpacity})`}
          style={{ filter: 'blur(60px)' }}
        />

        {/* Brazil outline */}
        <path
          d={BRAZIL_PATH}
          fill="url(#brazil-fill)"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* State borders */}
        <path
          d={STATE_BORDERS}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.06"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />

        {/* State highlights (heatmap mode) */}
        {variant === 'heatmap' && Object.entries(stateHighlights).map(([uf, data]) => {
          const state = STATES.find(s => s.uf === uf);
          if (!state) return null;
          const intensity = Math.min(1, (data.value || 0) / (data.maxValue || 1));
          return (
            <circle
              key={`heat-${uf}`}
              cx={state.cx}
              cy={state.cy}
              r={12 + intensity * 20}
              fill={data.color || '#49DC7A'}
              opacity={0.05 + intensity * 0.15}
              style={{ filter: 'blur(8px)' }}
            />
          );
        })}

        {/* Route arcs */}
        {routeArcs.map(arc => (
          <g key={arc.key}>
            {/* Glow trail */}
            <path
              d={arc.path}
              fill="none"
              stroke={arc.color}
              strokeWidth={2 + arc.intensity * 2}
              opacity={0.1}
              filter="url(#arc-glow)"
            />
            {/* Main arc */}
            <path
              d={arc.path}
              fill="none"
              stroke={arc.color}
              strokeWidth={1.2 + arc.intensity}
              opacity={0.5 + arc.intensity * 0.3}
              strokeDasharray="6 4"
              className="animate-dash"
            />
            {/* Arc endpoints */}
            <circle cx={arc.from.cx} cy={arc.from.cy} r={3} fill={arc.color} opacity={0.8} />
            <circle cx={arc.to.cx} cy={arc.to.cy} r={3} fill={arc.color} opacity={0.8} />
          </g>
        ))}

        {/* State labels */}
        {showLabels && STATES.map(state => (
          <text
            key={`label-${state.uf}`}
            x={state.cx}
            y={state.cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            fillOpacity="0.32"
            fontSize="8"
            fontFamily="Outfit, system-ui"
            fontWeight="600"
          >
            {state.uf}
          </text>
        ))}

        {/* Active points (cities, destinations) */}
        {activePoints.map((point, idx) => {
          const state = STATES.find(s => s.uf === point.uf);
          if (!state) return null;
          const px = point.x || state.cx + (point.offsetX || 0);
          const py = point.y || state.cy + (point.offsetY || 0);

          return (
            <g
              key={`point-${idx}`}
              filter="url(#point-glow)"
              onMouseEnter={() => setTooltip({ x: px, y: py, label: point.label, value: point.value })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Pulse ring */}
              <circle
                cx={px}
                cy={py}
                r={8}
                fill="none"
                stroke={point.color || '#49DC7A'}
                strokeWidth={1}
                opacity={0.3}
                className="animate-ping-slow"
              />
              {/* Inner dot */}
              <circle
                cx={px}
                cy={py}
                r={3.5}
                fill={point.color || '#49DC7A'}
                stroke="rgb(var(--page-base))"
                strokeOpacity="0.85"
                strokeWidth={1.5}
              />
              {/* Label */}
              {point.label && (
                <text
                  x={px + 8}
                  y={py + 1}
                  fill="currentColor"
                  fillOpacity="0.6"
                  fontSize="7"
                  fontFamily="Outfit, system-ui"
                  fontWeight="500"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Interactive state overlays */}
        {onStateClick && STATES.map(state => (
          <circle
            key={`click-${state.uf}`}
            cx={state.cx}
            cy={state.cy}
            r={15}
            fill="transparent"
            stroke={hoveredState === state.uf ? 'rgba(73,220,122,0.2)' : 'transparent'}
            strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredState(state.uf)}
            onMouseLeave={() => setHoveredState(null)}
            onClick={() => onStateClick(state)}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x + 10}
              y={tooltip.y - 20}
              width={Math.max(60, (tooltip.label || '').length * 5 + 20)}
              height={tooltip.value ? 30 : 18}
              rx={4}
              fill="rgb(var(--surface-3))"
              fillOpacity="0.95"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth={0.5}
            />
            <text
              x={tooltip.x + 15}
              y={tooltip.y - 8}
              fill="currentColor"
              fillOpacity="0.95"
              fontSize="7"
              fontFamily="Outfit, system-ui"
              fontWeight="600"
            >
              {tooltip.label}
            </text>
            {tooltip.value && (
              <text
                x={tooltip.x + 15}
                y={tooltip.y + 3}
                fill="#49DC7A"
                fontSize="7"
                fontFamily="Outfit, system-ui"
                fontWeight="700"
              >
                {tooltip.value}
              </text>
            )}
          </g>
        )}
      </svg>

      {/* CSS for animations */}
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -20; }
        }
        .animate-dash {
          animation: dash-flow 1.5s linear infinite;
        }
        @keyframes ping-slow {
          0% { r: 4; opacity: 0.4; }
          100% { r: 14; opacity: 0; }
        }
        .animate-ping-slow {
          animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}

/**
 * Helper: Convert lat/lng to approximate SVG coordinates
 * Brazil bounds: lat -33 to 5, lng -74 to -35
 */
export function latLngToSvg(lat, lng) {
  const minLat = -33, maxLat = 5, minLng = -74, maxLng = -35;
  const svgMinX = 80, svgMaxX = 600, svgMinY = 90, svgMaxY = 520;

  const x = svgMinX + ((lng - minLng) / (maxLng - minLng)) * (svgMaxX - svgMinX);
  const y = svgMinY + ((maxLat - lat) / (maxLat - minLat)) * (svgMaxY - svgMinY);
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Helper: Build route data from simulation for the map
 */
export function buildMapRoutes(simulations, citiesDb = []) {
  const routeMap = {};

  simulations.forEach(sim => {
    const originCity = citiesDb.find(c => c.nome === sim.origem);
    const destCity = citiesDb.find(c => c.nome === sim.destino);
    if (!originCity || !destCity) return;

    const key = `${originCity.uf}-${destCity.uf}`;
    if (!routeMap[key]) {
      routeMap[key] = {
        fromUf: originCity.uf,
        toUf: destCity.uf,
        count: 0,
        totalCost: 0,
        color: '#49DC7A',
      };
    }
    routeMap[key].count += 1;
    routeMap[key].totalCost += sim.resumo?.custoTotalEquipe || 0;
    routeMap[key].intensity = Math.min(1, routeMap[key].count / 5);
  });

  return Object.values(routeMap);
}

/**
 * Helper: Build active points from simulations
 */
export function buildMapPoints(simulations, citiesDb = []) {
  const pointMap = {};

  simulations.forEach(sim => {
    [sim.origem, sim.destino].forEach(cityName => {
      if (!cityName) return;
      const city = citiesDb.find(c => c.nome === cityName);
      if (!city) return;
      if (!pointMap[cityName]) {
        const coords = latLngToSvg(city.lat, city.lng);
        pointMap[cityName] = {
          uf: city.uf,
          x: coords.x,
          y: coords.y,
          label: cityName.split(' - ')[0],
          count: 0,
          totalCost: 0,
          color: '#49DC7A',
        };
      }
      pointMap[cityName].count += 1;
      pointMap[cityName].totalCost += sim.resumo?.custoTotalEquipe || 0;
    });
  });

  return Object.values(pointMap).map(p => ({
    ...p,
    value: p.count > 0 ? `${p.count} analise(s)` : undefined,
  }));
}
