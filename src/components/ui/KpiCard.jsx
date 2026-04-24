import { clsx } from 'clsx';

const accents = {
  mint: {
    icon: 'text-mint bg-mint/10',
    value: 'text-mint',
    glow: 'shadow-glow-mint',
    border: '',
    topLine: 'from-transparent via-mint/30 to-transparent',
  },
  orange: {
    icon: 'text-accent-orange bg-accent-orange/10',
    value: 'text-accent-orange',
    glow: 'shadow-glow-orange',
    border: '',
    topLine: 'from-transparent via-accent-orange/30 to-transparent',
  },
  cyan: {
    icon: 'text-accent-cyan bg-accent-cyan/10',
    value: 'text-accent-cyan',
    glow: '',
    border: '',
    topLine: 'from-transparent via-accent-cyan/30 to-transparent',
  },
  blue: {
    icon: 'text-accent-blue bg-accent-blue/10',
    value: 'text-accent-blue',
    glow: '',
    border: '',
    topLine: 'from-transparent via-accent-blue/30 to-transparent',
  },
  purple: {
    icon: 'text-accent-purple bg-accent-purple/10',
    value: 'text-accent-purple',
    glow: '',
    border: '',
    topLine: 'from-transparent via-accent-purple/30 to-transparent',
  },
  amber: {
    icon: 'text-accent-amber bg-accent-amber/10',
    value: 'text-accent-amber',
    glow: '',
    border: '',
    topLine: 'from-transparent via-accent-amber/30 to-transparent',
  },
};

export function KpiCard({ label, value, detail, icon: Icon, accent = 'mint', className }) {
  const a = accents[accent] || accents.mint;

  return (
    <div className={clsx(
      'glass-card p-6 relative overflow-hidden group transition-all duration-300',
      a.border,
      className
    )}>
      {/* Specular highlight */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-transparent pointer-events-none" />

      {/* Top accent line */}
      <div className={clsx(
        'absolute top-0 left-0 right-0 h-px bg-gradient-to-r',
        a.topLine
      )} />

      <div className="relative flex items-start justify-between mb-5">
        <span className="label-micro">{label}</span>
        {Icon && (
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', a.icon)}>
            <Icon className="w-[18px] h-[18px]" />
          </div>
        )}
      </div>

      <div className={clsx('metric-value mb-1.5', a.value)}>
        {value}
      </div>

      {detail && (
        <p className="body mt-1.5">{detail}</p>
      )}
    </div>
  );
}
