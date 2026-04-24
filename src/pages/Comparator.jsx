import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart3, Settings, Bus, Plane, Car, AlertTriangle, CheckCircle, TrendingDown, Clock, Zap, Users, Trophy, Shield, DollarSign, Brain } from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { calcScenario, compareScenarios, formatCurrency, formatHours } from '../engine/calculator.js';
// GlassCard and KpiCard available but replaced by integrated panel design
// import { GlassCard, GlassCardHeader, GlassCardTitle } from '../components/ui/GlassCard';
// import { KpiCard } from '../components/ui/KpiCard';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { MagneticWrap } from '../components/ui/MagneticWrap';
import { CHART_PALETTE, COST_BREAKDOWN_COLORS, getComparatorScenarioAccent } from '../lib/chartTheme';

const SCENARIOS = [
  { key: 'onibus', label: 'Onibus', icon: Bus, color: CHART_PALETTE.amber, defaultTime: 24, defaultFare: 250 },
  { key: 'aereo', label: 'Aereo', icon: Plane, color: CHART_PALETTE.cyan, defaultTime: 4, defaultFare: 1200 },
  { key: 'veiculo', label: 'Veiculo/Frota', icon: Car, color: CHART_PALETTE.violet, defaultTime: 12, defaultFare: 0 },
];

const SCENARIO_ICON_MAP = {
  'Onibus': Bus,
  'Aereo': Plane,
  'Veiculo/Frota': Car,
};

