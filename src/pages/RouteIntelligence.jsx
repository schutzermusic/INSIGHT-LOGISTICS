import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Globe, Sparkles, AlertTriangle, CheckCircle, TrendingDown,
  Clock, Bus, Plane, Car, MapPin, Users, Settings, Loader2,
  ChevronDown, Star, Home, Navigation,
} from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { getExtendedCities } from '../engine/routes-intelligence-db.js';
import { analyzeRoutingIntelligence } from '../engine/routing-intelligence.js';
import { isFlightsApiEnabled } from '../engine/flights-api.js';
import { formatCurrency, formatHours } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { GlassCard, GlassCardHeader, GlassCardTitle } from '../components/ui/GlassCard';
import { KpiCard } from '../components/ui/KpiCard';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';

export default function RouteIntelligence() {
  const { collaborators } = useCollaborators();
  const { saveSimulation } = useSimulations();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [expandedAlt, setExpandedAlt] = useState(null);
  const [apenasDesmob, setApenasDesmob] = useState(false);

  const cities = getExtendedCities();
  const flightsEnabled = isFlightsApiEnabled();

  if (collaborators.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Inteligencia de Rotas" subtitle="Motor de recomendacao logistica com analise multi-modal" icon={Globe} badge="AI-Powered" badgeVariant="purple" />
        <EmptyState icon={AlertTriangle} title="Cadastre colaboradores primeiro" description="O modulo de inteligencia requer colaboradores cadastrados.">
          <button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button>
        </EmptyState>
      </div>
    );
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(true);
    setProgress('Iniciando analise inteligente...');

    try {
      const result = await analyzeRoutingIntelligence({
        origem: form.origem.value,
        destino: form.destino.value,
        collaborators,
        diasCampo: apenasDesmob ? 0 : (parseInt(form.diasCampo?.value) || 5),
        apenasDesmobilizacao: apenasDesmob,
        dateFilters: {
          dataIda: form.dataIda?.value || undefined,
          dataVolta: form.dataVolta?.value || undefined,
        },
        vehicleConfig: !apenasDesmob && form.consumoKmL?.value ? {
          consumoKmL: parseFloat(form.consumoKmL.value) || 10,
          precoLitro: parseFloat(form.precoLitro.value) || 5.5,
          aluguelDia: parseFloat(form.aluguelDia.value) || 180,
          pedagios: parseFloat(form.pedagios.value) || 0,
          categoria: form.categoriaVeiculo?.value || '',
        } : null,
        operational: apenasDesmob ? {
          custoHospedagemDia: 0,
          custoAlimentacaoDia: 0,
          horasNormaisDia: 0,
          horasExtra50Dia: 0,
        } : {
          custoHospedagemDia: parseFloat(form.hospedagem.value) || 150,
          custoAlimentacaoDia: parseFloat(form.alimentacao.value) || 80,
          horasNormaisDia: parseFloat(form.horasNormais.value) || 8,
          horasExtra50Dia: parseFloat(form.he50.value) || 2,
        },
        onProgress: (msg) => setProgress(msg),
      });

      setAnalysis(result);

      if (result.success) {
        result.alternatives?.forEach(alt => {
          saveSimulation({
            nome: `${apenasDesmob ? 'DESMOB' : 'AI'}: ${alt.tipo} - ${alt.descricao}`,
            modal: alt.tipo,
            origem: result.origem,
            destino: result.destino,
            qtdColaboradores: collaborators.length,
            type: 'ai-analysis',
            resumo: {
              custoTotalEquipe: alt.custos.operacionalTotal,
              custoEquipeHoras: alt.custos.maoObra,
              custoEquipeTransito: alt.custos.transito,
              custoEquipePassagens: alt.custos.transporteTotal,
              custoEquipeHospedagem: alt.custos.hospedagem,
              custoEquipeAlimentacao: alt.custos.alimentacao,
              custoLogistico: 0,
              horasTransito: alt.tempoIdaVoltaH,
            },
          });
        });
      }
    } catch (err) {
      setAnalysis({ success: false, error: err.message });
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* Hero Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-3xl bg-gradient-to-br from-accent-purple/20 to-accent-blue/10 flex items-center justify-center">
            <Globe className="w-6 h-6 text-accent-purple" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-heading text-white">Inteligencia de Rotas</h2>
              <Badge variant="purple" dot>AI-Powered</Badge>
            </div>
            <p className="text-sm text-white/30 mt-0.5">Motor de recomendacao logistica com analise multi-modal</p>
          </div>
        </div>
        {flightsEnabled && <Badge variant="mint" dot>Google Flights Ativo</Badge>}
      </div>

      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Origin/Destination */}
          <GlassCard className="lg:col-span-2">
            <GlassCardHeader><GlassCardTitle icon={MapPin}>Origem e Destino</GlassCardTitle></GlassCardHeader>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Cidade de Origem</label>
                <input className="glass-input" name="origem" list="cities-list" placeholder="Ex: Londrina - PR" required />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Cidade de Destino</label>
                <input className="glass-input" name="destino" list="cities-list" placeholder="Ex: Alta Floresta - MT" required />
              </div>
            </div>
            <datalist id="cities-list">
              {cities.map(c => <option key={c} value={c} />)}
            </datalist>

            {/* Demobilization toggle */}
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setApenasDesmob(!apenasDesmob)}
                className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all duration-200 w-full ${apenasDesmob
                  ? 'bg-accent-orange/[0.08] text-accent-orange'
                  : 'bg-surface text-white/35'
                  }`}
              >
                <Home className="w-4 h-4" />
                <span className="text-sm font-medium">Apenas Desmobilização (retorno para casa)</span>
                <div className={`ml-auto w-10 h-5.5 rounded-full transition-colors duration-200 flex items-center ${apenasDesmob ? 'bg-accent-orange justify-end' : 'bg-surface-border justify-start'
                  }`}>
                  <div className="w-4.5 h-4.5 rounded-full bg-white mx-0.5 shadow-sm" />
                </div>
              </button>
            </div>

            {!apenasDesmob && (
              <div className="grid grid-cols-3 gap-5 mt-5">
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Dias em Campo</label>
                  <input className="glass-input" type="number" name="diasCampo" defaultValue="5" min="1" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Data Ida</label>
                  <input className="glass-input" type="date" name="dataIda" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Data Volta</label>
                  <input className="glass-input" type="date" name="dataVolta" />
                </div>
              </div>
            )}

            {apenasDesmob && (
              <div className="grid grid-cols-2 gap-5 mt-5">
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Data da Viagem</label>
                  <input className="glass-input" type="date" name="dataIda" />
                </div>
              </div>
            )}
          </GlassCard>

          {/* Team Info */}
          <GlassCard>
            <GlassCardHeader><GlassCardTitle icon={Users}>Equipe Selecionada</GlassCardTitle></GlassCardHeader>
            <div className="space-y-2.5">
              {collaborators.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center text-xs font-bold text-white/40">
                    {c.nome.charAt(0)}
                  </div>
                  <span className="text-white/60 truncate">{c.nome}</span>
                </div>
              ))}
              {collaborators.length > 4 && (
                <span className="text-xs text-white/25">+{collaborators.length - 4} mais</span>
              )}
            </div>
            <div className="mt-5 p-4 rounded-2xl bg-surface">
              <span className="text-[11px] text-white/25 uppercase tracking-wider font-semibold">Total:</span>
              <span className="text-xl font-bold text-white ml-2">{collaborators.length}</span>
              <span className="text-xs text-white/25 ml-1">colaborador(es)</span>
            </div>
          </GlassCard>
        </div>

        {/* Operational params */}
        {!apenasDesmob && (
          <GlassCard className="mb-5">
            <GlassCardHeader><GlassCardTitle icon={Settings}>Parametros Operacionais</GlassCardTitle></GlassCardHeader>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Hospedagem/dia (R$)</label>
                <input className="glass-input" type="number" name="hospedagem" defaultValue="150" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Alimentacao/dia (R$)</label>
                <input className="glass-input" type="number" name="alimentacao" defaultValue="80" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Horas Normais/dia</label>
                <input className="glass-input" type="number" name="horasNormais" defaultValue="8" step="0.5" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">HE 50%/dia</label>
                <input className="glass-input" type="number" name="he50" defaultValue="2" step="0.5" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Consumo Veiculo (km/L)</label>
                <input className="glass-input" type="number" name="consumoKmL" defaultValue="10" step="0.1" min="1" />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Preco Litro (R$)</label>
                <input className="glass-input" type="number" name="precoLitro" defaultValue="5.50" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Aluguel/dia (R$)</label>
                <input className="glass-input" type="number" name="aluguelDia" defaultValue="180" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Pedagios (R$)</label>
                <input className="glass-input" type="number" name="pedagios" defaultValue="0" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Categoria Veiculo</label>
                <select className="glass-select" name="categoriaVeiculo">
                  <option value="">Padrao</option>
                  <option value="compacto">Compacto</option>
                  <option value="sedan">Sedan</option>
                  <option value="suv">SUV</option>
                  <option value="pickup">Pickup</option>
                </select>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Premium CTA Button */}
        <div className="flex justify-center w-full mb-2 pt-2">
          <LiquidMetalButton
            label={loading ? (progress || 'Analisando rotas...') : "Buscar Rotas Inteligentes"}
            width={220}
            disabled={loading}
            type="submit"
          />
        </div>
      </form>

      {/* Results */}
      {analysis && !analysis.success && (
        <GlassCard>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-accent-red" />
            <p className="text-sm text-white/60">{analysis.error}</p>
          </div>
        </GlassCard>
      )}

      {analysis?.success && (
        <div className="space-y-8 animate-slide-up">
          {/* Executive Summary — Premium Card */}
          <GlassCard glow="mint">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-mint to-accent-cyan flex items-center justify-center flex-shrink-0 shadow-glow-mint-strong">
                <Sparkles className="w-7 h-7 text-dark-900" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-xl font-bold text-white tracking-tight">Recomendacao AI</h3>
                  <Badge variant="mint" dot>Score {analysis.executive.scoreTotal}/100</Badge>
                  <Badge variant="purple">{analysis.totalAlternativas || analysis.alternatives?.length} alternativas</Badge>
                </div>
                <div className="space-y-3">
                  {analysis.executive.paragraphs.map((p, i) => (
                    <p key={i} className="text-sm text-white/45 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>') }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard
              label="Melhor Opcao"
              value={formatCurrency(analysis.executive.maisBaratoOperacional?.custos.operacionalTotal || 0)}
              detail={`${analysis.executive.melhor?.tipo} - Score ${analysis.executive.melhor?.scores.total}/100`}
              icon={Star}
              accent="mint"
            />
            <KpiCard
              label="Economia Operacional"
              value={formatCurrency(analysis.executive.economiaOperacional || 0)}
              detail="vs alternativa mais cara"
              icon={TrendingDown}
              accent="orange"
            />
            <KpiCard
              label="Tempo Economizado"
              value={`${(analysis.executive.tempoSalvo || 0).toFixed(1)}h`}
              detail="Diferenca mais rapido vs lento"
              icon={Clock}
              accent="cyan"
            />
            <KpiCard
              label="Distancia"
              value={`${(analysis.distanciaKm || 0).toLocaleString('pt-BR')} km`}
              detail={analysis.estimado ? 'Estimativa' : 'Dados reais'}
              icon={MapPin}
              accent="blue"
            />
          </div>

          {/* Alternative Cards */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white/60 tracking-tight">Alternativas Analisadas</h3>
            {analysis.alternatives?.sort((a, b) => b.scores.total - a.scores.total).map((alt, i) => (
              <AlternativeCard
                key={alt.id}
                alt={alt}
                rank={i + 1}
                isBest={i === 0}
                expanded={expandedAlt === alt.id}
                onToggle={() => setExpandedAlt(expandedAlt === alt.id ? null : alt.id)}
              />
            ))}
          </div>

          {/* Scores Radar */}
          {analysis.alternatives?.length > 1 && (
            <GlassCard>
              <GlassCardHeader><GlassCardTitle icon={Star}>Comparativo de Scores</GlassCardTitle></GlassCardHeader>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={[
                    { metric: 'Custo Direto', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoDireto])) },
                    { metric: 'Custo Operac.', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoOperacional])) },
                    { metric: 'Tempo', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.tempo])) },
                    { metric: 'Custo-Beneficio', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoBeneficio])) },
                  ]}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} />
                    {analysis.alternatives.map((alt, i) => (
                      <Radar
                        key={alt.id}
                        name={`${alt.tipo} - ${alt.descricao?.substring(0, 20)}`}
                        dataKey={alt.id}
                        stroke={['#49DC7A', '#F97316', '#22F2EF', '#A855F7', '#3B82F6'][i % 5]}
                        fill={['#49DC7A', '#F97316', '#22F2EF', '#A855F7', '#3B82F6'][i % 5]}
                        fillOpacity={0.08}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Tooltip content={<ChartTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}

function AlternativeCard({ alt, rank, isBest, expanded, onToggle }) {
  const TypeIcon = alt.tipo === 'Onibus' ? Bus : alt.tipo === 'Aereo' ? Plane : Car;

  return (
    <div className={`glass-card p-0 overflow-hidden transition-all duration-300 ${isBest ? 'glow-border-mint' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-center gap-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Rank */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${isBest ? 'bg-mint/10 text-mint' : 'bg-surface text-white/35'}`}>
          #{rank}
        </div>

        {/* Icon */}
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${alt.tipo === 'Onibus' ? 'bg-accent-amber/10' : alt.tipo === 'Aereo' ? 'bg-accent-blue/10' : 'bg-accent-purple/10'
          }`}>
          <TypeIcon className={`w-5 h-5 ${alt.tipo === 'Onibus' ? 'text-accent-amber' : alt.tipo === 'Aereo' ? 'text-accent-blue' : 'text-accent-purple'
            }`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-white">{alt.tipo}</span>
            {isBest && <Badge variant="mint" dot>Recomendado</Badge>}
            {alt.detalhes?.fonte === 'realtime' && <Badge variant="cyan">Tempo Real</Badge>}
          </div>
          <p className="text-xs text-white/25 truncate mt-1">{alt.descricao}</p>
        </div>

        {/* Score */}
        <div className="text-center px-4">
          <div className={`text-xl font-bold ${isBest ? 'text-mint' : 'text-white/60'}`}>{alt.scores.total}</div>
          <div className="text-[10px] text-white/20 uppercase font-semibold tracking-wider">Score</div>
        </div>

        {/* Cost */}
        <div className="text-right px-4">
          <div className="text-sm font-bold text-white">{formatCurrency(alt.custos.operacionalTotal)}</div>
          <div className="text-[10px] text-white/20">Custo operacional</div>
        </div>

        {/* Time */}
        <div className="text-right px-4">
          <div className="text-sm font-semibold text-white/60">{alt.tempoViagemH}h</div>
          <div className="text-[10px] text-white/20">so ida</div>
        </div>

        <ChevronDown className={`w-4 h-4 text-white/15 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-6 pb-6 pt-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
            <MiniStat label="Transporte Total" value={formatCurrency(alt.custos.transporteTotal)} />
            <MiniStat label="Transporte/Pessoa" value={formatCurrency(alt.custos.transportePessoa)} />
            <MiniStat label="Mao de Obra" value={formatCurrency(alt.custos.maoObra)} />
            <MiniStat label="Transito (horas)" value={formatCurrency(alt.custos.transito)} />
            <MiniStat label="Hospedagem" value={formatCurrency(alt.custos.hospedagem)} />
            <MiniStat label="Alimentacao" value={formatCurrency(alt.custos.alimentacao)} />
            <MiniStat label="HE Viagem" value={formatCurrency(alt.custos.impactoHorasExtras)} />
            <MiniStat label="Noturno" value={formatCurrency(alt.custos.impactoNoturno)} />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <ScoreBar label="Custo Direto" value={alt.scores.custoDireto} />
            <ScoreBar label="Custo Operac." value={alt.scores.custoOperacional} />
            <ScoreBar label="Tempo" value={alt.scores.tempo} />
            <ScoreBar label="Custo-Beneficio" value={alt.scores.custoBeneficio} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="p-3 rounded-xl bg-surface/50">
      <div className="text-[10px] text-white/20 uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-sm font-semibold text-white/65 mt-1">{value}</div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/25 font-medium">{label}</span>
        <span className="text-[10px] font-bold text-white/45">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-mint to-accent-cyan transition-all duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
