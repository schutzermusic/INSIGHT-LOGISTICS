import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, Clock, Sparkles, ArrowRight,
  Route, Target, BarChart3 as BarChartIcon,
  Globe, ChevronRight, Brain, TrendingDown,
  Activity, Layers, Crosshair, Radio,
  MapPin, Zap, AlertTriangle, CheckCircle, Compass,
} from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { formatCurrency } from '../engine/calculator.js';
import { getExtendedCitiesData } from '../engine/routes-intelligence-db.js';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import BrazilMap, { buildMapRoutes, buildMapPoints } from '../components/map/BrazilMap';

const CHART_COLORS = ['#49DC7A', '#F97316', '#22F2EF', '#A855F7', '#3B82F6', '#EF4444'];

export default function Dashboard() {
  const { collaborators } = useCollaborators();
  const { simulations } = useSimulations();
  const navigate = useNavigate();

  const citiesDb = useMemo(() => getExtendedCitiesData(), []);

  // Exclude manual comparisons (type: 'comparison') from dashboard metrics
  const dashboardSims = useMemo(() => simulations.filter(s => s.type !== 'comparison'), [simulations]);

  const stats = useMemo(() => {
    const totalSims = dashboardSims.length;
    const totalCollabs = collaborators.length;
    let avgCost = 0;
    let totalSavings = 0;
    let avgTravelTime = 0;
    const aiCount = dashboardSims.filter(s => s.type === 'ai-analysis').length;

    if (totalSims > 0) {
      const totalCost = dashboardSims.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0);
      avgCost = totalCost / totalSims;
      avgTravelTime = dashboardSims.reduce((s, sim) => s + (sim.resumo?.horasTransito || 0), 0) / totalSims;

      const aiAnalyses = dashboardSims.filter(s => s.type === 'ai-analysis');
      if (aiAnalyses.length >= 2) {
        const costs = aiAnalyses.map(s => s.resumo?.custoTotalEquipe || 0).sort((a, b) => a - b);
        totalSavings = costs[costs.length - 1] - costs[0];
      }
    }

    return { totalSims, totalCollabs, avgCost, totalSavings, avgTravelTime, aiCount };
  }, [dashboardSims, collaborators]);

  const costComposition = useMemo(() => {
    if (dashboardSims.length === 0) return [];
    const totals = { horas: 0, transito: 0, passagens: 0, hospedagem: 0, alimentacao: 0, logistico: 0 };
    dashboardSims.forEach(s => {
      const r = s.resumo;
      if (!r) return;
      totals.horas += r.custoEquipeHoras || 0;
      totals.transito += r.custoEquipeTransito || 0;
      totals.passagens += r.custoEquipePassagens || 0;
      totals.hospedagem += r.custoEquipeHospedagem || 0;
      totals.alimentacao += r.custoEquipeAlimentacao || 0;
      totals.logistico += r.custoLogistico || 0;
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    return [
      { name: 'Horas Trabalhadas', value: totals.horas, pct: Math.round((totals.horas / total) * 100) },
      { name: 'Deslocamento', value: totals.transito, pct: Math.round((totals.transito / total) * 100) },
      { name: 'Passagens', value: totals.passagens, pct: Math.round((totals.passagens / total) * 100) },
      { name: 'Hospedagem', value: totals.hospedagem, pct: Math.round((totals.hospedagem / total) * 100) },
      { name: 'Alimentacao', value: totals.alimentacao, pct: Math.round((totals.alimentacao / total) * 100) },
      { name: 'Logistico', value: totals.logistico, pct: Math.round((totals.logistico / total) * 100) },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [dashboardSims]);

  const trendData = useMemo(() => {
    const recent = [...dashboardSims].reverse().slice(0, 10);
    return recent.map((s, i) => ({
      name: `#${i + 1}`,
      custo: s.resumo?.custoTotalEquipe || 0,
      transito: s.resumo?.horasTransito || 0,
    }));
  }, [dashboardSims]);

  const modalDistribution = useMemo(() => {
    const dist = {};
    dashboardSims.forEach(s => {
      const modal = s.modal || 'Outro';
      dist[modal] = (dist[modal] || 0) + 1;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [dashboardSims]);

  const topDestinations = useMemo(() => {
    const destCount = {};
    dashboardSims.forEach(s => {
      const dest = s.destino;
      if (!dest) return;
      if (!destCount[dest]) destCount[dest] = { name: dest, count: 0, totalCost: 0 };
      destCount[dest].count += 1;
      destCount[dest].totalCost += s.resumo?.custoTotalEquipe || 0;
    });
    return Object.values(destCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(d => ({
        ...d,
        shortName: d.name.split(' - ')[0],
        avgCost: d.count > 0 ? Math.round(d.totalCost / d.count) : 0,
      }));
  }, [dashboardSims]);

  const mapRoutes = useMemo(() => buildMapRoutes(dashboardSims, citiesDb), [dashboardSims, citiesDb]);
  const mapPoints = useMemo(() => buildMapPoints(dashboardSims, citiesDb), [dashboardSims, citiesDb]);

  const aiInsights = useMemo(() => {
    const insights = [];

    if (stats.totalSavings > 0) {
      insights.push({
        type: 'success',
        icon: CheckCircle,
        title: 'Economia Detectada',
        text: `Economia de ${formatCurrency(stats.totalSavings)} identificada entre cenarios comparados. Continue otimizando com analise AI.`,
      });
    }

    if (stats.aiCount > 0) {
      insights.push({
        type: 'info',
        icon: Brain,
        title: 'Analises Inteligentes',
        text: `${stats.aiCount} analise(s) inteligente(s) realizada(s) com otimizacao multi-modal e recomendacoes automaticas.`,
      });
    }

    if (stats.avgTravelTime > 8) {
      insights.push({
        type: 'warning',
        icon: AlertTriangle,
        title: 'Tempo de Transito Elevado',
        text: `Media de ${stats.avgTravelTime.toFixed(1)}h de transito por mobilizacao. Considere modais aereos para destinos distantes.`,
      });
    }

    if (topDestinations.length > 0) {
      const topDest = topDestinations[0];
      insights.push({
        type: 'info',
        icon: MapPin,
        title: 'Destino Mais Frequente',
        text: `${topDest.shortName} concentra ${topDest.count} mobilizacao(es) com custo medio de ${formatCurrency(topDest.avgCost)}.`,
      });
    }

    if (costComposition.length > 0) {
      const biggest = costComposition[0];
      if (biggest.pct >= 40) {
        insights.push({
          type: 'warning',
          icon: Zap,
          title: 'Concentracao de Custo',
          text: `"${biggest.name}" representa ${biggest.pct}% dos custos totais. Avalie oportunidades de reducao nessa categoria.`,
        });
      }
    }

    if (stats.totalSims > 0 && stats.aiCount === 0) {
      insights.push({
        type: 'suggestion',
        icon: Sparkles,
        title: 'Use Inteligencia AI',
        text: 'Nenhuma analise AI realizada ainda. Use a inteligencia de rotas para otimizar custos automaticamente.',
      });
    }

    if (mapRoutes.length > 3) {
      insights.push({
        type: 'info',
        icon: Compass,
        title: 'Cobertura Nacional',
        text: `${mapRoutes.length} corredores logisticos ativos em ${mapPoints.length} pontos do territorio nacional.`,
      });
    }

    if (stats.totalSims === 0) {
      insights.push({
        type: 'suggestion',
        icon: Sparkles,
        title: 'Comece Agora',
        text: 'Crie simulacoes para receber insights automaticos de otimizacao logistica.',
      });
    }

    return insights;
  }, [stats, topDestinations, costComposition, mapRoutes, mapPoints]);

  const recentSims = dashboardSims.slice(0, 5);

  if (stats.totalSims === 0 && stats.totalCollabs === 0) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-mint/20 to-accent-cyan/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-mint" />
            </div>
            <h2 className="text-heading text-white">Centro de Comando</h2>
          </div>
        </div>
        <EmptyState
          icon={Sparkles}
          title="Bem-vindo ao Insight Logistics"
          description="Comece cadastrando seus colaboradores e criando analises para visualizar dados de inteligencia logistica."
        >
          <LiquidMetalButton label="Cadastrar Equipe" width={180} onClick={() => navigate('/colaboradores')} />
        </EmptyState>
      </div>
    );
  }

  const topModal = modalDistribution.length > 0
    ? modalDistribution.reduce((a, b) => a.value > b.value ? a : b).name
    : '—';

  return (
    <div className="animate-fade-in space-y-6">

      {/* ═══════════════════════════════════════════
          ZONE 1 — EXECUTIVE HERO / COMMAND HEADER
          ═══════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-dark-850/80 via-dark-900/60 to-dark-950/80 backdrop-blur-xl">
        {/* Ambient gradient orbs */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-mint/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-accent-cyan/[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/20 to-transparent" />

        <div className="relative px-8 py-7">
          {/* Top row: title + status + action */}
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mint/15 to-accent-cyan/10 flex items-center justify-center border border-mint/10">
                <Crosshair className="w-5 h-5 text-mint" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Centro de Comando</h1>
                <p className="text-[13px] text-white/30 mt-0.5">Inteligencia logistica em tempo real</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* AI Engine Status */}
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint/60 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-mint" />
                </span>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">AI Engine Ativo</span>
                {stats.aiCount > 0 && (
                  <Badge variant="purple" className="ml-1">{stats.aiCount} analises</Badge>
                )}
              </div>
              <LiquidMetalButton label="Nova Analise" onClick={() => navigate('/inteligencia-rotas')} />
            </div>
          </div>

          {/* KPI INTEGRATED STRIP */}
          <div className="grid grid-cols-4 gap-0 rounded-2xl border border-white/[0.04] bg-white/[0.015] overflow-hidden">
            <MetricCell
              label="Mobilizacoes"
              value={stats.totalSims}
              detail={`${stats.aiCount} via AI`}
              icon={Route}
              color="mint"
            />
            <MetricCell
              label="Custo Medio"
              value={stats.totalSims > 0 ? formatCurrency(stats.avgCost) : 'R$ 0'}
              detail="por mobilizacao"
              icon={DollarSign}
              color="cyan"
              border
            />
            <MetricCell
              label="Economia AI"
              value={stats.totalSavings > 0 ? formatCurrency(stats.totalSavings) : 'R$ 0'}
              detail="entre cenarios"
              icon={TrendingDown}
              color="orange"
              border
              highlight={stats.totalSavings > 0}
            />
            <MetricCell
              label="Transito Medio"
              value={stats.avgTravelTime > 0 ? `${stats.avgTravelTime.toFixed(1)}h` : '0h'}
              detail={`${stats.totalCollabs} colaboradores`}
              icon={Clock}
              color="blue"
              border
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ZONE 2 — MAIN INTELLIGENCE PANEL
          Cost Evolution (8 cols) + Brazil Map (4 cols)
          ═══════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Primary panel — cost evolution, dominant */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/15 to-transparent" />
          <div className="p-7">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-mint/[0.08] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-mint/70" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Evolucao de Custos</h3>
                  <p className="text-[11px] text-white/25 mt-0.5">Tendencia das ultimas mobilizacoes</p>
                </div>
              </div>
              <Badge variant="mint" dot>Tempo real</Badge>
            </div>

            {trendData.length > 1 ? (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="gradMintMain" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#49DC7A" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#49DC7A" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradCyanLine" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22F2EF" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#22F2EF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Area type="monotone" dataKey="custo" name="Custo Total" stroke="#49DC7A" strokeWidth={2.5} fill="url(#gradMintMain)" dot={false} activeDot={{ r: 5, fill: '#49DC7A', stroke: '#0a0f0a', strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="transito" name="Horas Transito" stroke="#22F2EF" strokeWidth={1.5} fill="url(#gradCyanLine)" dot={false} activeDot={{ r: 4, fill: '#22F2EF', stroke: '#0a0f0a', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-white/15 text-sm">
                Dados insuficientes para grafico de tendencia
              </div>
            )}
          </div>
        </div>

        {/* Brazil Map — territorial intelligence */}
        <div className="lg:col-span-4 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/15 to-transparent" />
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent-cyan/[0.08] flex items-center justify-center">
                  <Globe className="w-[14px] h-[14px] text-accent-cyan/60" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Mapa de Operacoes</h4>
                  <p className="text-[10px] text-white/20 mt-0.5">{mapRoutes.length} rotas ativas</p>
                </div>
              </div>
              {mapPoints.length > 0 && (
                <Badge variant="cyan" className="text-[10px]">{mapPoints.length} pontos</Badge>
              )}
            </div>

            <div className="relative h-[300px]">
              <BrazilMap
                routes={mapRoutes}
                activePoints={mapPoints}
                showLabels={true}
                className="w-full h-full"
              />
              {mapRoutes.length === 0 && mapPoints.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Globe className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-[11px] text-white/20">Crie simulacoes para visualizar rotas no mapa</p>
                  </div>
                </div>
              )}
            </div>

            {/* Map legend */}
            {mapPoints.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-4 text-[10px] text-white/25">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                    <span>Origem/Destino</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-px bg-mint/50" style={{ borderTop: '1px dashed rgba(73,220,122,0.5)' }} />
                    <span>Rota ativa</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ZONE 3 — SECONDARY ANALYTICS (4x3 grid)
          Modal Distribution + Cost Composition + Top Destinations + AI Summary
          ═══════════════════════════════════════════ */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* Modal Distribution */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/15 to-transparent" />
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-accent-purple/[0.08] flex items-center justify-center">
                <Layers className="w-[14px] h-[14px] text-accent-purple/60" />
              </div>
              <h4 className="text-sm font-semibold text-white">Modais</h4>
            </div>

            {modalDistribution.length > 0 ? (
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modalDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={62}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {modalDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-white/15 text-xs">
                Sem dados
              </div>
            )}

            {modalDistribution.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                {modalDistribution.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[10px] text-white/35">{entry.name}</span>
                    <span className="text-[10px] text-white/60 font-semibold">{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cost Composition Breakdown */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-orange/15 to-transparent" />
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-accent-orange/[0.08] flex items-center justify-center">
                <Target className="w-[14px] h-[14px] text-accent-orange/60" />
              </div>
              <h4 className="text-sm font-semibold text-white">Composicao de Custos</h4>
            </div>

            {costComposition.length > 0 ? (
              <div className="space-y-2.5">
                {costComposition.map((item, i) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-white/40">{item.name}</span>
                      <span className="text-[11px] text-white/60 font-semibold">{item.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${item.pct}%`,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-white/15 text-xs">
                Sem dados de custos
              </div>
            )}
          </div>
        </div>

        {/* Top Destinations */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/15 to-transparent" />
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-7 h-7 rounded-lg bg-accent-cyan/[0.08] flex items-center justify-center">
                <MapPin className="w-[14px] h-[14px] text-accent-cyan/60" />
              </div>
              <h4 className="text-sm font-semibold text-white">Top Destinos</h4>
            </div>

            {topDestinations.length > 0 ? (
              <div className="space-y-2">
                {topDestinations.map((dest, i) => (
                  <div
                    key={dest.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-white/25">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-white/70 block truncate">{dest.shortName}</span>
                      <span className="text-[10px] text-white/25">{dest.count} mobilizacao(es)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-mint flex-shrink-0">{formatCurrency(dest.avgCost)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-white/15 text-xs">
                Sem destinos registrados
              </div>
            )}
          </div>
        </div>

        {/* AI Summary Card */}
        <div className="lg:col-span-3 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-mint/[0.03] via-dark-900/40 to-dark-950/60 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/20 to-transparent" />
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg bg-mint/[0.08] flex items-center justify-center">
                <Brain className="w-[14px] h-[14px] text-mint/60" />
              </div>
              <h4 className="text-sm font-semibold text-white">Resumo AI</h4>
            </div>
            <div className="space-y-3">
              <InsightRow label="Modal predominante" value={topModal} />
              <InsightRow label="Total simulacoes" value={stats.totalSims} />
              <InsightRow label="Equipe ativa" value={`${stats.totalCollabs} pessoas`} />
              <InsightRow label="Destinos unicos" value={topDestinations.length} />
              <InsightRow label="Corredores logisticos" value={mapRoutes.length} />
              {stats.totalSavings > 0 && (
                <InsightRow label="Economia detectada" value={formatCurrency(stats.totalSavings)} highlight />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          ZONE 4 — AI INSIGHTS STRIP (full width)
          ═══════════════════════════════════════════ */}
      {aiInsights.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-accent-purple/[0.03] via-dark-900/40 to-dark-950/60 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/20 to-transparent" />
          <div className="p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-accent-purple/[0.08] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-accent-purple/70" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Insights AI</h3>
                  <p className="text-[11px] text-white/25 mt-0.5">Recomendacoes inteligentes baseadas nos seus dados</p>
                </div>
              </div>
              <Badge variant="purple" dot>{aiInsights.length} insight(s)</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {aiInsights.map((insight, i) => (
                <AIInsightCard
                  key={i}
                  type={insight.type}
                  icon={insight.icon}
                  title={insight.title}
                  text={insight.text}
                />
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-center justify-between">
              <span className="text-[11px] text-white/20">Powered by Insight Logistics AI Engine</span>
              <button
                onClick={() => navigate('/inteligencia-rotas')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-purple/10 border border-accent-purple/15 text-accent-purple text-xs font-semibold hover:bg-accent-purple/15 transition-colors"
              >
                <Brain className="w-3.5 h-3.5" />
                Abrir Inteligencia de Rotas
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
          ZONE 5 — ACTIVITY STREAM + COMMAND ACTIONS
          ═══════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Recent simulations */}
        <div className="lg:col-span-8 relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-dark-850/60 to-dark-900/40 backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center">
                  <Radio className="w-[14px] h-[14px] text-white/40" />
                </div>
                <h4 className="text-sm font-semibold text-white">Atividade Recente</h4>
              </div>
              {recentSims.length > 0 && (
                <button
                  className="text-[11px] text-white/25 hover:text-mint flex items-center gap-1 transition-colors font-medium uppercase tracking-wider"
                  onClick={() => navigate('/historico')}
                >
                  Ver historico <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {recentSims.length > 0 ? (
              <div className="space-y-0">
                {recentSims.map((sim, i) => (
                  <div
                    key={sim.id || i}
                    className="flex items-center gap-4 px-4 py-3.5 -mx-1 rounded-xl hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-bold text-white/20">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white/80 block truncate">{sim.nome || 'Simulacao'}</span>
                      <span className="text-[11px] text-white/25">{sim.origem || '—'} → {sim.destino || '—'}</span>
                    </div>
                    <Badge variant={sim.modal === 'Aereo' ? 'blue' : sim.modal === 'Onibus' ? 'amber' : 'purple'}>
                      {sim.modal || '—'}
                    </Badge>
                    <span className="text-[11px] text-white/25 w-20 text-right">{sim.qtdColaboradores || '—'} pessoa(s)</span>
                    <span className="text-sm font-bold text-mint w-28 text-right">{formatCurrency(sim.resumo?.custoTotalEquipe || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-white/15 text-sm">
                Nenhuma simulacao registrada
              </div>
            )}
          </div>
        </div>

        {/* Command actions */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <CommandAction
            icon={Globe}
            label="Inteligencia de Rotas"
            description="Analise AI multi-modal com otimizacao"
            accentFrom="from-accent-purple/15"
            accentTo="to-accent-blue/10"
            borderColor="border-accent-purple/10"
            iconColor="text-accent-purple"
            onClick={() => navigate('/inteligencia-rotas')}
          />
          <CommandAction
            icon={BarChartIcon}
            label="Comparar Cenarios"
            description="Simule Bus vs Air vs Car"
            accentFrom="from-accent-orange/15"
            accentTo="to-accent-orange/5"
            borderColor="border-accent-orange/10"
            iconColor="text-accent-orange"
            onClick={() => navigate('/comparador')}
          />
          <CommandAction
            icon={Users}
            label="Gerenciar Equipe"
            description={`${stats.totalCollabs} colaborador(es) cadastrado(s)`}
            accentFrom="from-accent-cyan/15"
            accentTo="to-accent-blue/5"
            borderColor="border-accent-cyan/10"
            iconColor="text-accent-cyan"
            onClick={() => navigate('/colaboradores')}
          />
        </div>
      </section>
    </div>
  );
}


/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

function MetricCell({ label, value, detail, icon: Icon, color, border, highlight }) {
  const colors = {
    mint: { icon: 'text-mint', value: 'text-mint', bg: 'bg-mint/10' },
    cyan: { icon: 'text-accent-cyan', value: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
    orange: { icon: 'text-accent-orange', value: 'text-accent-orange', bg: 'bg-accent-orange/10' },
    blue: { icon: 'text-accent-blue', value: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  };
  const c = colors[color] || colors.mint;

  return (
    <div className={`relative px-6 py-5 ${border ? 'border-l border-white/[0.04]' : ''}`}>
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-r from-accent-orange/[0.03] to-transparent pointer-events-none" />
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.1em]">{label}</span>
          {Icon && (
            <div className={`w-8 h-8 rounded-xl ${c.bg} flex items-center justify-center`}>
              <Icon className={`w-[15px] h-[15px] ${c.icon}`} />
            </div>
          )}
        </div>
        <div className={`text-2xl font-bold tracking-tight ${c.value}`}>{value}</div>
        {detail && <p className="text-[11px] text-white/20 mt-1">{detail}</p>}
      </div>
    </div>
  );
}

function InsightRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
      <span className="text-[11px] text-white/30">{label}</span>
      <span className={`text-[13px] font-semibold ${highlight ? 'text-mint' : 'text-white/70'}`}>{value}</span>
    </div>
  );
}

function AIInsightCard({ type, icon: Icon, title, text }) {
  const styles = {
    success: {
      bg: 'bg-mint/[0.04]',
      border: 'border-mint/10',
      iconBg: 'bg-mint/[0.08]',
      iconColor: 'text-mint/70',
      titleColor: 'text-mint/90',
      textColor: 'text-mint/60',
    },
    info: {
      bg: 'bg-accent-blue/[0.04]',
      border: 'border-accent-blue/10',
      iconBg: 'bg-accent-blue/[0.08]',
      iconColor: 'text-accent-blue/70',
      titleColor: 'text-accent-blue/90',
      textColor: 'text-accent-blue/60',
    },
    warning: {
      bg: 'bg-accent-orange/[0.04]',
      border: 'border-accent-orange/10',
      iconBg: 'bg-accent-orange/[0.08]',
      iconColor: 'text-accent-orange/70',
      titleColor: 'text-accent-orange/90',
      textColor: 'text-accent-orange/60',
    },
    suggestion: {
      bg: 'bg-accent-purple/[0.04]',
      border: 'border-accent-purple/10',
      iconBg: 'bg-accent-purple/[0.08]',
      iconColor: 'text-accent-purple/70',
      titleColor: 'text-accent-purple/90',
      textColor: 'text-accent-purple/60',
    },
  };
  const s = styles[type] || styles.info;

  return (
    <div className={`px-4 py-4 rounded-2xl ${s.bg} border ${s.border}`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-lg ${s.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          {Icon && <Icon className={`w-3.5 h-3.5 ${s.iconColor}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <h5 className={`text-[12px] font-semibold ${s.titleColor} mb-1`}>{title}</h5>
          <p className={`text-[11px] leading-relaxed ${s.textColor}`}>{text}</p>
        </div>
      </div>
    </div>
  );
}

function CommandAction({ icon: Icon, label, description, accentFrom, accentTo, borderColor, iconColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 relative overflow-hidden rounded-2xl border ${borderColor} bg-gradient-to-r ${accentFrom} ${accentTo} backdrop-blur-xl p-5 flex items-center gap-4 text-left group hover:scale-[1.01] transition-all duration-200`}
    >
      <div className="w-11 h-11 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-white/90 block">{label}</span>
        <span className="text-[11px] text-white/30 block mt-0.5">{description}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </button>
  );
}
