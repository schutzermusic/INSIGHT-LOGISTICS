import { clsx } from 'clsx';
import { Badge } from '../ui/Badge';

export function PageHeader({ title, subtitle, badge, badgeVariant = 'mint', icon: Icon, children, className }) {
  return (
    <div className={clsx('flex items-start justify-between mb-8', className)}>
      <div>
        <div className="flex items-center gap-4">
          {Icon && (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgb(var(--glass-ink) / 0.05)',
                boxShadow:
                  'inset 0 1px 0 rgb(var(--highlight-ink) / 0.08), 0 0 0 1px rgb(var(--glass-ink) / 0.06)',
              }}
            >
              <Icon className="w-[18px] h-[18px] text-mint/60" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h2 className="display-md">{title}</h2>
              {badge && <Badge variant={badgeVariant} dot>{badge}</Badge>}
            </div>
            {subtitle && (
              <p className="body mt-1.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
