import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History as HistoryIcon, Search, Trash2, X, ChevronDown, Clock, Bot, BarChart3,
  ArrowRight, Filter, Calendar, MapPin, Users, ListTree, CheckCircle,
} from 'lucide-react';
import { useSimulations } from '../hooks/useStore';
import { dashboardRevertConfirmation } from '../services/BackendApiClient';
import { formatCurrency } from '../engine/calculator.js';
import { mobilizationDraftHistorySummary } from '../domain/mobilizationDraftSummary';
import { formatMobilitySequence } from '../domain/mobilityLabels';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { MotionStagger, MotionStaggerItem } from '../components/ui/MotionStagger';
import { Modal } from '../components/ui/Modal';
import { ConfirmMobilizationModal } from '../components/mobilization/ConfirmMobilizationModal';
import { MobilizationScenarioDetail } from '../components/mobilization/MobilizationScenarioDetail';

const TYPE_CONFIG = {
  'ai-analysis': { label: 'AI', badge: 'accent', icon: Bot },
  'comparison': { label: 'Comparacao', badge: 'warning', icon: BarChart3 },
  'mobilization-draft': { label: 'Rascunho', badge: 'warning', icon: Clock },
  'default': { label: 'Simulacao', badge: 'info', icon: Clock },
};

export default function History() {
  const { simulations, updateSimulation, deleteSimulation, clearSimulations } = useSimulations();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterModal, setFilterModal] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [detailDraft, setDetailDraft] = useState(null);
  const [confirmDraft, setConfirmDraft] = useState(null);
  const [revertingId, setRevertingId] = useState(null);

  const filtered = useMemo(() => {
    return simulations.filter(sim => {
      const q = search.toLowerCase();
      const modalLabel = formatMobilitySequence(sim.modal).toLowerCase();
      const matchSearch = !q || (sim.origem || '').toLowerCase().includes(q) || (sim.destino || '').toLowerCase().includes(q) || modalLabel.includes(q) || (sim.nome || '').toLowerCase().includes(q);
      const matchType = !filterType || (sim.type || 'simulation') === filterType;
      const matchModal = !filterModal || modalLabel.includes(filterModal);
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
    if (simulations.some((simulation) => simulation.status === 'confirmed' && simulation.dashboardPublished)) {
      alert('Reverta as mobilizações confirmadas antes de limpar o Histórico.');
      return;
    }
    if (confirm('Tem certeza que deseja limpar todo o historico?')) {
      clearSimulations();
    }
  };

  const handleDelete = (id) => {
    if (confirm('Excluir esta simulacao?')) {
      deleteSimulation(id);
    }
  };

  const handleRevert = async (simulation) => {
    if (!simulation.confirmedId || revertingId) return;
    if (!confirm('Reverter esta mobilização? Ela será retirada do Dashboard e voltará ao estado de rascunho.')) return;
    setRevertingId(simulation.id);
    try {
      await dashboardRevertConfirmation(simulation.confirmedId);
      await updateSimulation(simulation.id, {
        status: 'draft',
        dashboardPublished: false,
        lastConfirmedId: simulation.confirmedId,
        lastConfirmedAt: simulation.confirmedAt || null,
        confirmedId: null,
        confirmedAt: null,
        revertedAt: new Date().toISOString(),
      });
    } catch (error) {
      alert(error.message || 'Não foi possível retirar a mobilização do Dashboard.');
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="surface-card relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
        <div className="relative px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-blue/15 to-accent-purple/10 flex items-center justify-center border border-accent-blue/10">
                <HistoryIcon className="w-5 h-5 text-accent-blue" />
              </div>
              <div>
                <h1 className="display-md text-white">Historico de Analises</h1>
                <p className="body text-[13px] mt-1">Registro completo de simulacoes e recomendacoes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="info" dot>{simulations.length} registro(s)</Badge>
              {simulations.length > 0 && (
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold text-danger-text/70 hover:text-danger-text hover:bg-danger-bg/70 transition-[color,background-color] duration-[var(--motion-duration-small)] ease-[var(--motion-ease-out)]" onClick={handleClear}>
                  <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* Summary stats strip */}
          {summaryStats && (
            <div className="surface-recessed grid grid-cols-5 gap-0 mt-6 rounded-2xl overflow-hidden">
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
          description="Suas simulacoes de Simulação Mobilização e Inteligencia de Rotas aparecerao aqui automaticamente."
        >
          <div className="flex items-center gap-4">
            <LiquidMetalButton label="Abrir Simulação Mobilização" width={220} onClick={() => navigate('/comparador')} />
            <button className="btn-ghost" onClick={() => navigate('/inteligencia-rotas')}>Inteligencia de Rotas</button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Filters */}
          <section className="surface-recessed relative overflow-hidden px-6 py-4">
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
                <option value="mobilization-draft">Rascunhos de mobilização</option>
              </select>
              <select className="glass-select max-w-[180px]" value={filterModal} onChange={(e) => setFilterModal(e.target.value)}>
                <option value="">Todos os modais</option>
                <option value="ônibus">Ônibus</option>
                <option value="voo">Voo</option>
                <option value="veículo">Veículo</option>
                <option value="espera">Espera</option>
                <option value="transfer">Transfer</option>
              </select>
              <Badge variant="neutral" className="ml-auto">{filtered.length} resultado(s)</Badge>
            </div>
          </section>

          {/* Timeline */}
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-white/15" />
                    <span className="label-micro text-white/25">{date}</span>
                  </div>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <AnimatedNumber
                    as="span"
                    className="label-micro text-white/15 tabular-data"
                    value={items.length}
                    format={(v) => `${Math.round(v)} registro(s)`}
                  />
                </div>

                <MotionStagger as="div" className="space-y-2" fast inView>
                  {items.map(sim => {
                    const isConfirmed = sim.status === 'confirmed' && sim.dashboardPublished === true;
                    const typeConfig = isConfirmed
                      ? { label: 'Confirmada', badge: 'success', icon: CheckCircle }
                      : (TYPE_CONFIG[sim.type] || TYPE_CONFIG.default);
                    const TypeIcon = typeConfig.icon;
                    const isExpanded = expanded === sim.id;
                    const modalLabel = formatMobilitySequence(sim.modal);
                    const detailSummary = sim.type === 'mobilization-draft' && sim.calculationResult?.recommended
                      ? mobilizationDraftHistorySummary(sim.calculationResult.recommended)
                      : sim.resumo;

                    return (
                      <MotionStaggerItem
                        key={sim.id}
                        className={`surface-card relative overflow-hidden rounded-2xl border ${
                          isConfirmed
                            ? 'border-success-border/40 bg-success-bg/20 shadow-[0_0_24px_rgb(var(--color-success-glow)/0.08)]'
                            : 'border-white/[0.05]'
                        }`}
                      >
                        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${
                          isConfirmed ? 'via-success-text/45' : 'via-white/[0.04]'
                        } to-transparent`} />
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          className={`w-full px-4 py-4 flex items-center gap-4 text-left transition-colors ${
                            isConfirmed ? 'hover:bg-success-bg/25' : 'hover:bg-white/[0.02]'
                          }`}
                          onClick={() => setExpanded(isExpanded ? null : sim.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setExpanded(isExpanded ? null : sim.id);
                            }
                          }}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isConfirmed ? 'bg-success-bg border border-success-border/30' : sim.type === 'ai-analysis' ? 'bg-accent-bg/70' : sim.type === 'comparison' ? 'bg-warning-bg/70' : 'bg-info-bg/70'
                            }`}>
                            <TypeIcon className={`w-4 h-4 ${isConfirmed ? 'text-success-text' : sim.type === 'ai-analysis' ? 'text-accent-text' : sim.type === 'comparison' ? 'text-warning-text' : 'text-info-text'
                              }`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="heading text-white/80 truncate">{sim.nome || 'Simulacao'}</div>
                            <div className="flex items-center gap-2 label-micro text-white/20 mt-1">
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

                          {modalLabel && (
                            <Badge
                              variant={modalLabel.includes('Voo') ? 'info' : modalLabel.includes('Ônibus') ? 'warning' : 'accent'}
                              dot
                              compact
                            >
                              {modalLabel}
                            </Badge>
                          )}

                          <div className="text-right min-w-[100px]">
                            <AnimatedNumber
                              as="span"
                              className="tabular-data text-sm font-bold text-success-text"
                              value={detailSummary?.custoTotalEquipe || 0}
                              format={(v) => formatCurrency(v)}
                            />
                          </div>

                          {!isConfirmed && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(sim.id); }}
                              aria-label={`Excluir ${sim.type === 'mobilization-draft' ? 'rascunho' : 'simulação'} ${sim.nome || ''}`.trim()}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/10 hover:text-danger-text hover:bg-danger-bg/70 transition-[color,background-color] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-out)]"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <ChevronDown className={`w-4 h-4 text-white/10 transition-transform duration-[var(--motion-duration-small)] ease-[var(--motion-ease-out)] ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-3 animate-fade-in border-t border-white/[0.03]">
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                              <DetailCell label="Mao de Obra" value={formatCurrency(detailSummary?.custoEquipeHoras || 0)} />
                              <DetailCell label="Passagens" value={formatCurrency(detailSummary?.custoEquipePassagens || 0)} />
                              <DetailCell label="Hospedagem" value={formatCurrency(detailSummary?.custoEquipeHospedagem || 0)} />
                              <DetailCell label="Alimentacao" value={formatCurrency(detailSummary?.custoEquipeAlimentacao || 0)} />
                              <DetailCell label="Logistico" value={formatCurrency(detailSummary?.custoLogistico || 0)} />
                            </div>
                            {sim.type === 'mobilization-draft' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                                <DetailCell
                                  label="Horas reais da equipe"
                                  value={formatHours(detailSummary?.horasReaisTrabalhadasEquipe)}
                                />
                                <DetailCell
                                  label="Horas computadas da equipe"
                                  value={formatHours(detailSummary?.horasComputadasEquipe)}
                                />
                                <DetailCell
                                  label="Intervalos abatidos"
                                  value={formatHours(detailSummary?.horasIntervalosEquipe)}
                                />
                              </div>
                            )}
                            {sim.type === 'mobilization-draft' && (
                              <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                                isConfirmed
                                  ? 'border-success-border/30 bg-success-bg/50'
                                  : 'border-warning-border/15 bg-warning-bg/30'
                              }`}>
                                <div>
                                  <span className={`label-micro block ${isConfirmed ? 'text-success-text' : 'text-warning-text/75'}`}>
                                    {isConfirmed ? 'Mobilização confirmada no Dashboard' : 'Mobilização ainda não confirmada'}
                                  </span>
                                  <span className="body text-[12px] text-white/35">
                                    {isConfirmed
                                      ? 'O snapshot está publicado e alimenta os indicadores.'
                                      : 'Revise o cenário e conclua os campos obrigatórios quando decidir seguir.'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-info-border/40 bg-info-bg text-info-text text-[12px] font-semibold shadow-sm hover:border-info-border/60 hover:brightness-95 transition-[border-color,filter,box-shadow]"
                                    onClick={() => setDetailDraft(sim)}
                                  >
                                    <ListTree className="w-3.5 h-3.5" />
                                    Detalhamento
                                  </button>
                                  {isConfirmed ? (
                                    <button
                                      disabled={revertingId === sim.id}
                                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger-bg text-danger-text border border-danger-border/30 text-[12px] font-semibold hover:brightness-95 disabled:opacity-50 transition-[filter,opacity]"
                                      onClick={() => handleRevert(sim)}
                                    >
                                      {revertingId === sim.id ? 'Revertendo…' : 'Reverter do Dashboard'}
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/75 text-[12px] font-semibold hover:bg-white/[0.08] transition-colors"
                                        onClick={() => navigate('/comparador', { state: { mobilizationDraft: sim, draftIntent: 'edit' } })}
                                      >
                                        Editar rascunho
                                      </button>
                                      <button
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-warning-bg text-warning-text border border-warning-border/25 text-[12px] font-semibold hover:bg-warning-bg/80 transition-colors"
                                        onClick={() => setConfirmDraft(sim)}
                                      >
                                        Continuar e confirmar <ArrowRight className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </MotionStaggerItem>
                    );
                  })}
                </MotionStagger>
              </div>
            ))}
          </div>
        </>
      )}
      <DraftEmployeeDetailModal draft={detailDraft} onClose={() => setDetailDraft(null)} />
      <HistoryConfirmationModal
        draft={confirmDraft}
        onClose={() => setConfirmDraft(null)}
        onUpdate={updateSimulation}
      />
    </div>
  );
}

function HistoryConfirmationModal({ draft, onClose, onUpdate }) {
  const result = draft?.calculationResult;
  const scenario = result?.recommended;
  if (!draft || !scenario) return null;

  const employees = (result?.employees || []).map((employee) => ({
    id: employee.id,
    name: employee.nome || employee.name || 'Colaborador',
    role: employee.cargo || employee.role || null,
    allowanceCategory: employee.allowanceCategory === 'leader' ? 'leader' : 'standard',
  }));

  return (
    <ConfirmMobilizationModal
      key={draft.id}
      open
      onClose={onClose}
      source="manual_simulation"
      scenario={scenario}
      alternatives={result?.scenarios || []}
      employees={employees}
      origin={draft?.origem}
      destination={draft?.destino}
      context={draft?.confirmationContext || {}}
      refs={{
        simulationId: result?.audit?.simulationId || null,
        policySummary: result?.policySummary || null,
        reasonCodes: result?.reasonCodes || [],
      }}
      onSaveDraft={async (confirmationContext) => {
        const updated = await onUpdate(draft.id, { confirmationContext });
        if (!updated) throw new Error('Não foi possível atualizar os dados da confirmação.');
      }}
      onConfirmed={async (confirmation, confirmationContext) => {
        await onUpdate(draft.id, {
          status: 'confirmed',
          resumo: mobilizationDraftHistorySummary(scenario),
          confirmationContext: confirmationContext || draft.confirmationContext || {},
          confirmedId: confirmation?.confirmedId || null,
          confirmedAt: new Date().toISOString(),
          dashboardPublished: true,
        });
      }}
    />
  );
}

function DraftEmployeeDetailModal({ draft, onClose }) {
  const scenario = draft?.calculationResult?.recommended;

  return (
    <Modal open={!!draft} onClose={onClose} title={scenario?.scenarioName || 'Detalhamento da mobilização'} size="xl">
      {!scenario ? (
        <p className="body text-[13px]">Este rascunho ainda não possui um cenário calculado.</p>
      ) : (
        <div>
          <p className="body text-[13px] mb-4">
            {draft.origem || '—'} → {draft.destino || '—'} · cálculo trabalhista individual e auditável.
          </p>
          <MobilizationScenarioDetail scenario={scenario} />
        </div>
      )}
    </Modal>
  );
}

function SummaryCell({ label, value, border }) {
  return (
    <div className={`px-6 py-4 ${border ? 'border-l border-white/[0.04]' : ''}`}>
      <span className="label-micro text-white/25 block">{label}</span>
      {typeof value === 'number' ? (
        <AnimatedNumber
          as="span"
          className="metric-value text-white/70 mt-2 block"
          value={value}
          format={(v) => (label === 'Custo Medio' ? formatCurrency(v) : Math.round(v).toLocaleString('pt-BR'))}
        />
      ) : (
        <span className="metric-value text-white/70 mt-2 block">{value}</span>
      )}
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
    <div className="px-3 py-3 rounded-xl bg-white/[0.02]">
      <span className="label-micro text-white/20 block">{label}</span>
      <span className="tabular-data text-[13px] font-semibold text-white/55 mt-2 block">{value}</span>
    </div>
  );
}

function formatHours(value) {
  const hours = Number(value) || 0;
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${whole}h${String(minutes).padStart(2, '0')}`;
}
