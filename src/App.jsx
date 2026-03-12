import { Routes, Route } from 'react-router-dom';
import { NavBar } from './components/ui/TubelightNavbar';
import Dashboard from './pages/Dashboard';
import Collaborators from './pages/Collaborators';
import Comparator from './pages/Comparator';
import RouteIntelligence from './pages/RouteIntelligence';
import History from './pages/History';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Globe,
  History as HistoryIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', url: '/', icon: LayoutDashboard, match: (p) => p === '/' },
  { name: 'Colaboradores', url: '/colaboradores', icon: Users },
  { name: 'Comparador', url: '/comparador', icon: BarChart3 },
  { name: 'Inteligência de Rotas', url: '/inteligencia-rotas', icon: Globe },
  { name: 'Histórico', url: '/historico', icon: HistoryIcon },
];

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-dark-900">
      {/* Ambient glow effect */}
      <div className="ambient-glow" />

      {/* Top Navbar */}
      <NavBar items={NAV_ITEMS} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pt-20">
        <div className="p-8 max-w-[1440px] mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/colaboradores" element={<Collaborators />} />
            <Route path="/comparador" element={<Comparator />} />
            <Route path="/inteligencia-rotas" element={<RouteIntelligence />} />
            <Route path="/historico" element={<History />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
