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

const MODAL_LABEL = { air: 'Aéreo', bus: 'Ônibus', rental: 'Locado', fleet: 'Frota', multimodal: 'Multimodal' };

/** Rough great-circle-ish arced samples (lon/lat lerp + parabolic height). */
function arcSamples(Cesium, o, d, n, maxHeight) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lng = o.lng + (d.lng - o.lng) * t;
    const lat = o.lat + (d.lat - o.lat) * t;
    const h = maxHeight * Math.sin(Math.PI * t);
    pts.push(Cesium.Cartesian3.fromDegrees(lng, lat, h));
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

export default function CesiumHudGlobe({ items = [], onSelect, className, height = 300 }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cesiumRef = useRef(null);
  const handlerRef = useRef(null);
  const spinRef = useRef({ enabled: false });
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState(null);

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
          contextOptions: { webgl: { alpha: true, antialias: true } },
        });
        viewerRef.current = viewer;

        const scene = viewer.scene;
        scene.backgroundColor = Cesium.Color.TRANSPARENT;
        scene.globe.baseColor = Cesium.Color.fromCssColorString('#0e2138'); // visible dark-blue globe
        scene.globe.showGroundAtmosphere = true;
        scene.globe.enableLighting = false;
        scene.skyBox && (scene.skyBox.show = false);
        scene.sun && (scene.sun.show = false);
        scene.moon && (scene.moon.show = false);
        scene.fog.enabled = false;
        if (scene.skyAtmosphere) { scene.skyAtmosphere.show = true; scene.skyAtmosphere.brightnessShift = 0.15; }
        viewer.cesiumWidget.creditContainer.style.display = 'none';

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

        // Procedural lat/long HUD grid on top — no assets, gives the command-center
        // wireframe overlay.
        try {
          const grid = viewer.imageryLayers.addImageryProvider(new Cesium.GridImageryProvider({
            cells: 8,
            color: Cesium.Color.fromCssColorString('#22f2ef').withAlpha(0.18),
            glowColor: Cesium.Color.fromCssColorString('#22f2ef').withAlpha(0.04),
            backgroundColor: Cesium.Color.TRANSPARENT,
          }));
          grid.alpha = 0.35;
        } catch { /* grid is cosmetic */ }

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
      try { handlerRef.current?.destroy?.(); } catch { /* noop */ }
      try { viewerRef.current?.destroy?.(); } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (Re)build entities whenever the active items change (realtime poll).
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !ready) return;

    viewer.entities.suspendEvents();
    viewer.entities.removeAll();

    for (const it of items) {
      if (!Number.isFinite(it.origin?.lat) || !Number.isFinite(it.destination?.lat)) continue;
      const color = Cesium.Color.fromCssColorString(
        it.modal === 'multimodal' && it.status !== 'delayed' ? '#A855F7' : (STATUS_COLOR[it.status] || '#49DC7A')
      );
      const distKm = haversineKm(it.origin, it.destination);
      const maxH = 120000 + distKm * 220; // parabola apex height
      const samples = arcSamples(Cesium, it.origin, it.destination, 64, maxH);

      // Glowing route arc.
      viewer.entities.add({
        __item: it,
        polyline: {
          positions: samples,
          width: 2.5,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: color.withAlpha(0.85) }),
          arcType: Cesium.ArcType.NONE,
        },
      });

      // Origin (filled) + destination (ring) nodes.
      viewer.entities.add({
        __item: it,
        position: Cesium.Cartesian3.fromDegrees(it.origin.lng, it.origin.lat),
        point: { pixelSize: 8, color: color.withAlpha(0.95), outlineColor: Cesium.Color.WHITE.withAlpha(0.5), outlineWidth: 1 },
      });
      viewer.entities.add({
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
          const t = i / (samples.length - 1);
          pos.addSample(Cesium.JulianDate.addSeconds(start, (total * t) / 1000, new Cesium.JulianDate()), p);
        });
        pos.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        pos.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        viewer.entities.add({
          __item: it,
          position: pos,
          point: { pixelSize: 11, color, outlineColor: Cesium.Color.WHITE.withAlpha(0.85), outlineWidth: 1.5 },
          label: {
            text: `${it.projectName}`,
            font: '600 11px Outfit, sans-serif',
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
        viewer.entities.add({
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

    viewer.entities.resumeEvents();
    viewer.scene.requestRender();
  }, [items, ready]);

  if (failed) {
    return <HudGlobe items={items} onSelect={onSelect} className={className} />;
  }

  return (
    <div className={clsx('relative overflow-hidden rounded-2xl', className)} style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 50% 30%, #0d1526 0%, #070a12 70%)' }} />

      {/* HUD scan-line overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        opacity: 0.04,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,242,239,0.14) 2px, rgba(34,242,239,0.14) 3px)',
      }} />

      {/* Live corner tag */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(11,15,26,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan/60 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan" />
        </span>
        <span className="label-micro text-white/60">3D · tempo real</span>
      </div>

      {!ready && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
            <span className="text-xs text-white/50">Carregando globo…</span>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div className="absolute z-30 pointer-events-none px-3 py-2 rounded-lg" style={{
          left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 300) - 190),
          top: Math.max(8, tooltip.y - 10),
          background: 'rgba(11,15,26,0.92)', border: `1px solid ${STATUS_COLOR[tooltip.item.status] || '#49DC7A'}55`,
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
