import { Sparkles, Gauge, Minus, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useMotionPreference } from '../../hooks/useMotionPreference';
import { motionDurationSec, motionEase, resolveTransition } from '../../lib/motion';

// Phase 4C — minimal preference control paired with ThemeToggle.
// Cycles: system → full → reduced → off → system …
// A full settings UI is intentionally out of scope; when one exists,
// swap this single-button cycler for a proper segmented control bound
// to `setPreference`.

const CONFIG = {
  system: {
    Icon: Monitor,
    label: 'Animações: seguindo sistema',
    color: 'rgb(148 163 184)',
    glow: 'rgba(148, 163, 184, 0.14)',
  },
  full: {
    Icon: Sparkles,
    label: 'Animações: completas',
    color: 'rgb(var(--mint-ink))',
    glow: 'rgba(73, 220, 122, 0.14)',
  },
  reduced: {
    Icon: Gauge,
    label: 'Animações: reduzidas',
    color: 'rgb(34 242 239)',
    glow: 'rgba(34, 242, 239, 0.14)',
  },
  off: {
    Icon: Minus,
    label: 'Animações: desativadas',
    color: 'rgb(148 163 184)',
    glow: 'rgba(148, 163, 184, 0.08)',
  },
};

export function MotionToggle({ className }) {
  const { preference, mode, cycle } = useMotionPreference();
  const current = CONFIG[preference] ?? CONFIG.system;
  const { Icon, label, color, glow } = current;

  const iconTransition = resolveTransition(mode, {
    duration: motionDurationSec.small,
    ease: motionEase.out,
  });

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className={clsx(
        'relative flex items-center justify-center',
        'w-9 h-9 rounded-xl',
        'transition-[background-color,box-shadow,transform] duration-[var(--motion-duration-small)] ease-[var(--motion-ease-out)]',
        className,
      )}
      style={{
        background: 'rgb(var(--glass-ink) / 0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow:
          '0 0 0 1px rgb(var(--glass-ink) / 0.12), 0 2px 8px rgb(var(--shadow-ink) / 0.08)',
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-[var(--motion-duration-medium)] ease-[var(--motion-ease-out)]"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 70%)`,
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={preference}
          initial={mode === 'off' ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={mode === 'off' ? { opacity: 1 } : { opacity: 0, scale: 0.6 }}
          transition={iconTransition}
          className="relative flex"
        >
          <Icon className="w-[15px] h-[15px]" strokeWidth={2} style={{ color }} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
