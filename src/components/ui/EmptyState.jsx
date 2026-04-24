import { clsx } from 'clsx';

export function EmptyState({ icon: Icon, title, description, children, className }) {
  return (
    <div className={clsx('surface-card glass-card p-12 flex flex-col items-center justify-center text-center', className)}>
      {Icon && (
        <div className="w-16 h-16 rounded-xl bg-surface flex items-center justify-center mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />
          <Icon className="w-7 h-7 text-white/25 relative" />
        </div>
      )}
      <h3 className="display-md text-white mb-2">{title}</h3>
      {description && <p className="body max-w-md mb-8">{description}</p>}
      {children && <div className="flex gap-3">{children}</div>}
    </div>
  );
}
