import { useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Bell,
  Sparkles,
  LayoutDashboard,
  Users,
  Clock,
  BarChart3,
  Globe,
  History,
} from 'lucide-react';

const PAGE_META = {
  '/': { title: 'Dashboard', icon: LayoutDashboard },
  '/colaboradores': { title: 'Colaboradores', icon: Users },
  '/comparador': { title: 'Comparador', icon: BarChart3 },
  '/inteligencia-rotas': { title: 'Inteligencia de Rotas', icon: Globe },
  '/historico': { title: 'Historico', icon: History },
};

export function Header() {
  const location = useLocation();
  const meta = PAGE_META[location.pathname] || PAGE_META['/'];
  const PageIcon = meta.icon;

  return (
    <header className="h-[72px] flex items-center justify-between px-8 relative">
      {/* Left: Page context */}
      <div className="relative flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center">
          <PageIcon className="w-[17px] h-[17px] text-white/40" />
        </div>
        <div>
          <h1 className="heading text-white/90">{meta.title}</h1>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="relative flex items-center gap-3">
        {/* AI Engine Badge */}
        <div className="surface-elevated flex items-center gap-2 px-3 py-1.5 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-accent-orange" />
          <span className="label-micro text-white/40">AI Engine</span>
          <div className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
        </div>

        {/* Notifications */}
        <button className="surface-elevated w-9 h-9 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-all duration-200 relative">
          <Bell className="w-4 h-4" />
        </button>

        {/* Profile */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mint/20 to-accent-cyan/20 flex items-center justify-center">
          <span className="text-xs font-bold text-mint">IL</span>
        </div>
      </div>
    </header>
  );
}
