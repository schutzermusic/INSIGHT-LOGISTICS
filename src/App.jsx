import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Collaborators from './pages/Collaborators';
import Comparator from './pages/Comparator';
import RouteIntelligence from './pages/RouteIntelligence';
import History from './pages/History';

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-900">
      {/* Ambient glow effect */}
      <div className="ambient-glow" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main className="flex-1 ml-[280px] overflow-y-auto overflow-x-hidden relative z-10">
        <div className="p-8 max-w-[1440px]">
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
