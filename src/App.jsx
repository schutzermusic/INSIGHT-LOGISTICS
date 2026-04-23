import { Component } from 'react';
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

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-white">
          <h2 className="text-xl font-bold text-accent-red mb-4">Erro na pagina</h2>
          <pre className="text-sm text-white/60 bg-white/5 p-4 rounded-xl overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 px-4 py-2 rounded-lg bg-mint/20 text-mint-ink text-sm"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      {/* Ambient glow — theme-aware via CSS */}
      <div className="ambient-glow" />

      {/* Top Navbar */}
      <NavBar items={NAV_ITEMS} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pt-20">
        <div className="p-8 max-w-[1440px] mx-auto">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/colaboradores" element={<Collaborators />} />
              <Route path="/comparador" element={<Comparator />} />
              <Route path="/inteligencia-rotas" element={<RouteIntelligence />} />
              <Route path="/historico" element={<History />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
