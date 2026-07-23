import { motion } from 'framer-motion';
import { resolveStaggerVariants } from '../../lib/motion';
import { useMotionPreference } from '../../hooks/useMotionPreference';

export function MotionStagger({
  children,
  className,
  as = 'div',
  inView = false,
  once = true,
  fast = false,
}) {
  const { mode } = useMotionPreference();
  const MotionComponent = motion[as] || motion.div;

  if (mode === 'off') {
    return <MotionComponent className={className}>{children}</MotionComponent>;
  }

  const { container } = resolveStaggerVariants(mode, { fast });
  const viewProps = inView
    ? {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once, amount: 0.2 },
      }
    : {
        initial: 'hidden',
        animate: 'visible',
      };

  return (
    <MotionComponent className={className} variants={container} {...viewProps}>
      {children}
    </MotionComponent>
  );
}

export function MotionStaggerItem({
  children,
  className,
  as = 'div',
}) {
  const { mode } = useMotionPreference();
  const MotionComponent = motion[as] || motion.div;

  if (mode === 'off') {
    return <MotionComponent className={className}>{children}</MotionComponent>;
  }

  const { item } = resolveStaggerVariants(mode);

  return (
    <MotionComponent className={className} variants={item}>
      {children}
    </MotionComponent>
  );
}
