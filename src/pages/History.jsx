import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History as HistoryIcon, Search, Trash2, X, ChevronDown, Clock, Bot, BarChart3,
  ArrowRight, Filter, Calendar, MapPin, Users,
} from 'lucide-react';
import { useSimulations } from '../hooks/useStore';
import { formatCurrency } from '../engine/calculator.js';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';

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
      const matchSearch = !q || (sim.origem || '').toLowerCase().includes(q) || (sim.destino || '').toLowerCase().includes(q) || (sim.modal || '').toLowerCase().includes(q) || (sim.nome || '').toLowerCase().includes(q);
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

  // Summary stats
  const summaryStats = useMemo(() => {
    if (simulations.length === 0) return null;
    const totalCost = simulations.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0);
    const avgCost = totalCost / simulations.length;
    const aiCount = simulations.filter(s => s.type === 'ai-analysis').length;
    const compCount = simulations.filter(s => s.type === 'comparison').length;
    const uniqueRoutes = new Set(simulations.map(s => `${s.origem}-${s.destino}`)).size;
    return { totalCost, avgCost, aiCount, compCount, uniqueRoutes };
  }, [simulations]);

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
    <div className="animate-fade-in space-y-6">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-dark-850/80 via-dark-900/60 to-dark-950/80 backdrop-blur-xl">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
        <div className="relative px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent-blue/15 to-accent-purple/10 flex items-center justify-center border border-accent-blue/10">
                <HistoryIcon className="w-5 h-5 text-accent-blue" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Historico de Analises</h1>
                <p className="text-[13px] text-white/30 mt-0.5">Registro completo de simulacoes e recomendacoes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="blue" dot>{simulations.length} registro(s)</Badge>
              {simulations.length > 0 && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-accent-red/50 hover:text-accent-red hover:bg-accent-red/10 transition-all" onClick={handleClear}>
                  <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* Summary stats strip */}
          {summaryStats && (
            <div className="grid grid-cols-5 gap-0 mt-5 rounded-2xl border border-white/[0.04] bg-white/[0.015] overflow-hidden">
              <SummaryCell label="Total Registros" value={simulations.length} />
              <SummaryCell label="Analises AI" value={summaryStats.aiCount} border />
              <SummaryCell label="Comparacoes" value={summaryStats.compCount} border />
              <SummaryCell label="Rotas Unicas" value={summaryStats.uniqueRoutes} border />
              <SummaryCell label="Custo Medio" value={formatCurrency(summaryStats.avgCost)} border />
            </div>
          )}
        </div>
      </section>

      {simulations.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nenhuma simulacao registrada"
          description="Suas simulacoes do Comparador e Inteligencia de Rotas aparecerao aqui automaticamente."
        >
          <div className="flex items-center gap-4">
            <LiquidMetalButton label="Comparar Cenarios" width={220} onClick={() => navigate('/comparador')} />
            <button className="btn-ghost" onClick={() => navigate('/inteligencia-rotas')}>Inteligencia de Rotas</button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Filters */}
          <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-r from-dark-850/40 to-dark-900/40 backdrop-blur-xl px-6 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-white/20">
                <Filter className="w-4 h-4" />
              </div>
              <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/15" />
                <input
                  className="glass-input pl-11"
                  placeholder="Buscar por rota, modal ou nome..."
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
          </section>

          {/* Timeline */}
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-white/15" />
                    <span className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.1em]">{date}</span>
                  </div>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[10px] text-white/15">{items.length} registro(s)</span>
                </div>

                <div className="space-y-2">
                  {items.map(sim => {
                    const typeConfig = TYPE_CONFIG[sim.type] || TYPE_CONFIG.default;
                    const TypeIcon = typeConfig.icon;
                    const isExpanded = expanded === sim.id;

                    return (
                      <div key={sim.id} className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-gradient-to-r from-dark-850/40 to-dark-900/30 backdrop-blur-xl">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
                        <button
                          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors"
                          onClick={() => setExpanded(isExpanded ? null : sim.id)}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${sim.type === 'ai-analysis' ? 'bg-accent-purple/10' : sim.type === 'comparison' ? 'bg-accent-amber/10' : 'bg-accent-blue/10'
                            }`}>
                            <TypeIcon className={`w-4 h-4 ${sim.type === 'ai-analysis' ? 'text-accent-purple' : sim.type === 'comparison' ? 'text-accent-amber' : 'text-accent-blue'
                              }`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white/80 truncate">{sim.nome || 'Simulacao'}</div>
                            <div className="flex items-center gap-1.5 text-[11px] text-white/20 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {sim.origem || '-'}
                              <ArrowRight className="w-3 h-3" />
                              {sim.destino || '-'}
                              <span className="mx-1">|</span>
                              <Users className="w-3 h-3" />
                              {sim.qtdColaboradores || 0}
                            </div>
                          </div>

                          <Badge variant={typeConfig.badge}>{typeConfig.label}</Badge>

                          {sim.modal && (
                            <Badge variant={sim.modal?.includes('Aereo') || sim.modal?.includes('reo') ? 'blue' : sim.modal?.includes('Onibus') || sim.modal?.includes('nibus') ? 'amber' : 'purple'}>
                              {sim.modal}
                            </Badge>
                          )}

                          <div className="text-right min-w-[100px]">
                            <span className="text-sm font-bold text-mint">
                              {formatCurrency(sim.resumo?.custoTotalEquipe || 0)}
                            </span>
                            {sim.resumo?.horasTransito > 0 && (
                              <div className="text-[10px] text-white/20">{sim.resumo.horasTransito}h transito</div>
                            )}
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(sim.id); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 hover:text-accent-red hover:bg-accent-red/10 transition-all duration-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          <ChevronDown className={`w-4 h-4 text-white/10 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 pt-3 animate-fade-in border-t border-white/[0.03]">
                            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                              <DetailCell label="Mao de Obra" value={formatCurrency(sim.resumo?.custoEquipeHoras || 0)} />
                              <DetailCell label="Transito" value={formatCurrency(sim.resumo?.custoEquipeTransito || 0)} />
                              <DetailCell label="Passagens" value={formatCurrency(sim.resumo?.custoEquipePassagens || 0)} />
                              <DetailCell label="Hospedagem" value={formatCurrency(sim.resumo?.custoEquipeHospedagem || 0)} />
                              <DetailCell label="Alimentacao" value={formatCurrency(sim.resumo?.custoEquipeAlimentacao || 0)} />
                              <DetailCell label="Logistico" value={formatCurrency(sim.resumo?.custoLogistico || 0)} />
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

function SummaryCell({ label, value, border }) {
  return (
    <div className={`px-5 py-3.5 ${border ? 'border-l border-white/[0.04]' : ''}`}>
      <span className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.1em] block">{label}</span>
      <span className="text-lg font-bold text-white/70 mt-1 block">{value}</span>
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-white/[0.02]">
      <span className="text-[10px] text-white/20 uppercase font-semibold tracking-wider block">{label}</span>
      <span className="text-[13px] font-semibold text-white/55 mt-1 block">{value}</span>
    </div>
  );
}
