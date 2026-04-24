import { useCallback, useRef } from 'react';

/**
 * Magnetic hover hook for CTAs.
 * Subtly translates the element toward the cursor while hovering and
 * snaps back on mouse leave. rAF-throttled. Respects reduced-motion.
 *
 * strength: max pixel offset at the far edge of the element (default 8)
 */
export function useMagnetic({ strength = 8 } = {}) {
  const elRef = useRef(null);
  const frameRef = useRef(0);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const handleMove = useCallback((e) => {
    if (reducedMotion.current) return;
    const el = elRef.current;
    if (!el) return;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      const nx = Math.max(-1, Math.min(1, x / (rect.width / 2)));
      const ny = Math.max(-1, Math.min(1, y / (rect.height / 2)));
      el.style.setProperty('--mag-x', `${nx * strength}px`);
      el.style.setProperty('--mag-y', `${ny * strength}px`);
    });
  }, [strength]);

  const handleLeave = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.setProperty('--mag-x', '0px');
    el.style.setProperty('--mag-y', '0px');
  }, []);

  return {
    ref: elRef,
    onMouseMove: handleMove,
    onMouseLeave: handleLeave,
  };
}
