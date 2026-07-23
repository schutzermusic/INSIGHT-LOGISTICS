import { useEffect, useMemo, useState } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import { motionDurationSec, motionEase } from '../../lib/motion';
import { useMotionPreference } from '../../hooks/useMotionPreference';

function defaultFormatter(value) {
  return String(value);
}

export function AnimatedNumber({
  value,
  format = defaultFormatter,
  as: Component = 'span',
  className,
}) {
  const numericValue = Number.isFinite(value) ? value : 0;
  const { mode } = useMotionPreference();
  const motionValue = useMotionValue(numericValue);
  const [displayValue, setDisplayValue] = useState(numericValue);

  useEffect(() => {
    // In reduced/off modes, skip the count-up and snap to the target.
    if (mode !== 'full') {
      motionValue.set(numericValue);
      setDisplayValue(numericValue);
      return undefined;
    }

    if (motionValue.get() === numericValue) {
      setDisplayValue(numericValue);
      return undefined;
    }

    const controls = animate(motionValue, numericValue, {
      duration: motionDurationSec.medium,
      ease: motionEase.out,
      onUpdate: (latest) => setDisplayValue(latest),
    });

    return () => controls.stop();
  }, [motionValue, numericValue, mode]);

  const formatted = useMemo(() => format(displayValue), [displayValue, format]);

  return <Component className={className}>{formatted}</Component>;
}
