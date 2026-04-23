import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { isGoogleMapsLoaded } from '../../services/GoogleMapsLoader';
import { fetchDrivingRoutes } from '../../services/BackendApiClient';
import { useTheme } from '../../hooks/useTheme';

// Dark futuristic map style — deep green-tinted for command-center look
const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0a0f0f' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0f0f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#2a3a3a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#0f1a1a' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#1a3030' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#122222' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#3a5555' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#080e0e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0b1414' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#1f3333' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0a1612' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#111c1c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d1616' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#162222' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0f1919' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#2a4444' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0d1818' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#2a4444' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#040a0d' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#0f2030' }] },
];

// Light premium map style — soft off-white + green accents, same identity
const LIGHT_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#F3F8F5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4A6359' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#E6EFEA' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#B8D1C3' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#CFE1D6' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#38574A' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#ECF4EF' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E3EEE8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5E7A6E' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D9EADF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E4EDE8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D2E0D8' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4A6359' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E8F1EC' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#4A6359' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DAE8EE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6F8D97' }] },
];

// Decode Google encoded polyline to array of [lng, lat]
function decodePolyline(encoded) {
  if (!encoded) return [];
  if (window.google?.maps?.geometry?.encoding) {
    const path = window.google.maps.geometry.encoding.decodePath(encoded);
    return path.map(p => [p.lng(), p.lat()]);
  }
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

const COLORS = {
  mint: [73, 220, 122],
  cyan: [34, 242, 239],
  orange: [249, 115, 22],
  purple: [168, 85, 247],
  blue: [59, 130, 246],
  white: [255, 255, 255],
};

// Lazy-load deck.gl modules to avoid WebGL initialization errors at import time
let deckModules = null;
async function loadDeckGL() {
  if (deckModules) return deckModules;
  const [gmOverlay, layers] = await Promise.all([
    import('@deck.gl/google-maps'),
    import('@deck.gl/layers'),
  ]);
  deckModules = {
    GoogleMapsOverlay: gmOverlay.GoogleMapsOverlay,
    ArcLayer: layers.ArcLayer,
    ScatterplotLayer: layers.ScatterplotLayer,
    PathLayer: layers.PathLayer,
  };
  return deckModules;
}

export default function DeckGLMap({
  origin,
  destination,
  routeType = 'driving',
  className = '',
  height = 500,
  showArc = true,
  onRouteLoaded,
}) {
  const { isDark } = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const deckRef = useRef(null); // cached deck modules
  const [routePath, setRoutePath] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState(null);

  // Theme-aware map chrome (applied to Google Maps styles and canvas bg)
  const mapStyles = isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES;
  const mapBg = isDark ? '#0A1E18' : '#F3F8F5';
  const overlayFade = isDark ? '4, 10, 10' : '243, 248, 245';
  const panelBg = isDark ? 'rgba(10,30,24,0.80)' : 'rgba(255,255,255,0.92)';
  const panelBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,30,24,0.08)';

  // Calculate center and zoom
  const { center, zoom } = useMemo(() => {
    if (!origin || !destination) {
      return { center: { lat: -15.79, lng: -47.88 }, zoom: 4 };
    }
    const cLat = (origin.lat + destination.lat) / 2;
    const cLng = (origin.lng + destination.lng) / 2;
    const maxDiff = Math.max(
      Math.abs(origin.lat - destination.lat),
      Math.abs(origin.lng - destination.lng)
    );

    let z = 5;
    if (maxDiff < 2) z = 8;
    else if (maxDiff < 5) z = 7;
    else if (maxDiff < 10) z = 6;
    else if (maxDiff < 20) z = 5;
    else z = 4;

    return { center: { lat: cLat, lng: cLng }, zoom: z };
  }, [origin, destination]);

  // Initialize Google Map + deck.gl overlay
  useEffect(() => {
    if (!containerRef.current || !isGoogleMapsLoaded() || !window.google?.maps) return;

    let cancelled = false;

    async function init() {
      try {
        const deck = await loadDeckGL();
        if (cancelled) return;
        deckRef.current = deck;

        const map = new window.google.maps.Map(containerRef.current, {
          center,
          zoom,
          tilt: 0,
          mapTypeId: 'roadmap',
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position: window.google.maps.ControlPosition.RIGHT_CENTER,
          },
          gestureHandling: 'greedy',
          backgroundColor: mapBg,
        });

        mapRef.current = map;

        const overlay = new deck.GoogleMapsOverlay();
        overlay.setMap(map);
        overlayRef.current = overlay;

        setMapReady(true);
      } catch (err) {
        console.error('[DeckGLMap] Init error:', err);
        setError(err.message);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
    };
  }, []);

  // Update map center/zoom when origin/destination changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.panTo(center);
    mapRef.current.setZoom(zoom);
  }, [center, zoom]);

  // Apply theme change live — no remount needed
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({ styles: mapStyles, backgroundColor: mapBg });
  }, [mapStyles, mapBg]);

  // Fetch route polyline
  useEffect(() => {
    if (!origin || !destination) {
      setRoutePath(null);
      setRouteInfo(null);
      return;
    }

    let cancelled = false;

    async function loadRoute() {
      try {
        const result = await fetchDrivingRoutes(
          { lat: origin.lat, lng: origin.lng },
          { lat: destination.lat, lng: destination.lng },
          { alternatives: false }
        );

        if (cancelled) return;

        if (result.success && result.routes?.length > 0) {
          const route = result.routes[0];
          const decoded = decodePolyline(route.polyline);
          if (decoded.length > 0) {
            setRoutePath(decoded);
            setRouteInfo(route);
            onRouteLoaded?.(route);
          }
        }
      } catch (err) {
        console.warn('[DeckGLMap] Route fetch failed, using arc only:', err.message);
      }
    }

    if (routeType === 'driving' || routeType === 'bus') {
      loadRoute();
    }

    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, routeType]);

  // Color based on route type
  const routeColor = useMemo(() => {
    switch (routeType) {
      case 'air': return COLORS.cyan;
      case 'bus': return COLORS.orange;
      default: return COLORS.mint;
    }
  }, [routeType]);

  // Build and set deck.gl layers
  const updateLayers = useCallback(() => {
    const deck = deckRef.current;
    if (!overlayRef.current || !deck || !origin || !destination) return;

    const { ArcLayer, ScatterplotLayer, PathLayer } = deck;
    const layers = [];

    // 1. Route path layer (actual road route)
    if (routePath && routePath.length > 1) {
      layers.push(new PathLayer({
        id: 'route-glow',
        data: [{ path: routePath }],
        getPath: d => d.path,
        getColor: [...routeColor, 40],
        getWidth: 30,
        widthMinPixels: 8,
        widthMaxPixels: 30,
        capRounded: true,
        jointRounded: true,
        billboard: false,
      }));

      layers.push(new PathLayer({
        id: 'route-main',
        data: [{ path: routePath }],
        getPath: d => d.path,
        getColor: [...routeColor, 200],
        getWidth: 12,
        widthMinPixels: 3,
        widthMaxPixels: 12,
        capRounded: true,
        jointRounded: true,
        billboard: false,
      }));

      layers.push(new PathLayer({
        id: 'route-core',
        data: [{ path: routePath }],
        getPath: d => d.path,
        getColor: [255, 255, 255, 120],
        getWidth: 3,
        widthMinPixels: 1,
        widthMaxPixels: 3,
        capRounded: true,
        jointRounded: true,
        billboard: false,
      }));
    }

    // 2. Arc layer (futuristic arc for air routes or when no road path)
    if (showArc && (routeType === 'air' || !routePath)) {
      layers.push(new ArcLayer({
        id: 'route-arc-glow',
        data: [{ source: [origin.lng, origin.lat], target: [destination.lng, destination.lat] }],
        getSourcePosition: d => d.source,
        getTargetPosition: d => d.target,
        getSourceColor: [...routeColor, 60],
        getTargetColor: [...routeColor, 60],
        getWidth: 8,
        greatCircle: true,
      }));

      layers.push(new ArcLayer({
        id: 'route-arc',
        data: [{ source: [origin.lng, origin.lat], target: [destination.lng, destination.lat] }],
        getSourcePosition: d => d.source,
        getTargetPosition: d => d.target,
        getSourceColor: [...routeColor, 220],
        getTargetColor: [...COLORS.white, 200],
        getWidth: 3,
        greatCircle: true,
      }));
    }

    // 3. Origin & destination points
    const pointsData = [
      { position: [origin.lng, origin.lat], color: COLORS.mint },
      { position: [destination.lng, destination.lat], color: COLORS.orange },
    ];

    layers.push(new ScatterplotLayer({
      id: 'points-glow',
      data: pointsData,
      getPosition: d => d.position,
      getFillColor: d => [...d.color, 60],
      getRadius: 600,
      radiusMinPixels: 12,
      radiusMaxPixels: 30,
    }));

    layers.push(new ScatterplotLayer({
      id: 'points-core',
      data: pointsData,
      getPosition: d => d.position,
      getFillColor: d => [...d.color, 255],
      getRadius: 200,
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      stroked: true,
      lineWidthMinPixels: 2,
      getLineColor: [255, 255, 255, 180],
      getLineWidth: 2,
    }));

    overlayRef.current.setProps({ layers });
  }, [origin, destination, routePath, routeType, routeColor, showArc]);

  // Update layers when data changes
  useEffect(() => {
    if (mapReady) updateLayers();
  }, [mapReady, updateLayers]);

  // Error state
  if (error) {
    return (
      <div className={`relative rounded-2xl overflow-hidden bg-dark-900 flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center space-y-2">
          <p className="text-xs text-white/30">Erro ao carregar mapa</p>
          <p className="text-[10px] text-white/15">{error}</p>
        </div>
      </div>
    );
  }

  // Fallback when Google Maps is not loaded
  if (!isGoogleMapsLoaded() || !window.google?.maps) {
    return (
      <div className={`relative rounded-2xl overflow-hidden ${className}`} style={{ height }}>
        <div className="absolute inset-0 bg-gradient-to-br from-dark-800 to-dark-900 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <p className="text-xs text-white/30 font-medium">Mapa indisponivel</p>
            <p className="text-[10px] text-white/15">Configure VITE_GOOGLE_MAPS_API_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`} style={{ height }}>
      {/* Map container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Gradient overlays — theme-aware vignette */}
      <div
        className="absolute inset-x-0 top-0 h-12 pointer-events-none z-10"
        style={{ background: `linear-gradient(to bottom, rgba(${overlayFade}, 0.5), transparent)` }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none z-10"
        style={{ background: `linear-gradient(to top, rgba(${overlayFade}, 0.5), transparent)` }}
      />

      {/* Scan lines — mint stripe, very subtle in both themes */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          opacity: isDark ? 0.02 : 0.015,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(73,220,122,0.1) 2px, rgba(73,220,122,0.1) 4px)',
        }}
      />

      {/* Route info overlay */}
      {routeInfo && (
        <div className="absolute bottom-4 left-4 z-20">
          <div
            className="px-4 py-3 rounded-xl backdrop-blur-xl space-y-1.5"
            style={{
              background: panelBg,
              border: `1px solid ${panelBorder}`,
              boxShadow: `0 8px 24px rgba(${overlayFade}, 0.18)`,
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: `rgb(${routeColor.join(',')})` }} />
              <span className="text-[10px] font-semibold text-white/55 uppercase tracking-wider">Rota via {routeInfo.summary || 'Google Maps'}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-white">{routeInfo.distanceText}</span>
              <div className="w-px h-5 bg-white/[0.12]" />
              <span className="text-lg font-bold text-white/70">{routeInfo.durationText}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 z-20">
        <div
          className="px-3 py-2 rounded-lg backdrop-blur-xl space-y-1.5"
          style={{
            background: panelBg,
            border: `1px solid ${panelBorder}`,
          }}
        >
          {origin && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-mint" />
              <span className="text-[9px] text-white/60 font-medium">{origin.label || 'Origem'}</span>
            </div>
          )}
          {destination && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-orange" />
              <span className="text-[9px] text-white/60 font-medium">{destination.label || 'Destino'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Loading indicator */}
      {!mapReady && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: `rgba(${overlayFade}, 0.5)` }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-mint/30 border-t-mint rounded-full animate-spin" />
            <span className="text-xs text-white/50">Carregando mapa...</span>
          </div>
        </div>
      )}

      {origin && destination && !routePath && routeType !== 'air' && mapReady && (
        <div className="absolute top-4 left-4 z-20">
          <div
            className="px-3 py-2 rounded-lg backdrop-blur-xl flex items-center gap-2"
            style={{
              background: panelBg,
              border: `1px solid ${panelBorder}`,
            }}
          >
            <div className="w-3 h-3 border-2 border-mint/30 border-t-mint rounded-full animate-spin" />
            <span className="text-[10px] text-white/60 font-medium">Carregando rota...</span>
          </div>
        </div>
      )}
    </div>
  );
}
