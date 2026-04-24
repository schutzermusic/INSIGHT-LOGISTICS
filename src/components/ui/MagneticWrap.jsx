import { useMagnetic } from '../../hooks/useMagnetic';

/**
 * Invisible inline-block wrapper that gives its single child a magnetic
 * hover effect. The wrapper moves toward the cursor; the child keeps its
 * own transforms intact. Use around prominent CTAs (white buttons, mint
 * primary buttons) that should feel magnetic.
 *
 * Props:
 *   strength - max px offset toward cursor (default 6)
 *   className - extra classes on the wrapper
 */
export function MagneticWrap({ children, strength = 6, className = '' }) {
  const { ref, onMouseMove, onMouseLeave } = useMagnetic({ strength });
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`inline-block magnetic ${className}`}
    >
      {children}
    </div>
  );
}
