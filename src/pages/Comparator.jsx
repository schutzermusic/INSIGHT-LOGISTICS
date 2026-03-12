import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { BarChart3, Settings, Bus, Plane, Car, AlertTriangle, CheckCircle, TrendingDown, Clock, Zap } from 'lucide-react';
import { useCollaborators, useSimulations } from '../hooks/useStore';
import { calcScenario, compareScenarios, formatCurrency, formatHours } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { GlassCard, GlassCardHeader, GlassCardTitle } from '../components/ui/GlassCard';
import { KpiCard } from '../components/ui/KpiCard';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ChartTooltip } from '../components/charts/ChartTooltip';

const SCENARIOS = [
  { key: 'onibus', label: 'Onibus', icon: Bus, color: '#F59E0B', defaultTime: 24, defaultFare: 250 },
  { key: 'aereo', label: 'Aereo', icon: Plane, color: '#3B82F6', defaultTime: 4, defaultFare: 1200 },
  { key: 'veiculo', label: 'Veiculo/Frota', icon: Car, color: '#A855F7', defaultTime: 12, defaultFare: 0 },
];

export default function Comparator() {
  const { collaborators } = useCollaborators();
  const { saveSimulation } = useSimulations();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);

  if (collaborators.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Comparador de Cenarios" subtitle="Compare diferentes modais de transporte lado a lado" icon={BarChart3} />
        <EmptyState icon={AlertTriangle} title="Cadastre colaboradores primeiro" description="Para comparar cenarios, e necessario ter pelo menos um colaborador cadastrado.">
          <button className="btn-primary-mint" onClick={() => navigate('/colaboradores')}>Ir para Cadastro</button>
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

  const chartData = analysis?.cenarios.map((c, i) => ({
    name: c.nome,
    'Horas Trabalhadas': c.resumo.custoEquipeHoras,
    'Deslocamento': c.resumo.custoEquipeTransito,
    'Passagens': c.resumo.custoEquipePassagens,
    'Hosp + Alim': c.resumo.custoEquipeHospedagem + c.resumo.custoEquipeAlimentacao,
    'Logistico': c.resumo.custoLogistico,
  }));

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Comparador de Cenarios"
        subtitle="Analise custos e tempo entre onibus, aereo e veiculo proprio/locado"
        icon={BarChart3}
        badge={`${collaborators.length} colaborador(es)`}
        badgeVariant="blue"
      />

      <form onSubmit={handleCompare}>
        {/* Common Parameters */}
        <GlassCard className="mb-6">
          <GlassCardHeader><GlassCardTitle icon={Settings}>Parametros Comuns</GlassCardTitle></GlassCardHeader>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Origem</label>
              <input className="glass-input" name="origem" placeholder="Sao Paulo - SP" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Destino</label>
              <input className="glass-input" name="destino" placeholder="Manaus - AM" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Dias em Campo</label>
              <input className="glass-input" type="number" name="diasCampo" defaultValue="5" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Horas Normais/dia</label>
              <input className="glass-input" type="number" name="horasNormais" defaultValue="8" step="0.5" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">HE 50%/dia</label>
              <input className="glass-input" type="number" name="he50" defaultValue="2" step="0.5" min="0" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">HE 100%/dia</label>
              <input className="glass-input" type="number" name="he100" defaultValue="0" step="0.5" min="0" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Hospedagem/dia (R$)</label>
              <input className="glass-input" type="number" name="hospedagem" defaultValue="150" step="0.01" min="0" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Alimentacao/dia (R$)</label>
              <input className="glass-input" type="number" name="alimentacao" defaultValue="80" step="0.01" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 mt-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Noturnas/dia</label>
              <input className="glass-input max-w-[200px]" type="number" name="noturnas" defaultValue="0" step="0.5" min="0" />
            </div>
          </div>
        </GlassCard>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {SCENARIOS.map(s => (
            <GlassCard key={s.key}>
              <GlassCardHeader>
                <GlassCardTitle>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                    <s.icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <span>{s.label}</span>
                </GlassCardTitle>
              </GlassCardHeader>
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Tempo Viagem (h, so ida)</label>
                  <input className="glass-input" type="number" name={`${s.key}-tempo`} defaultValue={s.defaultTime} step="0.5" min="0" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Passagem/pessoa (R$)</label>
                  <input className="glass-input" type="number" name={`${s.key}-passagem`} defaultValue={s.defaultFare} step="0.01" min="0" />
                </div>
                {s.key === 'veiculo' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Aluguel Veiculo (R$)</label>
                      <input className="glass-input" type="number" name="veiculo-aluguel" defaultValue="800" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Combustivel (R$)</label>
                      <input className="glass-input" type="number" name="veiculo-comb" defaultValue="600" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Pedagios (R$)</label>
                      <input className="glass-input" type="number" name="veiculo-pedagios" defaultValue="150" step="0.01" min="0" />
                    </div>
                  </>
                )}
              </div>
            </GlassCard>
          ))}
        </div>

        <button type="submit" className="btn-primary-orange w-full py-4 text-base mb-6">
          <BarChart3 className="w-5 h-5" /> Comparar Cenarios
        </button>
      </form>

      {/* Results */}
      {analysis && (
        <div className="space-y-8 animate-slide-up">
          {/* Recommendation */}
          <GlassCard glow="mint">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-mint/15 to-mint/5 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-mint" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white mb-2 tracking-tight">Recomendacao do Sistema</h4>
                <p className="text-sm text-white/45 leading-relaxed">{analysis.recomendacao}</p>
              </div>
            </div>
          </GlassCard>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard label="Melhor Custo" value={formatCurrency(analysis.melhor.resumo.custoTotalEquipe)} detail={`${analysis.melhor.nome}`} icon={TrendingDown} accent="mint" />
            <KpiCard label="Maior Custo" value={formatCurrency(analysis.pior.resumo.custoTotalEquipe)} detail={`${analysis.pior.nome}`} icon={TrendingDown} accent="orange" />
            <KpiCard label="Economia Potencial" value={formatCurrency(analysis.economia)} detail="Diferenca entre melhor e pior" icon={Zap} accent="cyan" />
            <KpiCard label="Mais Rapido" value={formatHours(analysis.maisRapido.resumo.horasTransito)} detail={`${analysis.maisRapido.nome}`} icon={Clock} accent="purple" />
          </div>

          {/* Chart */}
          <GlassCard>
            <GlassCardHeader><GlassCardTitle icon={BarChart3}>Comparativo Visual</GlassCardTitle></GlassCardHeader>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="Horas Trabalhadas" stackId="a" fill="#3B82F6" fillOpacity={0.7} />
                  <Bar dataKey="Deslocamento" stackId="a" fill="#F59E0B" fillOpacity={0.7} />
                  <Bar dataKey="Passagens" stackId="a" fill="#A855F7" fillOpacity={0.7} />
                  <Bar dataKey="Hosp + Alim" stackId="a" fill="#49DC7A" fillOpacity={0.7} />
                  <Bar dataKey="Logistico" stackId="a" fill="#EF4444" fillOpacity={0.7} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Detail Table */}
          <GlassCard padding="p-0">
            <div className="px-7 py-5">
              <GlassCardTitle>Detalhamento Comparativo</GlassCardTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">Categoria</th>
                    {analysis.cenarios.map((c, i) => (
                      <th key={i} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-right">
                        {c.nome}
                      </th>
                    ))}
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
                  ].map((row, ri) => (
                    <tr key={ri} className="border-b border-white/[0.04]/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5 text-sm text-white/50">{row.label}</td>
                      {analysis.cenarios.map((c, ci) => (
                        <td key={ci} className="px-6 py-3.5 text-sm text-white/60 text-right font-medium">{formatCurrency(c.resumo[row.key])}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-surface">
                    <td className="px-6 py-4 text-sm font-bold text-white">CUSTO TOTAL</td>
                    {analysis.cenarios.map((c, ci) => (
                      <td key={ci} className={`px-6 py-4 text-sm font-bold text-right ${ci === 0 ? 'text-mint' : 'text-white'}`}>
                        {formatCurrency(c.resumo.custoTotalEquipe)}
                        {ci === 0 && <span className="ml-1 text-mint">✓</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
