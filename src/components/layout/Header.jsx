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
          <h1 className="text-[15px] font-semibold text-white/90 tracking-tight">{meta.title}</h1>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="relative flex items-center gap-3">
        {/* AI Engine Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5 text-accent-orange" />
          <span className="text-[11px] font-medium text-white/40">AI Engine</span>
          <div className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
        </div>

        {/* Notifications */}
        <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all duration-200 relative">
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
