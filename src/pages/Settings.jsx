import { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon, Link2, SlidersHorizontal, Utensils, Bed,
  MapPin, Car, Fuel, Check, Loader2, AlertTriangle, Save,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { getConfig, updateConfig } from '../data/policyStore.js';
import { toCentavos, fromCentavos } from '../domain/money.js';

// Field types: 'minutes' | 'int' | 'money' (BRL↔centavos) | 'decimal'
const SECTIONS = [
  {
    table: 'connection_buffer_policies',
    title: 'Buffers de Conexão',
    subtitle: 'Tempo mínimo entre trechos para uma conexão ser considerada viável',
    icon: Link2,
    accent: 'mint',
    fields: [
      { key: 'bus_to_bus_buffer_min', label: 'Ônibus → Ônibus', type: 'minutes', hint: 'Mínimo 120 (2h)' },
      { key: 'bus_to_flight_buffer_min', label: 'Ônibus → Voo', type: 'minutes', hint: 'Mínimo 180 (3h)' },
      { key: 'flight_to_bus_buffer_min', label: 'Voo → Ônibus', type: 'minutes' },
      { key: 'same_terminal_buffer_min', label: 'Mesmo terminal', type: 'minutes' },
      { key: 'different_terminal_transfer_min', label: 'Transferência entre terminais', type: 'minutes' },
      { key: 'disembark_buffer_min', label: 'Desembarque', type: 'minutes' },
      { key: 'airport_checkin_buffer_min', label: 'Check-in aeroporto', type: 'minutes' },
    ],
  },
  {
    table: 'search_limit_policies',
    title: 'Limites de Busca',
    subtitle: 'Restrições que evitam explosão de rotas e mantêm as opções viáveis',
    icon: SlidersHorizontal,
    accent: 'purple',
    fields: [
      { key: 'max_total_trip_minutes', label: 'Duração máx. total', type: 'minutes' },
      { key: 'max_segments', label: 'Máx. trechos', type: 'int' },
      { key: 'max_connections', label: 'Máx. conexões', type: 'int' },
      { key: 'max_modal_changes', label: 'Máx. trocas de modal', type: 'int' },
      { key: 'max_wait_per_connection_min', label: 'Espera máx. por conexão', type: 'minutes' },
      { key: 'max_cumulative_wait_min', label: 'Espera acumulada máx.', type: 'minutes' },
      { key: 'driver_max_continuous_drive_min', label: 'Direção contínua máx.', type: 'minutes' },
      { key: 'mandatory_rest_min', label: 'Descanso obrigatório', type: 'minutes' },
    ],
  },
  {
    table: 'vehicle_assumptions',
    title: 'Veículo & Combustível',
    subtitle: 'Premissas para custo rodoviário estimado',
    icon: Car,
    accent: 'cyan',
    fields: [
      { key: 'fuel_consumption_km_per_l', label: 'Consumo (km/L)', type: 'decimal' },
      { key: 'rental_per_day_c', label: 'Aluguel/dia (R$)', type: 'money' },
      { key: 'avg_speed_kmh', label: 'Velocidade média (km/h)', type: 'int' },
    ],
  },
  {
    table: 'fuel_prices',
    title: 'Preço de Combustível',
    subtitle: 'Valor por litro usado nas estimativas rodoviárias',
    icon: Fuel,
    accent: 'amber',
    fields: [
      { key: 'price_per_liter_c', label: 'Preço/L (R$)', type: 'money' },
    ],
  },
  {
    table: 'meal_policies',
    title: 'Alimentação',
    subtitle: 'Custo diário de alimentação',
    icon: Utensils,
    accent: 'mint',
    fields: [{ key: 'daily_meal_cost_c', label: 'Alimentação/dia (R$)', type: 'money' }],
  },
  {
    table: 'hotel_policies',
    title: 'Hospedagem',
    subtitle: 'Custo diário de hospedagem',
    icon: Bed,
    accent: 'purple',
    fields: [{ key: 'daily_hotel_cost_c', label: 'Hospedagem/dia (R$)', type: 'money' }],
  },
  {
    table: 'local_transport_policies',
    title: 'Deslocamento Local',
    subtitle: 'Custo diário de transporte local no destino',
    icon: MapPin,
    accent: 'cyan',
    fields: [{ key: 'daily_local_transport_cost_c', label: 'Deslocamento/dia (R$)', type: 'money' }],
  },
];

const ACCENT = {
  mint: 'text-mint', purple: 'text-accent-purple', cyan: 'text-accent-cyan', amber: 'text-accent-orange',
};

function toFormValue(type, raw) {
  if (raw == null) return '';
  if (type === 'money') return String(fromCentavos(Number(raw)));
  return String(raw);
}

function toColumnValue(type, str) {
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return null;
  if (type === 'money') return toCentavos(n);
  if (type === 'decimal') return n;
  return Math.round(n); // int | minutes
}

function ConfigSection({ table, title, subtitle, icon: Icon, accent, fields }) {
  const [row, setRow] = useState(null);
  const [form, setForm] = useState({});
  const [status, setStatus] = useState('loading'); // loading|idle|saving|saved|error
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    const data = await getConfig(table);
    if (!data) { setStatus('error'); setError('Não foi possível carregar.'); return; }
    setRow(data);
    setForm(Object.fromEntries(fields.map((f) => [f.key, toFormValue(f.type, data[f.key])])));
    setStatus('idle');
  }, [table]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  };

  const onSave = async () => {
    if (!row) return;
    setStatus('saving');
    setError(null);
    try {
      const patch = {};
      for (const f of fields) {
        const v = toColumnValue(f.type, form[f.key]);
        if (v != null) patch[f.key] = v;
      }
      const updated = await updateConfig(table, row.id, patch);
      setRow(updated);
      setStatus('saved');
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div className="surface-card relative rounded-2xl border border-white/[0.04] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl surface-recessed border border-white/[0.06] flex items-center justify-center">
          <Icon className={`w-4 h-4 ${ACCENT[accent] || 'text-mint'}`} />
        </div>
        <div className="flex-1">
          <h3 className="heading text-white">{title}</h3>
          <p className="label-micro text-white/25 mt-0.5">{subtitle}</p>
        </div>
        {status === 'loading' && <Loader2 className="w-4 h-4 text-white/30 animate-spin" />}
      </div>

      <div className="p-6">
        {status === 'error' && !row ? (
          <div className="flex items-center gap-2 text-warning-text/80">
            <AlertTriangle className="w-4 h-4" />
            <span className="body text-[13px]">{error || 'Erro ao carregar configuração.'}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block label-micro text-white/35 mb-2">{f.label}</label>
                  <input
                    className="glass-input"
                    type="number"
                    step={f.type === 'money' ? '0.01' : f.type === 'decimal' ? '0.1' : '1'}
                    min="0"
                    value={form[f.key] ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    disabled={status === 'loading' || status === 'saving'}
                  />
                  {f.hint && <span className="label-micro text-white/15 mt-1 block">{f.hint}</span>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              {status === 'error' && error && (
                <span className="body text-[13px] text-warning-text/80">{error}</span>
              )}
              {status === 'saved' && (
                <span className="flex items-center gap-1.5 body text-[13px] text-success-text">
                  <Check className="w-3.5 h-3.5" /> Salvo
                </span>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={status === 'loading' || status === 'saving'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-mint/15 text-mint border border-mint/20 hover:bg-mint/20 transition-colors disabled:opacity-40"
              >
                {status === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        subtitle="Políticas de roteirização e custos operacionais"
        icon={SettingsIcon}
        badge="Admin"
        badgeVariant="accent"
      />

      <div className="surface-card rounded-2xl border border-accent-purple/10 p-4 flex items-start gap-3">
        <SlidersHorizontal className="w-4 h-4 text-accent-purple/60 mt-0.5 flex-shrink-0" />
        <p className="body text-[13px]">
          Estas políticas alimentam o motor de roteirização multimodal e o cálculo de custo. Alterações
          entram em vigor nas próximas buscas. Valores versionados de política trabalhista (CLT) são
          administrados separadamente por questões de segurança.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {SECTIONS.slice(0, 2).map((s) => (
          <ConfigSection key={s.table} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SECTIONS.slice(2).map((s) => (
          <ConfigSection key={s.table} {...s} />
        ))}
      </div>
    </div>
  );
}
