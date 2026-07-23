import { useCallback, useRef } from 'react';
import { useMotionPreference } from './useMotionPreference';

/**
 * Cursor-follow spotlight hook.
 * Writes --mx / --my CSS vars on the element so the `.spotlight` CSS
 * class can position its radial highlight. rAF-throttled to keep
 * updates cheap on long scrolls or grid hovers. Disabled in
 * reduced/off motion modes.
 */
export function useSpotlight() {
  const elRef = useRef(null);
  const frameRef = useRef(0);
  const { reduced } = useMotionPreference();

  const handleMove = useCallback((e) => {
    if (reduced) return;
    const el = elRef.current;
    if (!el) return;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const rect = el.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${mx}%`);
      el.style.setProperty('--my', `${my}%`);
    });
  }, [reduced]);

  return {
    ref: elRef,
    onMouseMove: handleMove,
  };
}
