/**
 * Módulo — Dashboard Executivo
 */
import { getCollaborators, getSimulations } from '../data/store.js';
import { formatCurrency } from '../engine/calculator.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let chartCost = null;
let chartDist = null;

export function render() {
  const collaborators = getCollaborators();
  const simulations = getSimulations();

  const totalSims = simulations.length;
  const totalCollabs = collaborators.length;

  // Calculate aggregates
  let custoMedio = 0;
  let economiaTotal = 0;
  let horasTransitoTotal = 0;
  const recentSims = simulations.slice(0, 5);

  if (totalSims > 0) {
    const totalCost = simulations.reduce((s, sim) => s + (sim.resumo?.custoTotalEquipe || 0), 0);
    custoMedio = totalCost / totalSims;
    horasTransitoTotal = simulations.reduce((s, sim) => s + (sim.resumo?.horasTransito || 0), 0);

    // Find comparison-based savings
    const comparisons = simulations.filter(s => s.type === 'comparison' || s.type === 'ai-analysis');
    if (comparisons.length >= 2) {
      const costs = comparisons.map(s => s.resumo?.custoTotalEquipe || 0).sort((a, b) => a - b);
      economiaTotal = costs[costs.length - 1] - costs[0];
    }
  }

  const aiCount = simulations.filter(s => s.type === 'ai-analysis').length;

  return `
    <div class="page-enter">
      <div class="page-header">
        <div class="page-header-left">
          <h2>Dashboard Executivo</h2>
          <p>Visão geral de custos de mobilização e análises</p>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-blue">
          <div class="kpi-label">Simulações Realizadas</div>
          <div class="kpi-value">${totalSims}</div>
          <div class="kpi-detail">Total de cenários calculados${aiCount > 0 ? ` · ${aiCount} via AI` : ''}</div>
        </div>
        <div class="kpi-card kpi-green">
          <div class="kpi-label">Colaboradores</div>
          <div class="kpi-value">${totalCollabs}</div>
          <div class="kpi-detail">Cadastrados no sistema</div>
        </div>
        <div class="kpi-card kpi-amber">
          <div class="kpi-label">Custo Médio/Simulação</div>
          <div class="kpi-value">${totalSims > 0 ? formatCurrency(custoMedio) : 'R$ 0,00'}</div>
          <div class="kpi-detail">Média das mobilizações</div>
        </div>
        <div class="kpi-card kpi-purple">
          <div class="kpi-label">Economia Potencial</div>
          <div class="kpi-value">${economiaTotal > 0 ? formatCurrency(economiaTotal) : 'R$ 0,00'}</div>
          <div class="kpi-detail">Diferença entre cenários</div>
        </div>
      </div>

      ${totalSims === 0 && totalCollabs === 0 ? renderWelcome() : renderContent(recentSims, simulations, collaborators)}
    </div>
  `;
}

