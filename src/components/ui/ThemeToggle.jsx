import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../hooks/useTheme';
import { clsx } from 'clsx';

/**
 * Premium theme toggle.
 * Frosted glass pill with color-matched glow:
 *   dark mode → cyan glow (moon)
 *   light mode → amber glow (sun)
 */
export function ThemeToggle({ className }) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={clsx(
        'relative flex items-center justify-center',
        'w-9 h-9 rounded-xl',
        'transition-all duration-300',
        className,
      )}
      style={{
        background: isDark
          ? 'rgb(var(--glow-cyan) / 0.08)'
          : 'rgb(245 158 11 / 0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: isDark
          ? '0 0 0 1px rgb(var(--glow-cyan) / 0.16), 0 2px 8px rgb(var(--shadow-ink) / 0.10)'
          : '0 0 0 1px rgb(245 158 11 / 0.20), 0 2px 8px rgb(var(--shadow-ink) / 0.06)',
      }}
    >
      {/* Radial glow behind icon */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl pointer-events-none transition-all duration-500"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 50% 50%, rgb(var(--glow-cyan) / 0.12) 0%, transparent 70%)'
            : 'radial-gradient(circle at 50% 50%, rgb(245 158 11 / 0.14) 0%, transparent 70%)',
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -30, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.5 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="relative flex"
          >
            <Moon
              className="w-[15px] h-[15px]"
              strokeWidth={2}
              style={{ color: 'rgb(var(--cyan-ink))' }}
            />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 30, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -30, scale: 0.5 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="relative flex"
          >
            <Sun
              className="w-[15px] h-[15px]"
              strokeWidth={2}
              style={{ color: 'rgb(245 158 11)' }}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
