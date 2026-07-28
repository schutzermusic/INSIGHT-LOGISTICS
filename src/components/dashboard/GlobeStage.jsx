/**
 * GlobeStage — the live operations canvas.
 *
 * A contained block in the normal document flow, sitting below the KPI rail.
 * It is deliberately NOT a fixed page background: as a background it collided
 * with the navbar above and showed through the analytics panels below.
 *
 * Composition, bottom to top:
 *   0. the Cesium globe, filling the block
 *   1. a vignette that fades the edges into the page background, so the block
 *      has no hard frame and reads as a stage rather than a boxed widget
 *   2. HUD overlays (title, live tag, legend) placed ON the canvas
 *
 * Clearance is part of the component, not left to the caller: `scroll-mt`
 * keeps it clear of the fixed navbar when scrolled to, and the wrapper owns
 * its own vertical breathing room.
 */

import { lazy, Suspense } from 'react';
import HudGlobe, { STATUS_COLOR, STATUS_LABEL } from '../map/HudGlobe';

const CesiumHudGlobe = lazy(() => import('../map/CesiumHudGlobe'));

const STATUSES = ['on_track', 'in_transit', 'warning', 'delayed'];

export default function GlobeStage({ items = [], onSelect, activeCount }) {
  const count = activeCount ?? items.length;

  return (
    <section
      id="operacoes-ao-vivo"
      // scroll-mt clears the fixed navbar; the vertical padding is what keeps
      // the canvas from crowding the KPI rail above and the charts below.
      className="scroll-mt-28 pt-2 pb-1"
      aria-label="Operações ao vivo"
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ height: 'clamp(420px, 54vh, 640px)' }}
      >
        <div className="absolute inset-0">
          <Suspense
            fallback={<HudGlobe items={items} onSelect={onSelect} className="w-full h-full" />}
          >
            <CesiumHudGlobe
              items={items}
              height="100%"
              onSelect={onSelect}
              className="w-full h-full"
            />
          </Suspense>
        </div>

        {/* Edge vignette — dissolves the frame so the globe reads as a stage.
            pointer-events-none so the globe stays draggable underneath. */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(112% 92% at 50% 44%, transparent 24%, rgb(var(--page-base) / 0.35) 58%, rgb(var(--page-base)) 84%)',
          }}
        />

        {/* Top-left: what the canvas is showing. */}
        <div className="absolute top-5 left-5 z-20 pointer-events-none">
          <h3 className="heading">Operações ao vivo</h3>
          <p className="label-micro mt-1">{count} operações ativas</p>
        </div>

        {/* Bottom: status legend, on the canvas. */}
        <div className="absolute bottom-5 left-5 right-5 z-20 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pointer-events-none">
          {STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5 label-micro">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[s] }}
              />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>

        {count === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none">
            <p className="body text-[13px] text-center max-w-sm glass-panel px-4 py-3">
              Nenhuma mobilização confirmada ativa — confirme uma mobilização para vê-la
              orbitando o globo.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
