/**
 * CesiumHudGlobe — a modern 3D HUD globe for confirmed active mobilizations (§4).
 *
 * Renders a self-hosted, tokenless CesiumJS globe (no Ion, no imagery tiles —
 * just a dark globe with atmosphere glow, so it works offline and CSP-safe) and
 * animates every confirmed mobilization ALONG its route in real time, keyed to
 * the current date: the CesiumJS clock runs at 1× real time, and each marker's
 * position is a SampledPositionProperty between the planned departure and the
 * expected arrival. Before departure it holds at the origin, after arrival it
 * holds at the destination — so what you see reflects "agora".
 *
 * Hospedagem (§6.1 accommodation): mobilizations that carry accommodation cost
 * get a hotel marker at the destination; it lights up once the team has arrived
 * and the operation is still running.
 *
 * Only the backend `activeMapItems` (confirmed | in_progress) reach this
 * component — drafts/previews/completed never appear. If WebGL/Cesium fails to
 * initialize it renders the lightweight SVG HUD as a graceful fallback (§18).
 */

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import * as Cesium from 'cesium';
import HudGlobe, { STATUS_COLOR, STATUS_LABEL } from './HudGlobe';
import { fetchDrivingRoutes } from '../../services/BackendApiClient';
import { decodeGooglePolyline } from '../../utils/googlePolyline';
import { BRAZIL_OUTLINE_FLAT } from './brazilOutline';

const MODAL_LABEL = { air: 'Aéreo', bus: 'Ônibus', rental: 'Locado', fleet: 'Frota', multimodal: 'Multimodal' };

/** Great-circle samples matching DeckGLMap's `greatCircle` fallback geometry. */
function arcSamples(Cesium, o, d, n, maxHeight) {
  const geodesic = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(o.lng, o.lat),
    Cesium.Cartographic.fromDegrees(d.lng, d.lat),
  );
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cartographic = geodesic.interpolateUsingFraction(t, new Cesium.Cartographic());
    const h = maxHeight * Math.sin(Math.PI * t);
    pts.push(Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      h,
    ));
  }
  return pts;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const roadRouteCache = new Map();
const isRoadModal = (modal) => modal === 'bus' || modal === 'rental' || modal === 'fleet';
const routeKey = (item) => [
  item.origin.lat, item.origin.lng, item.destination.lat, item.destination.lng,
].join(':');

function roadSamples(Cesium, coordinates) {
  return coordinates.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat, 0));
}

/** Allocate travel time by distance, so the live marker moves naturally. */
function cumulativeRouteProgress(coordinates) {
  if (coordinates.length < 2) return coordinates.map(() => 0);
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [previousLng, previousLat] = coordinates[i - 1];
    const [lng, lat] = coordinates[i];
    cumulative.push(cumulative[i - 1] + haversineKm(
      { lat: previousLat, lng: previousLng },
      { lat, lng },
    ));
  }
  const total = cumulative.at(-1) || 1;
  return cumulative.map((distance) => distance / total);
}

