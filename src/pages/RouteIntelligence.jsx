import { useState, useMemo, lazy, Suspense } from 'react';
import { DatePicker } from '../components/ui/DatePicker';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Globe, Sparkles, AlertTriangle, CheckCircle, TrendingDown,
  Clock, Bus, Plane, Car, MapPin, Users, Settings, Loader2,
  ChevronDown, Star, Navigation, ArrowRight, ArrowLeftRight,
  Radar as RadarIcon, Route, Zap, Target, BarChart3,
  ToggleLeft, ToggleRight, Layers, DollarSign, Briefcase, Shield,
  Info, ChevronRight, Check, ExternalLink, ThumbsUp, ThumbsDown,
  ShoppingCart, TrendingUp, Eye, Tag,
} from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { getExtendedCities, getCityInfo } from '../engine/routes-intelligence-db.js';
import { analyzeRoutingIntelligence } from '../engine/routing-intelligence.js';
import { isFlightsApiEnabled } from '../engine/flights-api.js';
import { formatCurrency, formatHours } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { MagneticWrap } from '../components/ui/MagneticWrap';
import BrazilMap, { latLngToSvg } from '../components/map/BrazilMap';
const DeckGLMap = lazy(() => import('../components/map/DeckGLMap'));
import { isGoogleMapsLoaded } from '../services/GoogleMapsLoader';
import { CityAutocomplete } from '../components/ui/CityAutocomplete';

const ROUTE_SCENARIO_ORDER = ['veiculo', 'aereo', 'onibus'];
const ROUTE_SCENARIO_META = {
  onibus: { label: 'Onibus', icon: Bus, color: '#F59E0B' },
  aereo: { label: 'Aereo', icon: Plane, color: '#3B82F6' },
  veiculo: { label: 'Veiculo/Frota', icon: Car, color: '#A855F7' },
};

function inferScenarioKey(tipo = '') {
  const lowerTipo = tipo.toLowerCase();
  if (lowerTipo.includes('nibus') || lowerTipo.includes('bus')) return 'onibus';
  if (lowerTipo.includes('reo') || lowerTipo.includes('air')) return 'aereo';
  if (lowerTipo.includes('culo') || lowerTipo.includes('car') || lowerTipo.includes('frota')) return 'veiculo';
  return null;
}

