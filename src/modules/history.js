/**
 * Módulo — Histórico de Simulações
 */
import { getSimulations, deleteSimulation, clearSimulations } from '../data/store.js';
import { formatCurrency } from '../engine/calculator.js';

export function render() {
    const simulations = getSimulations();

    return `
    <div class="page-enter">
      <div class="page-header">
        <div class="page-header-left">
          <h2>Histórico de Simulações</h2>
          <p>Todas as simulações e análises realizadas</p>
        </div>
        ${simulations.length > 0 ? `
        <div style="display: flex; gap: var(--space-3);">
          <button class="btn btn-ghost" id="btn-clear-history">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Limpar Histórico
          </button>
        </div>
        ` : ''}
      </div>

      ${simulations.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <h3>Nenhuma simulação registrada</h3>
            <p>Suas simulações do Comparador e da Inteligência de Rotas aparecerão aqui automaticamente.</p>
            <div style="display: flex; gap: var(--space-3);">
              <button class="btn btn-primary" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'comparator'}))">
                Comparar Cenários
              </button>
              <button class="btn btn-ghost" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'routeIntelligence'}))">
                Inteligência de Rotas
              </button>
            </div>
          </div>
        </div>
      ` : renderTimeline(simulations)}
    </div>
  `;
}

function renderTimeline(simulations) {
    // Group by date
    const groups = {};
    simulations.forEach(sim => {
        const date = sim.createdAt ? new Date(sim.createdAt).toLocaleDateString('pt-BR') : 'Sem data';
        if (!groups[date]) groups[date] = [];
        groups[date].push(sim);
    });

    return `
    <!-- Filters -->
    <div class="card mb-6" style="padding: var(--space-4);">
      <div style="display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;">
        <input class="form-input" type="text" id="hist-search" placeholder="Buscar por rota ou modal..." style="max-width: 300px;" />
        <select class="form-select" id="hist-filter-type" style="max-width: 200px;">
          <option value="">Todos os tipos</option>
          <option value="simulation">Simulações</option>
          <option value="comparison">Comparações</option>
          <option value="ai-analysis">Análises AI</option>
        </select>
        <select class="form-select" id="hist-filter-modal" style="max-width: 200px;">
          <option value="">Todos os modais</option>
          <option value="Ônibus">🚌 Ônibus</option>
          <option value="Aéreo">✈️ Aéreo</option>
          <option value="Veículo">🚗 Veículo</option>
        </select>
        <span class="badge badge-blue" style="margin-left: auto;">${simulations.length} registro(s)</span>
      </div>
    </div>

    <!-- Timeline -->
    <div id="hist-timeline" class="timeline">
      ${Object.entries(groups).map(([date, items]) => `
        <div class="timeline-group">
          <div class="timeline-date">${date}</div>
          ${items.map(sim => `
            <div class="timeline-item" data-id="${sim.id}" data-type="${sim.type || 'simulation'}" data-modal="${sim.modal || ''}" data-route="${(sim.origem || '') + ' ' + (sim.destino || '')}">
              <div class="timeline-item-header">
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  <span style="font-size: 1.2rem;">${getTypeIcon(sim.type)}</span>
                  <div>
                    <div style="font-weight: 600; color: var(--text-primary); font-size: var(--font-sm);">${sim.nome || 'Simulação'}</div>
                    <div style="font-size: var(--font-xs); color: var(--text-muted);">
                      ${sim.origem || '-'} → ${sim.destino || '-'} · ${sim.qtdColaboradores || 0} pessoa(s)
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  <span class="badge ${getTypeBadge(sim.type)}">${getTypeLabel(sim.type)}</span>
                  <span style="font-weight: 700; color: var(--accent-blue-light); font-size: var(--font-base);">
                    ${formatCurrency(sim.resumo?.custoTotalEquipe || 0)}
                  </span>
                  <button class="btn btn-ghost btn-sm btn-delete-sim" data-id="${sim.id}" title="Excluir">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              <!-- Expandable details -->
              <div class="timeline-item-details">
                <div class="form-grid" style="gap: var(--space-3);">
                  <div>
                    <span class="text-muted" style="font-size: var(--font-xs);">Modal</span>
                    <div style="font-size: var(--font-sm); font-weight: 500;">${sim.modal || '-'}</div>
                  </div>
                  <div>
                    <span class="text-muted" style="font-size: var(--font-xs);">Trânsito</span>
                    <div style="font-size: var(--font-sm); font-weight: 500;">${sim.resumo?.horasTransito || 0}h</div>
                  </div>
                  <div>
                    <span class="text-muted" style="font-size: var(--font-xs);">Horas Equipe</span>
                    <div style="font-size: var(--font-sm); font-weight: 500;">${formatCurrency(sim.resumo?.custoEquipeHoras || 0)}</div>
                  </div>
                  <div>
                    <span class="text-muted" style="font-size: var(--font-xs);">Logístico</span>
                    <div style="font-size: var(--font-sm); font-weight: 500;">${formatCurrency((sim.resumo?.custoEquipePassagens || 0) + (sim.resumo?.custoLogistico || 0))}</div>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

export function bind() {
    // Delete buttons
    document.querySelectorAll('.btn-delete-sim').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (confirm('Excluir esta simulação?')) {
                deleteSimulation(id);
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'history' }));
            }
        });
    });

    // Clear all
    const clearBtn = document.getElementById('btn-clear-history');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todo o histórico de simulações?')) {
                clearSimulations();
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'history' }));
            }
        });
    }

    // Search
    const searchInput = document.getElementById('hist-search');
    const filterType = document.getElementById('hist-filter-type');
    const filterModal = document.getElementById('hist-filter-modal');

    const applyFilters = () => {
        const query = (searchInput?.value || '').toLowerCase();
        const type = filterType?.value || '';
        const modal = filterModal?.value || '';

        document.querySelectorAll('.timeline-item').forEach(item => {
            const itemType = item.dataset.type || '';
            const itemModal = item.dataset.modal || '';
            const itemRoute = item.dataset.route || '';

            let show = true;
            if (query && !itemRoute.toLowerCase().includes(query) && !itemModal.toLowerCase().includes(query)) {
                show = false;
            }
            if (type && itemType !== type) show = false;
            if (modal && !itemModal.includes(modal)) show = false;

            item.style.display = show ? '' : 'none';
        });
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (filterType) filterType.addEventListener('change', applyFilters);
    if (filterModal) filterModal.addEventListener('change', applyFilters);

    // Toggle details on click
    document.querySelectorAll('.timeline-item-header').forEach(header => {
        header.addEventListener('click', () => {
            const details = header.nextElementSibling;
            if (details) {
                details.classList.toggle('open');
            }
        });
    });
}

function getTypeIcon(type) {
    switch (type) {
        case 'ai-analysis': return '🤖';
        case 'comparison': return '📊';
        default: return '📋';
    }
}

function getTypeBadge(type) {
    switch (type) {
        case 'ai-analysis': return 'badge-purple';
        case 'comparison': return 'badge-amber';
        default: return 'badge-blue';
    }
}

function getTypeLabel(type) {
    switch (type) {
        case 'ai-analysis': return 'AI';
        case 'comparison': return 'Comparação';
        default: return 'Simulação';
    }
}
