import { clsx } from 'clsx';

const variants = {
  default: 'bg-white/[0.06] text-white/60',
  mint: 'bg-mint/10 text-mint',
  orange: 'bg-accent-orange/10 text-accent-orange',
  cyan: 'bg-accent-cyan/10 text-accent-cyan',
  blue: 'bg-accent-blue/10 text-accent-blue',
  purple: 'bg-accent-purple/10 text-accent-purple',
  red: 'bg-accent-red/10 text-accent-red',
  amber: 'bg-accent-amber/10 text-accent-amber',
};

export function Badge({ children, variant = 'default', className, dot }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold',
        'backdrop-blur-sm',
        variants[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full',
          variant === 'mint' && 'bg-mint',
          variant === 'orange' && 'bg-accent-orange',
          variant === 'cyan' && 'bg-accent-cyan',
          variant === 'blue' && 'bg-accent-blue',
          variant === 'purple' && 'bg-accent-purple',
          variant === 'red' && 'bg-accent-red',
          variant === 'amber' && 'bg-accent-amber',
          variant === 'default' && 'bg-white/40',
        )} />
      )}
      {children}
    </span>
  );
}
