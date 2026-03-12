/**
 * Módulo — Cadastro de Colaboradores
 */
import { getCollaborators, addCollaborator, updateCollaborator, deleteCollaborator } from '../data/store.js';
import { calcHourlyRates, formatCurrency } from '../engine/calculator.js';

let editingId = null;

export function render() {
    const collaborators = getCollaborators();

    return `
    <div class="page-enter">
      <div class="page-header">
        <div class="page-header-left">
          <h2>Colaboradores</h2>
          <p>Cadastre e gerencie os técnicos e profissionais de campo</p>
        </div>
        <button class="btn btn-primary" id="btn-add-collaborator">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Colaborador
        </button>
      </div>

      ${collaborators.length === 0 ? renderEmpty() : renderTable(collaborators)}

      <div id="modal-container"></div>
    </div>
  `;
}

function renderEmpty() {
    return `
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <h3>Nenhum colaborador cadastrado</h3>
        <p>Adicione seus técnicos e profissionais de campo para calcular custos de mobilização.</p>
        <button class="btn btn-primary" id="btn-add-empty">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Adicionar Primeiro Colaborador
        </button>
      </div>
    </div>
  `;
}

function renderTable(collaborators) {
    return `
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Salário Base</th>
              <th>CH Mensal</th>
              <th>Hora Normal</th>
              <th>HE 50%</th>
              <th>HE 100%</th>
              <th>Noturno</th>
              <th>H. Técnica</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${collaborators.map(c => {
        const rates = calcHourlyRates(c);
        return `
                <tr>
                  <td style="font-weight: 600; color: var(--text-primary);">${c.nome}</td>
                  <td><span class="badge badge-blue">${c.cargo}</span></td>
                  <td>${formatCurrency(c.salarioBase)}</td>
                  <td>${c.cargaHoraria}h</td>
                  <td class="text-green">${formatCurrency(rates.horaNormal)}</td>
                  <td class="text-amber">${formatCurrency(rates.horaExtra50)}</td>
                  <td class="text-red">${formatCurrency(rates.horaExtra100)}</td>
                  <td class="text-purple">${formatCurrency(rates.horaNoturna)}</td>
                  <td class="text-blue">${formatCurrency(rates.horaTecnica)}</td>
                  <td>
                    <div class="col-actions">
                      <button class="btn btn-ghost btn-sm btn-edit" data-id="${c.id}" title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-delete" data-id="${c.id}" title="Excluir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderModal(collab = null) {
    const isEdit = !!collab;
    return `
    <div class="modal-overlay" id="collab-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Editar' : 'Novo'} Colaborador</h3>
          <button class="btn btn-ghost btn-icon" id="btn-close-modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form id="collab-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nome *</label>
              <input class="form-input" type="text" name="nome" value="${collab?.nome || ''}" required placeholder="Nome completo" />
            </div>
            <div class="form-group">
              <label class="form-label">Cargo *</label>
              <input class="form-input" type="text" name="cargo" value="${collab?.cargo || ''}" required placeholder="Ex: Técnico Eletricista" />
            </div>
          </div>

          <div class="form-grid mt-4">
            <div class="form-group">
              <label class="form-label">Salário Base (R$) *</label>
              <input class="form-input" type="number" name="salarioBase" value="${collab?.salarioBase || ''}" required step="0.01" min="0" placeholder="5000.00" />
            </div>
            <div class="form-group">
              <label class="form-label">Carga Horária Mensal *</label>
              <input class="form-input" type="number" name="cargaHoraria" value="${collab?.cargaHoraria || 220}" required min="1" placeholder="220" />
              <span class="form-hint">Horas/mês (padrão CLT: 220h)</span>
            </div>
          </div>

          <div class="form-grid mt-4">
            <div class="form-group">
              <label class="form-label">Valor Hora Técnica (R$)</label>
              <input class="form-input" type="number" name="valorHoraTecnica" value="${collab?.valorHoraTecnica || ''}" step="0.01" min="0" placeholder="Calculado se vazio" />
              <span class="form-hint">Se vazio, usa hora normal</span>
            </div>
            <div class="form-group">
              <label class="form-label">Multiplicador HE 50%</label>
              <input class="form-input" type="number" name="multHE50" value="${collab?.multHE50 || 1.5}" step="0.01" min="1" />
              <span class="form-hint">Padrão CLT: 1.5</span>
            </div>
          </div>

          <div class="form-grid mt-4">
            <div class="form-group">
              <label class="form-label">Multiplicador HE 100%</label>
              <input class="form-input" type="number" name="multHE100" value="${collab?.multHE100 || 2.0}" step="0.01" min="1" />
              <span class="form-hint">Padrão CLT: 2.0</span>
            </div>
            <div class="form-group">
              <label class="form-label">Adicional Noturno (%)</label>
              <input class="form-input" type="number" name="percNoturno" value="${collab?.percNoturno || 20}" step="1" min="0" />
              <span class="form-hint">Padrão CLT: 20%</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="btn-cancel-modal">Cancelar</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Adicionar Colaborador'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function bind() {
    const addBtn = document.getElementById('btn-add-collaborator');
    const addEmptyBtn = document.getElementById('btn-add-empty');

    if (addBtn) addBtn.addEventListener('click', () => openModal());
    if (addEmptyBtn) addEmptyBtn.addEventListener('click', () => openModal());

    // Edit/Delete buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const collab = getCollaborators().find(c => c.id === id);
            if (collab) openModal(collab);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (confirm('Tem certeza que deseja excluir este colaborador?')) {
                deleteCollaborator(id);
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'collaborators' }));
            }
        });
    });
}

function openModal(collab = null) {
    editingId = collab?.id || null;
    const container = document.getElementById('modal-container');
    container.innerHTML = renderModal(collab);

    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('collab-modal').addEventListener('click', (e) => {
        if (e.target.id === 'collab-modal') closeModal();
    });

    document.getElementById('collab-form').addEventListener('submit', (e) => {
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

        if (editingId) {
            updateCollaborator(editingId, data);
        } else {
            addCollaborator(data);
        }

        closeModal();
        window.dispatchEvent(new CustomEvent('navigate', { detail: 'collaborators' }));
    });
}

function closeModal() {
    const container = document.getElementById('modal-container');
    if (container) container.innerHTML = '';
    editingId = null;
}
