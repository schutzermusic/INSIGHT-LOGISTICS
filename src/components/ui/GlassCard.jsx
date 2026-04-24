import { clsx } from 'clsx';
import { useSpotlight } from '../../hooks/useSpotlight';

export function GlassCard({ children, className, hover = false, glow, padding = 'p-6', onClick, ...props }) {
  const { ref, onMouseMove } = useSpotlight();

  return (
    <div
      ref={hover ? ref : undefined}
      onMouseMove={hover ? onMouseMove : undefined}
      className={clsx(
        hover ? 'glass-card-interactive spotlight' : 'glass-card',
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
    <h4 className={clsx('heading flex items-center gap-3', className)}>
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-mint/[0.08] flex items-center justify-center">
          <Icon className="w-[15px] h-[15px] text-mint/60" />
        </div>
      )}
      {children}
    </h4>
  );
}
