import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Clock,
  BarChart3,
  Globe,
  History,
  Sparkles,
  Zap,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/colaboradores', label: 'Colaboradores', icon: Users },
  { path: '/comparador', label: 'Comparador', icon: BarChart3 },
  { path: '/inteligencia-rotas', label: 'Inteligencia de Rotas', icon: Globe, special: true },
  { path: '/historico', label: 'Historico', icon: History },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 w-[280px] h-screen flex flex-col z-50">
      {/* Glass background */}
      <div className="absolute inset-0 bg-dark-900/90 backdrop-blur-2xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-transparent pointer-events-none" />
      {/* edge light removed */}

      {/* Logo */}
      <div className="relative px-6 py-6">
        <div className="flex items-center justify-center">
          <img
            src="/INSIGHT-LOGISTICS-LOGO.png"
            alt="Insight Logistics"
            className="w-full max-w-[210px] h-auto drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)]"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 px-4 py-6 flex flex-col gap-1 overflow-y-auto">
        <span className="label-micro text-white/20 px-4 mb-2">
          Menu Principal
        </span>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 group relative',
                isActive
                  ? 'text-white'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active background with glass effect */}
                {isActive && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden">
                    <div className="absolute inset-0 bg-white/[0.06]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-mint/[0.08] via-transparent to-transparent" />
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-mint/30 via-white/[0.06] to-transparent" />
                  </div>
                )}

                {/* Active side indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-mint to-accent-cyan shadow-glow-mint" />
                )}

                <div className={clsx(
                  'relative w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200',
                  isActive
                    ? 'bg-mint/10'
                    : 'bg-transparent group-hover:bg-white/[0.04]'
                )}>
                  <item.icon className={clsx(
                    'w-[17px] h-[17px] transition-colors',
                    isActive ? 'text-mint' : 'text-white/25 group-hover:text-white/45'
                  )} />
                </div>

                <span className="relative">{item.label}</span>

                {item.special && (
                  <div className="relative ml-auto flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-accent-orange animate-glow-pulse" />
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="relative px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-mint" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-mint animate-ping opacity-30" />
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-white/15" />
            <span className="label-micro text-white/20">v2.0 Premium</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
