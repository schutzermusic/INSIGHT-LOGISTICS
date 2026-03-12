import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, Trash2, X, ChevronDown, Clock, Bot, BarChart3 } from 'lucide-react';
import { useSimulations } from '../hooks/useStore';
import { formatCurrency } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

const TYPE_CONFIG = {
  'ai-analysis': { label: 'AI', badge: 'purple', icon: Bot },
  'comparison': { label: 'Comparacao', badge: 'amber', icon: BarChart3 },
  'default': { label: 'Simulacao', badge: 'blue', icon: Clock },
};

export default function History() {
  const { simulations, deleteSimulation, clearSimulations } = useSimulations();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterModal, setFilterModal] = useState('');
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    return simulations.filter(sim => {
      const q = search.toLowerCase();
      const matchSearch = !q || (sim.origem || '').toLowerCase().includes(q) || (sim.destino || '').toLowerCase().includes(q) || (sim.modal || '').toLowerCase().includes(q);
      const matchType = !filterType || (sim.type || 'simulation') === filterType;
      const matchModal = !filterModal || (sim.modal || '').includes(filterModal);
      return matchSearch && matchType && matchModal;
    });
  }, [simulations, search, filterType, filterModal]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(sim => {
      const date = sim.createdAt ? new Date(sim.createdAt).toLocaleDateString('pt-BR') : 'Sem data';
      if (!groups[date]) groups[date] = [];
      groups[date].push(sim);
    });
    return groups;
  }, [filtered]);

  const handleClear = () => {
    if (confirm('Tem certeza que deseja limpar todo o historico?')) {
      clearSimulations();
    }
  };

  const handleDelete = (id) => {
    if (confirm('Excluir esta simulacao?')) {
      deleteSimulation(id);
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Historico"
        subtitle="Todas as simulacoes e analises realizadas"
        icon={HistoryIcon}
        badge={`${simulations.length} registro(s)`}
        badgeVariant="blue"
      >
        {simulations.length > 0 && (
          <button className="btn-ghost text-accent-red/60 hover:text-accent-red" onClick={handleClear}>
            <Trash2 className="w-4 h-4" /> Limpar Historico
          </button>
        )}
      </PageHeader>

      {simulations.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nenhuma simulacao registrada"
          description="Suas simulacoes do Comparador e Inteligencia de Rotas aparecerao aqui automaticamente."
        >
          <button className="btn-primary-mint" onClick={() => navigate('/comparador')}>Comparar Cenarios</button>
          <button className="btn-ghost" onClick={() => navigate('/inteligencia-rotas')}>Inteligencia de Rotas</button>
        </EmptyState>
      ) : (
        <>
          {/* Filters */}
          <GlassCard padding="p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/15" />
                <input
                  className="glass-input pl-11"
                  placeholder="Buscar por rota ou modal..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="glass-select max-w-[180px]" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">Todos os tipos</option>
                <option value="simulation">Simulacoes</option>
                <option value="comparison">Comparacoes</option>
                <option value="ai-analysis">Analises AI</option>
              </select>
              <select className="glass-select max-w-[180px]" value={filterModal} onChange={(e) => setFilterModal(e.target.value)}>
                <option value="">Todos os modais</option>
                <option value="Onibus">Onibus</option>
                <option value="Aereo">Aereo</option>
                <option value="Veiculo">Veiculo</option>
              </select>
              <Badge variant="default" className="ml-auto">{filtered.length} resultado(s)</Badge>
            </div>
          </GlassCard>

          {/* Timeline */}
          <div className="space-y-8">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-mint/30" />
                  <span className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em]">{date}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>
                <div className="space-y-3">
                  {items.map(sim => {
                    const typeConfig = TYPE_CONFIG[sim.type] || TYPE_CONFIG.default;
                    const TypeIcon = typeConfig.icon;
                    const isExpanded = expanded === sim.id;

                    return (
                      <div key={sim.id} className="glass-card p-0 overflow-hidden">
                        <button
                          className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors"
                          onClick={() => setExpanded(isExpanded ? null : sim.id)}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                            sim.type === 'ai-analysis' ? 'bg-accent-purple/10 border-accent-purple/10' : sim.type === 'comparison' ? 'bg-accent-amber/10 border-accent-amber/10' : 'bg-accent-blue/10 border-accent-blue/10'
                          }`}>
                            <TypeIcon className={`w-4 h-4 ${
                              sim.type === 'ai-analysis' ? 'text-accent-purple' : sim.type === 'comparison' ? 'text-accent-amber' : 'text-accent-blue'
                            }`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{sim.nome || 'Simulacao'}</div>
                            <div className="text-xs text-white/20 mt-0.5">
                              {sim.origem || '-'} → {sim.destino || '-'} | {sim.qtdColaboradores || 0} pessoa(s)
                            </div>
                          </div>

                          <Badge variant={typeConfig.badge}>{typeConfig.label}</Badge>

                          <span className="text-sm font-bold text-mint">
                            {formatCurrency(sim.resumo?.custoTotalEquipe || 0)}
                          </span>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(sim.id); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 hover:text-accent-red hover:bg-accent-red/10 transition-all duration-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          <ChevronDown className={`w-4 h-4 text-white/10 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isExpanded && (
                          <div className="px-6 pb-5 pt-4 animate-fade-in">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                              <div className="p-3 rounded-xl bg-surface/50 ">
                                <span className="text-[10px] text-white/20 uppercase font-semibold tracking-wider">Modal</span>
                                <div className="text-sm font-medium text-white/55 mt-1">{sim.modal || '-'}</div>
                              </div>
                              <div className="p-3 rounded-xl bg-surface/50 ">
                                <span className="text-[10px] text-white/20 uppercase font-semibold tracking-wider">Transito</span>
                                <div className="text-sm font-medium text-white/55 mt-1">{sim.resumo?.horasTransito || 0}h</div>
                              </div>
                              <div className="p-3 rounded-xl bg-surface/50 ">
                                <span className="text-[10px] text-white/20 uppercase font-semibold tracking-wider">Horas Equipe</span>
                                <div className="text-sm font-medium text-white/55 mt-1">{formatCurrency(sim.resumo?.custoEquipeHoras || 0)}</div>
                              </div>
                              <div className="p-3 rounded-xl bg-surface/50 ">
                                <span className="text-[10px] text-white/20 uppercase font-semibold tracking-wider">Logistico</span>
                                <div className="text-sm font-medium text-white/55 mt-1">{formatCurrency((sim.resumo?.custoEquipePassagens || 0) + (sim.resumo?.custoLogistico || 0))}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