export default function RouteIntelligence() {
  const { collaborators } = useCollaborators();
  const { saveSimulation } = useSimulations();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [expandedAlt, setExpandedAlt] = useState(null);
  const [tripType, setTripType] = useState('roundtrip'); // 'oneway' | 'roundtrip'
  const [dataIda, setDataIda] = useState('');
  const [dataVolta, setDataVolta] = useState('');
  const [confirmedRoute, setConfirmedRoute] = useState(null); // id of confirmed alternative
  const [operationalEnabled, setOperationalEnabled] = useState(false);
  const [operationalMode, setOperationalMode] = useState('logistics-labor'); // 'logistics-labor' | 'full-operational'
  const [selectedCollabIds, setSelectedCollabIds] = useState(new Set());

  const cities = getExtendedCities();

  // Selected collaborators & vehicle calculation
  const selectedCollaborators = collaborators.filter(c => selectedCollabIds.has(c.id));
  const veiculosNecessarios = Math.ceil(selectedCollaborators.length / 4);

  const toggleCollab = (id) => {
    setSelectedCollabIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCollabs = () => {
    if (selectedCollabIds.size === collaborators.length) {
      setSelectedCollabIds(new Set());
    } else {
      setSelectedCollabIds(new Set(collaborators.map(c => c.id)));
    }
  };
  const flightsEnabled = isFlightsApiEnabled();

  // Build DeckGL map props from analysis (must be before early returns — React hooks rule)
  const deckMapProps = useMemo(() => {
    if (!analysis?.success) return null;

    const originCity = getCityInfo(analysis.origem);
    const destCity = getCityInfo(analysis.destino);
    if (!originCity || !destCity) return null;

    const bestAlt = [...(analysis.alternatives || [])].sort((a, b) => b.scores.total - a.scores.total)?.[0];
    const tipo = bestAlt?.tipo?.toLowerCase() || 'driving';
    let routeType = 'driving';
    if (tipo.includes('aer') || tipo.includes('air')) routeType = 'air';
    else if (tipo.includes('onibus') || tipo.includes('bus')) routeType = 'bus';

    return {
      origin: { lat: originCity.lat, lng: originCity.lng, label: analysis.origem?.split(' - ')[0] },
      destination: { lat: destCity.lat, lng: destCity.lng, label: analysis.destino?.split(' - ')[0] },
      routeType,
    };
  }, [analysis]);

  const scenarioComparison = useMemo(() => {
    if (!analysis?.success || !analysis.alternatives?.length) return [];

    const bestByScenario = new Map();
    analysis.alternatives.forEach((alt) => {
      const scenarioKey = inferScenarioKey(alt.tipo);
      if (!scenarioKey) return;
      const current = bestByScenario.get(scenarioKey);
      if (!current || alt.scores.total > current.scores.total) {
        bestByScenario.set(scenarioKey, alt);
      }
    });

    return ROUTE_SCENARIO_ORDER
      .map((scenarioKey) => {
        const alt = bestByScenario.get(scenarioKey);
        if (!alt) return null;

        const isVehicle = scenarioKey === 'veiculo';
        const extraOperational = (alt.custos.deslocamentoLocal || 0) + (alt.custos.impactoHorasExtras || 0) + (alt.custos.impactoNoturno || 0);
        const custoPassagens = isVehicle ? 0 : alt.custos.transporteTotal;
        const custoLogistico = (isVehicle ? alt.custos.transporteTotal : 0) + extraOperational;

        return {
          id: alt.id,
          nome: ROUTE_SCENARIO_META[scenarioKey].label,
          scenarioKey,
          resumo: {
            custoEquipeHoras: alt.custos.maoObra || 0,
            custoEquipeTransito: alt.custos.transito || 0,
            custoEquipePassagens: custoPassagens,
            custoEquipeHospedagem: alt.custos.hospedagem || 0,
            custoEquipeAlimentacao: alt.custos.alimentacao || 0,
            custoLogistico,
            custoTotalEquipe: alt.custos.operacionalTotal || 0,
            horasTransito: alt.tempoIdaVoltaH || alt.tempoViagemH || 0,
          },
        };
      })
      .filter(Boolean);
  }, [analysis]);

  const routeBestScenarioName = useMemo(() => {
    if (!scenarioComparison.length) return null;
    return [...scenarioComparison].sort((a, b) => a.resumo.custoTotalEquipe - b.resumo.custoTotalEquipe)[0]?.nome || null;
  }, [scenarioComparison]);

  const routeFastestScenarioName = useMemo(() => {
    if (!scenarioComparison.length) return null;
    return [...scenarioComparison].sort((a, b) => a.resumo.horasTransito - b.resumo.horasTransito)[0]?.nome || null;
  }, [scenarioComparison]);

  if (collaborators.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Inteligencia de Rotas" subtitle="Motor de recomendacao logistica com analise multi-modal" icon={Globe} badge="AI-Powered" badgeVariant="purple" />
        <EmptyState icon={AlertTriangle} title="Cadastre colaboradores primeiro" description="O modulo de inteligencia requer colaboradores cadastrados.">
          <MagneticWrap><button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button></MagneticWrap>
        </EmptyState>
      </div>
    );
  }

  // Build map data from analysis results
  const buildRouteMapData = () => {
    if (!analysis?.success) return { routes: [], points: [] };

    const originCity = getCityInfo(analysis.origem);
    const destCity = getCityInfo(analysis.destino);

    if (!originCity || !destCity) return { routes: [], points: [] };

    const originCoords = latLngToSvg(originCity.lat, originCity.lng);
    const destCoords = latLngToSvg(destCity.lat, destCity.lng);

    const bestAlt = analysis.alternatives?.sort((a, b) => b.scores.total - a.scores.total)?.[0];
    const routeColor = bestAlt?.tipo === 'Aereo' ? '#22F2EF' : bestAlt?.tipo === 'Onibus' ? '#F97316' : '#49DC7A';

    const routes = [{
      fromUf: originCity.uf,
      toUf: destCity.uf,
      color: routeColor,
      intensity: 1,
      label: `${(analysis.distanciaKm || 0).toLocaleString('pt-BR')} km`,
    }];

    const points = [
      {
        uf: originCity.uf,
        x: originCoords.x,
        y: originCoords.y,
        label: analysis.origem?.split(' - ')[0],
        color: '#49DC7A',
        value: 'Origem',
      },
      {
        uf: destCity.uf,
        x: destCoords.x,
        y: destCoords.y,
        label: analysis.destino?.split(' - ')[0],
        color: '#F97316',
        value: 'Destino',
      },
    ];

    return { routes, points };
  };

  const mapData = analysis?.success ? buildRouteMapData() : { routes: [], points: [] };

  // Compute the active optimization mode
  const activeOptimizationMode = operationalEnabled ? operationalMode : 'logistics';

  const handleSearch = async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(true);
    setProgress('Iniciando analise inteligente...');

    try {
      // Build operational params based on mode
      let operational;
      if (!operationalEnabled) {
        // Logistics-only: zero out operational costs
        operational = {
          custoHospedagemDia: 0,
          custoAlimentacaoDia: 0,
          horasNormaisDia: 0,
          horasExtra50Dia: 0,
        };
      } else if (operationalMode === 'logistics-labor') {
        // Labor costs only, no per diem
        operational = {
          custoHospedagemDia: 0,
          custoAlimentacaoDia: 0,
          horasNormaisDia: parseFloat(form.horasNormais?.value) || 8,
          horasExtra50Dia: parseFloat(form.he50?.value) || 2,
        };
      } else {
        // Full operational
        operational = {
          custoHospedagemDia: parseFloat(form.hospedagem?.value) || 150,
          custoAlimentacaoDia: parseFloat(form.alimentacao?.value) || 80,
          horasNormaisDia: parseFloat(form.horasNormais?.value) || 8,
          horasExtra50Dia: parseFloat(form.he50?.value) || 2,
        };
      }

      // Auto-calculate field days from dates
      let diasCampo = 5; // default
      if (tripType === 'oneway') {
        diasCampo = 0;
      } else if (dataIda && dataVolta) {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diff = Math.round((new Date(dataVolta) - new Date(dataIda)) / msPerDay);
        diasCampo = Math.max(1, diff);
      }

      const result = await analyzeRoutingIntelligence({
        origem: form.origem.value,
        destino: form.destino.value,
        collaborators: selectedCollaborators,
        veiculosNecessarios,
        diasCampo,
        apenasDesmobilizacao: tripType === 'oneway',
        optimizationMode: activeOptimizationMode,
        dateFilters: {
          dataIda: dataIda || undefined,
          dataVolta: dataVolta || undefined,
        },
        vehicleConfig: form.consumoKmL?.value ? {
          consumoKmL: parseFloat(form.consumoKmL.value) || 10,
          precoLitro: parseFloat(form.precoLitro.value) || 5.5,
          aluguelDia: parseFloat(form.aluguelDia.value) || 180,
          categoria: form.categoriaVeiculo?.value || '',
        } : null,
        operational,
        onProgress: (msg) => setProgress(msg),
      });

      setAnalysis(result);
      setConfirmedRoute(null);
    } catch (err) {
      setAnalysis({ success: false, error: err.message });
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleConfirmRoute = (alt) => {
    saveSimulation({
      nome: `AI: ${alt.tipo} - ${alt.descricao}`,
      modal: alt.tipo,
      origem: analysis.origem,
      destino: analysis.destino,
      qtdColaboradores: selectedCollaborators.length,
      type: 'confirmed-route',
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
    setConfirmedRoute(alt.id);
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Command Center Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.04] bg-gradient-to-br from-dark-800/80 via-dark-900/90 to-dark-800/80 p-8">
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent-purple/[0.06] rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-mint/[0.04] rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-accent-cyan/[0.02] rounded-full blur-3xl" />
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
        </div>

        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-purple/20 via-accent-blue/15 to-mint/10 flex items-center justify-center border border-white/[0.06]">
                <Globe className="w-8 h-8 text-accent-purple" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-mint/20 border border-mint/30 flex items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-mint" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="display-md">Route Intelligence</h2>
                <Badge variant="purple" dot>AI-Powered</Badge>
              </div>
              <p className="body">Centro de comando logistico com analise multi-modal e otimizacao inteligente</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 label-micro text-white/20">
                  <Target className="w-3 h-3 text-mint/50" />
                  <span>Precisao otimizada</span>
                </div>
                <div className="flex items-center gap-1.5 label-micro text-white/20">
                  <BarChart3 className="w-3 h-3 text-accent-cyan/50" />
                  <span>Multi-modal scoring</span>
                </div>
                <div className="flex items-center gap-1.5 label-micro text-white/20">
                  <Route className="w-3 h-3 text-accent-purple/50" />
                  <span>Rota inteligente</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {flightsEnabled && <Badge variant="mint" dot>Google Flights Ativo</Badge>}
            <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] label-micro text-white/25 tabular-data">
              {collaborators.length} colab.
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Form - Integrated Panel */}
      <form onSubmit={handleSearch}>
        <div className="relative rounded-2xl border border-white/[0.04] bg-gradient-to-b from-dark-800/60 to-dark-900/40 overflow-hidden">
          {/* Panel header strip */}
          <div className="px-8 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-mint/60 animate-pulse" />
              <span className="label-micro text-white/40">Painel de Configuracao da Analise</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Trip Type Selector */}
              <div className="flex items-center rounded-xl bg-white/[0.03] border border-white/[0.04] p-0.5">
                <button
                  type="button"
                  onClick={() => setTripType('oneway')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                    tripType === 'oneway'
                      ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <ArrowRight className="w-3 h-3" />
                  So Ida
                </button>
                <button
                  type="button"
                  onClick={() => setTripType('roundtrip')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                    tripType === 'roundtrip'
                      ? 'bg-mint/15 text-mint border border-mint/20'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Ida e Volta
                </button>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {/* Route Configuration Row */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Origin / Destination - spans 8 cols */}
              <div className="lg:col-span-8">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-mint/60" />
                  <span className="label-micro text-white/40">Rota</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block label-micro text-white/35 mb-2">Cidade de Origem</label>
                    <CityAutocomplete
                      name="origem"
                      placeholder="Ex: sao paulo, londrina..."
                      cities={cities}
                      iconColor="mint"
                      required
                    />
                  </div>
                  <div>
                    <label className="block label-micro text-white/35 mb-2">Cidade de Destino</label>
                    <CityAutocomplete
                      name="destino"
                      placeholder="Ex: alta floresta, cuiaba..."
                      cities={cities}
                      iconColor="orange"
                      required
                    />
                  </div>
                </div>

              </div>

              {/* Team Selector - spans 4 cols */}
              <div className="lg:col-span-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent-purple/60" />
                    <span className="label-micro text-white/40">Equipe</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAllCollabs}
                    className="label-micro text-accent-purple/60 hover:text-accent-purple transition-colors"
                  >
                    {selectedCollabIds.size === collaborators.length ? 'Limpar' : 'Todos'}
                  </button>
                </div>
                <div
                  className="rounded-2xl border border-white/[0.03] overflow-hidden"
                  style={{ background: 'rgba(4, 10, 10, 0.4)', backdropFilter: 'blur(12px)' }}
                >
                  <div className="max-h-[180px] overflow-y-auto p-2 space-y-1">
                    {collaborators.map(c => {
                      const isSelected = selectedCollabIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCollab(c.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                            isSelected
                              ? 'bg-accent-purple/[0.08] border border-accent-purple/15'
                              : 'border border-transparent hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
                            isSelected
                              ? 'bg-accent-purple'
                              : 'bg-white/[0.06] border border-white/[0.08]'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                            isSelected
                              ? 'bg-accent-purple/15 text-accent-purple'
                              : 'bg-white/[0.04] text-white/25'
                          }`}>
                            {c.nome.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                        <span className={`body text-[13px] truncate block ${isSelected ? 'text-white/70' : 'text-white/35'}`}>{c.nome}</span>
                            {c.cargo && <span className={`label-micro truncate block mt-1 ${isSelected ? 'text-white/30' : 'text-white/15'}`}>{c.cargo}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer with count + vehicles */}
                  <div className="px-4 py-3 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className={`metric-value ${selectedCollaborators.length > 0 ? 'text-white' : 'text-white/20'}`}>
                          {selectedCollaborators.length}
                        </span>
                        <span className="label-micro text-white/25">
                          selecionado{selectedCollaborators.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {selectedCollaborators.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-cyan/[0.08] border border-accent-cyan/10">
                          <Car className="w-3 h-3 text-accent-cyan" />
                          <span className="label-micro text-accent-cyan tabular-data">
                            {veiculosNecessarios} {veiculosNecessarios === 1 ? 'veiculo' : 'veiculos'}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedCollaborators.length > 4 && (
                      <p className="label-micro text-white/15 mt-2">
                        Maximo 4 pessoas por veiculo
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Date Filters Row */}
            <div className={`grid gap-4 ${tripType === 'roundtrip' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <DatePicker
                label="Data Ida"
                value={dataIda}
                onChange={setDataIda}
              />
              {tripType === 'roundtrip' && (
                <DatePicker
                  label="Data Volta"
                  value={dataVolta}
                  onChange={setDataVolta}
                  minDate={dataIda ? new Date(dataIda + 'T00:00:00') : undefined}
                />
              )}
            </div>

            {/* Vehicle Configuration - Logistics parameter (always available) */}
            <div className="rounded-2xl border border-white/[0.03] bg-white/[0.015] overflow-hidden">
                <div className="px-6 py-3 border-b border-white/[0.03] flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-white/25" />
                  <span className="label-micro text-white/30">Configuracao do Veiculo</span>
                  <span className="label-micro text-white/15 ml-auto">Logistica</span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Consumo (km/L)</label>
                      <input className="glass-input" type="number" name="consumoKmL" defaultValue="10" step="0.1" min="1" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Preco Litro (R$)</label>
                      <input className="glass-input" type="number" name="precoLitro" defaultValue="5.50" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Aluguel/dia (R$)</label>
                      <input className="glass-input" type="number" name="aluguelDia" defaultValue="180" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Pedagios</label>
                      <div className="glass-input flex items-center gap-1.5 text-white/40 cursor-default select-none" title="Calculado automaticamente via Google Routes API">
                        <Zap className="w-3 h-3 text-accent-cyan" />
                        <span className="body text-[13px]">Auto</span>
                      </div>
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Categoria</label>
                      <select className="glass-select" name="categoriaVeiculo">
                        <option value="">Padrao</option>
                        <option value="compacto">Compacto</option>
                        <option value="sedan">Sedan</option>
                        <option value="suv">SUV</option>
                        <option value="pickup">Pickup</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

            {/* Current Optimization Mode Indicator */}
            <div className="flex items-center gap-3 px-2">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold tracking-wide ${
                  activeOptimizationMode === 'logistics'
                    ? 'bg-accent-cyan/[0.08] text-accent-cyan border border-accent-cyan/15'
                    : activeOptimizationMode === 'logistics-labor'
                    ? 'bg-accent-purple/[0.08] text-accent-purple border border-accent-purple/15'
                    : 'bg-mint/[0.08] text-mint border border-mint/15'
                }`}>
                  <Shield className="w-3.5 h-3.5" />
                  {activeOptimizationMode === 'logistics' && 'Modo: Logistics Only'}
                  {activeOptimizationMode === 'logistics-labor' && 'Modo: Logistics + Labor Cost'}
                  {activeOptimizationMode === 'full-operational' && 'Modo: Full Operational Cost'}
                </div>
                <div className="flex-1 h-px bg-white/[0.04]" />
                <span className="label-micro text-white/15">
                  {operationalEnabled ? 'Parametros operacionais ativos' : 'Apenas variaveis logisticas'}
                </span>
              </div>

          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OPERATIONAL PARAMETERS — Independent Collapsible Block
            Visually separated from core route search
        ═══════════════════════════════════════════════════════════════ */}
        <div className={`relative rounded-2xl border overflow-hidden transition-all duration-300 mt-4 ${
            operationalEnabled
              ? 'border-accent-purple/15 bg-gradient-to-br from-accent-purple/[0.03] via-dark-900/80 to-dark-800/60'
              : 'border-white/[0.04] bg-gradient-to-b from-dark-800/40 to-dark-900/30'
          }`}>
            {/* Subtle glow when enabled */}
            {operationalEnabled && (
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-accent-purple/[0.04] rounded-full blur-3xl pointer-events-none" />
            )}

            {/* Header with Toggle */}
            <button
              type="button"
              onClick={() => setOperationalEnabled(!operationalEnabled)}
              className="relative w-full px-8 py-6 flex items-center gap-4 text-left hover:bg-white/[0.01] transition-colors"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                operationalEnabled
                  ? 'bg-gradient-to-br from-accent-purple/20 to-accent-blue/15 border border-accent-purple/20'
                  : 'bg-white/[0.03] border border-white/[0.06]'
              }`}>
                <Layers className={`w-5 h-5 transition-colors duration-300 ${
                  operationalEnabled ? 'text-accent-purple' : 'text-white/25'
                }`} />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-0.5">
                  <h3 className={`heading transition-colors duration-300 ${
                    operationalEnabled ? 'text-white' : 'text-white/40'
                  }`}>
                    Parametros Operacionais
                  </h3>
                  {operationalEnabled && (
                    <Badge variant="purple" dot>Ativo</Badge>
                  )}
                </div>
                <p className={`body text-[13px] transition-colors duration-300 ${
                  operationalEnabled ? 'text-white/30' : 'text-white/15'
                }`}>
                  {operationalEnabled
                    ? 'A analise incluira custos operacionais e de mao de obra na otimizacao'
                    : 'Habilite para incluir custos de mao de obra e operacionais na analise'
                  }
                </p>
              </div>

              {/* Toggle Switch */}
              <div className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center ${
                operationalEnabled
                  ? 'bg-accent-purple justify-end'
                  : 'bg-white/[0.08] justify-start'
              }`}>
                <div className="w-5 h-5 rounded-full bg-white mx-0.5 shadow-sm transition-all duration-200" />
              </div>

              <ChevronRight className={`w-4 h-4 text-white/15 transition-transform duration-300 ${
                operationalEnabled ? 'rotate-90' : ''
              }`} />
            </button>

            {/* Expandable Content */}
            {operationalEnabled && (
              <div className="relative px-8 pb-8 pt-2 space-y-6 animate-fade-in">
                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-accent-purple/15 to-transparent" />

                {/* Mode Selector */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Info className="w-3.5 h-3.5 text-accent-purple/40" />
                    <span className="label-micro text-white/30">Nivel de Otimizacao</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setOperationalMode('logistics-labor')}
                      className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
                        operationalMode === 'logistics-labor'
                          ? 'border-accent-purple/20 bg-accent-purple/[0.06]'
                          : 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          operationalMode === 'logistics-labor'
                            ? 'bg-accent-purple/15'
                            : 'bg-white/[0.04]'
                        }`}>
                          <Briefcase className={`w-4 h-4 ${
                            operationalMode === 'logistics-labor' ? 'text-accent-purple' : 'text-white/25'
                          }`} />
                        </div>
                        <div>
                          <div className={`heading text-[15px] ${
                            operationalMode === 'logistics-labor' ? 'text-white' : 'text-white/40'
                          }`}>Logistics + Labor Cost</div>
                          <div className={`label-micro mt-1 ${
                            operationalMode === 'logistics-labor' ? 'text-white/30' : 'text-white/15'
                          }`}>Custo hora tecnica + horas extras</div>
                        </div>
                      </div>
                      <div className={`body text-[13px] leading-relaxed ${
                        operationalMode === 'logistics-labor' ? 'text-white/25' : 'text-white/12'
                      }`}>
                        Inclui custo hora tecnica, hora normal, HE 50%, HE 100%, adicional noturno
                      </div>
                      {operationalMode === 'logistics-labor' && (
                        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOperationalMode('full-operational')}
                      className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
                        operationalMode === 'full-operational'
                          ? 'border-mint/20 bg-mint/[0.06]'
                          : 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          operationalMode === 'full-operational'
                            ? 'bg-mint/15'
                            : 'bg-white/[0.04]'
                        }`}>
                          <DollarSign className={`w-4 h-4 ${
                            operationalMode === 'full-operational' ? 'text-mint' : 'text-white/25'
                          }`} />
                        </div>
                        <div>
                          <div className={`heading text-[15px] ${
                            operationalMode === 'full-operational' ? 'text-white' : 'text-white/40'
                          }`}>Full Operational Cost</div>
                          <div className={`label-micro mt-1 ${
                            operationalMode === 'full-operational' ? 'text-white/30' : 'text-white/15'
                          }`}>Custo operacional completo</div>
                        </div>
                      </div>
                      <div className={`body text-[13px] leading-relaxed ${
                        operationalMode === 'full-operational' ? 'text-white/25' : 'text-white/12'
                      }`}>
                        Inclui tudo acima + hospedagem, alimentacao, deslocamento local
                      </div>
                      {operationalMode === 'full-operational' && (
                        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-mint animate-pulse" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Labor Cost Inputs (shown for both modes) */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase className="w-3.5 h-3.5 text-accent-purple/40" />
                    <span className="label-micro text-white/30">Jornada de Trabalho</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Horas Normais/dia</label>
                      <input className="glass-input" type="number" name="horasNormais" defaultValue="8" step="0.5" min="0" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">HE 50%/dia</label>
                      <input className="glass-input" type="number" name="he50" defaultValue="2" step="0.5" min="0" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">HE 100%/dia</label>
                      <input className="glass-input" type="number" name="he100" defaultValue="0" step="0.5" min="0" />
                    </div>
                    <div>
                      <label className="block label-micro text-white/35 mb-2">Horas Noturnas/dia</label>
                      <input className="glass-input" type="number" name="horasNoturnas" defaultValue="0" step="0.5" min="0" />
                    </div>
                  </div>
                </div>

                {/* Per Diem Inputs (only for full-operational mode) */}
                {operationalMode === 'full-operational' && (
                  <div className="animate-fade-in">
                    <div className="flex items-center gap-2 mb-4">
                      <DollarSign className="w-3.5 h-3.5 text-mint/40" />
                      <span className="label-micro text-white/30">Custos de Permanencia</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Hospedagem/dia (R$)</label>
                        <input className="glass-input" type="number" name="hospedagem" defaultValue="150" step="0.01" min="0" />
                      </div>
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Alimentacao/dia (R$)</label>
                        <input className="glass-input" type="number" name="alimentacao" defaultValue="80" step="0.01" min="0" />
                      </div>
                      <div>
                        <label className="block label-micro text-white/35 mb-2">Deslocamento Local/dia (R$)</label>
                        <input className="glass-input" type="number" name="deslocamentoLocal" defaultValue="40" step="0.01" min="0" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Premium CTA Button */}
        <div className="flex flex-col items-center w-full pt-4 pb-2 gap-2">
          {selectedCollaborators.length === 0 && (
            <span className="body text-[13px] text-accent-orange/60 font-medium">Selecione ao menos 1 colaborador</span>
          )}
          <LiquidMetalButton
            label={loading ? (progress || 'Analisando...') : 'Buscar Rotas'}
            width={240}
            height={56}
            disabled={loading || selectedCollaborators.length === 0}
            type="submit"
          />
        </div>
      </form>

      {/* No Alternatives Found State — Intelligent fallback messaging, never dead-end */}
      {analysis?.success && analysis?.noAlternativesFound && (
        <div className="space-y-4 animate-slide-up">
          <div className="rounded-2xl border border-accent-purple/15 bg-gradient-to-br from-accent-purple/[0.04] via-dark-900/60 to-dark-800/40 backdrop-blur-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-accent-purple" />
              </div>
              <div className="flex-1">
                <h3 className="heading text-white mb-2">Este destino requer composicao regional de acesso</h3>
                <p className="body text-[13px] mb-3">
                  Nenhuma rota direta simples encontrada. O motor de inteligencia gerou alternativas multimodais, mas nenhuma atendeu aos parametros de viabilidade. Abaixo, o resumo da exploracao realizada.
                </p>
                <div className="space-y-2">
                  {analysis.executive?.paragraphs?.map((p, i) => (
                    <p key={i} className="body text-[15px]"
                      dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/70 font-semibold">$1</strong>') }}
                    />
                  ))}
                </div>
                {analysis.explorationLog?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.04]">
                    <p className="label-micro text-white/20 mb-2">Estrategias exploradas</p>
                    <div className="space-y-1">
                      {analysis.explorationLog.map((log, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <CheckCircle className="w-2.5 h-2.5 text-accent-purple/40" />
                          <span className="body text-[13px]">{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {analysis?.success && !analysis?.noAlternativesFound && (
        <div className="space-y-8 animate-slide-up">

          {/* Multimodal Discovery Banner */}
          {analysis.multimodal && (
            <div className="relative overflow-hidden rounded-2xl border border-accent-purple/15 bg-gradient-to-r from-accent-purple/[0.04] via-dark-900/60 to-accent-cyan/[0.03] p-6">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-accent-purple/[0.06] rounded-full blur-3xl pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4.5 h-4.5 text-accent-purple" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="heading text-white">Motor Multimodal Ativo</h4>
                    <Badge variant="purple" dot>Exploração Inteligente</Badge>
                  </div>
                  <p className="body text-[13px]">
                    Rota direta simples nao encontrada. O motor de inteligencia explorou aeroportos proximos, hubs regionais e composicoes multimodais para construir {analysis.alternatives?.length || 0} alternativa(s) porta-a-porta.
                  </p>
                  {analysis.explorationLog?.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {analysis.explorationLog.map((log, i) => (
                        <span key={i} className="label-micro text-white/20 flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5 text-mint/40" />
                          {log}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Map + Executive Summary — Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Map Panel */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl border border-white/[0.04] bg-gradient-to-b from-dark-800/60 to-dark-900/40 overflow-hidden h-full">
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-3.5 h-3.5 text-mint/50" />
                    <span className="label-micro text-white/30">Mapa da Rota</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-mint" />
                      <span className="label-micro text-white/25">{analysis.origem?.split(' - ')[0]}</span>
                    </div>
                    <ArrowRight className="w-2.5 h-2.5 text-white/15" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-accent-orange" />
                      <span className="label-micro text-white/25">{analysis.destino?.split(' - ')[0]}</span>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  {deckMapProps && isGoogleMapsLoaded() ? (
                    <Suspense fallback={
                      <div className="h-[420px] flex items-center justify-center bg-dark-900/50 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-mint/30 border-t-mint rounded-full animate-spin" />
                          <span className="body text-[13px]">Carregando mapa...</span>
                        </div>
                      </div>
                    }>
                      <DeckGLMap
                        origin={deckMapProps.origin}
                        destination={deckMapProps.destination}
                        routeType={deckMapProps.routeType}
                        height={420}
                        showArc={true}
                      />
                    </Suspense>
                  ) : (
                    <div className="p-4">
                      <BrazilMap
                        routes={mapData.routes}
                        activePoints={mapData.points}
                        showLabels={true}
                        glowIntensity="high"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
                {/* Route info footer */}
                <div className="px-4 py-3 border-t border-white/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="label-micro text-white/20">Distancia</div>
                      <div className="tabular-data text-sm font-bold text-white">{(analysis.distanciaKm || 0).toLocaleString('pt-BR')} km</div>
                    </div>
                    <div className="w-px h-6 bg-white/[0.06]" />
                    <div>
                      <div className="label-micro text-white/20">Alternativas</div>
                      <div className="tabular-data text-sm font-bold text-accent-purple">{analysis.totalAlternativas || analysis.alternatives?.length}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {analysis.multimodal && (
                      <Badge variant="purple" dot>Multimodal</Badge>
                    )}
                    <Badge variant={analysis.estimado ? 'orange' : 'mint'} dot>
                      {analysis.estimado ? 'Estimativa' : 'Dados reais'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Executive Summary Panel */}
            <div className="lg:col-span-7">
              <div className="relative rounded-2xl border border-mint/10 bg-gradient-to-br from-mint/[0.03] via-dark-900/80 to-dark-800/60 overflow-hidden h-full">
                {/* Subtle glow effect */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-mint/[0.04] rounded-full blur-3xl pointer-events-none" />

                <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mint to-accent-cyan flex items-center justify-center flex-shrink-0 shadow-glow-mint-strong">
                    <Sparkles className="w-5 h-5 text-dark-900" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="heading text-white">Recomendacao AI</h3>
                      <Badge variant="mint" dot>Score {analysis.executive.scoreTotal}/100</Badge>
                    </div>
                    <p className="label-micro text-white/25 mt-1">Analise completa multi-modal com otimizacao de custos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OptimizationModeBadge mode={analysis.optimizationMode} />
                    <Badge variant="purple">{analysis.totalAlternativas || analysis.alternatives?.length} alternativas</Badge>
                  </div>
                </div>

                <div className="p-6 relative">
                  <div className="space-y-3">
                    {analysis.executive.paragraphs.map((p, i) => (
                      <p key={i} className="body text-[15px]"
                        dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>') }}
                      />
                    ))}
                  </div>

                  {/* Quick stats row inside executive */}
                  <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/[0.04]">
                    <div className="text-center">
                      <div className="metric-value text-mint">{formatCurrency(analysis.executive.maisBaratoOperacional?.custos.operacionalTotal || 0)}</div>
                      <div className="label-micro text-white/20 mt-1">Melhor opcao</div>
                    </div>
                    <div className="text-center">
                      <div className="metric-value text-accent-orange">{formatCurrency(analysis.executive.economiaOperacional || 0)}</div>
                      <div className="label-micro text-white/20 mt-1">Economia</div>
                    </div>
                    <div className="text-center">
                      <div className="metric-value text-accent-cyan">{(analysis.executive.tempoSalvo || 0).toFixed(1)}h</div>
                      <div className="label-micro text-white/20 mt-1">Tempo salvo</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Flight Price Intelligence Panel */}
          {analysis.flightPriceInsights?.available && (
            <div className="relative rounded-2xl border border-accent-blue/10 bg-gradient-to-r from-accent-blue/[0.03] via-dark-900/60 to-dark-800/40 p-6">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4.5 h-4.5 text-accent-blue" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="heading text-white">Inteligencia de Precos — Voos</h4>
                    <Badge variant="cyan">Google Flights</Badge>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <div className="label-micro text-white/20">Melhor Preco</div>
                      <div className="metric-value text-accent-cyan">{formatCurrency(analysis.flightPriceInsights.precoAtual || 0)}</div>
                    </div>
                    {analysis.flightPriceInsights.faixaPreco?.length >= 2 && (
                      <div>
                        <div className="label-micro text-white/20">Faixa Tipica</div>
                        <div className="tabular-data text-sm font-semibold text-white/50">
                          {formatCurrency(analysis.flightPriceInsights.faixaPreco[0])} — {formatCurrency(analysis.flightPriceInsights.faixaPreco[1])}
                        </div>
                      </div>
                    )}
                    {analysis.flightPriceInsights.precoAtualNivel && (
                      <div>
                        <div className="label-micro text-white/20">Nivel de Preco</div>
                        <div className={`text-sm font-semibold ${
                          analysis.flightPriceInsights.precoAtualNivel === 'low' ? 'text-mint' :
                          analysis.flightPriceInsights.precoAtualNivel === 'high' ? 'text-accent-orange' : 'text-white/50'
                        }`}>
                          {analysis.flightPriceInsights.precoAtualNivel === 'low' ? 'Abaixo da media' :
                           analysis.flightPriceInsights.precoAtualNivel === 'high' ? 'Acima da media' :
                           analysis.flightPriceInsights.precoAtualNivel === 'typical' ? 'Tipico' : analysis.flightPriceInsights.precoAtualNivel}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="label-micro text-white/20">Fonte</div>
                      <div className="body text-[13px] text-accent-blue/50 font-medium">{analysis.flightPriceInsights.fonte}</div>
                      <div className="label-micro text-white/15 mt-1">
                        {new Date(analysis.flightPriceInsights.ultimaAtualizacao).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* KPI Strip */}
          <div className="relative rounded-2xl border border-white/[0.06] bg-gradient-to-r from-dark-850/80 to-dark-900/60 backdrop-blur-xl overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/15 to-transparent" />
            <div className="grid grid-cols-4 gap-0">
              <MetricCell label="Melhor Opcao" value={formatCurrency(analysis.executive.maisBaratoOperacional?.custos.operacionalTotal || 0)} detail={`${analysis.executive.melhor?.tipo} - Score ${analysis.executive.melhor?.scores.total}/100`} icon={Star} color="mint" />
              <MetricCell label="Economia Operacional" value={formatCurrency(analysis.executive.economiaOperacional || 0)} detail="vs alternativa mais cara" icon={TrendingDown} color="orange" border />
              <MetricCell label="Tempo Economizado" value={`${(analysis.executive.tempoSalvo || 0).toFixed(1)}h`} detail="Diferenca mais rapido vs lento" icon={Clock} color="cyan" border />
              <MetricCell label="Distancia" value={`${(analysis.distanciaKm || 0).toLocaleString('pt-BR')} km`} detail={analysis.estimado ? 'Estimativa' : 'Dados reais'} icon={MapPin} color="blue" border />
            </div>
          </div>

          {/* Comparator style — Vehicle / Air / Bus */}
          {scenarioComparison.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="heading text-white/60">Comparador de Cenarios da Pesquisa</h3>
                <div className="flex-1 h-px bg-white/[0.04]" />
                <span className="label-micro text-white/20">Veiculo / Aereo / Onibus</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {scenarioComparison.map((c) => {
                  const isBest = c.nome === routeBestScenarioName;
                  const isFastest = c.nome === routeFastestScenarioName;
                  const scenarioMeta = ROUTE_SCENARIO_META[c.scenarioKey];
                  const ScenarioIcon = scenarioMeta.icon;

                  return (
                    <section
                      key={c.id}
                      className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all ${
                        isBest
                          ? 'border-mint/[0.15] bg-gradient-to-br from-mint/[0.03] via-dark-900/60 to-dark-950/80'
                          : 'border-white/[0.06] bg-gradient-to-br from-dark-850/60 via-dark-900/40 to-dark-950/60'
                      }`}
                    >
                      {isBest && (
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mint/30 to-transparent" />
                      )}
                      {!isBest && (
                        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${scenarioMeta.color}15, transparent)` }} />
                      )}

                      <div className="relative p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center border"
                              style={{
                                backgroundColor: isBest ? undefined : `${scenarioMeta.color}10`,
                                borderColor: isBest ? undefined : `${scenarioMeta.color}15`,
                              }}
                              {...(isBest ? { className: 'w-10 h-10 rounded-xl flex items-center justify-center border border-mint/15 bg-gradient-to-br from-mint/20 to-mint/5' } : {})}
                            >
                              <ScenarioIcon className="w-5 h-5" style={{ color: isBest ? '#49DC7A' : scenarioMeta.color }} />
                            </div>
                            <h3 className={`heading ${isBest ? 'text-mint' : 'text-white/80'}`}>{c.nome}</h3>
                          </div>
                          <div className="flex gap-1.5">
                            {isBest && <Badge variant="mint" dot>Melhor Custo</Badge>}
                            {isFastest && <Badge variant="blue" dot>Mais Rapido</Badge>}
                          </div>
                        </div>

                        <div className={`display-lg mb-1.5 ${isBest ? 'text-mint' : ''}`}>
                          {formatCurrency(c.resumo.custoTotalEquipe)}
                        </div>
                        <p className="label-micro mb-4">Custo total · {selectedCollaborators.length} colab.</p>

                        <div className="space-y-3">
                          <RouteScenarioCostRow label="Horas Trabalhadas" value={c.resumo.custoEquipeHoras} total={c.resumo.custoTotalEquipe} color="#3B82F6" />
                          <RouteScenarioCostRow label="Deslocamento" value={c.resumo.custoEquipeTransito} total={c.resumo.custoTotalEquipe} color="#F59E0B" />
                          <RouteScenarioCostRow label="Passagens" value={c.resumo.custoEquipePassagens} total={c.resumo.custoTotalEquipe} color="#A855F7" />
                          <RouteScenarioCostRow label="Hospedagem" value={c.resumo.custoEquipeHospedagem} total={c.resumo.custoTotalEquipe} color="#49DC7A" />
                          <RouteScenarioCostRow label="Alimentacao" value={c.resumo.custoEquipeAlimentacao} total={c.resumo.custoTotalEquipe} color="#22F2EF" />
                          <RouteScenarioCostRow label="Logistico" value={c.resumo.custoLogistico} total={c.resumo.custoTotalEquipe} color="#EF4444" />
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/[0.04]">
                          <div className="flex items-center justify-between">
                            <span className="label-micro text-white/30">Tempo de Transito</span>
                            <span className={`tabular-data text-sm font-bold ${isFastest ? 'text-accent-blue' : 'text-white/60'}`}>
                              {formatHours(c.resumo.horasTransito)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {/* Alternative Cards */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="heading text-white/60">Alternativas Analisadas</h3>
              <OptimizationModeBadge mode={analysis.optimizationMode} />
              <div className="flex-1 h-px bg-white/[0.04]" />
              <span className="label-micro text-white/20">Ordenado por score</span>
            </div>
            {analysis.alternatives?.sort((a, b) => b.scores.total - a.scores.total).map((alt, i) => (
              <AlternativeCard
                key={alt.id}
                alt={alt}
                rank={i + 1}
                isBest={i === 0}
                expanded={expandedAlt === alt.id}
                onToggle={() => setExpandedAlt(expandedAlt === alt.id ? null : alt.id)}
                confirmed={confirmedRoute === alt.id}
                onConfirm={() => handleConfirmRoute(alt)}
              />
            ))}
          </div>

          {/* Detalhamento Comparativo — Side by Side Table */}
          {analysis.alternatives?.length > 1 && (
            <ComparativeDetailTable alternatives={analysis.alternatives.sort((a, b) => b.scores.total - a.scores.total)} />
          )}

          {/* Scores Radar */}
          {analysis.alternatives?.length > 1 && (
            <div className="relative rounded-2xl border border-white/[0.04] bg-gradient-to-b from-dark-800/60 to-dark-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-accent-purple/[0.08] flex items-center justify-center">
                  <Star className="w-4 h-4 text-accent-purple/60" />
                </div>
                <div>
                  <h3 className="heading text-white/70">Comparativo de Scores</h3>
                  <p className="label-micro text-white/25 mt-1">Analise radar multi-dimensional das alternativas</p>
                </div>
              </div>
              <div className="p-6">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { metric: 'Custo Direto', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoDireto])) },
                      { metric: 'Custo Operac.', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoOperacional])) },
                      { metric: 'Tempo', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.tempo])) },
                      { metric: 'Custo-Beneficio', ...Object.fromEntries(analysis.alternatives.map(a => [a.id, a.scores.custoBeneficio])) },
                    ]}>
                      <PolarGrid stroke="rgba(255,255,255,0.05)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
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
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }} />
                      <Tooltip content={<ChartTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlternativeCard({ alt, rank, isBest, expanded, onToggle, confirmed, onConfirm }) {
  const tipoLower = (alt.tipo || '').toLowerCase();
  const isMultimodal = alt.tipo.includes('+') || tipoLower.includes('terrestre');
  const isBus = tipoLower.includes('nibus') || tipoLower.includes('bus');
  const isAir = tipoLower.includes('reo') || tipoLower.includes('air');

  const TypeIcon = isMultimodal ? Route : isBus ? Bus : isAir ? Plane : Car;
  const iconBg = isMultimodal ? 'bg-gradient-to-br from-accent-blue/10 to-accent-purple/10' : isBus ? 'bg-accent-amber/10' : isAir ? 'bg-accent-blue/10' : 'bg-accent-purple/10';
  const iconColor = isMultimodal ? 'text-accent-cyan' : isBus ? 'text-accent-amber' : isAir ? 'text-accent-blue' : 'text-accent-purple';

  return (
    <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300 ${isBest ? 'border-mint/15 bg-gradient-to-r from-mint/[0.03] via-dark-900/60 to-dark-950/40' : 'border-white/[0.06] bg-gradient-to-r from-dark-850/60 to-dark-900/40'}`}>
      <button
        onClick={onToggle}
        className="w-full px-6 py-6 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Rank */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${isBest ? 'bg-mint/10 text-mint' : 'bg-white/[0.04] text-white/35'}`}>
          #{rank}
        </div>

        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>
          <TypeIcon className={`w-5 h-5 ${iconColor}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="heading text-white">{alt.tipo}</span>
            {isBest && <Badge variant="mint" dot>Recomendado</Badge>}
            {isMultimodal && <Badge variant="purple">Multimodal</Badge>}
            {alt.detalhes?.fonte === 'realtime' || alt.detalhes?.fonte === 'quero_passagem' ? <Badge variant="cyan">Tempo Real</Badge> : null}
            {alt.detalhes?.purchaseUrl && <Badge variant="orange">Compra Disponivel</Badge>}
            {alt.detalhes?.bookingOptions?.length > 0 && <Badge variant="blue">Reserva Online</Badge>}
          </div>
          <p className="body text-[13px] truncate mt-1">{alt.descricao}</p>
        </div>

        {/* Score */}
        <div className="text-center px-4">
          <div className={`metric-value ${isBest ? 'text-mint' : 'text-white/60'}`}>{alt.scores.total}</div>
          <div className="label-micro text-white/20">Score</div>
        </div>

        {/* Cost */}
        <div className="text-right px-4">
          <div className="tabular-data text-sm font-bold text-white">{formatCurrency(alt.custos.operacionalTotal)}</div>
          <div className="label-micro text-white/20">Custo operacional</div>
        </div>

        {/* Time */}
        <div className="text-right px-4">
          <div className="tabular-data text-sm font-semibold text-white/60">{alt.tempoViagemH}h</div>
          <div className="label-micro text-white/20">so ida</div>
        </div>

        <ChevronDown className={`w-4 h-4 text-white/15 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-6 pb-6 pt-5 animate-fade-in space-y-4">
          {/* Route Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat label="Tempo porta-a-porta (ida)" value={`${alt.tempoViagemH}h`} />
            <MiniStat label="Transporte Total" value={formatCurrency(alt.custos.transporteTotal)} />
            <MiniStat label="Transporte/Pessoa" value={formatCurrency(alt.custos.transportePessoa)} />
            <MiniStat label="Custo Operacional" value={formatCurrency(alt.custos.operacionalTotal)} />
          </div>

          {/* Operational Cost Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat label="Mao de Obra" value={formatCurrency(alt.custos.maoObra)} />
            <MiniStat label="Transito (horas)" value={formatCurrency(alt.custos.transito)} />
            <MiniStat label="Hospedagem" value={formatCurrency(alt.custos.hospedagem)} />
            <MiniStat label="Alimentacao" value={formatCurrency(alt.custos.alimentacao)} />
            <MiniStat label="HE Viagem" value={formatCurrency(alt.custos.impactoHorasExtras)} />
            <MiniStat label="Noturno" value={formatCurrency(alt.custos.impactoNoturno)} />
            <MiniStat label="Deslocamento Local" value={formatCurrency(alt.custos.deslocamentoLocal)} />
            {alt.detalhes?.baldeacoes > 0 && (
              <MiniStat label="Baldeacoes" value={`${alt.detalhes.baldeacoes}`} />
            )}
          </div>

          {/* Vehicle toll breakdown */}
          {alt.isVehicle && alt.detalhes?.pedagios > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Zap className="w-3 h-3 text-accent-cyan" />
              <span className="body text-[13px]">
                Pedagios: <span className="text-white/55 font-semibold">{formatCurrency(alt.detalhes.pedagios)}</span>
                <span className="ml-1.5 text-accent-cyan/60">
                  ({alt.detalhes.pedagioSource === 'google_routes_api' ? 'Google Routes API' : 'Estimativa por regiao'})
                </span>
              </span>
            </div>
          )}

          {/* Ground transfer breakdown for multimodal routes */}
          {alt.detalhes?.trechoTerrestre && (
            <div className="p-3 rounded-xl bg-accent-purple/[0.03] border border-accent-purple/10">
              <div className="flex items-center gap-2 mb-2">
                <Route className="w-3.5 h-3.5 text-accent-purple/60" />
                <span className="label-micro text-white/40">Trecho Terrestre Final</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="label-micro text-white/20">Trecho</div>
                  <div className="body text-[13px] font-medium text-white/50">{alt.detalhes.trechoTerrestre.de?.split(' - ')[0]} → {alt.detalhes.trechoTerrestre.para?.split(' - ')[0]}</div>
                </div>
                <div>
                  <div className="label-micro text-white/20">Distancia</div>
                  <div className="body text-[13px] font-medium text-white/50 tabular-data">{alt.detalhes.trechoTerrestre.distanciaKm} km</div>
                </div>
                <div>
                  <div className="label-micro text-white/20">Tempo / Tipo</div>
                  <div className="body text-[13px] font-medium text-white/50 tabular-data">{alt.detalhes.trechoTerrestre.tempoH}h — {alt.detalhes.trechoTerrestre.tipo === 'carro_alugado' ? 'Carro alugado' : alt.detalhes.trechoTerrestre.tipo === 'onibus' ? 'Onibus' : alt.detalhes.trechoTerrestre.tipo}</div>
                </div>
              </div>
            </div>
          )}

          {/* Airport pair for air routes */}
          {isAir && alt.detalhes?.aeroportoOrigem && (
            <div className="flex items-center gap-2 px-1">
              <Plane className="w-3 h-3 text-accent-blue/60" />
              <span className="body text-[13px]">
                Aeroportos: <span className="text-white/55 font-semibold">{alt.detalhes.aeroportoOrigem} → {alt.detalhes.aeroportoDestino}</span>
                {alt.detalhes.cias?.length > 0 && (
                  <span className="ml-2 text-accent-blue/50">({alt.detalhes.cias.join(', ')})</span>
                )}
              </span>
            </div>
          )}

          {/* Flight Price Insights / Price Intelligence */}
          {isAir && alt.detalhes?.priceInsights?.available && (
            <div className="p-4 rounded-xl bg-accent-blue/[0.03] border border-accent-blue/10">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-accent-blue/60" />
                <span className="label-micro text-white/40">Inteligencia de Precos</span>
                <span className="label-micro text-accent-blue/40 ml-auto">{alt.detalhes.priceInsights.fonte}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <div className="label-micro text-white/20">Preco Atual</div>
                  <div className="tabular-data text-xs text-white/60 font-semibold">{formatCurrency(alt.custos.transportePessoa)}</div>
                </div>
                {alt.detalhes.priceInsights.faixaPreco?.length >= 2 && (
                  <div>
                    <div className="label-micro text-white/20">Faixa Tipica</div>
                    <div className="tabular-data text-xs text-white/50 font-medium">
                      {formatCurrency(alt.detalhes.priceInsights.faixaPreco[0])} — {formatCurrency(alt.detalhes.priceInsights.faixaPreco[1])}
                    </div>
                  </div>
                )}
                {alt.detalhes.priceInsights.precoAtualNivel && (
                  <div>
                    <div className="label-micro text-white/20">Nivel</div>
                    <div className={`text-xs font-semibold ${
                      alt.detalhes.priceInsights.precoAtualNivel === 'low' ? 'text-mint' :
                      alt.detalhes.priceInsights.precoAtualNivel === 'high' ? 'text-accent-orange' : 'text-white/50'
                    }`}>
                      {alt.detalhes.priceInsights.precoAtualNivel === 'low' ? 'Abaixo da media' :
                       alt.detalhes.priceInsights.precoAtualNivel === 'high' ? 'Acima da media' :
                       alt.detalhes.priceInsights.precoAtualNivel === 'typical' ? 'Tipico' : alt.detalhes.priceInsights.precoAtualNivel}
                    </div>
                  </div>
                )}
                <div>
                  <div className="label-micro text-white/20">Fonte</div>
                  <div className="body text-[13px] text-accent-blue/50 font-medium">{alt.detalhes.priceInsights.fonte || 'Google Flights'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Bus source and purchase info */}
          {isBus && alt.detalhes?.fonte === 'quero_passagem' && (
            <div className="p-4 rounded-xl bg-accent-amber/[0.03] border border-accent-amber/10">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-3.5 h-3.5 text-accent-amber/60" />
                <span className="label-micro text-white/40">Dados de Passagem</span>
                <span className="label-micro text-accent-amber/40 ml-auto">{alt.detalhes.fonteLabel || 'Quero Passagem'}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {alt.detalhes.horarioPartida && (
                  <div>
                    <div className="label-micro text-white/20">Partida</div>
                    <div className="body text-[13px] text-white/55 font-medium">{alt.detalhes.horarioPartida}</div>
                  </div>
                )}
                {alt.detalhes.horarioChegada && (
                  <div>
                    <div className="label-micro text-white/20">Chegada</div>
                    <div className="body text-[13px] text-white/55 font-medium">{alt.detalhes.horarioChegada}</div>
                  </div>
                )}
                {alt.detalhes.assentosDisponiveis != null && (
                  <div>
                    <div className="label-micro text-white/20">Assentos</div>
                    <div className="body text-[13px] text-white/55 font-medium tabular-data">{alt.detalhes.assentosDisponiveis} disponiveis</div>
                  </div>
                )}
                {alt.detalhes.totalOpcoes > 1 && (
                  <div>
                    <div className="label-micro text-white/20">Opcoes</div>
                    <div className="body text-[13px] text-white/55 font-medium tabular-data">{alt.detalhes.totalOpcoes} horarios</div>
                  </div>
                )}
              </div>
              {alt.detalhes.ultimaAtualizacao && (
                <div className="mt-2 label-micro text-white/15">
                  Atualizado: {new Date(alt.detalhes.ultimaAtualizacao).toLocaleString('pt-BR')} | Fonte: {alt.detalhes.fonteLabel || 'Quero Passagem'}
                </div>
              )}
            </div>
          )}

          {/* Strengths & Limitations */}
          {(alt.strengths?.length > 0 || alt.limitations?.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {alt.strengths?.length > 0 && (
                <div className="p-3 rounded-xl bg-mint/[0.03] border border-mint/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ThumbsUp className="w-3 h-3 text-mint/60" />
                    <span className="label-micro text-mint/50">Vantagens</span>
                  </div>
                  <ul className="space-y-1">
                    {alt.strengths.map((s, i) => (
                      <li key={i} className="body text-[13px] flex items-start gap-1.5">
                        <CheckCircle className="w-2.5 h-2.5 text-mint/40 mt-0.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {alt.limitations?.length > 0 && (
                <div className="p-3 rounded-xl bg-accent-orange/[0.03] border border-accent-orange/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ThumbsDown className="w-3 h-3 text-accent-orange/60" />
                    <span className="label-micro text-accent-orange/50">Limitacoes</span>
                  </div>
                  <ul className="space-y-1">
                    {alt.limitations.map((l, i) => (
                      <li key={i} className="body text-[13px] flex items-start gap-1.5">
                        <AlertTriangle className="w-2.5 h-2.5 text-accent-orange/40 mt-0.5 flex-shrink-0" />
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Scores */}
          <div className="grid grid-cols-4 gap-4">
            <ScoreBar label="Custo Direto" value={alt.scores.custoDireto} />
            <ScoreBar label="Custo Operac." value={alt.scores.custoOperacional} />
            <ScoreBar label="Tempo" value={alt.scores.tempo} />
            <ScoreBar label="Custo-Beneficio" value={alt.scores.custoBeneficio} />
          </div>

          {/* Source / Provider Info */}
          {alt.detalhes?.fonte && (
            <div className="flex items-center gap-2 px-1">
              <Eye className="w-3 h-3 text-white/20" />
              <span className="label-micro text-white/20">
                Fonte: <span className="text-white/30">{alt.detalhes.fonteLabel || alt.detalhes.fonte}</span>
                {alt.detalhes.dataConsulta && (
                  <span className="ml-2">| Consultado: {new Date(alt.detalhes.dataConsulta).toLocaleString('pt-BR')}</span>
                )}
              </span>
            </div>
          )}

          {/* Booking / Purchase Actions */}
          <div className="pt-5 border-t border-white/[0.04] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {/* Confirm Route */}
              {confirmed ? (
                <div className="flex items-center gap-2.5 text-mint">
                  <CheckCircle className="w-5 h-5" />
                <span className="heading">Rota Confirmada</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                  className="flex items-center gap-3 px-6 py-3 rounded-xl bg-mint/10 border border-mint/20 text-mint text-sm font-semibold hover:bg-mint/15 transition-all duration-200"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirmar Rota
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Flight booking options */}
              {isAir && alt.detalhes?.bookingOptions?.length > 0 && (
                alt.detalhes.bookingOptions.slice(0, 2).map((opt, i) => (
                  opt.url ? (
                    <a
                      key={i}
                      href={opt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-[11px] font-semibold hover:bg-accent-blue/15 transition-all duration-200"
                    >
                      <ShoppingCart className="w-3 h-3" />
                      {opt.seller ? `Comprar — ${opt.seller}` : 'Ver reserva'}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : null
                ))
              )}

              {/* Google Flights deep link */}
              {isAir && alt.detalhes?.googleFlightsUrl && (
                <a
                  href={alt.detalhes.googleFlightsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/40 text-[11px] font-semibold hover:bg-white/[0.06] transition-all duration-200"
                >
                  <Plane className="w-3 h-3" />
                  Ver no Google Flights
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}

              {/* Bus purchase link */}
              {isBus && alt.detalhes?.purchaseUrl && (
                <a
                  href={alt.detalhes.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-amber/10 border border-accent-amber/20 text-accent-amber text-[11px] font-semibold hover:bg-accent-amber/15 transition-all duration-200"
                >
                  <ShoppingCart className="w-3 h-3" />
                  Comprar Passagem
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}

              {confirmed && (
                <span className="label-micro text-white/20">Salvo no Dashboard</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
      <div className="label-micro text-white/20">{label}</div>
      <div className="tabular-data text-sm font-semibold text-white/55 mt-2">{value}</div>
    </div>
  );
}

function MetricCell({ label, value, detail, icon: Icon, color, border }) {
  const colors = {
    mint: { icon: 'text-mint', value: 'text-mint', bg: 'bg-mint/10' },
    cyan: { icon: 'text-accent-cyan', value: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
    orange: { icon: 'text-accent-orange', value: 'text-accent-orange', bg: 'bg-accent-orange/10' },
    blue: { icon: 'text-accent-blue', value: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  };
  const c = colors[color] || colors.mint;

  return (
    <div className={`relative px-6 py-6 ${border ? 'border-l border-white/[0.04]' : ''}`}>
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
  );
}

function ScoreBar({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label-micro text-white/25">{label}</span>
        <span className="label-micro text-white/45 tabular-data">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-mint to-accent-cyan transition-all duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function RouteScenarioCostRow({ label, value, total, color }) {
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

function OptimizationModeBadge({ mode }) {
  const config = {
    'logistics': {
      label: 'Logistics Only',
      variant: 'cyan',
      icon: Route,
    },
    'logistics-labor': {
      label: 'Logistics + Labor',
      variant: 'purple',
      icon: Briefcase,
    },
    'full-operational': {
      label: 'Full Operational',
      variant: 'mint',
      icon: Layers,
    },
  };
  const c = config[mode] || config['full-operational'];
  const IconComp = c.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full label-micro ${
      mode === 'logistics'
        ? 'bg-accent-cyan/[0.08] text-accent-cyan border border-accent-cyan/15'
        : mode === 'logistics-labor'
        ? 'bg-accent-purple/[0.08] text-accent-purple border border-accent-purple/15'
        : 'bg-mint/[0.08] text-mint border border-mint/15'
    }`}>
      <IconComp className="w-3 h-3" />
      {c.label}
    </div>
  );
}

function ComparativeDetailTable({ alternatives }) {
  const TYPE_ICON_MAP = {
    'nibus': Bus,
    'bus': Bus,
    'reo': Plane,
    'air': Plane,
    'culo': Car,
    'car': Car,
  };
  const TYPE_COLOR_MAP = {
    'nibus': '#F59E0B',
    'bus': '#F59E0B',
    'reo': '#3B82F6',
    'air': '#3B82F6',
    'culo': '#A855F7',
    'car': '#A855F7',
  };

  const getIconAndColor = (tipo) => {
    const t = (tipo || '').toLowerCase();
    if (t.includes('+')) return { Icon: Route, color: '#22F2EF' };
    for (const [key, Icon] of Object.entries(TYPE_ICON_MAP)) {
      if (t.includes(key)) return { Icon, color: TYPE_COLOR_MAP[key] };
    }
    return { Icon: Car, color: '#A855F7' };
  };

  const bestIdx = 0; // already sorted by score desc

  const COST_ROWS = [
    { label: 'Transporte Total', key: 'transporteTotal' },
    { label: 'Transporte/Pessoa', key: 'transportePessoa' },
    { label: 'Mao de Obra', key: 'maoObra' },
    { label: 'Custo Transito', key: 'transito' },
    { label: 'Hospedagem', key: 'hospedagem' },
    { label: 'Alimentacao', key: 'alimentacao' },
    { label: 'Horas Extras', key: 'impactoHorasExtras' },
    { label: 'Adicional Noturno', key: 'impactoNoturno' },
  ];

  const SCORE_ROWS = [
    { label: 'Custo Direto', key: 'custoDireto' },
    { label: 'Custo Operacional', key: 'custoOperacional' },
    { label: 'Tempo', key: 'tempo' },
    { label: 'Custo-Beneficio', key: 'custoBeneficio' },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-dark-850/60 via-dark-900/40 to-dark-950/60 backdrop-blur-xl">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="relative">
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center border border-accent-cyan/10">
            <ArrowLeftRight className="w-4 h-4 text-accent-cyan" />
          </div>
          <div>
            <h3 className="heading text-white/80">Detalhamento Comparativo</h3>
            <p className="label-micro text-white/25 mt-1">Comparacao lado a lado de todas as alternativas</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="px-6 py-4 label-micro text-white/20 text-left">Categoria</th>
                {alternatives.map((alt, i) => {
                  const isBest = i === bestIdx;
                  const { Icon: AltIcon, color } = getIconAndColor(alt.tipo);
                  return (
                    <th key={alt.id} className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <AltIcon className="w-3.5 h-3.5" style={{ color: isBest ? '#49DC7A' : color }} />
                        <span className={`label-micro ${isBest ? 'text-mint/60' : 'text-white/20'}`}>
                          {alt.tipo}
                        </span>
                        {isBest && <span className="w-1.5 h-1.5 rounded-full bg-mint" />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Time row */}
              <tr className="border-b border-white/[0.04]/50 hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3 text-sm text-white/50">Tempo Viagem (ida)</td>
                {alternatives.map((alt, i) => {
                  const vals = alternatives.map(a => a.tempoViagemH);
                  const minVal = Math.min(...vals);
                  const isMin = alt.tempoViagemH === minVal;
                  return (
                    <td key={alt.id} className={`px-6 py-3 tabular-data text-sm text-right font-medium ${isMin ? 'text-mint/80' : 'text-white/60'}`}>
                      {alt.tempoViagemH}h
                      {isMin && <span className="ml-1 text-mint/40 text-[10px]">min</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Cost breakdown rows */}
              {COST_ROWS.map((row) => {
                const values = alternatives.map(a => a.custos[row.key] || 0);
                const nonZero = values.filter(v => v > 0);
                const minVal = nonZero.length > 0 ? Math.min(...nonZero) : 0;
                const allZero = nonZero.length === 0;
                if (allZero) return null;
                return (
                  <tr key={row.key} className="border-b border-white/[0.04]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-sm text-white/50">{row.label}</td>
                    {alternatives.map((alt) => {
                      const val = alt.custos[row.key] || 0;
                      const isMin = val === minVal && val > 0;
                      return (
                        <td key={alt.id} className={`px-6 py-3 tabular-data text-sm text-right font-medium ${isMin ? 'text-mint/80' : 'text-white/60'}`}>
                          {formatCurrency(val)}
                          {isMin && <span className="ml-1 text-mint/40 text-[10px]">min</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                <td className="px-6 py-4 label-micro text-white">Custo Operacional</td>
                {alternatives.map((alt, i) => {
                  const isBest = i === bestIdx;
                  return (
                    <td key={alt.id} className={`px-6 py-4 tabular-data text-sm font-bold text-right ${isBest ? 'text-mint' : 'text-white'}`}>
                      {formatCurrency(alt.custos.operacionalTotal)}
                      {isBest && <CheckCircle className="w-3.5 h-3.5 text-mint inline ml-1.5 -mt-0.5" />}
                    </td>
                  );
                })}
              </tr>

              {/* Separator for scores */}
              <tr className="border-b border-white/[0.06]">
                <td colSpan={alternatives.length + 1} className="px-6 py-2">
                  <span className="label-micro text-white/15">Scores (0-100)</span>
                </td>
              </tr>

              {/* Score rows */}
              {SCORE_ROWS.map((row) => {
                const values = alternatives.map(a => a.scores[row.key] || 0);
                const maxVal = Math.max(...values);
                return (
                  <tr key={row.key} className="border-b border-white/[0.04]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-sm text-white/50">{row.label}</td>
                    {alternatives.map((alt) => {
                      const val = alt.scores[row.key] || 0;
                      const isMax = val === maxVal && val > 0;
                      return (
                        <td key={alt.id} className={`px-6 py-3 tabular-data text-sm text-right font-medium ${isMax ? 'text-mint/80' : 'text-white/60'}`}>
                          {val}
                          {isMax && <span className="ml-1 text-mint/40 text-[10px]">max</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Total score row */}
              <tr className="bg-white/[0.02]">
                <td className="px-6 py-4 label-micro text-white">Score Total</td>
                {alternatives.map((alt, i) => {
                  const isBest = i === bestIdx;
                  return (
                    <td key={alt.id} className={`px-6 py-4 tabular-data text-sm font-bold text-right ${isBest ? 'text-mint' : 'text-white'}`}>
                      {alt.scores.total}/100
                      {isBest && <CheckCircle className="w-3.5 h-3.5 text-mint inline ml-1.5 -mt-0.5" />}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
