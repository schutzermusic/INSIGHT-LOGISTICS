/**
 * Módulo — Comparador de Cenários
 */
import { getCollaborators } from '../data/store.js';
import { saveSimulation } from '../data/store.js';
import { calcScenario, compareScenarios, formatCurrency, formatHours } from '../engine/calculator.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let chartInstance = null;

const SCENARIOS_CONFIG = [
    { key: 'onibus', label: 'Ônibus', icon: '🚌', color: '#f59e0b' },
    { key: 'aereo', label: 'Aéreo', icon: '✈️', color: '#3b82f6' },
    { key: 'veiculo', label: 'Veículo/Frota', icon: '🚗', color: '#8b5cf6' },
];

export function render() {
    const collaborators = getCollaborators();

    if (collaborators.length === 0) {
        return `
      <div class="page-enter">
        <div class="page-header">
          <div class="page-header-left">
            <h2>Comparador de Cenários</h2>
            <p>Compare diferentes modais de transporte lado a lado</p>
          </div>
        </div>
        <div class="card">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h3>Cadastre colaboradores primeiro</h3>
            <p>Para comparar cenários, é necessário ter pelo menos um colaborador cadastrado.</p>
            <button class="btn btn-primary" onclick="window.dispatchEvent(new CustomEvent('navigate', {detail:'collaborators'}))">
              Ir para Cadastro
            </button>
          </div>
        </div>
      </div>
    `;
    }

    return `
    <div class="page-enter">
      <div class="page-header">
        <div class="page-header-left">
          <h2>Comparador de Cenários</h2>
          <p>Analise custos e tempo entre ônibus, aéreo e veículo próprio/locado</p>
        </div>
      </div>

      <!-- Common fields -->
      <div class="card mb-6">
        <div class="card-header">
          <h4 class="card-title">⚙️ Parâmetros Comuns</h4>
          <span class="badge badge-blue">${collaborators.length} colaborador(es)</span>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Origem</label>
            <input class="form-input" type="text" id="comp-origem" placeholder="São Paulo - SP" />
          </div>
          <div class="form-group">
            <label class="form-label">Destino</label>
            <input class="form-input" type="text" id="comp-destino" placeholder="Manaus - AM" />
          </div>
          <div class="form-group">
            <label class="form-label">Dias em Campo</label>
            <input class="form-input" type="number" id="comp-dias" value="5" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Horas Normais/dia</label>
            <input class="form-input" type="number" id="comp-hn" value="8" step="0.5" min="0" />
          </div>
        </div>
        <div class="form-grid mt-4">
          <div class="form-group">
            <label class="form-label">HE 50%/dia</label>
            <input class="form-input" type="number" id="comp-he50" value="2" step="0.5" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">HE 100%/dia</label>
            <input class="form-input" type="number" id="comp-he100" value="0" step="0.5" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Noturnas/dia</label>
            <input class="form-input" type="number" id="comp-noturnas" value="0" step="0.5" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Hospedagem/dia (R$)</label>
            <input class="form-input" type="number" id="comp-hosp" value="150" step="0.01" min="0" />
          </div>
        </div>
        <div class="form-grid mt-4">
          <div class="form-group">
            <label class="form-label">Alimentação/dia (R$)</label>
            <input class="form-input" type="number" id="comp-alim" value="80" step="0.01" min="0" />
          </div>
        </div>
      </div>

      <!-- Scenarios -->
      <div class="scenario-grid mb-6">
        ${SCENARIOS_CONFIG.map(s => `
          <div class="card">
            <div class="card-header">
              <h4 class="card-title">${s.icon} ${s.label}</h4>
            </div>
            <div class="form-group mb-4">
              <label class="form-label">Tempo de Viagem (horas, só ida)</label>
              <input class="form-input" type="number" id="comp-${s.key}-tempo" value="${s.key === 'aereo' ? 4 : s.key === 'onibus' ? 24 : 12}" step="0.5" min="0" />
            </div>
            <div class="form-group mb-4">
              <label class="form-label">Custo Passagem/pessoa (R$)</label>
              <input class="form-input" type="number" id="comp-${s.key}-passagem" value="${s.key === 'aereo' ? 1200 : s.key === 'onibus' ? 250 : 0}" step="0.01" min="0" />
            </div>
            ${s.key === 'veiculo' ? `
            <div class="form-group mb-4">
              <label class="form-label">Aluguel Veículo (R$)</label>
              <input class="form-input" type="number" id="comp-veiculo-aluguel" value="800" step="0.01" min="0" />
            </div>
            <div class="form-group mb-4">
              <label class="form-label">Combustível (R$)</label>
              <input class="form-input" type="number" id="comp-veiculo-comb" value="600" step="0.01" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Pedágios (R$)</label>
              <input class="form-input" type="number" id="comp-veiculo-pedagios" value="150" step="0.01" min="0" />
            </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      <button class="btn btn-primary btn-lg mb-6" id="btn-compare" style="width: 100%;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Comparar Cenários
      </button>

      <div id="comp-results"></div>
    </div>
  `;
}

export function bind() {
    const btn = document.getElementById('btn-compare');
    if (btn) btn.addEventListener('click', runComparison);
}

function runComparison() {
    const collaborators = getCollaborators();
    if (collaborators.length === 0) return;

    const common = {
        origem: document.getElementById('comp-origem').value || '-',
        destino: document.getElementById('comp-destino').value || '-',
        diasCampo: parseInt(document.getElementById('comp-dias').value) || 1,
        horasNormaisDia: parseFloat(document.getElementById('comp-hn').value) || 0,
        horasExtra50Dia: parseFloat(document.getElementById('comp-he50').value) || 0,
        horasExtra100Dia: parseFloat(document.getElementById('comp-he100').value) || 0,
        horasNoturnasDia: parseFloat(document.getElementById('comp-noturnas').value) || 0,
        custoHospedagemDia: parseFloat(document.getElementById('comp-hosp').value) || 0,
        custoAlimentacaoDia: parseFloat(document.getElementById('comp-alim').value) || 0,
        idaEVolta: true,
    };

    const scenarios = SCENARIOS_CONFIG.map(s => {
        const params = {
            ...common,
            nome: s.label,
            modal: s.label,
            horasTransito: parseFloat(document.getElementById(`comp-${s.key}-tempo`).value) || 0,
            custoPassagem: parseFloat(document.getElementById(`comp-${s.key}-passagem`).value) || 0,
        };

        if (s.key === 'veiculo') {
            params.custoVeiculo = parseFloat(document.getElementById('comp-veiculo-aluguel').value) || 0;
            params.custoCombustivel = parseFloat(document.getElementById('comp-veiculo-comb').value) || 0;
            params.custoPedagios = parseFloat(document.getElementById('comp-veiculo-pedagios').value) || 0;
        }

        return calcScenario(collaborators, params);
    });

    const analysis = compareScenarios(scenarios);

    // Save as simulation
    scenarios.forEach(sc => {
        saveSimulation({ ...sc, type: 'comparison' });
    });

    renderComparisonResults(analysis);
}

function renderComparisonResults(analysis) {
    const container = document.getElementById('comp-results');
    if (!container || !analysis) return;

    container.innerHTML = `
    <!-- Recommendation -->
    <div class="highlight-card mb-6">
      <h4>✅ Recomendação do Sistema</h4>
      <p>${analysis.recomendacao}</p>
    </div>

    <!-- KPI comparison -->
    <div class="kpi-grid mb-6">
      <div class="kpi-card kpi-green">
        <div class="kpi-label">Melhor Custo</div>
        <div class="kpi-value">${formatCurrency(analysis.melhor.resumo.custoTotalEquipe)}</div>
        <div class="kpi-detail">${analysis.melhor.nome} (${analysis.melhor.modal})</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">Maior Custo</div>
        <div class="kpi-value">${formatCurrency(analysis.pior.resumo.custoTotalEquipe)}</div>
        <div class="kpi-detail">${analysis.pior.nome} (${analysis.pior.modal})</div>
      </div>
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">Economia Potencial</div>
        <div class="kpi-value">${formatCurrency(analysis.economia)}</div>
        <div class="kpi-detail">Diferença entre melhor e pior</div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-label">Mais Rápido</div>
        <div class="kpi-value">${formatHours(analysis.maisRapido.resumo.horasTransito)}</div>
        <div class="kpi-detail">${analysis.maisRapido.nome} (${analysis.maisRapido.modal})</div>
      </div>
    </div>

    <!-- Chart -->
    <div class="card mb-6">
      <div class="card-header">
        <h4 class="card-title">📊 Comparativo Visual</h4>
      </div>
      <div style="position: relative; height: 320px;">
        <canvas id="comp-chart"></canvas>
      </div>
    </div>

    <!-- Detail table -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title">📋 Detalhamento Comparativo</h4>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              ${analysis.cenarios.map(c => `<th style="text-align: right;">${SCENARIOS_CONFIG.find(s => s.label === c.nome)?.icon || ''} ${c.nome}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Horas Trabalhadas</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoEquipeHoras)}</td>`).join('')}
            </tr>
            <tr>
              <td>Tempo Deslocamento</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoEquipeTransito)}</td>`).join('')}
            </tr>
            <tr>
              <td>Passagens</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoEquipePassagens)}</td>`).join('')}
            </tr>
            <tr>
              <td>Hospedagem</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoEquipeHospedagem)}</td>`).join('')}
            </tr>
            <tr>
              <td>Alimentação</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoEquipeAlimentacao)}</td>`).join('')}
            </tr>
            <tr>
              <td>Veículo/Logístico</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatCurrency(c.resumo.custoLogistico)}</td>`).join('')}
            </tr>
            <tr>
              <td>Horas de Trânsito</td>
              ${analysis.cenarios.map(c => `<td style="text-align: right;">${formatHours(c.resumo.horasTransito)}</td>`).join('')}
            </tr>
            <tr style="background: var(--bg-tertiary); font-weight: 700;">
              <td style="color: var(--text-primary);">CUSTO TOTAL</td>
              ${analysis.cenarios.map((c, i) => `
                <td style="text-align: right; color: ${i === 0 ? 'var(--accent-green-light)' : 'var(--text-primary)'}; font-size: var(--font-base);">
                  ${formatCurrency(c.resumo.custoTotalEquipe)}
                  ${i === 0 ? ' ✓' : ''}
                </td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

    // Render chart
    renderChart(analysis);
}

function renderChart(analysis) {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const ctx = document.getElementById('comp-chart');
    if (!ctx) return;

    const labels = analysis.cenarios.map(c => c.nome);
    const colors = SCENARIOS_CONFIG.map(s => s.color);

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Horas Trabalhadas',
                    data: analysis.cenarios.map(c => c.resumo.custoEquipeHoras),
                    backgroundColor: '#3b82f680',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                },
                {
                    label: 'Deslocamento',
                    data: analysis.cenarios.map(c => c.resumo.custoEquipeTransito),
                    backgroundColor: '#f59e0b80',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                },
                {
                    label: 'Passagens',
                    data: analysis.cenarios.map(c => c.resumo.custoEquipePassagens),
                    backgroundColor: '#8b5cf680',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                },
                {
                    label: 'Hospedagem + Alimentação',
                    data: analysis.cenarios.map(c => c.resumo.custoEquipeHospedagem + c.resumo.custoEquipeAlimentacao),
                    backgroundColor: '#10b98180',
                    borderColor: '#10b981',
                    borderWidth: 1,
                },
                {
                    label: 'Logístico',
                    data: analysis.cenarios.map(c => c.resumo.custoLogistico),
                    backgroundColor: '#ef444480',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Inter' },
                        callback: (v) => 'R$ ' + v.toLocaleString('pt-BR'),
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16 },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString('pt-BR')}`,
                    },
                },
            },
        },
    });
}