function renderWelcome() {
  return `
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon">🚀</div>
        <h3>Bem-vindo ao Insight Mobilização</h3>
        <p>Comece cadastrando seus colaboradores e criando simulações para visualizar seus dados no dashboard.</p>
        <div style="display: flex; gap: var(--space-3);">
          <button class="btn btn-primary" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'collaborators'}))">
            Cadastrar Colaboradores
          </button>
          <button class="btn btn-ghost" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'simulator'}))">
            Fazer Simulação
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderContent(recentSims, allSims, collaborators) {
  return `
    <div class="grid-2 mb-6">
      <!-- Cost distribution chart -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title">💰 Distribuição de Custos</h4>
        </div>
        <div style="position: relative; height: 280px;">
          <canvas id="chart-distribution"></canvas>
        </div>
      </div>

      <!-- Recent by modal chart -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title">📊 Custos por Modal</h4>
        </div>
        <div style="position: relative; height: 280px;">
          <canvas id="chart-modal"></canvas>
        </div>
      </div>
    </div>

    <!-- Recent simulations -->
    <div class="card mb-6">
      <div class="card-header">
        <h4 class="card-title">🕐 Simulações Recentes</h4>
      </div>
      ${recentSims.length === 0 ? `
        <p style="color: var(--text-muted); font-size: var(--font-sm);">Nenhuma simulação realizada ainda.</p>
      ` : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Simulação</th>
                <th>Modal</th>
                <th>Rota</th>
                <th>Equipe</th>
                <th>Custo Total</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${recentSims.map(sim => `
                <tr>
                  <td style="font-weight: 600; color: var(--text-primary);">${sim.nome || 'Simulação'}</td>
                  <td><span class="badge badge-blue">${sim.modal || '-'}</span></td>
                  <td>${sim.origem || '-'} → ${sim.destino || '-'}</td>
                  <td>${sim.qtdColaboradores || '-'} pessoa(s)</td>
                  <td style="font-weight: 600; color: var(--accent-blue-light);">${formatCurrency(sim.resumo?.custoTotalEquipe || 0)}</td>
                  <td style="color: var(--text-muted);">${formatDate(sim.createdAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Quick actions -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title">⚡ Ações Rápidas</h4>
      </div>
      <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
        <button class="btn btn-primary" style="background: linear-gradient(135deg, #8b5cf6, #3b82f6);" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'routeIntelligence'}))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Inteligência de Rotas
        </button>
        <button class="btn btn-primary" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'simulator'}))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Nova Simulação
        </button>
        <button class="btn btn-ghost" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'comparator'}))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Comparar Cenários
        </button>
        <button class="btn btn-ghost" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'history'}))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Histórico
        </button>
        <button class="btn btn-ghost" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'collaborators'}))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Gerenciar Equipe
        </button>
      </div>
    </div>
  `;
}

export function bind() {
  const simulations = getSimulations();
  if (simulations.length > 0) {
    renderCharts(simulations);
  }
}

function renderCharts(simulations) {
  // Distribution chart (from most recent simulation with breakdown)
  const latest = simulations.find(s => s.resumo);
  if (latest) {
    const r = latest.resumo;
    const distCtx = document.getElementById('chart-distribution');
    if (distCtx) {
      if (chartDist) chartDist.destroy();
      chartDist = new Chart(distCtx, {
        type: 'doughnut',
        data: {
          labels: ['Horas Trabalhadas', 'Deslocamento', 'Passagens', 'Hospedagem', 'Alimentação', 'Logístico'],
          datasets: [{
            data: [
              r.custoEquipeHoras,
              r.custoEquipeTransito,
              r.custoEquipePassagens,
              r.custoEquipeHospedagem,
              r.custoEquipeAlimentacao,
              r.custoLogistico,
            ],
            backgroundColor: [
              '#3b82f680', '#f59e0b80', '#8b5cf680', '#10b98180', '#06b6d480', '#ef444480',
            ],
            borderColor: [
              '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#06b6d4', '#ef4444',
            ],
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: R$ ${ctx.raw.toLocaleString('pt-BR')}`,
              },
            },
          },
        },
      });
    }
  }

  // Modal comparison (aggregate by modal)
  const byModal = {};
  simulations.forEach(s => {
    const modal = s.modal || 'Outro';
    if (!byModal[modal]) byModal[modal] = [];
    byModal[modal].push(s.resumo?.custoTotalEquipe || 0);
  });

  const modalLabels = Object.keys(byModal);
  const modalAvgs = modalLabels.map(m => {
    const costs = byModal[m];
    return costs.reduce((a, b) => a + b, 0) / costs.length;
  });

  const modalCtx = document.getElementById('chart-modal');
  if (modalCtx && modalLabels.length > 0) {
    if (chartCost) chartCost.destroy();
    const modalColors = modalLabels.map((_, i) => {
      const palette = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4'];
      return palette[i % palette.length];
    });

    chartCost = new Chart(modalCtx, {
      type: 'bar',
      data: {
        labels: modalLabels,
        datasets: [{
          label: 'Custo Médio',
          data: modalAvgs,
          backgroundColor: modalColors.map(c => c + '80'),
          borderColor: modalColors,
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter' },
              callback: (v) => 'R$ ' + v.toLocaleString('pt-BR'),
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            ticks: { color: '#94a3b8', font: { family: 'Inter' } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Custo Médio: R$ ${ctx.raw.toLocaleString('pt-BR')}`,
            },
          },
        },
      },
    });
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
