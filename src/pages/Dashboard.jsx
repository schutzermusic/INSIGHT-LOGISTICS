/**
 * Insight Logistics — Command Center Dashboard (§1–§21).
 *
 * A real-time executive + operational control tower fed EXCLUSIVELY by confirmed
 * mobilizations (§3.1). Every number here comes from the backend aggregation
 * layer (DashboardService), which begins from the confirmed dataset — drafts,
 * searches, previews and unselected scenarios never appear. All money is integer
 * centavos from the API and formatted only at the edge.
 *
 * Layout (§7): HUD command hero + globe → KPI strip → financial analytics →
 * operational intelligence → supporting analytics, with global filters (§12) and
 * drill-down drawers (§11).
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Crosshair, Radio, Route as RouteIcon, Clock,
  TrendingDown, Users, AlertTriangle, ShieldCheck, Layers, Target, MapPin,
  Gauge, Moon, Filter, RotateCcw, ChevronRight, CheckCircle, Briefcase, Plane, Bus, Car,
  Hourglass, Package, TrendingUp, Timer,
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { formatBRL } from '../domain/money.js';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { MagneticWrap } from '../components/ui/MagneticWrap';
import { Modal } from '../components/ui/Modal';
import { PremiumAreaChart, PremiumDonutChart, SCurveChart, KpiSparkline } from '../components/charts';
import { STATUS_COLOR, STATUS_LABEL } from '../components/map/HudGlobe';
import GlobeStage from '../components/dashboard/GlobeStage';
import { CHART_PALETTE, CHART_SEQUENCE, accentByRank } from '../lib/chartTheme';


const fmtDur = (min) => {
  if (!min) return '0h';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};
const MODAL_META = {
  air: { label: 'Aéreo', icon: Plane }, bus: { label: 'Ônibus', icon: Bus },
  rental: { label: 'Locado', icon: Car }, fleet: { label: 'Frota', icon: Car },
  multimodal: { label: 'Multimodal', icon: Layers },
};

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', projectId: '', modal: '', status: '', source: '' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [drawer, setDrawer] = useState(null); // { type, payload }
  const { data, options, status, loading, error, lastSync } = useDashboard(filters);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const ov = data?.overview;
  const persistenceOff = status && status.persistenceEnabled === false;
  const hasData = ov && ov.totalMobilizationsInRange > 0;

  const trendData = useMemo(
    () => (data?.trend || []).map((d) => ({
      name: d.date.slice(5),
      custo: d.amountMinor,
      maoDeObra: d.laborAmountMinor,
      mobilizacoes: d.count,
      acumulado: d.cumulativeAmountMinor,
      ritmo: d.baselineAmountMinor,
    })),
    [data?.trend]
  );
  const modalDonut = useMemo(
    () => (data?.modalMix || []).map((m) => ({ name: MODAL_META[m.modal]?.label || m.modal, value: m.count })),
    [data?.modalMix]
  );

  return (
    <div className="space-y-7">
      {/* ═══ HERO COMMAND CENTER ═══ */}
      <section>
        <div className="flex items-start justify-between mb-7 gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 rounded-xl bg-accent/[0.12] flex items-center justify-center border border-accent/25">
              <Crosshair className="w-[18px] h-[18px] text-accent" strokeWidth={1.5} />
            </div>
            <div>
              <div className="mb-2">
                <span className="label-micro">Mobilizações confirmadas</span>
              </div>
              <h1 className="display-md">Centro de Comando</h1>
              <p className="body mt-1.5">
                {ov?.activeMobilizations ?? 0} operações ativas · {ov?.activeEmployeesInTransit ?? 0} colaboradores em trânsito
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-panel flex items-center gap-3 px-4 py-2 !rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="label-micro">Ao vivo</span>
              {lastSync && <span className="label-micro tabular-data">{lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            </div>
            <MagneticWrap strength={7}>
              <button onClick={() => navigate('/mobilizacao')} className="cta-white-with-accent">
                <span className="pl-2">Nova Análise</span>
                <span className="accent-chip"><Sparkles className="w-4 h-4" strokeWidth={2.5} /></span>
              </button>
            </MagneticWrap>
          </div>
        </div>

        {/* ── Tier 1: the number this product exists to control ──
            Left: total spend, large. Right: the composition split, because
            "custo de mobilização" is not one number — the useful question is
            how much of it is people-hours vs. moving them around. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
          <div className="lg:col-span-5 glass-panel p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="label-micro">Custo no período</span>
                <button onClick={() => setDrawer({ type: 'categories' })}
                  className="label-micro text-[color:var(--ink-3)] hover:text-accent transition-colors flex items-center gap-1">
                  Composição<ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <AnimatedNumber as="div" className="display-xl mt-3" value={ov?.totalSpendMinor ?? 0} format={(v) => formatBRL(Math.round(v))} />
              <p className="body text-[12px] mt-2">
                {ov?.totalMobilizationsInRange ?? 0} mobilizações confirmadas · média {formatBRL(ov?.averageSpendPerMobilizationMinor ?? 0)}
              </p>
            </div>
            {trendData.length > 1 && (
              <div className="mt-5 -mx-1">
                <KpiSparkline data={trendData.map((d) => d.custo)} width="100%" height={44} color="var(--chart-1)" />
              </div>
            )}
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 xl:grid-cols-4 gap-4">
            <CostCard label="Mão de obra" hint="horas + HE + noturno" icon={Hourglass}
              value={ov?.laborSpendMinor ?? 0} share={ov?.laborSharePercent}
              onClick={() => setDrawer({ type: 'labor' })} />
            <CostCard label="Logística" hint="passagens, hospedagem, transporte" icon={Package}
              value={ov?.logisticsSpendMinor ?? 0}
              share={ov?.laborSharePercent == null ? null : Math.round((100 - ov.laborSharePercent) * 10) / 10} />
            <CostCard label="Horas-equipe" icon={Timer} hint="duração × headcount"
              rawValue={`${(ov?.teamHours ?? 0).toLocaleString('pt-BR')}h`}
              detail={`equipe média ${ov?.averageTeamSize ?? 0}`} />
            <CostCard label="Custo / hora-equipe" icon={TrendingUp} hint="comparável entre rotas"
              value={ov?.costPerTeamHourMinor ?? 0} />
          </div>
        </div>

        {/* ── Tier 2: operational chips ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px rounded-xl border border-[color:var(--ink-line)] overflow-hidden bg-[color:var(--ink-line)]">
          <Kpi label="Ativas" value={ov?.activeMobilizations ?? 0} detail={`${ov?.multimodalCount ?? 0} multimodais`} icon={RouteIcon} onClick={() => setDrawer({ type: 'active' })} />
          <Kpi label="Economia" value={ov?.estimatedSavingsMinor ?? 0} money detail="vs. cenário não otimizado" icon={TrendingDown} highlight={(ov?.estimatedSavingsMinor ?? 0) > 0} />
          <Kpi label="Duração média" value={ov?.averageDurationMinutes ?? 0} duration detail="porta a porta" icon={Clock} />
          <Kpi label="No prazo" value={ov?.onTimeRate == null ? null : Math.round(ov.onTimeRate * 100)} suffix="%" detail="chegadas" icon={Gauge} />
          <Kpi label="Em trânsito" value={ov?.activeEmployeesInTransit ?? 0} detail="colaboradores" icon={Users} />
          <Kpi label="Alertas" value={ov?.alertCount ?? 0} detail="operacionais" icon={AlertTriangle} highlight={(ov?.alertCount ?? 0) > 0} onClick={() => setDrawer({ type: 'alerts' })} />
        </div>
      </section>

      {/* ═══ LIVE OPERATIONS CANVAS ═══ */}
      <GlobeStage
        items={data?.map || []}
        onSelect={(item) => setDrawer({ type: 'mobilization', payload: item })}
      />

      {/* ═══ GLOBAL FILTERS (§12) ═══ */}
      <section className="glass-panel">
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-white/40"><Filter className="w-4 h-4" /><span className="label-micro">Filtros</span></div>
          <input type="date" className="glass-input !py-1.5 !w-auto text-[13px]" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} aria-label="Data inicial" />
          <span className="text-white/20">→</span>
          <input type="date" className="glass-input !py-1.5 !w-auto text-[13px]" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} aria-label="Data final" />
          <FilterSelect value={filters.projectId} onChange={(v) => setFilter('projectId', v)} placeholder="Projeto"
            options={(options?.projects || []).map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect value={filters.modal} onChange={(v) => setFilter('modal', v)} placeholder="Modal"
            options={(options?.modals || []).map((m) => ({ value: m, label: MODAL_META[m]?.label || m }))} />
          <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} placeholder="Status"
            options={[{ value: 'confirmed', label: 'Confirmada' }, { value: 'in_progress', label: 'Em andamento' }, { value: 'completed', label: 'Concluída' }]} />
          <FilterSelect value={filters.source} onChange={(v) => setFilter('source', v)} placeholder="Origem"
            options={[{ value: 'automatic_mobilization', label: 'Automática' }, { value: 'manual_simulation', label: 'Manual' }]} />
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="flex items-center gap-1.5 label-micro text-white/40 hover:text-accent transition-colors ml-auto">
              <RotateCcw className="w-3.5 h-3.5" /> Limpar ({activeFilterCount})
            </button>
          )}
        </div>
      </section>

      {/* ═══ GOVERNANCE / EMPTY STATES ═══ */}
      {error && (
        <div className="glass-panel !border-danger/25 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-text flex-shrink-0" />
          <div><h3 className="heading text-white mb-1">Falha ao carregar o dashboard</h3><p className="body text-[13px]">{error}</p></div>
        </div>
      )}
      {persistenceOff && (
        <div className="glass-panel !border-warning/25 p-5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-warning-text flex-shrink-0" />
          <p className="body text-[13px]">Persistência de confirmações desativada — configure <span className="tabular-data text-white/70">SUPABASE_SERVICE_ROLE_KEY</span> no servidor para que mobilizações confirmadas alimentem o dashboard.</p>
        </div>
      )}
      {!loading && !hasData && !error && (
        <EmptyState icon={ShieldCheck} title="Nenhuma mobilização confirmada"
          description="O dashboard é alimentado apenas por mobilizações confirmadas nos fluxos de Simulação Manual ou Mobilização Automática. Rascunhos, buscas e cenários não selecionados nunca aparecem aqui.">
          <LiquidMetalButton label="Iniciar mobilização" width={200} onClick={() => navigate('/mobilizacao')} />
        </EmptyState>
      )}

      {hasData && (
        <>
          {/* ═══ FINANCIAL INTELLIGENCE ═══ */}
          {/* Curva S — how fast the period is burning, against a constant-rate
              reference. Full width because the shape only reads at width. */}
          <section>
            <Panel title="Curva S — acumulado do período" subtitle="Realizado vs. ritmo constante" icon={TrendingUp}
              action={
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 label-micro"><span className="w-3 h-[2px] rounded-full bg-accent" />Realizado</span>
                  <span className="flex items-center gap-1.5 label-micro"><span className="w-3 h-[2px] rounded-full" style={{ background: CHART_PALETTE.neutral }} />Ritmo constante</span>
                </div>
              }>
              <SCurveChart data={trendData} xKey="name" valueKey="acumulado" baselineKey="ritmo"
                yFormatter={(v) => `R$${(v / 100000).toFixed(0)}k`} tooltipValueFormatter={(v) => formatBRL(v)} height={300} />
            </Panel>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Panel className="lg:col-span-7" title="Evolução de custos" subtitle="Diário, separando mão de obra de logística" icon={TrendingDown}
              action={<Badge variant="success" dot>Confirmadas</Badge>}>
              {trendData.length > 1 ? (
                <PremiumAreaChart data={trendData} xKey="name"
                  series={[
                    { key: 'custo', name: 'Custo total', color: CHART_PALETTE.primary },
                    { key: 'maoDeObra', name: 'Mão de obra', color: CHART_PALETTE.neutral },
                  ]}
                  yFormatter={(v) => `R$${(v / 100000).toFixed(0)}k`} tooltipValueFormatter={(v) => formatBRL(v)} showLegend height={300} />
              ) : <NoData height={300} />}
            </Panel>

            <Panel className="lg:col-span-5" title="Gasto por categoria" subtitle="Composição normalizada" icon={Target}
              action={<button className="label-micro text-white/30 hover:text-accent flex items-center gap-1" onClick={() => setDrawer({ type: 'categories' })}>Detalhar<ChevronRight className="w-3 h-3" /></button>}>
              <CategoryBars items={data.categorySpend} />
            </Panel>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Panel className="lg:col-span-5" title="Gasto por projeto" subtitle="Ranking por custo total" icon={Briefcase}>
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {data.projectSpend.slice(0, 12).map((p, i) => (
                  <button key={p.projectId} onClick={() => setDrawer({ type: 'project', payload: p })}
                    className="w-full surface-recessed flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
                    <span className="w-5 shrink-0 tabular-data text-[11px] text-[color:var(--ink-3)]">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="body text-[13px] font-medium text-white/75 block truncate">{p.projectName}</span>
                      <span className="label-micro mt-0.5 block">{p.mobilizationCount} mob · {p.activeMobilizations} ativas</span>
                    </div>
                    <span className="tabular-data text-[12px] font-semibold text-accent flex-shrink-0">{formatBRL(p.amountMinor)}</span>
                  </button>
                ))}
                {data.projectSpend.length === 0 && <NoData height={200} />}
              </div>
            </Panel>

            <Panel className="lg:col-span-7" title="Top 20 colaboradores" subtitle="Custo atribuído por colaborador" icon={Users}
              action={<Badge variant="accent" compact>{data.collaboratorSpend.length}</Badge>}>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[rgb(var(--surface-3))]">
                    <tr className="label-micro text-white/30 border-b border-white/[0.05]">
                      <th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Colaborador</th>
                      <th className="px-3 py-2 font-medium text-right">Mob.</th><th className="px-3 py-2 font-medium text-right">Mão de obra</th>
                      <th className="px-3 py-2 font-medium text-right">Transporte</th><th className="px-3 py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.collaboratorSpend.map((c, i) => (
                      <tr key={c.employeeId || c.employeeName} onClick={() => setDrawer({ type: 'collaborator', payload: c })}
                        className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors">
                        <td className="px-3 py-2.5 tabular-data text-[11px] text-white/25">{i + 1}</td>
                        <td className="px-3 py-2.5"><span className="body text-[13px] text-white/75 block truncate max-w-[160px]">{c.employeeName}</span>{c.role && <span className="label-micro text-white/25">{c.role}</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-data text-[12px] text-white/50">{c.mobilizationCount}</td>
                        <td className="px-3 py-2.5 text-right tabular-data text-[12px] text-white/50">{formatBRL(c.laborSpendMinor)}</td>
                        <td className="px-3 py-2.5 text-right tabular-data text-[12px] text-white/50">{formatBRL(c.transportSpendMinor)}</td>
                        <td className="px-3 py-2.5 text-right tabular-data text-[12px] font-semibold text-white">{formatBRL(c.totalSpendMinor)}</td>
                      </tr>
                    ))}
                    {data.collaboratorSpend.length === 0 && <tr><td colSpan={6}><NoData height={160} /></td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          {/* ═══ OPERATIONAL INTELLIGENCE ═══ */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Panel className="lg:col-span-8" title="Mobilizações ativas" subtitle="Operações confirmadas em campo" icon={Radio}>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="label-micro text-white/30 border-b border-white/[0.05]">
                      <th className="px-3 py-2 font-medium">Projeto</th><th className="px-3 py-2 font-medium">Rota</th>
                      <th className="px-3 py-2 font-medium">Modal</th><th className="px-3 py-2 font-medium text-right">Equipe</th>
                      <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium text-right">ETA</th><th className="px-3 py-2 font-medium text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.map || []).map((m) => {
                      const Mi = MODAL_META[m.modal]?.icon || Layers;
                      return (
                        <tr key={m.mobilizationId} onClick={() => setDrawer({ type: 'mobilization', payload: m })}
                          className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors">
                          <td className="px-3 py-2.5"><span className="body text-[13px] text-white/75 block truncate max-w-[140px]">{m.projectName}</span><span className="label-micro text-white/25">{m.scheduleName}</span></td>
                          <td className="px-3 py-2.5"><span className="body text-[12px] text-white/50">{m.origin.label?.split(' - ')[0]} → {m.destination.label?.split(' - ')[0]}</span></td>
                          <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 label-micro text-white/50"><Mi className="w-3.5 h-3.5" />{MODAL_META[m.modal]?.label || m.modal}</span></td>
                          <td className="px-3 py-2.5 text-right tabular-data text-[12px] text-white/50">{m.teamSize}</td>
                          <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 label-micro" style={{ color: STATUS_COLOR[m.status] }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[m.status] }} />{STATUS_LABEL[m.status] || m.status}</span></td>
                          <td className="px-3 py-2.5 text-right label-micro text-white/40 tabular-data">{new Date(m.estimatedArrivalAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-2.5 text-right tabular-data text-[12px] font-semibold text-accent">{formatBRL(m.totalCostMinor)}</td>
                        </tr>
                      );
                    })}
                    {(data.map || []).length === 0 && <tr><td colSpan={7}><NoData height={140} /></td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Alerts + SLA */}
            <div className="lg:col-span-4 space-y-6">
              <Panel title="Alertas" subtitle="Mais urgentes primeiro" icon={AlertTriangle} action={<Badge variant="warning" compact>{data.alerts.length}</Badge>}>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {data.alerts.slice(0, 8).map((a, i) => (
                    <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${a.severity === 'high' ? 'bg-danger-bg/40 border-danger-border/20' : a.severity === 'medium' ? 'bg-warning-bg/40 border-warning-border/20' : 'bg-white/[0.02] border-white/[0.05]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.severity === 'high' ? 'bg-danger-text' : a.severity === 'medium' ? 'bg-warning-text' : 'bg-white/40'}`} />
                      <span className="body text-[12px] text-white/65">{a.message}</span>
                    </div>
                  ))}
                  {data.alerts.length === 0 && <div className="py-8 text-center label-micro text-white/25 flex flex-col items-center gap-2"><CheckCircle className="w-6 h-6 text-success-text/50" />Nenhum alerta ativo</div>}
                </div>
              </Panel>
              <Panel title="SLA de chegada" subtitle="Cumprimento de prazo" icon={Gauge}>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="No prazo" value={data.sla.onTimeRate == null ? '—' : `${Math.round(data.sla.onTimeRate * 100)}%`} accent="text-success-text" />
                  <Stat label="Atrasadas" value={data.sla.lateCount} accent="text-danger-text" />
                  <Stat label="Em risco" value={data.sla.activeAtRisk} accent="text-warning-text" />
                  <Stat label="Concluídas" value={data.sla.completedCount} accent="text-white/70" />
                </div>
              </Panel>
            </div>
          </section>

          {/* ═══ SUPPORTING ANALYTICS ═══ */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Panel className="lg:col-span-4" title="Mix de modais" subtitle="Distribuição por transporte" icon={Layers}>
              {modalDonut.length > 0 ? (
                <>
                  <PremiumDonutChart data={modalDonut} nameKey="name" valueKey="value" colors={CHART_SEQUENCE} innerRadius={40} outerRadius={62} paddingAngle={4} height={160} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                    {(data.modalMix || []).map((m, i) => (
                      <div key={m.modal} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_SEQUENCE[i % CHART_SEQUENCE.length] }} />
                        <span className="body text-[12px]">{MODAL_META[m.modal]?.label || m.modal}</span>
                        <span className="tabular-data text-[11px] text-white/50 font-semibold">{formatBRL(m.amountMinor)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <NoData height={160} />}
            </Panel>

            <Panel className="lg:col-span-4" title="Inteligência de economia" subtitle={data.savings.methodology} icon={TrendingDown}>
              <div className="space-y-3">
                <Stat label="Economia total" value={formatBRL(data.savings.totalSavingsMinor)} accent="text-success-text" big />
                <Row label="Economia média / mob." value={formatBRL(data.savings.averageSavingsMinor)} />
                <Row label="Cobertura do cálculo" value={`${Math.round((data.savings.coverage || 0) * 100)}%`} />
                {(data.savings.byProject || []).slice(0, 3).map((p) => (
                  <Row key={p.projectId} label={p.projectName} value={formatBRL(p.savingsMinor)} />
                ))}
              </div>
            </Panel>

            <Panel className="lg:col-span-4" title="Conformidade & exposição" subtitle="HE, noturno e origem" icon={ShieldCheck}>
              <div className="space-y-3">
                <Row label="Manual vs automática" value={`${ov.manualCount} / ${ov.automaticCount}`} />
                <Row label="Projetos com mobilização" value={ov.projectsWithMobilization} />
                <Row label="Rotas multimodais" value={ov.multimodalCount} />
                <Row label="Colaboradores em trânsito" value={ov.activeEmployeesInTransit} />
                <div className="pt-2 flex items-center gap-2 label-micro text-white/25"><Moon className="w-3.5 h-3.5" />Adicional noturno e HE detalhados no drill-down por colaborador</div>
              </div>
            </Panel>
          </section>
        </>
      )}

      {/* ═══ DRILL-DOWN DRAWER (§11) ═══ */}
      <DrillDownDrawer drawer={drawer} data={data} onClose={() => setDrawer(null)} />
    </div>
  );
}

/* ── Drill-down drawer ── */
function DrillDownDrawer({ drawer, data, onClose }) {
  if (!drawer) return null;
  const titles = { mobilization: 'Mobilização', collaborator: 'Colaborador', project: 'Projeto', categories: 'Gasto por categoria', alerts: 'Alertas operacionais', active: 'Mobilizações ativas', labor: 'Composição de mão de obra' };
  return (
    <Modal open={!!drawer} onClose={onClose} title={titles[drawer.type] || 'Detalhe'} size="lg">
      {drawer.type === 'mobilization' && <MobilizationDetail m={drawer.payload} />}
      {drawer.type === 'collaborator' && <CollaboratorDetail c={drawer.payload} />}
      {drawer.type === 'project' && <ProjectDetail p={drawer.payload} data={data} />}
      {drawer.type === 'categories' && <CategoryBars items={data?.categorySpend || []} full />}
      {drawer.type === 'labor' && <LaborBreakdown ov={data?.overview} />}
      {drawer.type === 'alerts' && (
        <div className="space-y-2">
          {(data?.alerts || []).map((a, i) => (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <Badge variant={a.severity === 'high' ? 'danger' : a.severity === 'medium' ? 'warning' : 'neutral'} compact>{a.severity}</Badge>
              <span className="body text-[13px] text-white/70">{a.message}</span>
            </div>
          ))}
          {(data?.alerts || []).length === 0 && <NoData height={120} />}
        </div>
      )}
      {drawer.type === 'active' && (
        <div className="space-y-2">
          {(data?.map || []).map((m) => <MobRow key={m.mobilizationId} m={m} />)}
          {(data?.map || []).length === 0 && <NoData height={120} />}
        </div>
      )}
    </Modal>
  );
}

/** Where the people-hours money actually goes. */
function LaborBreakdown({ ov }) {
  if (!ov) return <NoData height={160} />;
  const rows = [
    ['Horas base', ov.laborBaseSpendMinor],
    ['Hora extra', ov.overtimeSpendMinor],
    ['Adicional noturno', ov.nightPremiumSpendMinor],
  ];
  const total = ov.laborSpendMinor || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Info label="Mão de obra total" value={formatBRL(ov.laborSpendMinor)} />
        <Info label="Participação no custo" value={`${ov.laborSharePercent}%`} />
        <Info label="Horas-equipe" value={`${(ov.teamHours || 0).toLocaleString('pt-BR')}h`} />
        <Info label="Custo / hora-equipe" value={formatBRL(ov.costPerTeamHourMinor)} />
      </div>
      <div className="space-y-2.5">
        {rows.map(([label, v], i) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1">
              <span className="body text-[12px]">{label}</span>
              <span className="tabular-data text-[11px] text-white/60 font-medium">{formatBRL(v || 0)} · {Math.round(((v || 0) / total) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full inset-block overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${((v || 0) / total) * 100}%`, backgroundColor: accentByRank(i) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobilizationDetail({ m }) {
  const Mi = MODAL_META[m.modal]?.icon || Layers;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h4 className="heading text-white">{m.projectName}</h4><p className="label-micro mt-0.5">{m.scheduleName}</p></div>
        <span className="flex items-center gap-1.5 label-micro" style={{ color: STATUS_COLOR[m.status] }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[m.status] }} />{STATUS_LABEL[m.status] || m.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Info label="Origem" value={m.origin.label} icon={MapPin} />
        <Info label="Destino" value={m.destination.label} icon={MapPin} />
        <Info label="Modal" value={<span className="flex items-center gap-1.5"><Mi className="w-3.5 h-3.5" />{MODAL_META[m.modal]?.label || m.modal}</span>} />
        <Info label="Equipe" value={`${m.teamSize} · ${m.employeeSummary}`} />
        <Info label="Partida" value={new Date(m.plannedDepartureAt).toLocaleString('pt-BR')} />
        <Info label="ETA" value={new Date(m.estimatedArrivalAt).toLocaleString('pt-BR')} />
        <Info label="Progresso" value={`${m.progressPercentage}%`} />
        <Info label="Custo total" value={formatBRL(m.totalCostMinor)} />
        <Info label="Origem do dado" value={m.source === 'manual' ? 'Simulação manual' : 'Mobilização automática'} />
        <Info label="Risco" value={m.riskLevel} />
        {m.lodging?.hasLodging && (
          <Info label="Hospedagem" value={`${m.lodging.active ? '🏨 Hospedado' : '🛏 Previsto'} · ${m.lodging.nights} noite(s) · ${formatBRL(m.lodging.accommodationCostMinor)}`} />
        )}
      </div>
    </div>
  );
}
function CollaboratorDetail({ c }) {
  return (
    <div className="space-y-4">
      <div><h4 className="heading text-white">{c.employeeName}</h4><p className="label-micro mt-0.5">{c.role || '—'} · {c.projectCount} projeto(s)</p></div>
      <div className="grid grid-cols-2 gap-3">
        <Info label="Custo total atribuído" value={formatBRL(c.totalSpendMinor)} />
        <Info label="Mobilizações" value={c.mobilizationCount} />
        <Info label="Mão de obra" value={formatBRL(c.laborSpendMinor)} />
        <Info label="Transporte" value={formatBRL(c.transportSpendMinor)} />
        <Info label="Custo médio / mob." value={formatBRL(c.averageSpendMinor)} />
        <Info label="Duração média" value={fmtDur(c.averageDurationMinutes)} />
        <Info label="HE (min)" value={c.overtimeMinutes} />
        <Info label="Noturno (min)" value={c.nightMinutes} />
        <Info label="Ativas" value={c.activeMobilizationCount} />
      </div>
    </div>
  );
}
function ProjectDetail({ p, data }) {
  const cats = useMemo(() => (data?.categorySpend || []).slice(0, 8), [data]);
  return (
    <div className="space-y-4">
      <div><h4 className="heading text-white">{p.projectName}</h4><p className="label-micro mt-0.5">{p.mobilizationCount} mobilização(ões) · {p.activeMobilizations} ativas</p></div>
      <div className="grid grid-cols-2 gap-3">
        <Info label="Gasto total" value={formatBRL(p.amountMinor)} />
        <Info label="Custo médio" value={formatBRL(p.averageSpendMinor)} />
      </div>
      <div><span className="label-micro text-white/30 mb-2 block">Composição por categoria (período)</span><CategoryBars items={cats} /></div>
    </div>
  );
}
function MobRow({ m }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLOR[m.status] }} />
      <div className="flex-1 min-w-0"><span className="body text-[13px] text-white/75 block truncate">{m.projectName}</span><span className="label-micro">{m.origin.label?.split(' - ')[0]} → {m.destination.label?.split(' - ')[0]}</span></div>
      <span className="tabular-data text-[12px] font-semibold text-accent">{formatBRL(m.totalCostMinor)}</span>
    </div>
  );
}

/* ── Presentational helpers ── */
/**
 * Zone B/C panel — deliberately quiet.
 *
 * The `accent` prop is gone. Panels used to carry one of five hues chosen
 * per-instance with no rule (mint/orange/cyan/purple/white in page order),
 * so the colour taught the reader nothing and only added chroma noise. The
 * header is now: bare icon, title, subtitle, action. Nothing else.
 *
 * `accent` is still accepted and ignored so call sites don't have to change
 * in the same commit.
 */
function Panel({ children, className = '', title, subtitle, icon: Icon, action }) {
  return (
    <div className={`glass-panel ${className}`}>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="w-4 h-4 shrink-0 text-[color:var(--ink-3)]" strokeWidth={1.5} />}
            <div className="min-w-0">
              <h3 className="heading truncate">{title}</h3>
              {subtitle && <p className="body text-[12px] mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

function CategoryBars({ items = [], full }) {
  if (!items.length) return <NoData height={160} />;
  const max = Math.max(...items.map((i) => i.amountMinor), 1);
  return (
    <div className={`space-y-2.5 ${full ? '' : 'max-h-[300px] overflow-y-auto'}`}>
      {items.map((c, i) => (
        <div key={c.category}>
          <div className="flex items-center justify-between mb-1">
            <span className="body text-[12px] truncate">{c.label}</span>
            <span className="tabular-data text-[11px] text-white/60 font-semibold ml-2 flex-shrink-0">{formatBRL(c.amountMinor)} · {c.percentage}%</span>
          </div>
          <div className="h-1.5 rounded-full inset-block overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(c.amountMinor / max) * 100}%`, backgroundColor: accentByRank(i) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * KPI cell. The `color` prop is accepted and ignored: hue used to be
 * assigned per-card with no rule, so "Custo médio" was blue and "Custo no
 * período" cyan for no reason a reader could learn. Values are now ink-0,
 * and colour appears only where it carries meaning (`highlight`).
 */
function Kpi({ label, value, detail, icon: Icon, highlight, money, duration, suffix, onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`relative min-w-0 px-5 py-5 text-left bg-[rgb(var(--surface-3))] ${onClick ? 'hover:bg-[rgb(var(--surface-2))] transition-colors' : ''}`}>
      <div className="relative min-w-0">
        <div className="flex items-center justify-between mb-3">
          <span className="label-micro">{label}</span>
          {Icon && <Icon className={`w-4 h-4 ${highlight ? 'text-accent' : 'text-[color:var(--ink-3)]'}`} strokeWidth={1.5} />}
        </div>
        {value == null ? (
          <div className="dashboard-kpi-value text-[color:var(--ink-3)]">—</div>
        ) : (
          <AnimatedNumber as="div" className={`dashboard-kpi-value ${highlight ? 'text-accent' : ''}`} value={value}
            format={(v) => (money ? formatBRL(Math.round(v)) : duration ? fmtDur(v) : `${Math.round(v).toLocaleString('pt-BR')}${suffix || ''}`)} />
        )}
        {detail && <p className="body text-[12px] mt-1.5">{detail}</p>}
      </div>
    </Comp>
  );
}

/**
 * Composition card for the cost split. Takes either a money `value` (minor
 * units) or a pre-formatted `rawValue`, plus an optional `share` percentage
 * rendered as a hairline meter — the meter is what makes "R$ 1,2M mão de obra"
 * legible as *proportion* without the reader doing arithmetic.
 */
function CostCard({ label, hint, icon: Icon, value, rawValue, share, detail, onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`glass-panel p-4 text-left flex flex-col justify-between min-h-[132px] ${onClick ? 'hover:border-accent/30 transition-colors' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="label-micro leading-tight">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-[color:var(--ink-3)]" strokeWidth={1.5} />}
      </div>
      <div className="mt-3">
        {rawValue != null ? (
          <div className="metric-sm">{rawValue}</div>
        ) : (
          <AnimatedNumber as="div" className="metric-sm" value={value ?? 0} format={(v) => formatBRL(Math.round(v))} />
        )}
        {share != null && (
          <div className="mt-2">
            <div className="h-[3px] rounded-full bg-[color:var(--ink-line)] overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
            </div>
            <span className="label-micro mt-1.5 block">{share}% do total</span>
          </div>
        )}
        {detail && <p className="label-micro mt-1.5">{detail}</p>}
        {share == null && !detail && hint && <p className="label-micro mt-1.5">{hint}</p>}
      </div>
    </Comp>
  );
}

function Stat({ label, value, accent = 'text-white', big }) {
  return (
    <div className="surface-recessed rounded-xl px-3 py-3">
      <div className={`${big ? 'display-sm' : 'metric-value'} ${accent}`}>{value}</div>
      <div className="label-micro text-white/30 mt-1">{label}</div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
      <span className="body text-[13px] truncate mr-2">{label}</span>
      <span className="tabular-data text-[13px] font-semibold text-white/70 flex-shrink-0">{value}</span>
    </div>
  );
}
function Info({ label, value, icon: Icon }) {
  return (
    <div className="surface-recessed rounded-xl px-3 py-2.5">
      <span className="label-micro text-white/30 flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{label}</span>
      <span className="body text-[13px] text-white/75 block mt-0.5">{value}</span>
    </div>
  );
}
function FilterSelect({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="glass-input !py-1.5 !w-auto text-[13px] cursor-pointer">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function NoData({ height = 200 }) {
  return <div className="flex items-center justify-center text-white/15 text-xs" style={{ height }}>Sem dados no período</div>;
}
