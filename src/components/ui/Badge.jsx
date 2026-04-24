import { clsx } from 'clsx';

const variants = {
  neutral: 'bg-white/[0.06] text-white/60 border border-white/[0.08]',
  success: 'bg-success-bg/70 text-success-text border border-success-border/25 shadow-[0_0_14px_rgb(var(--color-success-glow)/0.08)]',
  warning: 'bg-warning-bg/70 text-warning-text border border-warning-border/25 shadow-[0_0_14px_rgb(var(--color-warning-glow)/0.08)]',
  danger: 'bg-danger-bg/70 text-danger-text border border-danger-border/25 shadow-[0_0_14px_rgb(var(--color-danger-glow)/0.08)]',
  info: 'bg-info-bg/70 text-info-text border border-info-border/25 shadow-[0_0_14px_rgb(var(--color-info-glow)/0.08)]',
  accent: 'bg-accent-bg/70 text-accent-text border border-accent-border/25 shadow-[0_0_14px_rgb(var(--color-accent-glow)/0.08)]',
};

const dotVariants = {
  neutral: 'bg-white/45',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
};

const textVariants = {
  neutral: 'text-white/60',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
  accent: 'text-accent-text',
};

const aliases = {
  default: 'neutral',
  mint: 'success',
  orange: 'accent',
  cyan: 'info',
  blue: 'info',
  purple: 'accent',
  red: 'danger',
  amber: 'warning',
};

function resolveVariant(variant) {
  return aliases[variant] || variant || 'neutral';
}

export function Badge({ children, variant = 'neutral', className, dot, compact = false }) {
  const resolvedVariant = resolveVariant(variant);

  return (
    <span
      className={clsx(
        compact
          ? 'inline-flex items-center gap-2 rounded-full px-0 py-0 text-[11px] font-semibold tabular-data'
          : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-data backdrop-blur-sm',
        compact
          ? textVariants[resolvedVariant] || textVariants.neutral
          : variants[resolvedVariant] || variants.neutral,
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            compact
              ? 'w-2 h-2 rounded-full shadow-[0_0_0_2px_rgb(var(--background))]'
              : 'w-1.5 h-1.5 rounded-full',
            dotVariants[resolvedVariant] || dotVariants.neutral,
          )}
        />
      )}
      {children}
    </span>
  );
}