export default function CesiumHudGlobe({ items = [], onSelect, className, height = 300 }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cesiumRef = useRef(null);
  const handlerRef = useRef(null);
  const spinRef = useRef({ enabled: false });
  const dprCleanupRef = useRef(null);
  const routesRef = useRef(null);   // routes live here, so clearing them
                                    // never touches the Brazil outline
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [roadRoutes, setRoadRoutes] = useState({});

  // Initialize the viewer once.
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (() => {
      try {
        if (cancelled || !containerRef.current) return;
        cesiumRef.current = Cesium;

        // Cesium Ion token (optional). Must be exposed to the client via a
        // VITE_-prefixed var. With a token we use high-quality Cesium World
        // Imagery; without it we fall back to free CARTO dark tiles.
        const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
          || import.meta.env.VITE_PUBLIC_CESIUM_ION_TOKEN
          || import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
          || '';
        if (ionToken) { try { Cesium.Ion.defaultAccessToken = ionToken; } catch { /* noop */ } }

        const viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,            // no imagery → no Ion token needed
          baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, animation: false,
          timeline: false, fullscreenButton: false, infoBox: false,
          selectionIndicator: false, shouldAnimate: true, scene3DOnly: true,
          contextOptions: { webgl: { alpha: true, antialias: true, powerPreference: 'high-performance' } },
          msaaSamples: 4,
        });
        viewerRef.current = viewer;

        const scene = viewer.scene;

        // Routes get their own data source. The realtime poll wipes and
        // rebuilds them every tick, and a blanket viewer.entities.removeAll()
        // would take the Brazil outline with it.
        const routes = new Cesium.CustomDataSource('routes');
        viewer.dataSources.add(routes);
        routesRef.current = routes;

        // ── Retina / 4K rendering ──────────────────────────────────────────
        // Cesium defaults to the "browser recommended" resolution, which caps
        // the drawing buffer at 1 CSS pixel per device pixel on many setups —
        // that is what makes the globe read soft on a 4K/Retina panel. Opting
        // out and driving resolutionScale from devicePixelRatio renders at the
        // panel's true pixel density. Capped at 2× because 3× on a 4K display
        // quadruples fragment work for no visible gain.
        scene.useBrowserRecommendedResolution = false;
        const applyResolution = () => {
          viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
        };
        applyResolution();
        // devicePixelRatio changes when the window moves between displays or
        // the user zooms; matchMedia is the only event that reports it.
        let dprQuery = null;
        const watchDpr = () => {
          dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
          dprQuery.addEventListener('change', onDprChange, { once: true });
        };
        const onDprChange = () => { applyResolution(); watchDpr(); };
        watchDpr();
        dprCleanupRef.current = () => dprQuery?.removeEventListener('change', onDprChange);

        if (scene.postProcessStages?.fxaa) scene.postProcessStages.fxaa.enabled = true;

        scene.backgroundColor = Cesium.Color.TRANSPARENT;
        scene.globe.baseColor = Cesium.Color.fromCssColorString('#0B1A15'); // deep green globe
        scene.globe.showGroundAtmosphere = true;
        scene.globe.enableLighting = false;
        scene.skyBox && (scene.skyBox.show = false);
        scene.sun && (scene.sun.show = false);
        scene.moon && (scene.moon.show = false);
        scene.fog.enabled = false;
        if (scene.skyAtmosphere) { scene.skyAtmosphere.show = true; scene.skyAtmosphere.brightnessShift = 0.15; }
        viewer.cesiumWidget.creditContainer.style.display = 'none';

        // ── Brazil outline ────────────────────────────────────────────────
        // A dashed border traced on the real country, drawn once and kept out
        // of viewer.entities so the per-poll `entities.removeAll()` that
        // rebuilds routes never wipes it. Ground-clamped so it follows the
        // terrain instead of floating over it.
        // GroundPolylinePrimitive needs specific WebGL support; on hardware
        // that lacks it the constructor throws, which would take the whole
        // viewer init down into the SVG fallback. Guard, and degrade to a
        // plain (unclamped) outline instead of losing the globe.
        if (Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)) {
        viewer.scene.primitives.add(
          new Cesium.GroundPolylinePrimitive({
            geometryInstances: new Cesium.GeometryInstance({
              geometry: new Cesium.GroundPolylineGeometry({
                positions: Cesium.Cartesian3.fromDegreesArray(BRAZIL_OUTLINE_FLAT),
                width: 1.6,
              }),
            }),
            appearance: new Cesium.PolylineMaterialAppearance({
              material: Cesium.Material.fromType('PolylineDash', {
                color: Cesium.Color.fromCssColorString('#F39444').withAlpha(0.55),
                gapColor: Cesium.Color.TRANSPARENT,
                dashLength: 14,
              }),
            }),
          }),
        );
        } else {
          viewer.entities.add({
            id: '__brazil-outline',
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(BRAZIL_OUTLINE_FLAT),
              width: 1.6,
              material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.fromCssColorString('#F39444').withAlpha(0.55),
                gapColor: Cesium.Color.TRANSPARENT,
                dashLength: 14,
              }),
            },
          });
        }

        // Basemap so the actual geography (Brazil, coastlines, borders) shows on
        // the globe. With an Ion token → Cesium World Imagery (satellite); else →
        // free CARTO dark tiles. If neither loads (offline), the dark globe + grid
        // still render.
        const addCarto = () => viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          credit: '© OpenStreetMap contributors © CARTO',
          maximumLevel: 18,
        }));
        try {
          if (ionToken && typeof Cesium.ImageryLayer?.fromWorldImagery === 'function') {
            const layer = Cesium.ImageryLayer.fromWorldImagery({});
            layer.brightness = 0.85;   // tone the satellite imagery toward the HUD
            layer.saturation = 0.9;
            viewer.imageryLayers.add(layer);
          } else {
            addCarto();
          }
        } catch {
          try { addCarto(); } catch { /* basemap is best-effort */ }
        }

        // Real-time clock keyed to the current date.
        viewer.clock.currentTime = Cesium.JulianDate.now();
        viewer.clock.multiplier = 1;
        viewer.clock.shouldAnimate = true;
        viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;

        // Frame Brazil front-and-center.
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-52, -14, 8_500_000) });

        // Gentle idle auto-rotation until the user interacts.
        const stopSpin = () => { spinRef.current.enabled = false; };
        scene.canvas.addEventListener('pointerdown', stopSpin);
        scene.canvas.addEventListener('wheel', stopSpin);
        viewer.clock.onTick.addEventListener(() => {
          if (spinRef.current.enabled) scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004);
        });

        // Pick handling for hover tooltip + click drill-down.
        const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
        handlerRef.current = handler;
        handler.setInputAction((m) => {
          const picked = scene.pick(m.endPosition);
          const item = picked?.id?.__item;
          if (item) {
            setTooltip({ x: m.endPosition.x, y: m.endPosition.y, item });
            scene.canvas.style.cursor = 'pointer';
          } else {
            setTooltip(null);
            scene.canvas.style.cursor = 'grab';
          }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        handler.setInputAction((m) => {
          const picked = scene.pick(m.position);
          if (picked?.id?.__item) onSelect?.(picked.id.__item);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        setReady(true);
        cleanup = () => {
          scene.canvas.removeEventListener('pointerdown', stopSpin);
          scene.canvas.removeEventListener('wheel', stopSpin);
        };
      } catch (err) {
        console.error('[CesiumHudGlobe] init failed, falling back to 2D HUD:', err?.message);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      try { dprCleanupRef.current?.(); } catch { /* noop */ }
      try { handlerRef.current?.destroy?.(); } catch { /* noop */ }
      try { viewerRef.current?.destroy?.(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Road operations use the same backend polyline as the bus map. The cache
  // prevents the dashboard's realtime refresh from repeating identical calls.
  useEffect(() => {
    let cancelled = false;
    const roadItems = items.filter((item) => (
      isRoadModal(item.modal)
      && Number.isFinite(item.origin?.lat)
      && Number.isFinite(item.destination?.lat)
    ));

    Promise.all(roadItems.map(async (item) => {
      const key = routeKey(item);
      if (!roadRouteCache.has(key)) {
        roadRouteCache.set(key, fetchDrivingRoutes(
          { lat: item.origin.lat, lng: item.origin.lng },
          { lat: item.destination.lat, lng: item.destination.lng },
          { alternatives: false },
        ).then((result) => {
          const encoded = result.success ? result.routes?.[0]?.polyline : '';
          const coordinates = decodeGooglePolyline(encoded);
          return coordinates.length > 1 ? coordinates : null;
        }).catch(() => null));
      }
      const coordinates = await roadRouteCache.get(key);
      if (!coordinates) roadRouteCache.delete(key);
      return [key, coordinates];
    })).then((entries) => {
      if (!cancelled) setRoadRoutes(Object.fromEntries(entries));
    });

    return () => { cancelled = true; };
  }, [items]);

  // (Re)build entities whenever the active items change (realtime poll).
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !ready) return;

    const routes = routesRef.current;
    if (!routes) return;
    routes.entities.suspendEvents();
    routes.entities.removeAll();

    for (const it of items) {
      if (!Number.isFinite(it.origin?.lat) || !Number.isFinite(it.destination?.lat)) continue;
      const color = Cesium.Color.fromCssColorString(
        it.modal === 'multimodal' && it.status !== 'delayed' ? '#A855F7' : (STATUS_COLOR[it.status] || '#49DC7A')
      );
      const distKm = haversineKm(it.origin, it.destination);
      const maxH = 120000 + distKm * 220; // parabola apex height
      const coordinates = roadRoutes[routeKey(it)];
      const followsRoad = isRoadModal(it.modal) && coordinates?.length > 1;
      const samples = followsRoad
        ? roadSamples(Cesium, coordinates)
        : arcSamples(Cesium, it.origin, it.destination, 64, maxH);
      const routeProgress = followsRoad
        ? cumulativeRouteProgress(coordinates)
        : samples.map((_, index) => index / (samples.length - 1));

      // ── Route rendering, by modal ─────────────────────────────────────
      // The two modals must not look alike, because they are not alike:
      //
      //   road  follows the real driving polyline from the routing backend
      //         (same source as the 2D bus map) and is clamped to the ground,
      //         so it reads as a highway drawn on the country.
      //   air   is an elevated great-circle arc that leaves the surface and
      //         crosses the map, with a glow that sells the altitude.
      //
      // Falling back to the arc when the road polyline is missing is
      // deliberate: a straight line on the ground would imply a road that
      // does not exist.
      if (followsRoad) {
        // Ground-clamped highway. A dashed core over a faint solid casing
        // reads as a route line rather than a border.
        routes.entities.add({
          __item: it,
          polyline: {
            positions: samples,
            width: 5,
            clampToGround: true,
            material: color.withAlpha(0.18),
          },
        });
        routes.entities.add({
          __item: it,
          polyline: {
            positions: samples,
            width: 2,
            clampToGround: true,
            material: new Cesium.PolylineDashMaterialProperty({
              color: color.withAlpha(0.95),
              gapColor: Cesium.Color.TRANSPARENT,
              dashLength: 18,
            }),
          },
        });
      } else {
        // Airborne arc: a glow pass for the halo, then a crisp core on top.
        routes.entities.add({
          __item: it,
          polyline: {
            positions: samples,
            width: 7,
            material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.45, color: color.withAlpha(0.35) }),
            arcType: Cesium.ArcType.NONE,
          },
        });
        routes.entities.add({
          __item: it,
          polyline: {
            positions: samples,
            width: 1.6,
            material: color.withAlpha(0.95),
            arcType: Cesium.ArcType.NONE,
          },
        });
        // Dropline at the apex — gives the arc a readable height off the map.
        const apex = samples[Math.floor(samples.length / 2)];
        const apexCarto = Cesium.Cartographic.fromCartesian(apex);
        routes.entities.add({
          __item: it,
          polyline: {
            positions: [
              apex,
              Cesium.Cartesian3.fromRadians(apexCarto.longitude, apexCarto.latitude, 0),
            ],
            width: 1,
            material: new Cesium.PolylineDashMaterialProperty({
              color: color.withAlpha(0.28),
              gapColor: Cesium.Color.TRANSPARENT,
              dashLength: 8,
            }),
            arcType: Cesium.ArcType.NONE,
          },
        });
      }

      // Origin (filled) + destination (ring) nodes.
      routes.entities.add({
        __item: it,
        position: Cesium.Cartesian3.fromDegrees(it.origin.lng, it.origin.lat),
        point: { pixelSize: 8, color: color.withAlpha(0.95), outlineColor: Cesium.Color.WHITE.withAlpha(0.5), outlineWidth: 1 },
      });
      routes.entities.add({
        __item: it,
        position: Cesium.Cartesian3.fromDegrees(it.destination.lng, it.destination.lat),
        point: { pixelSize: 9, color: Cesium.Color.TRANSPARENT, outlineColor: color, outlineWidth: 2 },
      });

      // Real-time moving marker along the arc (departure → arrival).
      const dep = Date.parse(it.plannedDepartureAt);
      const arr = Date.parse(it.estimatedArrivalAt);
      if (Number.isFinite(dep) && Number.isFinite(arr) && arr > dep) {
        const pos = new Cesium.SampledPositionProperty();
        const start = Cesium.JulianDate.fromDate(new Date(dep));
        const total = arr - dep;
        samples.forEach((p, i) => {
          const t = routeProgress[i];
          pos.addSample(Cesium.JulianDate.addSeconds(start, (total * t) / 1000, new Cesium.JulianDate()), p);
        });
        pos.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        pos.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        routes.entities.add({
          __item: it,
          position: pos,
          point: { pixelSize: 11, color, outlineColor: Cesium.Color.WHITE.withAlpha(0.85), outlineWidth: 1.5 },
          label: {
            text: `${it.projectName}`,
            font: "600 11px 'Helvetica Neue LT', 'Helvetica Neue', sans-serif",
            fillColor: Cesium.Color.WHITE.withAlpha(0.85),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#0b0f1a').withAlpha(0.7),
            pixelOffset: new Cesium.Cartesian2(0, -18),
            scale: 0.9,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6_000_000),
          },
        });
      }

      // Hospedagem — hotel marker at the destination.
      if (it.lodging?.hasLodging) {
        const active = it.lodging.active;
        routes.entities.add({
          __item: it,
          position: Cesium.Cartesian3.fromDegrees(it.destination.lng, it.destination.lat, 20000),
          label: {
            text: active ? '🏨' : '🛏',
            font: '18px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -14),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
          },
          point: {
            pixelSize: active ? 7 : 5,
            color: Cesium.Color.fromCssColorString(active ? '#F97316' : '#8A94A6').withAlpha(active ? 0.95 : 0.6),
            outlineColor: Cesium.Color.WHITE.withAlpha(0.4), outlineWidth: 1,
          },
        });
      }
    }

    routes.entities.resumeEvents();
    viewer.scene.requestRender();
  }, [items, ready, roadRoutes]);

  if (failed) {
    return <HudGlobe items={items} onSelect={onSelect} className={className} />;
  }

  return (
    <div className={clsx('relative overflow-hidden', className)} style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 50% 35%, #0E1B16 0%, #050C0A 72%)' }} />

      {/* Live corner tag */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(14,27,22,0.72)', border: '1px solid rgba(248,248,248,0.14)' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        <span className="label-micro">3D · tempo real</span>
      </div>

      {!ready && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent/25 border-t-accent rounded-full animate-spin" />
            <span className="text-xs text-white/50">Carregando globo…</span>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div className="absolute z-30 pointer-events-none px-3 py-2 rounded-lg" style={{
          left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 300) - 190),
          top: Math.max(8, tooltip.y - 10),
          background: 'rgba(10,21,17,0.94)', border: `1px solid ${STATUS_COLOR[tooltip.item.status] || '#49DC7A'}55`,
          maxWidth: 200,
        }}>
          <div className="text-[11px] font-semibold text-white/90 truncate">{tooltip.item.projectName}</div>
          <div className="text-[10px] mt-0.5" style={{ color: STATUS_COLOR[tooltip.item.status] }}>
            {tooltip.item.origin.label?.split(' - ')[0]} → {tooltip.item.destination.label?.split(' - ')[0]} · {STATUS_LABEL[tooltip.item.status] || tooltip.item.status}
          </div>
          <div className="text-[10px] text-white/45 mt-0.5">
            {MODAL_LABEL[tooltip.item.modal] || tooltip.item.modal} · {tooltip.item.teamSize} pax · {tooltip.item.progressPercentage}%
            {tooltip.item.lodging?.hasLodging ? ` · 🏨 ${tooltip.item.lodging.nights}n` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
