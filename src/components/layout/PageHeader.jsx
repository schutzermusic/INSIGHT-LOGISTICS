import { clsx } from 'clsx';
import { Badge } from '../ui/Badge';

export function PageHeader({ title, subtitle, badge, badgeVariant = 'mint', icon: Icon, children, className }) {
  return (
    <div className={clsx('flex items-start justify-between mb-10', className)}>
      <div>
        <div className="flex items-center gap-3.5 mb-1.5">
          {Icon && (
            <div className="w-10 h-10 rounded-2xl bg-surface flex items-center justify-center">
              <Icon className="w-5 h-5 text-mint/50" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
              {badge && <Badge variant={badgeVariant} dot>{badge}</Badge>}
            </div>
            {subtitle && (
              <p className="text-sm text-white/30 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
