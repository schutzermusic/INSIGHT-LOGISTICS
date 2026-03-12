import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, Clock, Sparkles, ArrowRight,
  Plane, Bus, Car, Route, Target, Zap, BarChart3 as BarChartIcon,
  Globe, ChevronRight, LayoutDashboard, Brain, TrendingDown,
  MapPin, Activity,
} from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { formatCurrency } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { GlassCard, GlassCardHeader, GlassCardTitle } from '../components/ui/GlassCard';
import { KpiCard } from '../components/ui/KpiCard';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';

const CHART_COLORS = ['#49DC7A', '#F97316', '#22F2EF', '#A855F7', '#3B82F6', '#EF4444'];
const MODAL_COLORS = { 'Onibus': '#F59E0B', 'Aereo': '#3B82F6', 'Veiculo/Frota': '#A855F7', 'Veiculo Proprio/Locado': '#A855F7', 'Misto': '#22F2EF' };

export default function Dashboard() {
  const { collaborators } = useCollaborators();
  const { simulations } = useSimulations();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const totalSims = simulations.length;
    const totalCollabs = collaborators.length;
    let avgCost = 0;
    let totalSavings = 0;
    let avgTravelTime = 0;
    const aiCount = simulations.filter(s => s.type === 'ai-analysis').length;

    if (totalSims > 0) {
      const totalCost = simulations.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0);
      avgCost = totalCost / totalSims;
      avgTravelTime = simulations.reduce((s, sim) => s + (sim.resumo?.horasTransito || 0), 0) / totalSims;

      const comparisons = simulations.filter(s => s.type === 'comparison' || s.type === 'ai-analysis');
      if (comparisons.length >= 2) {
        const costs = comparisons.map(s => s.resumo?.custoTotalEquipe || 0).sort((a, b) => a - b);
        totalSavings = costs[costs.length - 1] - costs[0];
      }
    }

    return { totalSims, totalCollabs, avgCost, totalSavings, avgTravelTime, aiCount };
  }, [simulations, collaborators]);

  const costByModal = useMemo(() => {
    const byModal = {};
    simulations.forEach(s => {
      const modal = s.modal || 'Outro';
      if (!byModal[modal]) byModal[modal] = { total: 0, count: 0 };
      byModal[modal].total += s.resumo?.custoTotalEquipe || 0;
      byModal[modal].count += 1;
    });
    return Object.entries(byModal).map(([name, data]) => ({
      name,
      custo: Math.round(data.total / data.count),
      quantidade: data.count,
    }));
  }, [simulations]);

  const costDistribution = useMemo(() => {
    const latest = simulations.find(s => s.resumo);
    if (!latest) return [];
    const r = latest.resumo;
    return [
      { name: 'Horas', value: r.custoEquipeHoras || 0 },
      { name: 'Deslocamento', value: r.custoEquipeTransito || 0 },
      { name: 'Passagens', value: r.custoEquipePassagens || 0 },
      { name: 'Hospedagem', value: r.custoEquipeHospedagem || 0 },
      { name: 'Alimentacao', value: r.custoEquipeAlimentacao || 0 },
      { name: 'Logistico', value: r.custoLogistico || 0 },
    ].filter(d => d.value > 0);
  }, [simulations]);

  const trendData = useMemo(() => {
    const recent = [...simulations].reverse().slice(0, 10);
    return recent.map((s, i) => ({
      name: `#${i + 1}`,
      custo: s.resumo?.custoTotalEquipe || 0,
      transito: s.resumo?.horasTransito || 0,
    }));
  }, [simulations]);

  const modalDistribution = useMemo(() => {
    const dist = {};
    simulations.forEach(s => {
      const modal = s.modal || 'Outro';
      dist[modal] = (dist[modal] || 0) + 1;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [simulations]);

  const recentSims = simulations.slice(0, 5);

  if (stats.totalSims === 0 && stats.totalCollabs === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader
          title="Dashboard"
          subtitle="Visao geral de inteligencia logistica e custos operacionais"
          icon={LayoutDashboard}
        />
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

  return (
    <div className="animate-fade-in space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-3xl bg-gradient-to-br from-mint/20 to-accent-cyan/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-mint" />
              </div>
              <div>
                <h2 className="text-heading text-white">Dashboard</h2>
                <p className="text-sm text-white/30">Inteligencia logistica e custos operacionais</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats.aiCount > 0 && (
              <Badge variant="purple" dot>{stats.aiCount} analises AI</Badge>
            )}
            <LiquidMetalButton label="Nova Analise AI" onClick={() => navigate('/inteligencia-rotas')} />
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          label="Mobilizacoes Hoje"
          value={stats.totalSims}
          detail={`${stats.aiCount} via inteligencia artificial`}
          icon={Route}
          accent="mint"
        />
        <KpiCard
          label="Custo Medio"
          value={stats.totalSims > 0 ? formatCurrency(stats.avgCost) : 'R$ 0'}
          detail="Media por mobilizacao"
          icon={DollarSign}
          accent="cyan"
        />
        <KpiCard
          label="Economia Gerada"
          value={stats.totalSavings > 0 ? formatCurrency(stats.totalSavings) : 'R$ 0'}
          detail="AI Savings entre cenarios"
          icon={TrendingDown}
          accent="orange"
        />
        <KpiCard
          label="Tempo Medio Transito"
          value={stats.avgTravelTime > 0 ? `${stats.avgTravelTime.toFixed(1)}h` : '0h'}
          detail={`${stats.totalCollabs} colaboradores ativos`}
          icon={Clock}
          accent="blue"
        />
      </div>

      {/* Charts Row 1 — Cost Evolution + Modal Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <GlassCard className="lg:col-span-2">
          <GlassCardHeader>
            <GlassCardTitle icon={TrendingUp}>Evolucao de Custos</GlassCardTitle>
          </GlassCardHeader>
          {trendData.length > 1 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="gradMint" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#49DC7A" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#49DC7A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                  <Area
                    type="monotone"
                    dataKey="custo"
                    name="Custo Total"
                    stroke="#49DC7A"
                    strokeWidth={2.5}
                    fill="url(#gradMint)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-white/15 text-sm">
              Dados insuficientes para grafico de tendencia
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <GlassCardHeader>
            <GlassCardTitle icon={BarChartIcon}>Modais Utilizados</GlassCardTitle>
          </GlassCardHeader>
          {modalDistribution.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modalDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {modalDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-white/15 text-sm">
              Sem dados de modais
            </div>
          )}
        </GlassCard>
      </div>

      {/* Charts Row 2 — Cost by Modal + Cost Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassCard>
          <GlassCardHeader>
            <GlassCardTitle icon={DollarSign}>Custo Medio por Modal</GlassCardTitle>
          </GlassCardHeader>
          {costByModal.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByModal} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={100} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                  <Bar dataKey="custo" name="Custo Medio" radius={[0, 8, 8, 0]}>
                    {costByModal.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-white/15 text-sm">
              Sem dados
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <GlassCardHeader>
            <GlassCardTitle icon={Target}>Distribuicao de Custos</GlassCardTitle>
          </GlassCardHeader>
          {costDistribution.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {costDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-white/15 text-sm">
              Sem dados de distribuicao
            </div>
          )}
        </GlassCard>
      </div>

      {/* Recent Simulations */}
      {recentSims.length > 0 && (
        <GlassCard>
          <GlassCardHeader
            action={
              <button
                className="text-xs text-white/25 hover:text-mint flex items-center gap-1.5 transition-colors font-medium"
                onClick={() => navigate('/historico')}
              >
                Ver todos <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          >
            <GlassCardTitle icon={Clock}>Simulacoes Recentes</GlassCardTitle>
          </GlassCardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">Simulacao</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">Modal</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">Rota</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">Equipe</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-right">Custo Total</th>
                </tr>
              </thead>
              <tbody>
                {recentSims.map((sim, i) => (
                  <tr key={sim.id || i} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-white">{sim.nome || 'Simulacao'}</td>
                    <td className="px-5 py-4">
                      <Badge variant={sim.modal === 'Aereo' ? 'blue' : sim.modal === 'Onibus' ? 'amber' : 'purple'}>
                        {sim.modal || '-'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-white/40">{sim.origem || '-'} → {sim.destino || '-'}</td>
                    <td className="px-5 py-4 text-sm text-white/40">{sim.qtdColaboradores || '-'} pessoa(s)</td>
                    <td className="px-5 py-4 text-sm font-bold text-mint text-right">{formatCurrency(sim.resumo?.custoTotalEquipe || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
        <QuickAction
          icon={Globe}
          label="Inteligencia de Rotas"
          description="Analise AI multi-modal"
          accent="from-accent-purple to-accent-blue"
          onClick={() => navigate('/inteligencia-rotas')}
        />
        <QuickAction
          icon={BarChartIcon}
          label="Comparar Cenarios"
          description="Bus vs Air vs Car"
          accent="from-accent-orange to-accent-orange-dark"
          onClick={() => navigate('/comparador')}
        />
        <QuickAction
          icon={Users}
          label="Gerenciar Equipe"
          description={`${stats.totalCollabs} cadastrado(s)`}
          accent="from-accent-cyan to-accent-blue"
          onClick={() => navigate('/colaboradores')}
        />
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, description, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className="glass-card-interactive p-5 flex items-center gap-4 text-left group"
    >
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center flex-shrink-0 shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors block">{label}</span>
        {description && <span className="text-[11px] text-white/25 block mt-0.5">{description}</span>}
      </div>
      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/35 transition-colors flex-shrink-0" />
    </button>
  );
}
