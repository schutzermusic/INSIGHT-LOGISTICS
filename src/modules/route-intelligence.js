/**
 * Módulo — Route Intelligence
 * AI-powered routing and fare intelligence for field team mobilization
 * Researches, compares and displays all viable travel alternatives
 */
import { getCollaborators } from '../data/store.js';
import { saveSimulation } from '../data/store.js';
import { getExtendedCities, searchExtendedCities } from '../engine/routes-intelligence-db.js';
import { analyzeRoutingIntelligence } from '../engine/routing-intelligence.js';
import { isFlightsApiEnabled } from '../engine/flights-api.js';
import { formatCurrency, formatHours } from '../engine/calculator.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let lastAnalysis = null;
let chartInstance = null;

export function render() {
    const collaborators = getCollaborators();
    const cities = getExtendedCities();

    if (collaborators.length === 0) {
        return `
      <div class="page-enter">
        <div class="page-header">
          <div class="page-header-left">
            <h2>🧠 Inteligência de Rotas</h2>
            <p>Motor de recomendação logística com análise multi-modal</p>
          </div>
        </div>
        <div class="card">
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h3>Cadastre colaboradores primeiro</h3>
            <p>O módulo de inteligência requer colaboradores cadastrados para calcular custos de mobilização completos.</p>
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
          <h2>🧠 Inteligência de Rotas</h2>
          <p>Motor de recomendação logística — pesquisa, compara e ranqueia todas as alternativas de mobilização</p>
        </div>
        <span class="badge badge-purple ri-engine-badge">AI Engine v3.0</span>
        ${isFlightsApiEnabled() ? '<span class="badge badge-green ri-live-badge">Google Flights API — Live</span>' : '<span class="badge badge-amber ri-offline-badge">Dados Estáticos</span>'}
      </div>

      <!-- Input Section -->
      <div class="ri-input-section mb-6">
        <div class="card ri-route-card">
          <div class="card-header">
            <h4 class="card-title">📍 Origem e Destino</h4>
            <span class="badge badge-blue">${cities.length} cidades</span>
          </div>
          <div class="ri-route-inputs">
            <div class="form-group ri-city-group">
              <label class="form-label">Origem</label>
              <div class="ri-autocomplete">
                <input class="form-input ri-city-input" type="text" id="ri-origem" placeholder="Ex: Londrina - PR" autocomplete="off" />
                <div class="ri-suggestions" id="ri-sug-origem"></div>
              </div>
            </div>
            <div class="ri-arrow-divider">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
            <div class="form-group ri-city-group">
              <label class="form-label">Destino</label>
              <div class="ri-autocomplete">
                <input class="form-input ri-city-input" type="text" id="ri-destino" placeholder="Ex: Alta Floresta - MT" autocomplete="off" />
                <div class="ri-suggestions" id="ri-sug-destino"></div>
              </div>
            </div>
          </div>

          <!-- Date Filters -->
          <div class="ri-date-section mt-4">
            <div class="form-group mb-3">
              <label class="form-label">Tipo de Viagem</label>
              <div class="ri-trip-type-selector" id="ri-trip-type">
                <button type="button" class="ri-trip-type-btn active" data-type="any">Qualquer Data / Mais Barato</button>
                <button type="button" class="ri-trip-type-btn" data-type="oneway">Somente Ida</button>
                <button type="button" class="ri-trip-type-btn" data-type="roundtrip">Ida e Volta</button>
              </div>
            </div>
            <div class="ri-date-fields" id="ri-date-fields" style="display:none;">
              <div class="form-group ri-date-group" id="ri-date-ida-group">
                <label class="form-label">Data de Ida</label>
                <input class="form-input" type="date" id="ri-data-ida" />
              </div>
              <div class="form-group ri-date-group" id="ri-date-volta-group" style="display:none;">
                <label class="form-label">Data de Volta</label>
                <input class="form-input" type="date" id="ri-data-volta" />
              </div>
            </div>
          </div>
        </div>

        <div class="card ri-params-card">
          <div class="card-header">
            <h4 class="card-title">⚙️ Parâmetros Operacionais</h4>
            <span class="badge badge-green" id="ri-selected-count">${collaborators.length} colaborador(es)</span>
          </div>

          <!-- Collaborator Selector -->
          <div class="form-group mb-4">
            <label class="form-label">Equipe de Viagem</label>
            <div class="ri-collab-selector" id="ri-collab-selector">
              <div class="ri-collab-actions">
                <button type="button" class="btn btn-sm btn-outline" id="ri-select-all">Selecionar Todos</button>
                <button type="button" class="btn btn-sm btn-outline" id="ri-select-none">Limpar</button>
              </div>
              <div class="ri-collab-list">
                ${collaborators.map(c => `
                  <label class="ri-collab-item" data-id="${c.id}">
                    <input type="checkbox" class="ri-collab-check" value="${c.id}" checked />
                    <div class="ri-collab-info">
                      <span class="ri-collab-name">${c.nome}</span>
                      <span class="ri-collab-meta">${c.cargo} · R$ ${c.salarioBase.toLocaleString('pt-BR')}/mês</span>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Dias em Campo</label>
              <input class="form-input" type="number" id="ri-dias" value="5" min="1" />
            </div>
            <div class="form-group">
              <label class="form-label">Horas Normais/dia</label>
              <input class="form-input" type="number" id="ri-hn" value="8" step="0.5" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">HE 50%/dia</label>
              <input class="form-input" type="number" id="ri-he50" value="2" step="0.5" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">HE 100%/dia</label>
              <input class="form-input" type="number" id="ri-he100" value="0" step="0.5" min="0" />
            </div>
          </div>
          <div class="form-grid mt-4">
            <div class="form-group">
              <label class="form-label">Horas Noturnas/dia</label>
              <input class="form-input" type="number" id="ri-noturnas" value="0" step="0.5" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Hospedagem/dia (R$)</label>
              <input class="form-input" type="number" id="ri-hosp" value="150" step="0.01" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Alimentação/dia (R$)</label>
              <input class="form-input" type="number" id="ri-alim" value="80" step="0.01" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Desloc. Local/dia (R$)</label>
              <input class="form-input" type="number" id="ri-local" value="40" step="0.01" min="0" />
            </div>
          </div>

          <!-- Vehicle Config -->
          <div class="ri-vehicle-config mt-4">
            <div class="form-group mb-3">
              <label class="form-label">Veículo — Categoria e Custos</label>
              <div class="ri-vehicle-toggle">
                <label class="ri-toggle-item">
                  <input type="checkbox" id="ri-vehicle-custom" />
                  <span>Personalizar veículo manualmente</span>
                </label>
              </div>
            </div>
            <div id="ri-vehicle-fields" style="display:none;">
              <div class="form-group mb-3">
                <label class="form-label">Categoria</label>
                <select class="form-input" id="ri-vehicle-cat">
                  <option value="popular">Popular (Ex: Gol, Onix)</option>
                  <option value="sedan" selected>Sedan (Ex: Corolla, Civic)</option>
                  <option value="suv">SUV (Ex: Creta, Tracker)</option>
                  <option value="pickup">Pickup (Ex: Hilux, S10)</option>
                  <option value="van">Van (Ex: Sprinter, Ducato)</option>
                  <option value="custom">Outro (definir valores)</option>
                </select>
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label">Aluguel/dia (R$)</label>
                  <input class="form-input" type="number" id="ri-vehicle-aluguel" value="180" step="0.01" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Consumo (km/L)</label>
                  <input class="form-input" type="number" id="ri-vehicle-consumo" value="10" step="0.1" min="1" />
                </div>
                <div class="form-group">
                  <label class="form-label">Preço Combustível (R$/L)</label>
                  <input class="form-input" type="number" id="ri-vehicle-preco-litro" value="5.89" step="0.01" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Pedágios estimados (R$)</label>
                  <input class="form-input" type="number" id="ri-vehicle-pedagios" value="0" step="0.01" min="0" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg mb-6 ri-analyze-btn" id="btn-ri-analyze">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Pesquisar Rotas e Analisar Alternativas
      </button>

      <div id="ri-results"></div>
    </div>
  `;
}

export function bind() {
    const btn = document.getElementById('btn-ri-analyze');
    if (btn) btn.addEventListener('click', runAnalysis);

    // Autocomplete bindings
    setupAutocomplete('ri-origem', 'ri-sug-origem');
    setupAutocomplete('ri-destino', 'ri-sug-destino');

    // Collaborator selector bindings
    setupCollaboratorSelector();

    // Date filter bindings
    setupDateFilters();

    // Vehicle config bindings
    setupVehicleConfig();
}

// ============================================================
// COLLABORATOR SELECTOR
// ============================================================

function setupCollaboratorSelector() {
    const selector = document.getElementById('ri-collab-selector');
    if (!selector) return;

    const updateCount = () => {
        const checked = selector.querySelectorAll('.ri-collab-check:checked');
        const badge = document.getElementById('ri-selected-count');
        if (badge) badge.textContent = `${checked.length} colaborador(es)`;
    };

    // Checkbox changes
    selector.querySelectorAll('.ri-collab-check').forEach(cb => {
        cb.addEventListener('change', updateCount);
    });

    // Select All
    const selectAllBtn = document.getElementById('ri-select-all');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            selector.querySelectorAll('.ri-collab-check').forEach(cb => { cb.checked = true; });
            updateCount();
        });
    }

    // Select None
    const selectNoneBtn = document.getElementById('ri-select-none');
    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', () => {
            selector.querySelectorAll('.ri-collab-check').forEach(cb => { cb.checked = false; });
            updateCount();
        });
    }
}

function getSelectedCollaborators() {
    const allCollaborators = getCollaborators();
    const checkboxes = document.querySelectorAll('.ri-collab-check:checked');
    const selectedIds = new Set([...checkboxes].map(cb => cb.value));
    return allCollaborators.filter(c => selectedIds.has(c.id));
}

// ============================================================
// DATE FILTERS
// ============================================================

function setupDateFilters() {
    const tripTypeContainer = document.getElementById('ri-trip-type');
    const dateFields = document.getElementById('ri-date-fields');
    const idaGroup = document.getElementById('ri-date-ida-group');
    const voltaGroup = document.getElementById('ri-date-volta-group');
    const dataIdaInput = document.getElementById('ri-data-ida');
    const dataVoltaInput = document.getElementById('ri-data-volta');

    if (!tripTypeContainer || !dateFields) return;

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    if (dataIdaInput) dataIdaInput.min = today;
    if (dataVoltaInput) dataVoltaInput.min = today;

    // When ida date changes, update volta min
    if (dataIdaInput && dataVoltaInput) {
        dataIdaInput.addEventListener('change', () => {
            dataVoltaInput.min = dataIdaInput.value || today;
            if (dataVoltaInput.value && dataVoltaInput.value < dataIdaInput.value) {
                dataVoltaInput.value = dataIdaInput.value;
            }
        });
    }

    // Trip type buttons
    tripTypeContainer.querySelectorAll('.ri-trip-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tripTypeContainer.querySelectorAll('.ri-trip-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.type;

            if (type === 'any') {
                dateFields.style.display = 'none';
            } else if (type === 'oneway') {
                dateFields.style.display = 'flex';
                idaGroup.style.display = 'block';
                voltaGroup.style.display = 'none';
            } else if (type === 'roundtrip') {
                dateFields.style.display = 'flex';
                idaGroup.style.display = 'block';
                voltaGroup.style.display = 'block';
            }
        });
    });
}

function getDateFilters() {
    const activeBtn = document.querySelector('.ri-trip-type-btn.active');
    const type = activeBtn ? activeBtn.dataset.type : 'any';
    const dataIda = document.getElementById('ri-data-ida')?.value || '';
    const dataVolta = document.getElementById('ri-data-volta')?.value || '';

    return { type, dataIda, dataVolta };
}

// ============================================================
// VEHICLE CONFIG
// ============================================================

const VEHICLE_PRESETS = {
    popular:  { aluguel: 120, consumo: 12,  precoLitro: 5.89 },
    sedan:    { aluguel: 180, consumo: 10,  precoLitro: 5.89 },
    suv:      { aluguel: 250, consumo: 8.5, precoLitro: 5.89 },
    pickup:   { aluguel: 320, consumo: 7,   precoLitro: 6.29 },
    van:      { aluguel: 400, consumo: 6,   precoLitro: 6.29 },
    custom:   { aluguel: 180, consumo: 10,  precoLitro: 5.89 },
};

function setupVehicleConfig() {
    const toggle = document.getElementById('ri-vehicle-custom');
    const fields = document.getElementById('ri-vehicle-fields');
    const catSelect = document.getElementById('ri-vehicle-cat');

    if (!toggle || !fields) return;

    toggle.addEventListener('change', () => {
        fields.style.display = toggle.checked ? 'block' : 'none';
    });

    if (catSelect) {
        catSelect.addEventListener('change', () => {
            const preset = VEHICLE_PRESETS[catSelect.value];
            if (!preset || catSelect.value === 'custom') return;
            document.getElementById('ri-vehicle-aluguel').value = preset.aluguel;
            document.getElementById('ri-vehicle-consumo').value = preset.consumo;
            document.getElementById('ri-vehicle-preco-litro').value = preset.precoLitro;
        });
    }
}

function getVehicleConfig() {
    const toggle = document.getElementById('ri-vehicle-custom');
    if (!toggle || !toggle.checked) return null;

    return {
        categoria: document.getElementById('ri-vehicle-cat')?.value || 'sedan',
        aluguelDia: parseFloat(document.getElementById('ri-vehicle-aluguel')?.value) || 180,
        consumoKmL: parseFloat(document.getElementById('ri-vehicle-consumo')?.value) || 10,
        precoLitro: parseFloat(document.getElementById('ri-vehicle-preco-litro')?.value) || 5.89,
        pedagios: parseFloat(document.getElementById('ri-vehicle-pedagios')?.value) || 0,
    };
}

// ============================================================
// AUTOCOMPLETE
// ============================================================

function setupAutocomplete(inputId, sugId) {
    const input = document.getElementById(inputId);
    const sugBox = document.getElementById(sugId);
    if (!input || !sugBox) return;

    input.addEventListener('input', () => {
        const val = input.value.trim();
        if (val.length < 2) { sugBox.innerHTML = ''; sugBox.style.display = 'none'; return; }
        const results = searchExtendedCities(val).slice(0, 8);
        if (results.length === 0) { sugBox.innerHTML = ''; sugBox.style.display = 'none'; return; }
        sugBox.innerHTML = results.map(c =>
            `<div class="ri-suggestion-item" data-city="${c}">${highlightMatch(c, val)}</div>`
        ).join('');
        sugBox.style.display = 'block';
    });

    sugBox.addEventListener('click', (e) => {
        const item = e.target.closest('.ri-suggestion-item');
        if (item) {
            input.value = item.dataset.city;
            sugBox.innerHTML = '';
            sugBox.style.display = 'none';
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { sugBox.style.display = 'none'; }, 200);
    });

    input.addEventListener('focus', () => {
        if (sugBox.innerHTML) sugBox.style.display = 'block';
    });
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + '<strong>' + text.slice(idx, idx + query.length) + '</strong>' + text.slice(idx + query.length);
}

// ============================================================
// ANALYSIS
// ============================================================

async function runAnalysis() {
    const origem = document.getElementById('ri-origem').value.trim();
    const destino = document.getElementById('ri-destino').value.trim();

    if (!origem || !destino) { alert('Informe a cidade de origem e destino.'); return; }
    if (origem === destino) { alert('Origem e destino devem ser diferentes.'); return; }

    const collaborators = getSelectedCollaborators();
    if (collaborators.length === 0) { alert('Selecione ao menos um colaborador para a viagem.'); return; }

    const dateFilters = getDateFilters();
    if (dateFilters.type === 'oneway' && !dateFilters.dataIda) { alert('Informe a data de ida.'); return; }
    if (dateFilters.type === 'roundtrip' && (!dateFilters.dataIda || !dateFilters.dataVolta)) { alert('Informe as datas de ida e volta.'); return; }

    const container = document.getElementById('ri-results');
    const apiEnabled = isFlightsApiEnabled();

    // Show loading
    container.innerHTML = `
      <div class="ri-loading">
        <div class="ri-loading-spinner"></div>
        <div class="ri-loading-text">
          <span class="ri-loading-title">Motor de Inteligência processando...</span>
          <span class="ri-loading-steps" id="ri-loading-steps">Pesquisando rotas disponíveis...</span>
          ${apiEnabled ? '<span class="ri-loading-api-tag">Google Flights API ativa</span>' : ''}
        </div>
      </div>
    `;

    // Progress callback for real-time updates
    const onProgress = (msg) => {
        const el = document.getElementById('ri-loading-steps');
        if (el) el.textContent = msg;
    };

    // Initial loading steps animation
    const steps = [
        'Pesquisando rotas de ônibus...',
        apiEnabled ? 'Consultando Google Flights em tempo real...' : 'Comparando alternativas aéreas...',
        'Calculando custos de veículo...',
    ];
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
        stepIdx++;
        if (stepIdx < steps.length) onProgress(steps[stepIdx]);
    }, 400);

    try {
        const result = await analyzeRoutingIntelligence({
            origem,
            destino,
            collaborators,
            diasCampo: parseInt(document.getElementById('ri-dias').value) || 5,
            dateFilters,
            vehicleConfig: getVehicleConfig(),
            operational: {
                horasNormaisDia: parseFloat(document.getElementById('ri-hn').value) || 8,
                horasExtra50Dia: parseFloat(document.getElementById('ri-he50').value) || 0,
                horasExtra100Dia: parseFloat(document.getElementById('ri-he100').value) || 0,
                horasNoturnasDia: parseFloat(document.getElementById('ri-noturnas').value) || 0,
                custoHospedagemDia: parseFloat(document.getElementById('ri-hosp').value) || 0,
                custoAlimentacaoDia: parseFloat(document.getElementById('ri-alim').value) || 0,
                custoDeslocamentoLocalDia: parseFloat(document.getElementById('ri-local').value) || 0,
            },
            onProgress,
        });

        clearInterval(stepInterval);
        lastAnalysis = result;

        if (!result.success) {
            container.innerHTML = `
              <div class="card"><div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <h3>Rota não encontrada</h3>
                <p>${result.error}</p>
              </div></div>
            `;
            return;
        }

        // Save to simulation history
        result.alternatives.forEach(alt => {
            saveSimulation({
                nome: `${alt.tipo}: ${alt.descricao}`,
                modal: alt.tipo,
                origem,
                destino,
                qtdColaboradores: collaborators.length,
                resumo: {
                    custoTotalEquipe: alt.custos.operacionalTotal,
                    horasTransito: alt.tempoIdaVoltaH,
                },
                type: 'route-intelligence',
            });
        });

        renderResults(result);
    } catch (err) {
        clearInterval(stepInterval);
        container.innerHTML = `
          <div class="card"><div class="empty-state">
            <div class="empty-state-icon">❌</div>
            <h3>Erro na análise</h3>
            <p>${err.message}</p>
          </div></div>
        `;
    }
}

// ============================================================
// RENDER RESULTS
// ============================================================

function renderResults(result) {
    const container = document.getElementById('ri-results');
    if (!container) return;

    const { alternatives, rankings, executive, estimado, airSource, realtimeFlights } = result;
    const sorted = rankings.geral;

    container.innerHTML = `
    ${airSource === 'realtime' ? `
      <div class="ri-realtime-banner mb-6">
        <div class="ri-realtime-dot"></div>
        <div class="ri-realtime-info">
          <strong>Dados de voos em tempo real</strong> — Google Flights API
          <span class="ri-realtime-meta">
            ${realtimeFlights ? `${realtimeFlights.totalResultados} voo(s) encontrado(s) · Melhor preço: ${formatCurrency(realtimeFlights.melhorPreco)}` : ''}
            · Consultado: ${new Date().toLocaleTimeString('pt-BR')}
          </span>
        </div>
      </div>
    ` : ''}
    ${estimado ? `
      <div class="ri-estimate-warning mb-6">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Rota estimada por geolocalização. Valores são aproximações. Para dados precisos, integre APIs externas.</span>
      </div>
    ` : ''}

    <!-- Executive Recommendation -->
    <div class="ri-executive-card mb-6">
      <div class="ri-executive-header">
        <div class="ri-executive-icon">🧠</div>
        <div>
          <h4>Parecer Executivo — Motor de Inteligência</h4>
          <span class="ri-executive-subtitle">${result.origem} → ${result.destino} · ${result.distanciaKm} km · ${result.qtdColaboradores} pessoa(s)</span>
        </div>
        <div class="ri-executive-score">
          <span class="ri-executive-score-value">${executive.scoreTotal}</span>
          <span class="ri-executive-score-label">Score</span>
        </div>
      </div>
      <div class="ri-executive-body">
        ${executive.paragraphs.map(p => `
          <p class="ri-executive-paragraph">${formatBold(p)}</p>
        `).join('')}
      </div>
      <div class="ri-executive-verdict">
        <span>Veredicto: <strong>${executive.veredicto}</strong></span>
        <span>${executive.totalAlternativas} alternativas analisadas</span>
      </div>
    </div>

    <!-- KPI Summary -->
    <div class="kpi-grid mb-6">
      <div class="kpi-card kpi-green">
        <div class="kpi-label">Menor Custo Direto</div>
        <div class="kpi-value">${formatCurrency(executive.maisBaratoDireto.custos.transporteTotal)}</div>
        <div class="kpi-detail">${executive.maisBaratoDireto.icon} ${executive.maisBaratoDireto.tipo}</div>
      </div>
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">Menor Custo Operacional</div>
        <div class="kpi-value">${formatCurrency(executive.maisBaratoOperacional.custos.operacionalTotal)}</div>
        <div class="kpi-detail">${executive.maisBaratoOperacional.icon} ${executive.maisBaratoOperacional.tipo}</div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-label">Menor Tempo</div>
        <div class="kpi-value">${formatHours(executive.maisRapido.tempoViagemH)}</div>
        <div class="kpi-detail">${executive.maisRapido.icon} ${executive.maisRapido.tipo}</div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-label">Economia Potencial</div>
        <div class="kpi-value">${formatCurrency(executive.economiaOperacional)}</div>
        <div class="kpi-detail">vs alternativa mais cara</div>
      </div>
    </div>

    <!-- Ranking Tabs -->
    <div class="ri-ranking-tabs mb-6">
      <button class="ri-tab active" data-ranking="geral">Ranking Geral</button>
      <button class="ri-tab" data-ranking="custoDireto">Menor Custo Direto</button>
      <button class="ri-tab" data-ranking="custoOp">Menor Custo Operacional</button>
      <button class="ri-tab" data-ranking="tempo">Menor Tempo</button>
      <button class="ri-tab" data-ranking="cb">Melhor Custo-Benefício</button>
    </div>

    <!-- Alternative Cards -->
    <div class="ri-alternatives" id="ri-alternatives">
      ${renderAlternativeCards(sorted)}
    </div>

    <!-- Comparative Chart -->
    <div class="card mb-6 mt-6">
      <div class="card-header">
        <h4 class="card-title">📊 Comparativo de Custos Operacionais</h4>
      </div>
      <div style="position: relative; height: 380px;">
        <canvas id="ri-chart"></canvas>
      </div>
    </div>

    <!-- Detailed Comparison Table -->
    <div class="card mb-6">
      <div class="card-header">
        <h4 class="card-title">📋 Detalhamento Comparativo Completo</h4>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              ${sorted.map(a => `<th style="text-align: right;">${a.icon} ${a.tipo}<br><small style="font-weight:400;opacity:0.7;">${truncate(a.descricao, 25)}</small></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Transporte (Total)</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.transporteTotal)}</td>`).join('')}
            </tr>
            <tr>
              <td>Transporte (por pessoa)</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.transportePessoa)}</td>`).join('')}
            </tr>
            <tr>
              <td>Mão de Obra</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.maoObra)}</td>`).join('')}
            </tr>
            <tr>
              <td>Custo Trânsito (h. técnicas)</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.transito)}</td>`).join('')}
            </tr>
            <tr>
              <td>Hospedagem</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.hospedagem)}</td>`).join('')}
            </tr>
            <tr>
              <td>Alimentação</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.alimentacao)}</td>`).join('')}
            </tr>
            <tr>
              <td>Deslocamento Local</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.deslocamentoLocal)}</td>`).join('')}
            </tr>
            <tr>
              <td>Impacto Horas Extras</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.impactoHorasExtras)}</td>`).join('')}
            </tr>
            <tr>
              <td>Impacto Noturno</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatCurrency(a.custos.impactoNoturno)}</td>`).join('')}
            </tr>
            <tr>
              <td>Tempo de Viagem (ida)</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatHours(a.tempoViagemH)}</td>`).join('')}
            </tr>
            <tr>
              <td>Tempo ida + volta</td>
              ${sorted.map(a => `<td style="text-align: right;">${formatHours(a.tempoIdaVoltaH)}</td>`).join('')}
            </tr>
            <tr style="background: var(--bg-tertiary); font-weight: 700;">
              <td style="color: var(--text-primary);">CUSTO OPERACIONAL TOTAL</td>
              ${sorted.map((a, i) => `
                <td style="text-align: right; color: ${i === 0 ? 'var(--accent-green-light)' : 'var(--text-primary)'}; font-size: var(--font-base);">
                  ${formatCurrency(a.custos.operacionalTotal)}
                  ${i === 0 ? ' ✓' : ''}
                </td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Route Details per Modal -->
    ${renderModalDetails(sorted)}
  `;

    // Bind ranking tabs
    bindRankingTabs(result);

    // Render chart
    renderChart(sorted);
}

// ============================================================
// RENDER ALTERNATIVE CARDS
// ============================================================

function renderAlternativeCards(sorted) {
    return sorted.map((alt, i) => `
      <div class="ri-alt-card ${i === 0 ? 'ri-alt-best' : ''}" data-alt-id="${alt.id}">
        ${i === 0 ? '<div class="ri-alt-recommended">✓ Recomendado</div>' : `<div class="ri-alt-position">#${i + 1}</div>`}
        <div class="ri-alt-header">
          <span class="ri-alt-icon">${alt.icon}</span>
          <div class="ri-alt-info">
            <h4 class="ri-alt-title">${alt.tipo}</h4>
            <p class="ri-alt-desc">${alt.descricao}</p>
          </div>
          <div class="ri-alt-score ${i === 0 ? 'ri-alt-score-best' : ''}">
            <span class="ri-alt-score-val">${alt.scores.total}</span>
            <span class="ri-alt-score-lbl">pts</span>
          </div>
        </div>

        <div class="ri-alt-metrics">
          <div class="ri-alt-metric">
            <span class="ri-alt-metric-label">Custo Direto</span>
            <span class="ri-alt-metric-value">${formatCurrency(alt.custos.transporteTotal)}</span>
          </div>
          <div class="ri-alt-metric">
            <span class="ri-alt-metric-label">Custo Operacional</span>
            <span class="ri-alt-metric-value ri-alt-metric-highlight">${formatCurrency(alt.custos.operacionalTotal)}</span>
          </div>
          <div class="ri-alt-metric">
            <span class="ri-alt-metric-label">Tempo (ida)</span>
            <span class="ri-alt-metric-value">${formatHours(alt.tempoViagemH)}</span>
          </div>
          <div class="ri-alt-metric">
            <span class="ri-alt-metric-label">Distância</span>
            <span class="ri-alt-metric-value">${alt.distanciaKm} km</span>
          </div>
        </div>

        <div class="ri-alt-scores">
          <div class="ri-alt-score-bar">
            <span class="ri-alt-score-bar-label">Custo Direto</span>
            <div class="ai-score-bar-track"><div class="ai-score-bar-fill ai-score-bar-blue" style="width: ${alt.scores.custoDireto}%"></div></div>
            <span class="ai-score-bar-value">${alt.scores.custoDireto}</span>
          </div>
          <div class="ri-alt-score-bar">
            <span class="ri-alt-score-bar-label">Custo Operacional</span>
            <div class="ai-score-bar-track"><div class="ai-score-bar-fill ai-score-bar-green" style="width: ${alt.scores.custoOperacional}%"></div></div>
            <span class="ai-score-bar-value">${alt.scores.custoOperacional}</span>
          </div>
          <div class="ri-alt-score-bar">
            <span class="ri-alt-score-bar-label">Tempo</span>
            <div class="ai-score-bar-track"><div class="ai-score-bar-fill ai-score-bar-purple" style="width: ${alt.scores.tempo}%"></div></div>
            <span class="ai-score-bar-value">${alt.scores.tempo}</span>
          </div>
          <div class="ri-alt-score-bar">
            <span class="ri-alt-score-bar-label">Custo-Benefício</span>
            <div class="ai-score-bar-track"><div class="ai-score-bar-fill" style="width: ${alt.scores.custoBeneficio}%; background: linear-gradient(90deg, var(--accent-amber), var(--accent-amber-light));"></div></div>
            <span class="ai-score-bar-value">${alt.scores.custoBeneficio}</span>
          </div>
        </div>

        <div class="ri-alt-breakdown">
          <div class="ri-alt-breakdown-title">Composição do Custo Total</div>
          <div class="result-row"><span class="result-label">Transporte</span><span class="result-value">${formatCurrency(alt.custos.transporteTotal)}</span></div>
          <div class="result-row"><span class="result-label">Mão de Obra (campo)</span><span class="result-value">${formatCurrency(alt.custos.maoObra)}</span></div>
          <div class="result-row"><span class="result-label">Horas Técnicas em Trânsito</span><span class="result-value">${formatCurrency(alt.custos.transito)}</span></div>
          <div class="result-row"><span class="result-label">Hospedagem</span><span class="result-value">${formatCurrency(alt.custos.hospedagem)}</span></div>
          <div class="result-row"><span class="result-label">Alimentação</span><span class="result-value">${formatCurrency(alt.custos.alimentacao)}</span></div>
          ${alt.custos.deslocamentoLocal > 0 ? `<div class="result-row"><span class="result-label">Deslocamento Local</span><span class="result-value">${formatCurrency(alt.custos.deslocamentoLocal)}</span></div>` : ''}
          ${alt.custos.impactoHorasExtras > 0 ? `<div class="result-row"><span class="result-label">Impacto Horas Extras (viagem)</span><span class="result-value">${formatCurrency(alt.custos.impactoHorasExtras)}</span></div>` : ''}
          ${alt.custos.impactoNoturno > 0 ? `<div class="result-row"><span class="result-label">Impacto Noturno</span><span class="result-value">${formatCurrency(alt.custos.impactoNoturno)}</span></div>` : ''}
          <div class="result-row result-total">
            <span class="result-label">CUSTO TOTAL MOBILIZAÇÃO</span>
            <span class="result-value" style="color: ${i === 0 ? 'var(--accent-green-light)' : 'var(--accent-blue-light)'};">${formatCurrency(alt.custos.operacionalTotal)}</span>
          </div>
        </div>
      </div>
    `).join('');
}

// ============================================================
// RENDER MODAL-SPECIFIC DETAILS
// ============================================================

function renderModalDetails(sorted) {
    return sorted.map(alt => {
        if (alt.tipo === 'Ônibus') return renderBusDetails(alt);
        if (alt.tipo === 'Aéreo') return renderAirDetails(alt);
        if (alt.tipo === 'Veículo/Frota') return renderVehicleDetails(alt);
        return '';
    }).join('');
}

function renderBusDetails(alt) {
    const d = alt.detalhes;
    if (!d || !d.trechos) return '';
    return `
    <div class="card mb-4">
      <div class="card-header">
        <h4 class="card-title">🚌 Detalhes — ${alt.descricao}</h4>
        <span class="badge badge-amber">${d.baldeacoes} baldeação(ões)</span>
      </div>
      <div class="ri-trip-timeline">
        ${d.trechos.map((t, i) => `
          <div class="ri-trip-segment">
            <div class="ri-trip-dot ${i === 0 ? 'ri-trip-dot-start' : ''}"></div>
            <div class="ri-trip-segment-info">
              <div class="ri-trip-segment-route">${t.de} → ${t.para}</div>
              <div class="ri-trip-segment-meta">
                ${t.distKm} km · ${t.tempoH}h · ${formatCurrency(t.custo)} · ${t.tipo}
              </div>
              <div class="ri-trip-segment-ops">Operadores: ${t.operadores.join(', ')}</div>
            </div>
          </div>
          ${i < d.trechos.length - 1 ? `<div class="ri-trip-wait">Espera: ~${d.tempoEspera / d.baldeacoes}h</div>` : ''}
        `).join('')}
      </div>
      <div class="ri-trip-summary">
        <span>Tempo total: <strong>${d.tempoViagem}h viagem + ${d.tempoEspera}h espera = ${alt.tempoViagemH}h</strong></span>
        <span>Operadores: <strong>${d.operadores.join(', ')}</strong></span>
      </div>
    </div>
  `;
}

function renderAirDetails(alt) {
    const d = alt.detalhes;
    if (!d || !d.trechos) return '';
    const isLive = d.fonte === 'realtime';
    return `
    <div class="card mb-4">
      <div class="card-header">
        <h4 class="card-title">✈️ Detalhes — ${alt.descricao}</h4>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${isLive ? '<span class="badge badge-green ri-live-badge-sm">Tempo Real</span>' : ''}
          <span class="badge badge-blue">${d.conexoes} conexão(ões)</span>
        </div>
      </div>
      ${isLive && d.precoMinimo ? `
        <div class="ri-price-range">
          <span>Faixa de preço: <strong>${formatCurrency(d.precoMinimo)}</strong> — <strong>${formatCurrency(d.precoMaximo)}</strong></span>
          <span>${d.opcoes} opção(ões) disponíveis</span>
          ${d.emissaoCarbono ? `<span>CO₂: ${Math.round(d.emissaoCarbono / 1000)} kg</span>` : ''}
        </div>
      ` : ''}
      <div class="ri-trip-timeline">
        <div class="ri-trip-segment">
          <div class="ri-trip-dot ri-trip-dot-start"></div>
          <div class="ri-trip-segment-info">
            <div class="ri-trip-segment-route">Deslocamento até aeroporto</div>
            <div class="ri-trip-segment-meta">${d.deslocamentoOrigem}h</div>
          </div>
        </div>
        ${d.trechos.map((t, i) => `
          <div class="ri-trip-segment">
            <div class="ri-trip-dot"></div>
            <div class="ri-trip-segment-info">
              <div class="ri-trip-segment-route">${t.de} → ${t.para}</div>
              <div class="ri-trip-segment-meta">
                ${t.numero ? `Voo ${t.numero} · ` : 'Voo: '}${t.tempoVooH}h · ${formatCurrency(t.custo)} · ${t.cia}
                ${t.horaSaida ? ` · ${t.horaSaida} → ${t.horaChegada}` : ''}
              </div>
              ${t.aviao ? `<div class="ri-trip-segment-ops">Aeronave: ${t.aviao}</div>` : ''}
            </div>
          </div>
          ${isLive && d.layovers && d.layovers[i] ? `
            <div class="ri-trip-wait">Conexão em ${d.layovers[i].nome || d.layovers[i].aeroporto}: ~${d.layovers[i].duracaoH}h${d.layovers[i].overnight ? ' (pernoite)' : ''}</div>
          ` : (i < d.trechos.length - 1 ? `<div class="ri-trip-wait">Conexão: ~${d.tempoConexao}h</div>` : '')}
        `).join('')}
        ${d.trechoTerrestre ? `
          <div class="ri-trip-segment">
            <div class="ri-trip-dot"></div>
            <div class="ri-trip-segment-info">
              <div class="ri-trip-segment-route">${d.trechoTerrestre.de} → ${d.trechoTerrestre.para} (${d.trechoTerrestre.modal})</div>
              <div class="ri-trip-segment-meta">${d.trechoTerrestre.tempoH}h · ${formatCurrency(d.trechoTerrestre.custo)}</div>
            </div>
          </div>
        ` : ''}
        <div class="ri-trip-segment">
          <div class="ri-trip-dot ri-trip-dot-end"></div>
          <div class="ri-trip-segment-info">
            <div class="ri-trip-segment-route">Aeroporto até destino final</div>
            <div class="ri-trip-segment-meta">${d.deslocamentoDestino}h</div>
          </div>
        </div>
      </div>
      <div class="ri-trip-summary">
        <span>Porta-a-porta: <strong>${formatHours(alt.tempoViagemH)}</strong></span>
        <span>Cias: <strong>${d.cias.join(', ')}</strong></span>
      </div>
    </div>
  `;
}

function renderVehicleDetails(alt) {
    const d = alt.detalhes;
    if (!d) return '';
    return `
    <div class="card mb-4">
      <div class="card-header">
        <h4 class="card-title">🚗 Detalhes — Veículo/Frota</h4>
        <span class="badge badge-purple">${d.distanciaKm} km</span>
      </div>
      ${d.trechos && d.trechos.length > 0 ? `
        <div class="ri-trip-timeline">
          ${d.trechos.map((t, i) => `
            <div class="ri-trip-segment">
              <div class="ri-trip-dot ${i === 0 ? 'ri-trip-dot-start' : i === d.trechos.length - 1 ? 'ri-trip-dot-end' : ''}"></div>
              <div class="ri-trip-segment-info">
                <div class="ri-trip-segment-route">${t.de} → ${t.para}</div>
                <div class="ri-trip-segment-meta">${t.km} km · ${t.tempoH}h · Pedágios: ${formatCurrency(t.pedagios)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="ri-vehicle-costs">
        <div class="result-row"><span class="result-label">Combustível (${d.consumoMedioKmL} km/L × R$ ${d.precoLitro})</span><span class="result-value">${formatCurrency(d.combustivel)}</span></div>
        <div class="result-row"><span class="result-label">Pedágios</span><span class="result-value">${formatCurrency(d.pedagios)}</span></div>
        <div class="result-row"><span class="result-label">Aluguel (${d.diasEstimados} diária(s) × R$ 180)</span><span class="result-value">${formatCurrency(d.aluguel)}</span></div>
        <div class="result-row result-total">
          <span class="result-label">CUSTO TOTAL VEÍCULO</span>
          <span class="result-value">${formatCurrency(d.combustivel + d.pedagios + d.aluguel)}</span>
        </div>
      </div>
      <div class="ri-trip-summary">
        <span>Tempo estimado: <strong>${formatHours(d.tempoEstimadoH)}</strong></span>
        <span>Dias de viagem: <strong>${d.diasEstimados}</strong></span>
      </div>
    </div>
  `;
}

// ============================================================
// RANKING TABS
// ============================================================

function bindRankingTabs(result) {
    const tabs = document.querySelectorAll('.ri-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const ranking = tab.dataset.ranking;
            let sorted;
            switch (ranking) {
                case 'custoDireto': sorted = result.rankings.menorCustoDireto; break;
                case 'custoOp': sorted = result.rankings.menorCustoOperacional; break;
                case 'tempo': sorted = result.rankings.menorTempo; break;
                case 'cb': sorted = result.rankings.melhorCustoBeneficio; break;
                default: sorted = result.rankings.geral;
            }

            const container = document.getElementById('ri-alternatives');
            if (container) container.innerHTML = renderAlternativeCards(sorted);
        });
    });
}

// ============================================================
// CHART
// ============================================================

function renderChart(sorted) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const ctx = document.getElementById('ri-chart');
    if (!ctx) return;

    const labels = sorted.map(a => `${a.icon} ${a.tipo}`);

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Transporte', data: sorted.map(a => a.custos.transporteTotal), backgroundColor: '#3b82f680', borderColor: '#3b82f6', borderWidth: 1 },
                { label: 'Mão de Obra', data: sorted.map(a => a.custos.maoObra), backgroundColor: '#8b5cf680', borderColor: '#8b5cf6', borderWidth: 1 },
                { label: 'Trânsito (h. técnicas)', data: sorted.map(a => a.custos.transito), backgroundColor: '#f59e0b80', borderColor: '#f59e0b', borderWidth: 1 },
                { label: 'Hospedagem + Alimentação', data: sorted.map(a => a.custos.hospedagem + a.custos.alimentacao), backgroundColor: '#10b98180', borderColor: '#10b981', borderWidth: 1 },
                { label: 'Outros (extras, noturno, local)', data: sorted.map(a => a.custos.impactoHorasExtras + a.custos.impactoNoturno + a.custos.deslocamentoLocal), backgroundColor: '#ef444480', borderColor: '#ef4444', borderWidth: 1 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { color: '#94a3b8', font: { family: 'Inter' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { stacked: true, ticks: { color: '#94a3b8', font: { family: 'Inter' }, callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(255,255,255,0.05)' } },
            },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16 } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: R$ ${c.raw.toLocaleString('pt-BR')}` } },
            },
        },
    });
}

// ============================================================
// HELPERS
// ============================================================

function formatBold(text) {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '...' : str;
}
