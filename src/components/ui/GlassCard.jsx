import { clsx } from 'clsx';

export function GlassCard({ children, className, hover = false, glow, padding = 'p-6', onClick, ...props }) {
  return (
    <div
      className={clsx(
        hover ? 'glass-card-interactive' : 'glass-card',
        padding,
        glow === 'mint' && 'glow-border-mint',
        glow === 'orange' && 'glow-border-orange',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassCardHeader({ children, className, action }) {
  return (
    <div className={clsx('flex items-center justify-between mb-6', className)}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function GlassCardTitle({ children, className, icon: Icon }) {
  return (
    <h4 className={clsx('text-base font-semibold text-white flex items-center gap-2.5', className)}>
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-mint/[0.08] flex items-center justify-center">
          <Icon className="w-[15px] h-[15px] text-mint/60" />
        </div>
      )}
      {children}
    </h4>
  );
}
