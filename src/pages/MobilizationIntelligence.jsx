import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Sparkles, Plane, Bus, Car, Clock, DollarSign, AlertTriangle,
  CheckCircle, ChevronDown, Users, MapPin, CalendarClock, Timer, Route as RouteIcon,
  Zap, ShieldCheck, Layers, ArrowRight, Check, Loader2, Briefcase, Moon, ListTree,
  Send, FileCheck, ShieldAlert, Search, X,
} from 'lucide-react';
import { useCollaborators } from '../hooks/useStore';
import { getExtendedCities } from '../engine/routes-intelligence-db.js';
import { CityAutocomplete } from '../components/ui/CityAutocomplete';
import { DatePicker } from '../components/ui/DatePicker';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { formatBRL } from '../domain/money.js';
import { mobilizationSearch, mobilizationSelect, mobilizationSubmitForApproval } from '../services/BackendApiClient.js';
import { getConfig } from '../data/policyStore.js';
import { ConfirmMobilizationModal } from '../components/mobilization/ConfirmMobilizationModal.jsx';

const MODE_META = {
  flight: { icon: Plane, label: 'Voo', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10', ring: 'border-accent-cyan/20' },
  bus: { icon: Bus, label: 'Ônibus', color: 'text-accent-orange', bg: 'bg-accent-orange/10', ring: 'border-accent-orange/20' },
  rental_car: { icon: Car, label: 'Veículo', color: 'text-accent-purple', bg: 'bg-accent-purple/10', ring: 'border-accent-purple/20' },
  company_car: { icon: Car, label: 'Frota', color: 'text-accent-purple', bg: 'bg-accent-purple/10', ring: 'border-accent-purple/20' },
  local_transfer: { icon: RouteIcon, label: 'Transfer', color: 'text-white/40', bg: 'bg-white/[0.04]', ring: 'border-white/10' },
  waiting: { icon: Clock, label: 'Espera', color: 'text-white/30', bg: 'bg-white/[0.03]', ring: 'border-white/10' },
};

const CAT_LABEL = {
  recommended: { text: 'Recomendado', variant: 'success' },
  lowest_total_cost: { text: 'Menor custo total', variant: 'success' },
  fastest: { text: 'Mais rápido', variant: 'info' },
  lowest_complexity: { text: 'Menos conexões', variant: 'accent' },
  lowest_ticket: { text: 'Menor passagem', variant: 'neutral' },
};

const fmtDur = (min) => {
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};
const fmtTime = (iso, tz) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: tz || 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso?.slice(11, 16) || ''; }
};
const toUtcIso = (localValue) => (localValue ? new Date(localValue).toISOString() : null);
const boldMd = (s) => s.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
const timePart = (dateTime, fallback = '08:00') => (dateTime || '').slice(11, 16) || fallback;
const withDatePart = (date, dateTime, fallbackTime = '08:00') => (date ? `${date}T${timePart(dateTime, fallbackTime)}` : dateTime);
const employeeName = (employee) => employee.nome || employee.name || 'Colaborador';
const employeeRole = (employee) => employee.cargo || employee.role || 'Cargo não informado';
const hourlyRateC = (employee) => (
  employee.hourlyRateC ??
  employee.valorHoraC ??
  employee.valor_hora_c ??
  employee.hourly_rate_c ??
  employee.custoHoraC ??
  employee.custo_hora_c ??
  // O cadastro guarda salário mensal e carga horária; convertemos para os
  // centavos/hora que o seletor e o motor de custos utilizam.
  (employee.salarioBase && employee.cargaHoraria
    ? Math.round((Number(employee.salarioBase) / Number(employee.cargaHoraria)) * 100)
    : 0)
);

const PROGRESS_STEPS = [
  'Selecionando hubs e aeroportos no corredor...',
  'Montando o grafo multimodal time-dependent...',
  'Gerando e filtrando itinerários viáveis...',
  'Calculando mão de obra, permanência e transporte...',
  'Ranqueando e gerando recomendação...',
];