export default function Comparator() {
  const { collaborators } = useCollaborators();
  const { saveSimulation } = useSimulations();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);

  if (collaborators.length === 0) {
    return (
      <div className="animate-fade-in">
        {/* Hero header for empty state */}
        <section className="surface-card relative overflow-hidden mb-8">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-cyan/[0.04] rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent" />
          <div className="relative px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-cyan/15 to-accent-blue/10 flex items-center justify-center border border-accent-cyan/10">
                <BarChart3 className="w-5 h-5 text-accent-cyan" />
              </div>
              <div>
                <h1 className="display-md text-white">Comparador de Cenarios</h1>
                <p className="body text-[13px] mt-1">Compare diferentes modais de transporte lado a lado</p>
              </div>
            </div>
          </div>
        </section>
        <EmptyState icon={AlertTriangle} title="Cadastre colaboradores primeiro" description="Para comparar cenarios, e necessario ter pelo menos um colaborador cadastrado.">
          <MagneticWrap><button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button></MagneticWrap>
        </EmptyState>
      </div>
    );
  }

  const handleCompare = (e) => {
    e.preventDefault();
    const form = e.target;

    const common = {
      origem: form.origem.value || '-',
      destino: form.destino.value || '-',
      diasCampo: parseInt(form.diasCampo.value) || 1,
      horasNormaisDia: parseFloat(form.horasNormais.value) || 0,
      horasExtra50Dia: parseFloat(form.he50.value) || 0,
      horasExtra100Dia: parseFloat(form.he100.value) || 0,
      horasNoturnasDia: parseFloat(form.noturnas.value) || 0,
      custoHospedagemDia: parseFloat(form.hospedagem.value) || 0,
      custoAlimentacaoDia: parseFloat(form.alimentacao.value) || 0,
      idaEVolta: true,
    };

    const scenarios = SCENARIOS.map(s => {
      const params = {
        ...common,
        nome: s.label,
        modal: s.label,
        horasTransito: parseFloat(form[`${s.key}-tempo`].value) || 0,
        custoPassagem: parseFloat(form[`${s.key}-passagem`].value) || 0,
      };
      if (s.key === 'veiculo') {
        params.custoVeiculo = parseFloat(form['veiculo-aluguel'].value) || 0;
        params.custoCombustivel = parseFloat(form['veiculo-comb'].value) || 0;
        params.custoPedagios = parseFloat(form['veiculo-pedagios'].value) || 0;
      }
      return calcScenario(collaborators, params);
    });

    const result = compareScenarios(scenarios);
    scenarios.forEach(sc => saveSimulation({ ...sc, type: 'comparison' }));
    setAnalysis(result);
  };

  const chartData = analysis?.cenarios.map((c) => ({
    name: c.nome,
    'Horas Trabalhadas': c.resumo.custoEquipeHoras,
    'Deslocamento': c.resumo.custoEquipeTransito,
    'Passagens': c.resumo.custoEquipePassagens,
    'Hosp + Alim': c.resumo.custoEquipeHospedagem + c.resumo.custoEquipeAlimentacao,
    'Logistico': c.resumo.custoLogistico,
  }));

  // Determine best option index from sorted scenarios
  const bestName = analysis?.melhor?.nome;
  const fastestName = analysis?.maisRapido?.nome;

  return (
    <div className="animate-fade-in space-y-6">

      {/* ═══════════════════════════════════════════
          HERO HEADER — Command Center Style
          ═══════════════════════════════════════════ */}
      <section className="surface-card relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-cyan/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-accent-blue/[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/20 to-transparent" />

        <div className="relative px-8 py-6">
          {/* Top row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-cyan/15 to-accent-blue/10 flex items-center justify-center border border-accent-cyan/10">
                <BarChart3 className="w-5 h-5 text-accent-cyan" />
              </div>
              <div>
                <h1 className="display-md text-white">Comparador de Cenarios</h1>
                <p className="body text-[13px] mt-1">Analise custos e tempo entre onibus, aereo e veiculo proprio/locado</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Analysis engine status */}
              <Badge variant="accent" dot compact>Motor Comparativo</Badge>
              <Badge variant="info" dot>{collaborators.length} colaborador(es)</Badge>
            </div>
          </div>

          {/* Employee context strip */}
          <div className="surface-recessed rounded-2xl overflow-hidden">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-accent-blue/10 flex items-center justify-center">
                    <Users className="w-[15px] h-[15px] text-accent-blue" />
                  </div>
                  <div>
                    <span className="label-micro text-white/30">Equipe na Comparacao</span>
                    <div className="body text-[13px] font-medium text-white/70 mt-1">
                      {collaborators.length} colaborador(es) serao incluidos em cada cenario
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end max-w-[60%]">
                  {collaborators.slice(0, 6).map((c, i) => (
                    <div
                      key={i}
                      className="surface-recessed flex items-center gap-2 px-3 py-2 rounded-xl"
                    >
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-accent-blue/30 to-accent-cyan/20 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-white/70">
                          {(c.nome || c.name || `C${i + 1}`).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[11px] text-white/50 font-medium truncate max-w-[100px]">
                        {c.nome || c.name || `Colab. ${i + 1}`}
                      </span>
                      {c.salarioBase && (
                        <span className="tabular-data text-[10px] text-white/25">{formatCurrency(c.salarioBase)}</span>
                      )}
                    </div>
                  ))}
                  {collaborators.length > 6 && (
                    <span className="text-[11px] text-white/30 font-medium">+{collaborators.length - 6} mais</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FORM — Parameters & Scenarios
          ═══════════════════════════════════════════ */}
      <form onSubmit={handleCompare}>
        {/* Common Parameters */}
        <section className="surface-card relative overflow-hidden mb-6">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="surface-recessed w-9 h-9 rounded-xl flex items-center justify-center">
                <Settings className="w-4 h-4 text-white/40" />
              </div>
              <div>
                <h3 className="heading text-white/80">Parametros Comuns</h3>
                <p className="body text-[13px] mt-1">Aplicados a todos os cenarios de transporte</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block label-micro text-white/35 mb-2">Origem</label>
                <input className="glass-input" name="origem" placeholder="Sao Paulo - SP" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">Destino</label>
                <input className="glass-input" name="destino" placeholder="Manaus - AM" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">Dias em Campo</label>
                <input className="glass-input" type="number" name="diasCampo" defaultValue="5" min="1" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">Horas Normais/dia</label>
                <input className="glass-input" type="number" name="horasNormais" defaultValue="8" step="0.5" min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div>
                <label className="block label-micro text-white/35 mb-2">HE 50%/dia</label>
                <input className="glass-input" type="number" name="he50" defaultValue="2" step="0.5" min="0" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">HE 100%/dia</label>
                <input className="glass-input" type="number" name="he100" defaultValue="0" step="0.5" min="0" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">Hospedagem/dia (R$)</label>
                <input className="glass-input" type="number" name="hospedagem" defaultValue="150" step="0.01" min="0" />
              </div>
              <div>
                <label className="block label-micro text-white/35 mb-2">Alimentacao/dia (R$)</label>
                <input className="glass-input" type="number" name="alimentacao" defaultValue="80" step="0.01" min="0" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 mt-4">
              <div>
                <label className="block label-micro text-white/35 mb-2">Noturnas/dia</label>
                <input className="glass-input max-w-[200px]" type="number" name="noturnas" defaultValue="0" step="0.5" min="0" />
              </div>
            </div>
          </div>
        </section>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {SCENARIOS.map(s => (
            <section
              key={s.key}
              className="surface-card relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent to-transparent" style={{ '--tw-gradient-via': `${s.color}20`, viaColor: s.color }} />
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${s.color}20, transparent)` }} />
              <div className="relative p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${s.color}10`, borderColor: `${s.color}15` }}>
                    <s.icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <h3 className="heading text-white/80">{s.label}</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block label-micro text-white/35 mb-2">Tempo Viagem (h, so ida)</label>
                    <input className="glass-input" type="number" name={`${s.key}-tempo`} defaultValue={s.defaultTime} step="0.5" min="0" />
                  </div>
                  <div>
                    <label className="block label-micro text-white/35 mb-2">Passagem/pessoa (R$)</label>
                    <input className="glass-input" type="number" name={`${s.key}-passagem`} defaultValue={s.defaultFare} step="0.01" min="0" />
                  </div>
                  {s.key === 'veiculo' && (
                    <>
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Aluguel Veiculo (R$)</label>
                        <input className="glass-input" type="number" name="veiculo-aluguel" defaultValue="800" step="0.01" min="0" />
                      </div>
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Combustivel (R$)</label>
                        <input className="glass-input" type="number" name="veiculo-comb" defaultValue="600" step="0.01" min="0" />
                      </div>
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Pedagios (R$)</label>
                        <input className="glass-input" type="number" name="veiculo-pedagios" defaultValue="150" step="0.01" min="0" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="flex justify-center w-full mb-6">
          <LiquidMetalButton label="Comparar Cenarios" width={220} type="submit" />
        </div>
      </form>

      {/* ═══════════════════════════════════════════
          RESULTS
          ═══════════════════════════════════════════ */}
      {analysis && (
        <div className="space-y-6 animate-slide-up">

          {/* AI VERDICT — Best Option Highlight */}
          <section className="surface-card relative overflow-hidden border border-mint/[0.15]">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-mint/[0.06] rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-accent-cyan/[0.04] rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/30 to-transparent" />

            <div className="relative px-8 py-6">
              {/* Header row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-mint/20 to-mint/5 flex items-center justify-center border border-mint/15">
                    <Brain className="w-5 h-5 text-mint" />
                  </div>
                  <div>
                    <h2 className="display-md text-white">Veredito AI</h2>
                    <p className="body text-[13px] mt-1">Recomendacao baseada em custo-beneficio</p>
                  </div>
                </div>
                <Badge variant="success" dot className="text-xs px-4 py-1.5">
                  <Trophy className="w-3 h-3 mr-1" />
                  Melhor Opcao: {analysis.melhor.nome}
                </Badge>
              </div>

              {/* Best option hero card */}
              <div className="surface-recessed rounded-xl border border-mint/[0.1] p-6 mb-6">
                <div className="flex items-start gap-6">
                  {/* Winner icon */}
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-mint/20 to-accent-cyan/10 flex items-center justify-center border border-mint/15">
                      {(() => {
                        const WinnerIcon = SCENARIO_ICON_MAP[analysis.melhor.nome] || CheckCircle;
                        return <WinnerIcon className="w-8 h-8 text-mint" />;
                      })()}
                    </div>
                  </div>
                  {/* Winner details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="display-md text-mint">{analysis.melhor.nome}</h3>
                      <Badge variant="success">RECOMENDADO</Badge>
                    </div>
                    <p className="body text-[15px] mb-4">{analysis.recomendacao}</p>
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="label-micro text-white/25">Custo Total</span>
                        <div className="metric-value text-mint mt-2">{formatCurrency(analysis.melhor.resumo.custoTotalEquipe)}</div>
                      </div>
                      <div className="w-px h-10 bg-white/[0.06]" />
                      <div>
                        <span className="label-micro text-white/25">Economia vs. Pior</span>
                        <div className="metric-value text-accent-cyan mt-2">{formatCurrency(analysis.economia)}</div>
                      </div>
                      <div className="w-px h-10 bg-white/[0.06]" />
                      <div>
                        <span className="label-micro text-white/25">Tempo Transito</span>
                        <div className="metric-value text-white/70 mt-2">{formatHours(analysis.melhor.resumo.horasTransito)}</div>
                      </div>
                      <div className="w-px h-10 bg-white/[0.06]" />
                      <div>
                        <span className="label-micro text-white/25">Mais Rapido</span>
                        <div className="text-[1.125rem] font-semibold text-accent-purple mt-2 tabular-data">{analysis.maisRapido.nome} ({formatHours(analysis.maisRapido.resumo.horasTransito)})</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Strip integrated */}
              <div className="surface-recessed grid grid-cols-4 gap-0 rounded-2xl overflow-hidden">
                <MetricCell
                  label="Melhor Custo"
                  value={formatCurrency(analysis.melhor.resumo.custoTotalEquipe)}
                  detail={analysis.melhor.nome}
                  icon={TrendingDown}
                  color="mint"
                />
                <MetricCell
                  label="Maior Custo"
                  value={formatCurrency(analysis.pior.resumo.custoTotalEquipe)}
                  detail={analysis.pior.nome}
                  icon={DollarSign}
                  color="accent"
                  border
                />
                <MetricCell
                  label="Economia Potencial"
                  value={formatCurrency(analysis.economia)}
                  detail="Diferenca entre melhor e pior"
                  icon={Zap}
                  color="info"
                  border
                  highlight
                />
                <MetricCell
                  label="Mais Rapido"
                  value={formatHours(analysis.maisRapido.resumo.horasTransito)}
                  detail={analysis.maisRapido.nome}
                  icon={Clock}
                  color="neutral"
                  border
                />
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              COMPARISON CARDS — Side by side modals
              ═══════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {analysis.cenarios.map((c, i) => {
              const isBest = c.nome === bestName;
              const isFastest = c.nome === fastestName;
              const scenarioColor = getComparatorScenarioAccent(c.nome, bestName);
              const ScenarioIcon = SCENARIO_ICON_MAP[c.nome] || BarChart3;

              return (
                <section
                  key={i}
                  className={`surface-card relative overflow-hidden rounded-2xl border transition-all ${
                    isBest
                      ? 'border-mint/[0.15]'
                      : 'border-white/[0.06]'
                  }`}
                >
                  {isBest && (
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/30 to-transparent" />
                  )}
                  {!isBest && (
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${scenarioColor}15, transparent)` }} />
                  )}

                  <div className="relative p-6">
                    {/* Header with badges */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center border"
                          style={{
                            backgroundColor: isBest ? undefined : `${scenarioColor}10`,
                            borderColor: isBest ? undefined : `${scenarioColor}15`,
                          }}
                          {...(isBest ? { className: 'w-10 h-10 rounded-xl flex items-center justify-center border border-mint/15 bg-gradient-to-br from-mint/20 to-mint/5' } : {})}
                        >
                          <ScenarioIcon className="w-5 h-5" style={{ color: isBest ? '#49DC7A' : scenarioColor }} />
                        </div>
                        <h3 className={`heading ${isBest ? 'text-mint' : 'text-white/80'}`}>{c.nome}</h3>
                      </div>
                      <div className="flex gap-1.5">
                        {isBest && <Badge variant="success" dot compact>Melhor Custo</Badge>}
                        {isFastest && <Badge variant="info" dot compact>Mais Rapido</Badge>}
                      </div>
                    </div>

                    {/* Total cost prominent */}
                    <div className={`display-lg mb-2 ${isBest ? 'text-mint' : ''}`}>
                      {formatCurrency(c.resumo.custoTotalEquipe)}
                    </div>
                    <p className="label-micro mb-4">Custo total · {c.qtdColaboradores} colab.</p>

                    {/* Cost breakdown */}
                    <div className="space-y-3">
                      <CostRow label="Horas Trabalhadas" value={c.resumo.custoEquipeHoras} total={c.resumo.custoTotalEquipe} color="#3B82F6" />
                      <CostRow label="Deslocamento" value={c.resumo.custoEquipeTransito} total={c.resumo.custoTotalEquipe} color="#F59E0B" />
                      <CostRow label="Passagens" value={c.resumo.custoEquipePassagens} total={c.resumo.custoTotalEquipe} color="#A855F7" />
                      <CostRow label="Hospedagem" value={c.resumo.custoEquipeHospedagem} total={c.resumo.custoTotalEquipe} color="#49DC7A" />
                      <CostRow label="Alimentacao" value={c.resumo.custoEquipeAlimentacao} total={c.resumo.custoTotalEquipe} color="#22F2EF" />
                      <CostRow label="Logistico" value={c.resumo.custoLogistico} total={c.resumo.custoTotalEquipe} color="#EF4444" />
                    </div>

                    {/* Time info */}
                    <div className="mt-4 pt-4 border-t border-white/[0.04]">
                      <div className="flex items-center justify-between">
                        <span className="label-micro text-white/30">Tempo de Transito</span>
                        <span className={`tabular-data text-sm font-bold ${isFastest ? 'text-info-text' : 'text-white/60'}`}>
                          {formatHours(c.resumo.horasTransito)}
                          {isFastest && <span className="ml-1.5 text-[10px] text-info-text/70">(ida)</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════
              COST-BENEFIT ANALYSIS
              ═══════════════════════════════════════════ */}
          {analysis.economia > 0 && (
            <section className="surface-card relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/15 to-transparent" />
              <div className="relative p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center border border-accent-cyan/10">
                    <Shield className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div>
                    <h3 className="heading text-white/80">Analise Custo-Beneficio</h3>
                    <p className="body text-[13px] mt-1">Economia e eficiencia temporal entre cenarios</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Savings */}
                  <div className="surface-recessed rounded-xl border border-mint/[0.08] bg-mint/[0.02] p-4">
                    <span className="label-micro text-mint/50">Economia Total</span>
                    <div className="metric-value text-mint mt-2">{formatCurrency(analysis.economia)}</div>
                    <p className="body text-[13px] mt-2">
                      Escolhendo {analysis.melhor.nome} ao inves de {analysis.pior.nome}
                    </p>
                  </div>

                  {/* Time savings */}
                  <div className="surface-recessed rounded-xl border border-accent-blue/[0.08] bg-accent-blue/[0.02] p-4">
                    <span className="label-micro text-info-text/70">Diferenca de Tempo</span>
                    <div className="metric-value text-info-text mt-2">
                      {formatHours(Math.abs(analysis.melhor.resumo.horasTransito - analysis.maisRapido.resumo.horasTransito))}
                    </div>
                    <p className="body text-[13px] mt-2">
                      {analysis.melhor.nome === analysis.maisRapido.nome
                        ? 'Melhor custo E mais rapido'
                        : `${analysis.maisRapido.nome} e mais rapido que ${analysis.melhor.nome}`
                      }
                    </p>
                  </div>

                  {/* Cost per hour of transit saved */}
                  <div className="surface-recessed rounded-xl border border-accent-purple/[0.08] bg-accent-purple/[0.02] p-4">
                    <span className="label-micro text-accent-purple/50">Custo por Hora Economizada</span>
                    <div className="metric-value text-accent-purple mt-2">
                      {(() => {
                        const timeDiff = Math.abs(analysis.pior.resumo.horasTransito - analysis.melhor.resumo.horasTransito);
                        return timeDiff > 0 ? formatCurrency(analysis.economia / timeDiff) : '--';
                      })()}
                    </div>
                    <p className="body text-[13px] mt-2">
                      Valor economizado por hora de transito reduzida
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════
              CHART — Visual Comparison
              ═══════════════════════════════════════════ */}
          <section className="surface-card relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="relative p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/10">
                  <BarChart3 className="w-4 h-4 text-accent-blue" />
                </div>
                <h3 className="heading text-white/80">Comparativo Visual</h3>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="Horas Trabalhadas" stackId="a" fill={COST_BREAKDOWN_COLORS['Horas Trabalhadas']} fillOpacity={0.76} />
                    <Bar dataKey="Deslocamento" stackId="a" fill={COST_BREAKDOWN_COLORS.Deslocamento} fillOpacity={0.76} />
                    <Bar dataKey="Passagens" stackId="a" fill={COST_BREAKDOWN_COLORS.Passagens} fillOpacity={0.76} />
                    <Bar dataKey="Hosp + Alim" stackId="a" fill={COST_BREAKDOWN_COLORS['Hosp + Alim']} fillOpacity={0.76} />
                    <Bar dataKey="Logistico" stackId="a" fill={COST_BREAKDOWN_COLORS.Logistico} fillOpacity={0.76} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              DETAIL TABLE
              ═══════════════════════════════════════════ */}
          <section className="surface-card relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="relative">
              <div className="px-6 py-6 flex items-center gap-3">
                <div className="surface-recessed w-9 h-9 rounded-xl flex items-center justify-center">
                  <Settings className="w-4 h-4 text-white/40" />
                </div>
                <h3 className="heading text-white/80">Detalhamento Comparativo</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-6 py-4 label-micro text-white/20 text-left">Categoria</th>
                      {analysis.cenarios.map((c, i) => {
                        const isBest = c.nome === bestName;
                        const ScIcon = SCENARIO_ICON_MAP[c.nome] || BarChart3;
                        const scColor = getComparatorScenarioAccent(c.nome, bestName);
                        return (
                          <th key={i} className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <ScIcon className="w-3.5 h-3.5" style={{ color: scColor }} />
                              <span className={`label-micro ${isBest ? 'text-mint/60' : 'text-white/20'}`}>
                                {c.nome}
                              </span>
                              {isBest && (
                                <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Horas Trabalhadas', key: 'custoEquipeHoras' },
                      { label: 'Tempo Deslocamento', key: 'custoEquipeTransito' },
                      { label: 'Passagens', key: 'custoEquipePassagens' },
                      { label: 'Hospedagem', key: 'custoEquipeHospedagem' },
                      { label: 'Alimentacao', key: 'custoEquipeAlimentacao' },
                      { label: 'Veiculo/Logistico', key: 'custoLogistico' },
                    ].map((row, ri) => {
                      // Find the minimum value for this row to highlight it
                      const values = analysis.cenarios.map(c => c.resumo[row.key]);
                      const minVal = Math.min(...values);
                      return (
                        <tr key={ri} className="border-b border-white/[0.04]/50 hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3 text-sm text-white/50">{row.label}</td>
                          {analysis.cenarios.map((c, ci) => {
                            const isMin = c.resumo[row.key] === minVal && minVal > 0;
                            return (
                              <td key={ci} className={`px-6 py-3 tabular-data text-sm text-right font-medium ${isMin ? 'text-mint/80' : 'text-white/60'}`}>
                                {formatCurrency(c.resumo[row.key])}
                                {isMin && <span className="ml-1 text-mint/40 text-[10px]">min</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr className="bg-white/[0.02]">
                      <td className="px-6 py-4 label-micro text-white">Custo Total</td>
                      {analysis.cenarios.map((c, ci) => {
                        const isBest = c.nome === bestName;
                        return (
                          <td key={ci} className={`px-6 py-4 tabular-data text-sm font-bold text-right ${isBest ? 'text-mint' : 'text-white'}`}>
                            {formatCurrency(c.resumo.custoTotalEquipe)}
                            {isBest && (
                              <CheckCircle className="w-3.5 h-3.5 text-mint inline ml-1.5 -mt-0.5" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

function MetricCell({ label, value, detail, icon: Icon, color, border, highlight }) {
  const colors = {
    success: { icon: 'text-success-text', value: 'text-success-text', bg: 'bg-success-bg' },
    info: { icon: 'text-info-text', value: 'text-info-text', bg: 'bg-info-bg' },
    accent: { icon: 'text-accent-text', value: 'text-accent-text', bg: 'bg-accent-bg' },
    neutral: { icon: 'text-white/50', value: 'text-white/70', bg: 'bg-white/[0.06]' },
    mint: { icon: 'text-success-text', value: 'text-success-text', bg: 'bg-success-bg' },
    cyan: { icon: 'text-info-text', value: 'text-info-text', bg: 'bg-info-bg' },
    orange: { icon: 'text-accent-text', value: 'text-accent-text', bg: 'bg-accent-bg' },
    blue: { icon: 'text-info-text', value: 'text-info-text', bg: 'bg-info-bg' },
  };
  const c = colors[color] || colors.success;

  return (
    <div className={`relative px-6 py-6 ${border ? 'border-l border-white/[0.04]' : ''}`}>
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-r from-accent-cyan/[0.03] to-transparent pointer-events-none" />
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="label-micro text-white/30">{label}</span>
          {Icon && (
            <div className={`w-8 h-8 rounded-xl ${c.bg} flex items-center justify-center`}>
              <Icon className={`w-[15px] h-[15px] ${c.icon}`} />
            </div>
          )}
        </div>
        <div className={`metric-value ${c.value}`}>{value}</div>
        {detail && <p className="body text-[13px] mt-2">{detail}</p>}
      </div>
    </div>
  );
}

function CostRow({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="body text-[13px]">{label}</span>
          <span className="tabular-data text-[11px] text-white/50 font-semibold">{formatCurrency(value)}</span>
        </div>
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color, opacity: 0.6 }}
          />
        </div>
      </div>
      <span className="tabular-data text-[10px] text-white/20 font-medium w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}
