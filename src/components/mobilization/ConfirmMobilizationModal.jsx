/**
 * ConfirmMobilizationModal (§3.1 — the confirmation gate UI).
 *
 * The single review step that turns a SELECTED scenario/itinerary into a
 * dashboard-eligible confirmed mobilization. The confirm button stays disabled
 * until every mandatory reference is valid (project, schedule/phase, identified
 * collaborators, selected scenario, dates and cost) and the user acknowledges
 * that confirming will feed the dashboard, financial indicators, the live map
 * and the rankings.
 *
 * It does NOT compute anything: it carries the already-costed scenario snapshot
 * straight to the backend, which re-validates the gate and stores immutable
 * snapshots. Money is integer centavos.
 */

import { useMemo, useState } from 'react';
import { CheckCircle, Loader2, ShieldCheck, MapPin, CalendarClock, Users, Briefcase, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { formatBRL } from '../../domain/money.js';
import { dashboardConfirm } from '../../services/BackendApiClient.js';

const slug = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const fmtTime = (iso) => {
  try { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
  catch { return iso || '—'; }
};

export function ConfirmMobilizationModal({
  open, onClose, source, scenario, alternatives = [], employees = [],
  origin, destination, context = {}, refs = {}, onConfirmed,
}) {
  const [projectName, setProjectName] = useState(context.projectName || '');
  const [scheduleName, setScheduleName] = useState(context.scheduleName || '');
  const [activityName, setActivityName] = useState(context.activityName || '');
  const [costCenter, setCostCenter] = useState(context.costCenter || '');
  const [contract, setContract] = useState(context.contract || '');
  const [assigned, setAssigned] = useState(() => new Set(employees.map((e) => e.id)));
  const [ack, setAck] = useState(false);
  const [state, setState] = useState('idle'); // idle | saving | done | error
  const [error, setError] = useState(null);

  const assignedEmployees = useMemo(() => employees.filter((e) => assigned.has(e.id)), [employees, assigned]);

  const valid =
    projectName.trim().length > 0 &&
    scheduleName.trim().length > 0 &&
    assignedEmployees.length > 0 &&
    !!scenario &&
    ack;

  const toggle = (id) => setAssigned((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const submit = async () => {
    if (!valid || state === 'saving') return;
    setState('saving'); setError(null);
    const payload = {
      source,
      selectedItineraryId: refs.selectedItineraryId || null,
      selectedScenarioId: refs.selectedScenarioId || null,
      requestId: refs.requestId || null,
      simulationId: refs.simulationId || null,
      actorId: refs.actorId || null,
      actorName: refs.actorName || null,
      project: { id: context.projectId || slug(projectName), name: projectName.trim() },
      schedule: { id: context.scheduleId || slug(scheduleName), name: scheduleName.trim() },
      activity: activityName.trim() ? { id: slug(activityName), name: activityName.trim() } : undefined,
      costCenter: costCenter.trim() || undefined,
      contract: contract.trim() || undefined,
      employees: assignedEmployees.map((e) => ({ id: e.id, name: e.name, role: e.role || null })),
      scenario,
      alternatives,
      origin,
      destination,
      reasonCodes: refs.reasonCodes || [],
      policySummary: refs.policySummary || null,
    };
    try {
      const res = await dashboardConfirm(payload);
      setState('done');
      onConfirmed?.(res);
    } catch (err) {
      setState('error');
      setError(err.message || 'Falha ao confirmar a mobilização.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Confirmar mobilização" size="lg">
      {state === 'done' ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-mint/15 border border-mint/25 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-mint" />
          </div>
          <h4 className="heading text-white">Mobilização confirmada</h4>
          <p className="body text-[13px] max-w-md mx-auto">
            Esta mobilização agora alimenta o Dashboard, os indicadores financeiros, o mapa em tempo real e os rankings.
          </p>
          <button className="btn-primary-mint mt-2" onClick={onClose}>Fechar</button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Route + timing + cost review */}
          <div className="surface-recessed rounded-2xl border border-white/[0.05] p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-3.5 h-3.5 text-mint/60" />
              <span className="label-micro text-white/40">Cenário selecionado</span>
              <Badge variant="success" compact className="ml-auto">{formatBRL(scenario?.totalMobilizationCostC || 0)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <Info label="Origem" value={origin} />
              <Info label="Destino final" value={destination} />
              <Info label="Partida planejada" value={fmtTime(scenario?.departureAtUtc)} icon={CalendarClock} />
              <Info label="Chegada prevista" value={fmtTime(scenario?.arrivalAtUtc)} icon={CalendarClock} />
            </div>
          </div>

          {/* Mandatory governed references */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Projeto *" required filled={projectName.trim().length > 0}>
              <input className="glass-input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex.: Usina Norte" />
            </Field>
            <Field label="Cronograma / etapa / frente *" required filled={scheduleName.trim().length > 0}>
              <input className="glass-input" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Ex.: Montagem eletromecânica" />
            </Field>
            <Field label="Atividade / pacote de trabalho">
              <input className="glass-input" value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="Opcional" />
            </Field>
            <Field label="Centro de custo">
              <input className="glass-input" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Opcional" />
            </Field>
          </div>

          {/* Collaborator assignment (§3.1: every person explicitly assigned) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-accent-purple/60" />
              <span className="label-micro text-white/40">Colaboradores atribuídos *</span>
              <span className="label-micro text-white/25 ml-auto">{assignedEmployees.length}/{employees.length}</span>
            </div>
            <div className="surface-recessed rounded-2xl border border-white/[0.04] p-2 max-h-[160px] overflow-y-auto space-y-1">
              {employees.map((e) => {
                const on = assigned.has(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => toggle(e.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${on ? 'bg-accent-purple/[0.08] border border-accent-purple/15' : 'border border-transparent hover:bg-white/[0.03]'}`}>
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${on ? 'bg-accent-purple' : 'bg-white/[0.06] border border-white/[0.08]'}`}>
                      {on && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`body text-[13px] truncate block ${on ? 'text-white/80' : 'text-white/40'}`}>{e.name}</span>
                      {e.role && <span className="label-micro text-white/20 truncate block">{e.role}</span>}
                    </div>
                    <Briefcase className="w-3.5 h-3.5 text-white/15" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Acknowledgment */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-mint/[0.04] border border-mint/15 cursor-pointer">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#49dc7a]" />
            <span className="body text-[13px] text-white/70">
              Ao confirmar, esta mobilização passará a alimentar o Dashboard, os indicadores financeiros, o mapa em tempo real e os rankings.
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-danger-border/20 bg-danger-bg/40">
              <AlertTriangle className="w-4 h-4 text-danger-text flex-shrink-0 mt-0.5" />
              <p className="body text-[13px] text-danger-text/80">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-white/50 hover:text-white/80 transition-colors">Cancelar</button>
            <button onClick={submit} disabled={!valid || state === 'saving'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-mint/15 text-mint border border-mint/25 hover:bg-mint/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Confirmar mobilização
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children, required, filled }) {
  return (
    <div>
      <label className={`label-micro mb-1.5 flex items-center gap-1.5 ${required && !filled ? 'text-warning-text/70' : 'text-white/40'}`}>
        {label}
        {required && filled && <CheckCircle className="w-3 h-3 text-mint" />}
      </label>
      {children}
    </div>
  );
}

function Info({ label, value, icon: Icon }) {
  return (
    <div>
      <span className="label-micro text-white/30 flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{label}</span>
      <span className="body text-[13px] text-white/75 block truncate">{value || '—'}</span>
    </div>
  );
}
