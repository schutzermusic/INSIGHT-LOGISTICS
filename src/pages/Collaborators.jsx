import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useCollaborators } from '../hooks/useStore';
import { calcHourlyRates, formatCurrency } from '../engine/calculator.js';
import { PageHeader } from '../components/layout/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';

export default function Collaborators() {
  const { collaborators, addCollaborator, updateCollaborator, deleteCollaborator } = useCollaborators();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      nome: form.nome.value.trim(),
      cargo: form.cargo.value.trim(),
      salarioBase: parseFloat(form.salarioBase.value),
      cargaHoraria: parseInt(form.cargaHoraria.value),
      valorHoraTecnica: form.valorHoraTecnica.value ? parseFloat(form.valorHoraTecnica.value) : null,
      multHE50: parseFloat(form.multHE50.value),
      multHE100: parseFloat(form.multHE100.value),
      percNoturno: parseFloat(form.percNoturno.value),
    };

    if (editing) {
      updateCollaborator(editing.id, data);
    } else {
      addCollaborator(data);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = (id) => {
    if (confirm('Tem certeza que deseja excluir este colaborador?')) {
      deleteCollaborator(id);
    }
  };

  const openEdit = (collab) => {
    setEditing(collab);
    setModalOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Colaboradores"
        subtitle="Cadastre e gerencie os tecnicos e profissionais de campo"
        icon={Users}
        badge={`${collaborators.length} cadastrado(s)`}
        badgeVariant="blue"
      >
        <button className="btn-primary-mint" onClick={openNew}>
          <Plus className="w-4 h-4" /> Novo Colaborador
        </button>
      </PageHeader>

      {collaborators.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador cadastrado"
          description="Adicione seus tecnicos e profissionais de campo para calcular custos de mobilizacao."
        >
          <button className="btn-primary-mint" onClick={openNew}>
            <Plus className="w-4 h-4" /> Adicionar Primeiro Colaborador
          </button>
        </EmptyState>
      ) : (
        <GlassCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['Nome', 'Cargo', 'Salario Base', 'CH', 'Hora Normal', 'HE 50%', 'HE 100%', 'Noturno', 'H. Tecnica', ''].map((h, i) => (
                    <th key={i} className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/20 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collaborators.map((c) => {
                  const rates = calcHourlyRates(c);
                  return (
                    <tr key={c.id} className="border-b border-white/[0.04]/50 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-white">{c.nome}</td>
                      <td className="px-6 py-4"><Badge variant="blue">{c.cargo}</Badge></td>
                      <td className="px-6 py-4 text-sm text-white/50">{formatCurrency(c.salarioBase)}</td>
                      <td className="px-6 py-4 text-sm text-white/35">{c.cargaHoraria}h</td>
                      <td className="px-6 py-4 text-sm text-mint font-medium">{formatCurrency(rates.horaNormal)}</td>
                      <td className="px-6 py-4 text-sm text-accent-amber font-medium">{formatCurrency(rates.horaExtra50)}</td>
                      <td className="px-6 py-4 text-sm text-accent-red font-medium">{formatCurrency(rates.horaExtra100)}</td>
                      <td className="px-6 py-4 text-sm text-accent-purple font-medium">{formatCurrency(rates.horaNoturna)}</td>
                      <td className="px-6 py-4 text-sm text-accent-cyan font-medium">{formatCurrency(rates.horaTecnica)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-accent-red hover:bg-accent-red/10 transition-all duration-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? 'Editar Colaborador' : 'Novo Colaborador'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Nome *</label>
              <input className="glass-input" name="nome" defaultValue={editing?.nome || ''} required placeholder="Nome completo" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Cargo *</label>
              <input className="glass-input" name="cargo" defaultValue={editing?.cargo || ''} required placeholder="Ex: Tecnico Eletricista" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Salario Base (R$) *</label>
              <input className="glass-input" type="number" name="salarioBase" defaultValue={editing?.salarioBase || ''} required step="0.01" min="0" placeholder="5000.00" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Carga Horaria Mensal *</label>
              <input className="glass-input" type="number" name="cargaHoraria" defaultValue={editing?.cargaHoraria || 220} required min="1" placeholder="220" />
              <span className="text-[11px] text-white/15 mt-1.5 block">Horas/mes (padrao CLT: 220h)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Valor Hora Tecnica (R$)</label>
              <input className="glass-input" type="number" name="valorHoraTecnica" defaultValue={editing?.valorHoraTecnica || ''} step="0.01" min="0" placeholder="Calculado se vazio" />
              <span className="text-[11px] text-white/15 mt-1.5 block">Se vazio, usa hora normal</span>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Multiplicador HE 50%</label>
              <input className="glass-input" type="number" name="multHE50" defaultValue={editing?.multHE50 || 1.5} step="0.01" min="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Multiplicador HE 100%</label>
              <input className="glass-input" type="number" name="multHE100" defaultValue={editing?.multHE100 || 2.0} step="0.01" min="1" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-2">Adicional Noturno (%)</label>
              <input className="glass-input" type="number" name="percNoturno" defaultValue={editing?.percNoturno || 20} step="1" min="0" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" className="btn-ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary-mint">
              {editing ? 'Salvar Alteracoes' : 'Adicionar Colaborador'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