export default function MobilizationIntelligence() {
  const { collaborators } = useCollaborators();
  const navigate = useNavigate();
  const cities = useMemo(() => getExtendedCities(), []);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [tripType, setTripType] = useState('oneway');
  const [outboundDate, setOutboundDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [departure, setDeparture] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [config, setConfig] = useState(null);

  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [approval, setApproval] = useState('idle'); // idle|saving|sent|error
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const selected = collaborators.filter((c) => selectedIds.has(c.id));
  const normalizedQuery = employeeQuery.trim().toLocaleLowerCase('pt-BR');
  const visibleEmployees = useMemo(() => collaborators.filter((employee) => {
    if (!normalizedQuery) return true;
    return [
      employeeName(employee),
      employeeRole(employee),
      employee.matricula,
      employee.projeto || employee.project,
      employee.cidadeAtual || employee.cidade || employee.city,
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalizedQuery);
  }), [collaborators, normalizedQuery]);

  useEffect(() => { loadConfig().then(setConfig).catch(() => setConfig({})); }, []);
  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1)), 1200);
    return () => clearInterval(t);
  }, [loading]);

  const toggle = (id) => setSelectedIds((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // A data de ida abre a janela de busca. Os horários abaixo são filtros finos
  // opcionais; quando ausentes, enviamos a janela completa para o motor atual.
  const canSearch = origin && destination && outboundDate && (tripType === 'oneway' || returnDate) &&
    selected.length > 0 && !loading;

  const handleSelect = async (it) => {
    if (!result?.audit?.enabled) { setSelectedId(it.id); return; }
    const dbId = result.audit.itineraryIdMap[it.id];
    const isOverride = rec && it.id !== rec.id;
    let reason;
    if (isOverride) {
      reason = window.prompt('Motivo para escolher uma opção diferente da recomendada:');
      if (!reason) return; // override requires a reason (§25)
    }
    try {
      await mobilizationSelect(dbId, {
        requestId: result.audit.requestId,
        override: isOverride ? { isOverride: true, recommendedItineraryId: result.audit.itineraryIdMap[rec.id], reason } : undefined,
      });
      setSelectedId(it.id); setApproval('idle');
    } catch (err) { setError(err.message); }
  };

  const handleSubmit = async () => {
    if (!result?.audit?.enabled || !selectedId) return;
    setApproval('saving');
    try {
      await mobilizationSubmitForApproval(result.audit.requestId, { itineraryId: result.audit.itineraryIdMap[selectedId] });
      setApproval('sent');
    } catch { setApproval('error'); }
  };

  const runSearch = async () => {
    setLoading(true); setError(null); setResult(null); setExpanded(null); setSelectedId(null); setApproval('idle');
    try {
      const defaultDeadlineDate = tripType === 'roundtrip' && returnDate ? returnDate : outboundDate;
      const payload = {
        origin, destination,
        tripType,
        outboundDate,
        returnDate: tripType === 'roundtrip' ? returnDate : null,
        earliestDepartureUtc: toUtcIso(departure || `${outboundDate}T00:00`),
        deadlineUtc: toUtcIso(deadline || `${defaultDeadlineDate}T23:59`),
        employees: selected.map((c) => ({ id: c.id, nome: c.nome, salarioBase: c.salarioBase, cargaHoraria: c.cargaHoraria })),
        config: config || undefined,
      };
      const res = await mobilizationSearch(payload);
      if (!res.success) setError(res.message || 'Não foi possível concluir a busca.');
      else setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (collaborators.length === 0) {
    return (
      <div>
        <Hero />
        <EmptyState icon={AlertTriangle} title="Cadastre colaboradores primeiro" description="A mobilização usa o custo-hora dos colaboradores para o cálculo.">
          <button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button>
        </EmptyState>
      </div>
    );
  }

  const rec = result?.recommended;

  return (
    <div className="space-y-6">
      <Hero />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-6 items-stretch">
        <SearchParametersCard
          origin={origin}
          destination={destination}
          tripType={tripType}
          outboundDate={outboundDate}
          returnDate={returnDate}
          departure={departure}
          deadline={deadline}
          cities={cities}
          onOrigin={setOrigin}
          onDestination={setDestination}
          onTripType={(nextTripType) => {
            setTripType(nextTripType);
            if (nextTripType === 'oneway') setReturnDate('');
          }}
          onOutboundDate={(nextOutboundDate) => {
            setOutboundDate(nextOutboundDate);
            // Mantém somente o horário opcional associado à nova data de ida.
            setDeparture((current) => current ? withDatePart(nextOutboundDate, current, '00:00') : '');
          }}
          onReturnDate={(nextReturnDate) => {
            setReturnDate(nextReturnDate);
          }}
          onDeparture={setDeparture}
          onDeadline={setDeadline}
        />
        <IntelligentTeamSelector
          employees={visibleEmployees}
          selectedEmployees={selected}
          selectedIds={selectedIds}
          query={employeeQuery}
          onQuery={setEmployeeQuery}
          onToggle={toggle}
          onSelectVisible={() => setSelectedIds((current) => new Set([...current, ...visibleEmployees.map((employee) => employee.id)]))}
          onClear={() => setSelectedIds(new Set())}
        />
      </div>

      <PolicyCard policy={result?.policySummary} />

      <div className="flex flex-col items-center gap-2 pt-1">
        {selected.length === 0 && <span className="body text-[13px] text-warning-text/80">Selecione ao menos 1 colaborador</span>}
        <LiquidMetalButton label={loading ? 'Analisando...' : 'Buscar Mobilização'} width={260} height={56} disabled={!canSearch} onClick={runSearch} />
      </div>

      {/* ── Progressive loading ── */}
      {loading && (
        <div className="surface-card rounded-2xl border border-white/[0.05] p-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="w-5 h-5 text-mint animate-spin" />
            <span className="heading text-white">Processando mobilização multimodal</span>
          </div>
          <div className="space-y-3">
            {PROGRESS_STEPS.map((s, i) => (
              <div key={i} className={`flex items-center gap-3 transition-opacity ${i <= stepIdx ? 'opacity-100' : 'opacity-30'}`}>
                {i < stepIdx ? <CheckCircle className="w-4 h-4 text-mint" /> : i === stepIdx ? <Loader2 className="w-4 h-4 text-mint animate-spin" /> : <div className="w-4 h-4 rounded-full border border-white/15" />}
                <span className="body text-[13px]">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="surface-card rounded-2xl border border-danger-border/20 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-text flex-shrink-0" />
          <div><h3 className="heading text-white mb-1">Não foi possível concluir</h3><p className="body text-[13px]">{error}</p></div>
        </div>
      )}

      {/* ── Results ── */}
      {result?.success && result.itineraries.length > 0 && (
        <div className="space-y-6 animate-slide-up">
          <ProvidersStrip providers={result.providers} />
          {rec && <RecommendationHero rec={rec} explanation={result.explanation} reasonCodes={result.reasonCodes} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {result.itineraries.map((it) => (
              <AlternativeCard key={it.id} it={it} isRec={it.id === rec?.id} selected={selectedId === it.id}
                expanded={expanded === it.id} onToggle={() => setExpanded(expanded === it.id ? null : it.id)} onSelect={() => handleSelect(it)} />
            ))}
          </div>

          <ApprovalBar audit={result.audit} selectedId={selectedId} rec={rec} itineraries={result.itineraries} approval={approval} onSubmit={handleSubmit} />

          {/* Confirmation gate (§3.1) — only a confirmed mobilization feeds the dashboard */}
          {selectedId && (
            <div className="surface-card rounded-2xl border border-mint/20 p-5 flex flex-wrap items-center gap-4">
              <FileCheck className="w-5 h-5 text-mint flex-shrink-0" />
              <div className="flex-1 min-w-[220px]">
                <h3 className="heading text-white/85 mb-0.5">Confirmar mobilização</h3>
                <p className="body text-[13px]">
                  {confirmed
                    ? 'Mobilização confirmada — já alimenta o Dashboard, os rankings e o mapa em tempo real.'
                    : 'Vincule projeto, cronograma e colaboradores para tornar esta mobilização elegível ao Dashboard.'}
                </p>
              </div>
              {confirmed ? (
                <span className="flex items-center gap-1.5 body text-[13px] text-success-text"><CheckCircle className="w-4 h-4" /> Confirmada</span>
              ) : (
                <button onClick={() => setConfirmOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-mint/15 text-mint border border-mint/25 hover:bg-mint/20 transition-colors">
                  <ShieldCheck className="w-4 h-4" /> Confirmar mobilização
                </button>
              )}
            </div>
          )}

          <ComparisonTable itineraries={result.itineraries} recId={rec?.id} />

          {selectedId && (() => {
            const chosen = result.itineraries.find((i) => i.id === selectedId);
            return (
              <ConfirmMobilizationModal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                source="automatic_mobilization"
                scenario={chosen}
                alternatives={result.itineraries}
                employees={selected.map((c) => ({ id: c.id, name: c.nome || c.name, role: c.cargo || c.role }))}
                origin={origin}
                destination={destination}
                context={{ tripType, outboundDate, returnDate: tripType === 'roundtrip' ? returnDate : null }}
                refs={{
                  requestId: result.audit?.requestId || null,
                  selectedItineraryId: result.audit?.itineraryIdMap?.[selectedId] || null,
                  reasonCodes: result.reasonCodes || [],
                  policySummary: result.policySummary || null,
                }}
                onConfirmed={() => { setConfirmed(true); }}
              />
            );
          })()}
        </div>
      )}

      {result?.success && result.itineraries.length === 0 && !loading && (
        <div className="space-y-4">
          <EmptyState icon={RouteIcon} title="Nenhuma rota viável no prazo" description="Nenhuma composição atende ao prazo de chegada e às restrições. Tente ampliar a janela de tempo." />
          <ManualCTA navigate={navigate} />
        </div>
      )}

      {/* §2.1/§8: when the automatic road search is unavailable, offer the manual
          simulator — same engine, manual segments. */}
      {(error || (result?.providers && result.providers.bus?.source === 'unavailable' && result.providers.flights?.source === 'unavailable')) && !loading && (
        <ManualCTA navigate={navigate} />
      )}
    </div>
  );
}

function ManualCTA({ navigate }) {
  return (
    <div className="surface-card relative overflow-hidden border border-accent-cyan/[0.15]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/25 to-transparent" />
      <div className="p-6 flex items-center justify-between gap-6">
        <div>
          <h3 className="heading text-white/85 mb-1">Busca automática indisponível?</h3>
          <p className="body text-[13px] max-w-xl">
            Utilize a Simulação Manual para cadastrar os trechos e calcular jornada, adicionais e custo
            total com o mesmo motor de mobilização — útil também para fretamentos e tarifas negociadas.
          </p>
        </div>
        <button className="btn-primary-mint whitespace-nowrap" onClick={() => navigate('/comparador')}>Abrir Simulação Manual</button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Hero() {
  return (
    <div className="surface-card relative overflow-hidden p-8 rounded-2xl">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-16 w-72 h-72 bg-mint/[0.06] rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-10 w-52 h-52 bg-accent-purple/[0.05] rounded-full blur-3xl" />
      </div>
      <div className="relative flex items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-mint/20 via-accent-cyan/15 to-accent-purple/10 flex items-center justify-center border border-white/[0.08]">
            <Rocket className="w-8 h-8 text-mint" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center">
            <Zap className="w-2.5 h-2.5 text-accent-cyan" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="display-md">Mobilização Inteligente</h2>
            <Badge variant="success" dot>Multimodal Engine</Badge>
          </div>
          <p className="body">Otimiza pelo <span className="text-white/70 font-medium">custo total de mobilização</span> — não pela menor passagem. Mão de obra, permanência e viabilidade calculadas automaticamente.</p>
        </div>
      </div>
    </div>
  );
}

function PolicyCard({ policy }) {
  const lines = policy?.lines || ['8h normais', '+2h a +50%', 'excedente a +100%', 'sábado: todas as horas a +100%', 'domingo a 2.5x', 'noturno 22:00–05:00 a +20%'];
  return (
    <div className="surface-recessed rounded-2xl border border-white/[0.04] p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-mint/60" />
        <span className="label-micro text-white/40">Política Trabalhista Aplicada</span>
        <Badge variant="neutral" compact>{policy?.name || 'CLT Padrão'} v{policy?.version || 1}</Badge>
        <span className="label-micro text-white/20 ml-auto">Somente leitura — editável na administração</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {lines.map((l, i) => (
          <span key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] label-micro text-white/50">{l}</span>
        ))}
      </div>
    </div>
  );
}

function ProvidersStrip({ providers }) {
  if (!providers) return null;
  const badge = (p, Icon, name) => {
    const map = {
      realtime: { t: 'tempo real', c: 'text-mint', d: 'bg-mint' },
      no_data: { t: 'sem viagens reais', c: 'text-white/40', d: 'bg-white/30' },
      unavailable: { t: 'indisponível', c: 'text-white/30', d: 'bg-white/20' },
      estimated: { t: 'estimado', c: 'text-accent-orange', d: 'bg-accent-orange' },
    };
    const m = map[p.source] || map.estimated;
    return (
      <span className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-white/40" />
        <span className="label-micro text-white/40">{name}:</span>
        <span className={`flex items-center gap-1 label-micro ${m.c}`}><span className={`w-1.5 h-1.5 rounded-full ${m.d}`} />{m.t}</span>
        {p.realPairs > 0 && <span className="label-micro text-white/20">({p.realPairs} par{p.realPairs !== 1 ? 'es' : ''})</span>}
      </span>
    );
  };
  return (
    <div className="surface-card rounded-2xl border border-white/[0.05] px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="label-micro text-white/25">Fontes de dados</span>
      {badge(providers.flights, Plane, providers.flights.label || 'Voos')}
      {badge(providers.bus, Bus, providers.bus.label || 'Ônibus')}
    </div>
  );
}

function RecommendationHero({ rec, explanation, reasonCodes }) {
  return (
    <div className="surface-card relative rounded-2xl border border-mint/15 overflow-hidden">
      <div className="absolute -top-24 -right-20 w-64 h-64 bg-mint/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mint to-accent-cyan flex items-center justify-center shadow-glow-mint-strong">
          <Sparkles className="w-5 h-5 text-dark-900" />
        </div>
        <div className="flex-1">
          <h3 className="heading text-white">Recomendação</h3>
          <p className="label-micro text-white/25 mt-0.5">Menor custo total de mobilização viável</p>
        </div>
        <Badge variant="success" dot>Score {rec.score}/100</Badge>
      </div>

      <div className="p-6 relative">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {rec.modeSequence.map((m, i) => {
            const meta = MODE_META[m] || MODE_META.waiting; const Icon = meta.icon;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="w-3 h-3 text-white/20" />}
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${meta.bg} border ${meta.ring}`}>
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} /><span className="label-micro text-white/60">{meta.label}</span>
                </span>
              </span>
            );
          })}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <Stat label="Custo total" value={rec.totalMobilizationCostC} money accent="text-mint" big />
          <Stat label="Economia" value={explanation?.savingsC || 0} money accent="text-accent-cyan" />
          <div className="text-center">
            <div className="metric-value text-white">{fmtDur(rec.durationMinutes)}</div>
            <div className="label-micro text-white/20 mt-1">Duração</div>
          </div>
          <div className="text-center">
            <div className="metric-value text-accent-purple">{rec.connectionCount}</div>
            <div className="label-micro text-white/20 mt-1">Conexões</div>
          </div>
        </div>

        <div className="space-y-2">
          {(explanation?.paragraphs || []).map((p, i) => (
            <p key={i} className="body text-[14px]" dangerouslySetInnerHTML={{ __html: boldMd(p) }} />
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-4">
          {reasonCodes?.map((r) => (
            <span key={r} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] label-micro text-white/40">{r}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, money, accent = 'text-white', big }) {
  return (
    <div className="text-center">
      <AnimatedNumber as="div" className={`${big ? 'display-sm' : 'metric-value'} ${accent}`} value={value} format={(v) => (money ? formatBRL(Math.round(v)) : Math.round(v))} />
      <div className="label-micro text-white/20 mt-1">{label}</div>
    </div>
  );
}

function ApprovalBar({ audit, selectedId, rec, itineraries, approval, onSubmit }) {
  const sel = itineraries.find((i) => i.id === selectedId);
  if (!audit?.enabled) {
    return (
      <div className="surface-card rounded-2xl border border-white/[0.05] p-4 flex items-center gap-3">
        <ShieldAlert className="w-4 h-4 text-white/30 flex-shrink-0" />
        <p className="body text-[13px] text-white/40">Auditoria e aprovações desativadas. Configure <span className="tabular-data text-white/60">SUPABASE_SERVICE_ROLE_KEY</span> no servidor para registrar snapshots imutáveis, seleção e workflow de aprovação.</p>
      </div>
    );
  }
  return (
    <div className="surface-card rounded-2xl border border-mint/12 p-5 flex flex-wrap items-center gap-4">
      <FileCheck className="w-5 h-5 text-mint/70 flex-shrink-0" />
      <div className="flex-1 min-w-[220px]">
        {sel ? (
          <p className="body text-[13px]">
            Rota selecionada: <span className="text-white/80 font-medium">{sel.modeSequence.map((m) => (MODE_META[m] || {}).label || m).join(' + ')}</span>
            {sel.id !== rec?.id && <span className="text-warning-text/70"> · substituição da recomendada (motivo registrado)</span>}
          </p>
        ) : (
          <p className="body text-[13px] text-white/40">Clique em <span className="text-white/60">Selecionar</span> numa rota para registrar a escolha e enviar para aprovação.</p>
        )}
      </div>
      {approval === 'sent' ? (
        <span className="flex items-center gap-1.5 body text-[13px] text-success-text"><CheckCircle className="w-4 h-4" /> Enviado para aprovação</span>
      ) : (
        <button onClick={onSubmit} disabled={!sel || approval === 'saving'}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-mint/15 text-mint border border-mint/20 hover:bg-mint/20 transition-colors disabled:opacity-40">
          {approval === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar para aprovação
        </button>
      )}
      {approval === 'error' && <span className="body text-[13px] text-danger-text">Falha ao enviar</span>}
    </div>
  );
}

function AlternativeCard({ it, isRec, expanded, onToggle, onSelect, selected }) {
  const cat = it.rankingCategory ? CAT_LABEL[it.rankingCategory] : null;
  const b = it.breakdown || {};
  const scheduled = it.segments.filter((s) => s.mode === 'flight' || s.mode === 'bus' || s.mode === 'rental_car');
  return (
    <div className={`surface-card rounded-2xl border overflow-hidden transition-colors ${selected ? 'border-mint/50 shadow-glow-mint' : isRec ? 'border-mint/25' : 'border-white/[0.05]'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {it.modeSequence.map((m, i) => {
              const meta = MODE_META[m] || MODE_META.waiting; const Icon = meta.icon;
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-white/20" />}
                  <span className={`w-7 h-7 rounded-lg ${meta.bg} border ${meta.ring} flex items-center justify-center`}><Icon className={`w-3.5 h-3.5 ${meta.color}`} /></span>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            {isRec && <Badge variant="success" dot compact>Recomendado</Badge>}
            {!isRec && cat && <Badge variant={cat.variant} compact>{cat.text}</Badge>}
            {it.feasibilityStatus === 'invalid' && <Badge variant="danger" compact>Inviável</Badge>}
          </div>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="label-micro text-white/20">Custo total de mobilização</div>
            <div className="display-sm text-white tabular-data">{formatBRL(it.totalMobilizationCostC)}</div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end label-micro text-white/40"><Clock className="w-3 h-3" />{fmtDur(it.durationMinutes)}</div>
            <div className="flex items-center gap-1.5 justify-end label-micro text-white/40 mt-1"><Layers className="w-3 h-3" />{it.connectionCount} conexão(ões)</div>
          </div>
        </div>

        {/* cost split mini-bars */}
        <CostSplit total={it.totalMobilizationCostC} parts={[
          { label: 'Passagens', value: (b.ticket_c || 0) + (b.shared_vehicle_c || 0), color: 'bg-accent-cyan' },
          { label: 'Mão de obra', value: b.labor_c || 0, color: 'bg-accent-purple' },
          { label: 'Refeição/Hotel', value: (b.transit_meals_c || 0) + (b.transit_hotel_c || 0) + (b.field_meals_c || 0) + (b.field_hotel_c || 0), color: 'bg-mint' },
          { label: 'Local/Transfer', value: (b.terminal_transfers_c || 0) + (b.field_local_c || 0), color: 'bg-accent-orange' },
        ]} />

        <div className="flex items-center gap-2 mt-4">
          <button onClick={onToggle} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl surface-recessed border border-white/[0.05] label-micro text-white/40 hover:text-white/60 transition-colors">
            <ListTree className="w-3.5 h-3.5" /> {expanded ? 'Ocultar' : 'Detalhes'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          {it.feasibilityStatus === 'valid' && (
            <button onClick={onSelect}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors ${selected ? 'bg-mint/20 text-mint border border-mint/30' : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/80'}`}>
              {selected ? <><Check className="w-3.5 h-3.5" /> Selecionada</> : 'Selecionar'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.05] p-5 space-y-5 animate-fade-in">
          <Timeline segments={it.segments} />
          <LaborBreakdown laborByEmployee={it.laborByEmployee} />
        </div>
      )}
    </div>
  );
}

function CostSplit({ total, parts }) {
  const t = total || 1;
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.04]">
        {parts.map((p, i) => <div key={i} className={p.color} style={{ width: `${Math.max(0, (p.value / t) * 100)}%` }} title={`${p.label}: ${formatBRL(p.value)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1.5 label-micro text-white/35">
            <span className={`w-2 h-2 rounded-sm ${p.color}`} />{p.label} <span className="text-white/50 tabular-data">{formatBRL(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Timeline({ segments }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><RouteIcon className="w-3.5 h-3.5 text-mint/50" /><span className="label-micro text-white/40">Timeline porta a porta</span></div>
      <div className="space-y-0">
        {segments.map((s, i) => {
          const meta = MODE_META[s.mode] || MODE_META.waiting; const Icon = meta.icon;
          const dur = Math.round((Date.parse(s.arrivalAtUtc) - Date.parse(s.departureAtUtc)) / 60000);
          const minor = s.mode === 'waiting' || s.mode === 'local_transfer';
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-lg ${meta.bg} border ${meta.ring} flex items-center justify-center flex-shrink-0`}><Icon className={`w-3.5 h-3.5 ${meta.color}`} /></div>
                {i < segments.length - 1 && <div className="w-px flex-1 bg-white/[0.08] my-1" />}
              </div>
              <div className={`pb-3 flex-1 ${minor ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="body text-[13px] text-white/70">{meta.label}{s.estimated ? ' · estimado' : ''}</span>
                  <span className="label-micro text-white/30 tabular-data">{fmtDur(dur)}</span>
                </div>
                <div className="label-micro text-white/30 mt-0.5">
                  {fmtTime(s.departureAtUtc, s.originTimezone)} → {fmtTime(s.arrivalAtUtc, s.destinationTimezone)}
                  {s.commercialCostC > 0 && <span className="text-white/40"> · {formatBRL(s.commercialCostC)}/pax</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Labels keyed by (dayType, baseClassification) so Saturday +100% is shown
// distinctly from weekday +100% — Saturday is always 100% from the first
// counted minute (§4.2), never a regular band.
const LABOR_LABEL = {
  regular: 'Regular', overtime_50: '+50%', overtime_100: '+100%',
  overtime_150: '+150% (Dom/Fer)', custom: 'Custom',
  saturday_overtime_100: '+100% Sábado', sunday_overtime_150: '2,5× Domingo', holiday_overtime_150: '2,5× Feriado',
};

/** Bucket key that separates Saturday/Sunday/holiday premium bands (via dayType). */
function laborBucketKey(bl) {
  if (bl.dayType === 'saturday' && bl.baseClassification === 'overtime_100') return 'saturday_overtime_100';
  if (bl.baseClassification === 'overtime_150') return bl.dayType === 'holiday' ? 'holiday_overtime_150' : 'sunday_overtime_150';
  return bl.baseClassification;
}

function LaborBreakdown({ laborByEmployee }) {
  if (!laborByEmployee?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><Briefcase className="w-3.5 h-3.5 text-accent-purple/60" /><span className="label-micro text-white/40">Mão de obra (por colaborador)</span></div>
      <div className="space-y-3">
        {laborByEmployee.map((emp) => {
          const byClass = {};
          let nightMin = 0;
          for (const bl of emp.blocks) {
            const key = laborBucketKey(bl);
            byClass[key] = (byClass[key] || 0) + bl.countedMinutes;
            if (bl.nightPremiumApplied) nightMin += bl.countedMinutes;
          }
          return (
            <div key={emp.employeeId} className="surface-recessed rounded-xl border border-white/[0.04] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="body text-[13px] text-white/60">{emp.employeeName || emp.employeeId}{emp.warning === 'missing_hourly_rate' ? ' · sem custo-hora' : ''}</span>
                <span className="tabular-data text-[13px] font-semibold text-accent-purple">{formatBRL(emp.totalCostC)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(byClass).map(([k, m]) => (
                  <span key={k} className="px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05] label-micro text-white/45">{fmtDur(m)} {LABOR_LABEL[k] || k}</span>
                ))}
                {nightMin > 0 && <span className="px-2 py-0.5 rounded-md bg-accent-purple/[0.08] border border-accent-purple/15 label-micro text-accent-purple/70 flex items-center gap-1"><Moon className="w-2.5 h-2.5" />{fmtDur(nightMin)} noturno</span>}
              </div>
              <p className="label-micro text-white/15 mt-2">Horas noturnas sobrepõem as categorias acima — não são duplicadas.</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonTable({ itineraries, recId }) {
  return (
    <div className="surface-card rounded-2xl border border-white/[0.05] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-2"><DollarSign className="w-4 h-4 text-mint/50" /><span className="label-micro text-white/40">Comparativo Normalizado</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="label-micro text-white/30 border-b border-white/[0.04]">
              <th className="px-6 py-3 font-medium">Opção</th>
              <th className="px-4 py-3 font-medium text-right">Passagens</th>
              <th className="px-4 py-3 font-medium text-right">Mão de obra</th>
              <th className="px-4 py-3 font-medium text-right">Perman./Local</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">Duração</th>
            </tr>
          </thead>
          <tbody>
            {itineraries.map((it) => {
              const b = it.breakdown || {};
              const perm = (b.transit_meals_c || 0) + (b.transit_hotel_c || 0) + (b.field_meals_c || 0) + (b.field_hotel_c || 0) + (b.terminal_transfers_c || 0) + (b.field_local_c || 0);
              const isRec = it.id === recId;
              return (
                <tr key={it.id} className={`border-b border-white/[0.03] ${isRec ? 'bg-mint/[0.03]' : ''}`}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      {isRec && <CheckCircle className="w-3.5 h-3.5 text-mint" />}
                      <span className="body text-[13px] text-white/70">{it.modeSequence.map((m) => (MODE_META[m] || {}).label || m).join(' + ')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-data text-[13px] text-white/50">{formatBRL((b.ticket_c || 0) + (b.shared_vehicle_c || 0))}</td>
                  <td className="px-4 py-3 text-right tabular-data text-[13px] text-white/50">{formatBRL(b.labor_c || 0)}</td>
                  <td className="px-4 py-3 text-right tabular-data text-[13px] text-white/50">{formatBRL(perm)}</td>
                  <td className={`px-4 py-3 text-right tabular-data text-[13px] font-semibold ${isRec ? 'text-mint' : 'text-white'}`}>{formatBRL(it.totalMobilizationCostC)}</td>
                  <td className="px-4 py-3 text-right tabular-data text-[13px] text-white/50">{fmtDur(it.durationMinutes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchParametersCard({
  origin, destination, tripType, outboundDate, returnDate, departure, deadline, cities,
  onOrigin, onDestination, onTripType, onOutboundDate, onReturnDate, onDeparture, onDeadline,
}) {
  return (
    <section className="surface-card h-full">
      <div className="p-5 md:p-6">
        <PanelTitle
          icon={RouteIcon}
          title="Parâmetros da mobilização"
          subtitle="Origem, destino e data da viagem. Horários são filtros opcionais."
        />
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <FieldBlock label="Origem *" icon={MapPin} iconClassName="text-mint/60">
                <CityAutocomplete
                  name="mob-origin"
                  placeholder="Buscar cidade de origem..."
                  cities={cities}
                  iconColor="mint"
                  value={origin}
                  onChange={onOrigin}
                />
              </FieldBlock>
              <fieldset>
                <legend className="label-micro text-white/55 mb-2">Tipo de viagem *</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['oneway', 'Somente ida'],
                    ['roundtrip', 'Ida e volta'],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={`trip-type-button ${tripType === value ? 'is-selected' : ''}`}
                      onClick={() => onTripType(value)}
                      aria-pressed={tripType === value}
                    >
                      <span className="selection-dot">{tripType === value && <Check className="w-3 h-3" />}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <FieldBlock label="Destino final *" icon={MapPin} iconClassName="text-accent-orange/60">
              <CityAutocomplete
                name="mob-dest"
                placeholder="Buscar destino da operação..."
                cities={cities}
                iconColor="orange"
                value={destination}
                onChange={onDestination}
              />
            </FieldBlock>
          </div>

          <div className={`grid gap-4 ${tripType === 'roundtrip' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            <DatePicker label="Data de ida *" value={outboundDate} onChange={onOutboundDate} />
            {tripType === 'roundtrip' && (
              <DatePicker
                label="Data de volta *"
                value={returnDate}
                onChange={onReturnDate}
                minDate={outboundDate ? new Date(`${outboundDate}T00:00:00`) : undefined}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldBlock label="Horário a partir de (opcional)" icon={CalendarClock}>
              <input
                type="time"
                className="glass-input"
                value={timePart(departure, '')}
                disabled={!outboundDate}
                onChange={(e) => onDeparture(e.target.value ? `${outboundDate}T${e.target.value}` : '')}
              />
              <span className="label-micro text-white/35 mt-1 block">Aplica-se à data de ida selecionada acima.</span>
            </FieldBlock>
            <FieldBlock label="Prazo de chegada (opcional)" icon={Timer} labelClassName="text-mint/70" iconClassName="text-mint">
              <input
                type="datetime-local"
                className="glass-input border-mint/25 bg-mint/[0.04] focus:border-mint/50"
                value={deadline}
                onChange={(e) => onDeadline(e.target.value)}
              />
              <span className="label-micro text-mint/40 mt-1 block">Preencha apenas para limitar as opções encontradas.</span>
            </FieldBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntelligentTeamSelector({
  employees, selectedEmployees, selectedIds, query, onQuery, onToggle, onSelectVisible, onClear,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const selectedCount = selectedIds.size;
  const virtualized = employees.length > 80;
  const rowHeight = 58;
  const visibleStart = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - 3) : 0;
  const visibleEnd = virtualized ? Math.min(employees.length, visibleStart + 12) : employees.length;
  const renderedEmployees = employees.slice(visibleStart, visibleEnd);

  const employeeOption = (employee, virtualIndex = null) => {
    const isSelected = selectedIds.has(employee.id);
    const rate = hourlyRateC(employee);
    return (
      <button
        type="button"
        key={employee.id}
        role="option"
        aria-selected={isSelected}
        className={`employee-option ${isSelected ? 'is-selected' : ''}`}
        style={virtualIndex === null ? undefined : {
          position: 'absolute',
          left: 6,
          right: 6,
          top: virtualIndex * rowHeight + 6,
          height: rowHeight - 2,
        }}
        onClick={() => onToggle(employee.id)}
      >
        <span className="employee-check">{isSelected && <Check className="w-3 h-3" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white/85 truncate">{employeeName(employee)}</span>
          <span className="block text-[11px] text-white/45 truncate">{employeeRole(employee)}</span>
        </span>
        <span className="tabular-data text-[11px] text-white/65 whitespace-nowrap">
          {rate ? `${formatBRL(rate)}/h` : 'sem custo-hora'}
        </span>
      </button>
    );
  };

  return (
    <section className="surface-card h-full">
      <div className="p-5 md:p-6 h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <PanelTitle icon={Users} title="Equipe" subtitle="Custo individual preservado no cálculo." />
          <Badge variant={selectedCount ? 'success' : 'neutral'} compact>{selectedCount} selecionado(s)</Badge>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
          <input
            className="glass-input pl-10"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar nome, cargo, matrícula, projeto ou cidade..."
            aria-label="Buscar colaborador"
          />
        </div>
        <div
          className="employee-scroll mt-3"
          role="listbox"
          aria-multiselectable="true"
          onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        >
          {employees.length ? (
            virtualized
              ? <div className="relative" style={{ height: employees.length * rowHeight + 12 }}>
                {renderedEmployees.map((employee, index) => employeeOption(employee, visibleStart + index))}
              </div>
              : renderedEmployees.map((employee) => employeeOption(employee))
          ) : (
            <p className="body text-[12px] text-white/45 p-4 text-center">Nenhum colaborador encontrado.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <button type="button" className="text-[12px] text-white/60 hover:text-white" onClick={onClear}>Limpar seleção</button>
          <button type="button" className="text-[12px] text-accent-cyan hover:text-white" onClick={onSelectVisible}>Selecionar visíveis</button>
        </div>
        {!!selectedEmployees.length && (
          <div className="flex flex-wrap gap-1.5 mt-3" aria-label="Colaboradores selecionados">
            {selectedEmployees.map((employee) => (
              <button key={employee.id} type="button" className="selected-chip" onClick={() => onToggle(employee.id)}>
                {employeeName(employee)} <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PanelTitle({ icon: Icon, title, subtitle }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent-cyan" />
        <h3 className="heading text-white/85">{title}</h3>
      </div>
      {subtitle && <p className="body text-[13px] text-white/40 mt-1">{subtitle}</p>}
    </div>
  );
}

function FieldBlock({
  label, icon: Icon, children, labelClassName = '', iconClassName = 'text-white/40',
}) {
  return (
    <div>
      <label className={`flex items-center gap-1.5 label-micro text-white/40 mb-2 ${labelClassName}`}>
        {Icon && <Icon className={`w-3 h-3 ${iconClassName}`} />}
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── Config mapping (Settings → engine shapes) ── */
async function loadConfig() {
  const [buf, lim, meal, hotel, local, veh, fuel] = await Promise.all([
    getConfig('connection_buffer_policies'), getConfig('search_limit_policies'),
    getConfig('meal_policies'), getConfig('hotel_policies'), getConfig('local_transport_policies'),
    getConfig('vehicle_assumptions'), getConfig('fuel_prices'),
  ]);
  const cfg = {};
  if (buf) cfg.bufferPolicy = {
    busToBusBufferMin: buf.bus_to_bus_buffer_min, busToFlightBufferMin: buf.bus_to_flight_buffer_min,
    flightToBusBufferMin: buf.flight_to_bus_buffer_min, sameTerminalBufferMin: buf.same_terminal_buffer_min,
    differentTerminalTransferMin: buf.different_terminal_transfer_min, disembarkBufferMin: buf.disembark_buffer_min,
    airportCheckinBufferMin: buf.airport_checkin_buffer_min,
  };
  if (lim) cfg.constraints = {
    maxTotalTripMinutes: lim.max_total_trip_minutes, maxSegments: lim.max_segments, maxConnections: lim.max_connections,
    maxModalChanges: lim.max_modal_changes, maxWaitPerConnectionMin: lim.max_wait_per_connection_min, maxCumulativeWaitMin: lim.max_cumulative_wait_min,
  };
  cfg.costConfig = {
    ...(meal ? { mealDailyC: meal.daily_meal_cost_c } : {}),
    ...(hotel ? { hotelDailyC: hotel.daily_hotel_cost_c } : {}),
    ...(local ? { localDailyC: local.daily_local_transport_cost_c } : {}),
  };
  return cfg;
}
