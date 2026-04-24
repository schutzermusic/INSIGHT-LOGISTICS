import { Component, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { NavBar } from './components/ui/TubelightNavbar';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Globe,
  History as HistoryIcon,
} from 'lucide-react';

// Loaders cached and reused so hover-prefetch + lazy() hit the same chunk.
const loaders = {
  '/': () => import('./pages/Dashboard'),
  '/colaboradores': () => import('./pages/Collaborators'),
  '/comparador': () => import('./pages/Comparator'),
  '/inteligencia-rotas': () => import('./pages/RouteIntelligence'),
  '/historico': () => import('./pages/History'),
};

export function prefetchRoute(path) {
  const loader = loaders[path];
  if (loader) loader();
}

const Dashboard = lazy(loaders['/']);
const Collaborators = lazy(loaders['/colaboradores']);
const Comparator = lazy(loaders['/comparador']);
const RouteIntelligence = lazy(loaders['/inteligencia-rotas']);
const History = lazy(loaders['/historico']);

function RouteFallback() {
  return (
    <div className="stagger-children space-y-6" aria-busy="true" aria-live="polite">
      {/* Hero skeleton */}
      <div className="premium-panel">
        <div className="p-9 space-y-6">
          <div className="flex items-center gap-4">
            <div className="skeleton w-12 h-12" style={{ borderRadius: '1rem' }} />
            <div className="space-y-2">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-7 w-56" />
              <div className="skeleton h-3 w-80" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 rounded-2xl border border-white/[0.06] overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`p-6 space-y-4 ${i > 0 ? 'md:border-l border-white/[0.06]' : ''}`}>
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-8 w-32" />
                <div className="skeleton h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 premium-panel">
          <div className="p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-6 w-24" style={{ borderRadius: '999px' }} />
            </div>
            <div className="skeleton h-[260px] w-full" style={{ borderRadius: '1rem' }} />
          </div>
        </div>
        <div className="lg:col-span-4 premium-panel">
          <div className="p-6 space-y-4">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-[280px] w-full" style={{ borderRadius: '1rem' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

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
      {/* Cinematic stage — volumetric light, beam, and film grain */}
      <div className="ambient-glow" />
      <div className="stage-beam" />
      <div className="stage-grain" />

      {/* Top Navbar */}
      <NavBar items={NAV_ITEMS} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 pt-20">
        <div className="p-8 max-w-[1440px] mx-auto">
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/colaboradores" element={<Collaborators />} />
                <Route path="/comparador" element={<Comparator />} />
                <Route path="/inteligencia-rotas" element={<RouteIntelligence />} />
                <Route path="/historico" element={<History />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
