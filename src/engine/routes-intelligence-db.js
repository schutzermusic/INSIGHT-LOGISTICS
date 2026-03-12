import BRAZILIAN_CITIES_ALL from '../data/brazilian-cities-db.js';

const ALL_BRAZILIAN_CITIES = BRAZILIAN_CITIES_ALL;

/**
 * Routes Intelligence Database — Extended Brazilian route data
 * Covers 80+ cities with detailed modal information:
 * - Bus: operators, transfers, alternative routes
 * - Air: airports, connections, door-to-door times
 * - Vehicle: distance, fuel, tolls, driving time
 *
 * Architecture prepared for future external API integration
 * (Google Maps, Skyscanner, ClickBus, Localiza, etc.)
 */

// ============================================================
// CITIES DATABASE — Expanded to cover industrial & field hubs
// ============================================================
const CITIES_EXTENDED = [
    // Capitals
    { nome: 'São Paulo - SP', uf: 'SP', aeroportos: ['GRU', 'CGH', 'VCP'], hub: true, lat: -23.55, lng: -46.63 },
    { nome: 'Rio de Janeiro - RJ', uf: 'RJ', aeroportos: ['GIG', 'SDU'], hub: true, lat: -22.91, lng: -43.17 },
    { nome: 'Belo Horizonte - MG', uf: 'MG', aeroportos: ['CNF', 'PLU'], hub: true, lat: -19.92, lng: -43.94 },
    { nome: 'Brasília - DF', uf: 'DF', aeroportos: ['BSB'], hub: true, lat: -15.79, lng: -47.88 },
    { nome: 'Salvador - BA', uf: 'BA', aeroportos: ['SSA'], hub: true, lat: -12.97, lng: -38.51 },
    { nome: 'Recife - PE', uf: 'PE', aeroportos: ['REC'], hub: true, lat: -8.05, lng: -34.87 },
    { nome: 'Fortaleza - CE', uf: 'CE', aeroportos: ['FOR'], hub: true, lat: -3.72, lng: -38.52 },
    { nome: 'Manaus - AM', uf: 'AM', aeroportos: ['MAO'], hub: true, lat: -3.12, lng: -60.02 },
    { nome: 'Belém - PA', uf: 'PA', aeroportos: ['BEL'], hub: true, lat: -1.46, lng: -48.50 },
    { nome: 'Curitiba - PR', uf: 'PR', aeroportos: ['CWB'], hub: true, lat: -25.43, lng: -49.27 },
    { nome: 'Porto Alegre - RS', uf: 'RS', aeroportos: ['POA'], hub: true, lat: -30.03, lng: -51.23 },
    { nome: 'Goiânia - GO', uf: 'GO', aeroportos: ['GYN'], hub: true, lat: -16.69, lng: -49.25 },
    { nome: 'Vitória - ES', uf: 'ES', aeroportos: ['VIX'], hub: false, lat: -20.32, lng: -40.34 },
    { nome: 'Florianópolis - SC', uf: 'SC', aeroportos: ['FLN'], hub: false, lat: -27.59, lng: -48.55 },
    { nome: 'Campo Grande - MS', uf: 'MS', aeroportos: ['CGR'], hub: false, lat: -20.47, lng: -54.62 },
    { nome: 'Cuiabá - MT', uf: 'MT', aeroportos: ['CGB'], hub: true, lat: -15.60, lng: -56.10 },
    { nome: 'Macapá - AP', uf: 'AP', aeroportos: ['MCP'], hub: false, lat: 0.03, lng: -51.07 },
    { nome: 'São Luís - MA', uf: 'MA', aeroportos: ['SLZ'], hub: false, lat: -2.53, lng: -44.28 },
    { nome: 'Natal - RN', uf: 'RN', aeroportos: ['NAT'], hub: false, lat: -5.79, lng: -35.21 },
    { nome: 'João Pessoa - PB', uf: 'PB', aeroportos: ['JPA'], hub: false, lat: -7.12, lng: -34.86 },
    { nome: 'Teresina - PI', uf: 'PI', aeroportos: ['THE'], hub: false, lat: -5.09, lng: -42.80 },
    { nome: 'Maceió - AL', uf: 'AL', aeroportos: ['MCZ'], hub: false, lat: -9.67, lng: -35.74 },
    { nome: 'Aracaju - SE', uf: 'SE', aeroportos: ['AJU'], hub: false, lat: -10.91, lng: -37.07 },
    { nome: 'Palmas - TO', uf: 'TO', aeroportos: ['PMW'], hub: false, lat: -10.18, lng: -48.33 },
    { nome: 'Porto Velho - RO', uf: 'RO', aeroportos: ['PVH'], hub: false, lat: -8.76, lng: -63.90 },
    { nome: 'Rio Branco - AC', uf: 'AC', aeroportos: ['RBR'], hub: false, lat: -9.97, lng: -67.81 },
    { nome: 'Boa Vista - RR', uf: 'RR', aeroportos: ['BVB'], hub: false, lat: 2.82, lng: -60.67 },

    // Paraná — Industrial & Field hubs
    { nome: 'Londrina - PR', uf: 'PR', aeroportos: ['LDB'], hub: false, lat: -23.31, lng: -51.16 },
    { nome: 'Maringá - PR', uf: 'PR', aeroportos: ['MGF'], hub: false, lat: -23.42, lng: -51.94 },
    { nome: 'Cascavel - PR', uf: 'PR', aeroportos: ['CAC'], hub: false, lat: -24.96, lng: -53.46 },
    { nome: 'Foz do Iguaçu - PR', uf: 'PR', aeroportos: ['IGU'], hub: false, lat: -25.52, lng: -54.59 },
    { nome: 'Ponta Grossa - PR', uf: 'PR', aeroportos: [], hub: false, lat: -25.09, lng: -50.16 },

    // Mato Grosso — Agro & field hubs
    { nome: 'Alta Floresta - MT', uf: 'MT', aeroportos: ['AFL'], hub: false, lat: -9.87, lng: -56.10 },
    { nome: 'Sinop - MT', uf: 'MT', aeroportos: ['OPS'], hub: false, lat: -11.86, lng: -55.59 },
    { nome: 'Rondonópolis - MT', uf: 'MT', aeroportos: ['ROO'], hub: false, lat: -16.47, lng: -54.64 },
    { nome: 'Sorriso - MT', uf: 'MT', aeroportos: ['SMT'], hub: false, lat: -12.55, lng: -55.71 },
    { nome: 'Lucas do Rio Verde - MT', uf: 'MT', aeroportos: [], hub: false, lat: -13.05, lng: -55.91 },
    { nome: 'Tangará da Serra - MT', uf: 'MT', aeroportos: [], hub: false, lat: -14.62, lng: -57.49 },

    // São Paulo Interior
    { nome: 'Campinas - SP', uf: 'SP', aeroportos: ['VCP'], hub: false, lat: -22.91, lng: -47.06 },
    { nome: 'Ribeirão Preto - SP', uf: 'SP', aeroportos: ['RAO'], hub: false, lat: -21.18, lng: -47.81 },
    { nome: 'São José do Rio Preto - SP', uf: 'SP', aeroportos: ['SJP'], hub: false, lat: -20.82, lng: -49.38 },
    { nome: 'Bauru - SP', uf: 'SP', aeroportos: ['BAU'], hub: false, lat: -22.31, lng: -49.07 },
    { nome: 'Presidente Prudente - SP', uf: 'SP', aeroportos: ['PPB'], hub: false, lat: -22.12, lng: -51.39 },
    { nome: 'Sorocaba - SP', uf: 'SP', aeroportos: [], hub: false, lat: -23.50, lng: -47.46 },
    { nome: 'São José dos Campos - SP', uf: 'SP', aeroportos: ['SJK'], hub: false, lat: -23.22, lng: -45.90 },
    { nome: 'Santos - SP', uf: 'SP', aeroportos: [], hub: false, lat: -23.96, lng: -46.33 },
    { nome: 'Marília - SP', uf: 'SP', aeroportos: ['MII'], hub: false, lat: -22.21, lng: -49.95 },

    // Minas Gerais Interior
    { nome: 'Uberlândia - MG', uf: 'MG', aeroportos: ['UDI'], hub: false, lat: -18.92, lng: -48.28 },
    { nome: 'Uberaba - MG', uf: 'MG', aeroportos: ['UBA'], hub: false, lat: -19.76, lng: -47.93 },
    { nome: 'Montes Claros - MG', uf: 'MG', aeroportos: ['MOC'], hub: false, lat: -16.73, lng: -43.86 },
    { nome: 'Juiz de Fora - MG', uf: 'MG', aeroportos: [], hub: false, lat: -21.76, lng: -43.35 },
    { nome: 'Governador Valadares - MG', uf: 'MG', aeroportos: ['GVR'], hub: false, lat: -18.85, lng: -41.95 },
    { nome: 'Ipatinga - MG', uf: 'MG', aeroportos: ['IPN'], hub: false, lat: -19.47, lng: -42.54 },

    // Goiás
    { nome: 'Anápolis - GO', uf: 'GO', aeroportos: [], hub: false, lat: -16.33, lng: -48.95 },
    { nome: 'Rio Verde - GO', uf: 'GO', aeroportos: [], hub: false, lat: -17.80, lng: -50.92 },

    // Bahia Interior
    { nome: 'Vitória da Conquista - BA', uf: 'BA', aeroportos: ['VDC'], hub: false, lat: -14.86, lng: -40.84 },
    { nome: 'Barreiras - BA', uf: 'BA', aeroportos: ['BRA'], hub: false, lat: -12.15, lng: -44.99 },
    { nome: 'Ilhéus - BA', uf: 'BA', aeroportos: ['IOS'], hub: false, lat: -14.79, lng: -39.04 },

    // Pará Interior
    { nome: 'Marabá - PA', uf: 'PA', aeroportos: ['MAB'], hub: false, lat: -5.37, lng: -49.14 },
    { nome: 'Santarém - PA', uf: 'PA', aeroportos: ['STM'], hub: false, lat: -2.42, lng: -54.71 },
    { nome: 'Altamira - PA', uf: 'PA', aeroportos: ['ATM'], hub: false, lat: -3.21, lng: -52.21 },
    { nome: 'Parauapebas - PA', uf: 'PA', aeroportos: ['CKS'], hub: false, lat: -6.07, lng: -49.90 },

    // Rio Grande do Sul Interior
    { nome: 'Caxias do Sul - RS', uf: 'RS', aeroportos: ['CXJ'], hub: false, lat: -29.17, lng: -51.18 },
    { nome: 'Passo Fundo - RS', uf: 'RS', aeroportos: ['PFB'], hub: false, lat: -28.26, lng: -52.41 },
    { nome: 'Pelotas - RS', uf: 'RS', aeroportos: ['PET'], hub: false, lat: -31.77, lng: -52.34 },

    // Santa Catarina
    { nome: 'Joinville - SC', uf: 'SC', aeroportos: ['JOI'], hub: false, lat: -26.30, lng: -48.84 },
    { nome: 'Chapecó - SC', uf: 'SC', aeroportos: ['XAP'], hub: false, lat: -27.09, lng: -52.62 },
    { nome: 'Navegantes - SC', uf: 'SC', aeroportos: ['NVT'], hub: false, lat: -26.88, lng: -48.65 },

    // Mato Grosso do Sul Interior
    { nome: 'Dourados - MS', uf: 'MS', aeroportos: ['DOU'], hub: false, lat: -22.20, lng: -54.81 },
    { nome: 'Três Lagoas - MS', uf: 'MS', aeroportos: ['TJL'], hub: false, lat: -20.79, lng: -51.68 },

    // Tocantins
    { nome: 'Araguaína - TO', uf: 'TO', aeroportos: ['AUX'], hub: false, lat: -7.19, lng: -48.21 },

    // Rondônia
    { nome: 'Ji-Paraná - RO', uf: 'RO', aeroportos: ['JPR'], hub: false, lat: -10.87, lng: -61.85 },

    // Maranhão
    { nome: 'Imperatriz - MA', uf: 'MA', aeroportos: ['IMP'], hub: false, lat: -5.53, lng: -47.49 },

    // Piauí
    { nome: 'Parnaíba - PI', uf: 'PI', aeroportos: ['PHB'], hub: false, lat: -2.91, lng: -41.78 },
];

// ============================================================
// BUS OPERATORS — Major intercity bus companies
// ============================================================
const BUS_OPERATORS = {
    'Viação Garcia': { regiao: ['PR', 'SP', 'MS', 'MT'], qualidade: 4, leito: true },
    'Viação Cometa': { regiao: ['SP', 'RJ', 'MG', 'DF'], qualidade: 4, leito: true },
    'Viação Itapemirim': { regiao: ['SP', 'RJ', 'ES', 'MG', 'BA'], qualidade: 3, leito: true },
    'Viação 1001': { regiao: ['RJ', 'ES', 'MG'], qualidade: 4, leito: true },
    'Viação Kaissara': { regiao: ['RJ', 'MG', 'ES', 'BA'], qualidade: 3, leito: false },
    'Eucatur': { regiao: ['PR', 'MT', 'MS', 'RO', 'AC', 'GO', 'TO'], qualidade: 3, leito: true },
    'Expresso São Luiz': { regiao: ['MT', 'GO', 'PA', 'TO', 'MA'], qualidade: 3, leito: true },
    'Viação Catarinense': { regiao: ['SC', 'PR', 'RS', 'SP'], qualidade: 4, leito: true },
    'Viação Planalto': { regiao: ['RS', 'SC', 'PR'], qualidade: 3, leito: true },
    'Gontijo': { regiao: ['MG', 'BA', 'SP', 'DF', 'GO'], qualidade: 3, leito: true },
    'Real Expresso': { regiao: ['DF', 'GO', 'MG', 'SP', 'MT'], qualidade: 3, leito: false },
    'Reunidas': { regiao: ['SC', 'PR'], qualidade: 3, leito: false },
    'Expresso Nordeste': { regiao: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'], qualidade: 3, leito: true },
    'Princesa dos Campos': { regiao: ['PR'], qualidade: 3, leito: false },
    'Andorinha': { regiao: ['SP', 'MT', 'MS', 'PR'], qualidade: 3, leito: true },
};

// ============================================================
// EXTENDED ROUTES — Detailed multi-modal route data
// ============================================================
// Format: { origem, destino, distanciaKm, bus, air, vehicle }
const ROUTES_INTELLIGENCE = [
    // ======================================
    // LONDRINA HUB — Key example route
    // ======================================
    {
        origem: 'Londrina - PR',
        destino: 'Alta Floresta - MT',
        distanciaKm: 1850,
        bus: {
            direto: null, // No direct bus
            alternativas: [
                {
                    descricao: 'Londrina → Cuiabá → Alta Floresta',
                    trechos: [
                        { de: 'Londrina - PR', para: 'Cuiabá - MT', distKm: 1450, tempoH: 22, custo: 320, operadores: ['Eucatur', 'Andorinha'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', distKm: 800, tempoH: 12, custo: 180, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 36,
                    custoTotal: 500,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
                {
                    descricao: 'Londrina → Maringá → Cuiabá → Sinop → Alta Floresta',
                    trechos: [
                        { de: 'Londrina - PR', para: 'Maringá - PR', distKm: 100, tempoH: 1.5, custo: 35, operadores: ['Viação Garcia'], tipo: 'executivo' },
                        { de: 'Maringá - PR', para: 'Cuiabá - MT', distKm: 1350, tempoH: 20, custo: 290, operadores: ['Eucatur'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Sinop - MT', distKm: 500, tempoH: 7, custo: 130, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                        { de: 'Sinop - MT', para: 'Alta Floresta - MT', distKm: 300, tempoH: 5, custo: 90, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 37.5,
                    custoTotal: 545,
                    baldeacoes: 3,
                    tempoEspera: 6,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'LDB → GRU → CGB, depois terrestre até Alta Floresta',
                    trechos: [
                        { de: 'LDB', para: 'GRU', tempoVooH: 1.2, custo: 450, cia: 'LATAM/Azul' },
                        { de: 'GRU', para: 'CGB', tempoVooH: 2.0, custo: 520, cia: 'LATAM/Gol/Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2.5,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', tempoH: 10, custo: 180, modal: 'Ônibus' },
                    tempoTotalPortaPortaH: 16.7,
                    custoTotal: 1150,
                },
                {
                    descricao: 'LDB → GRU → AFL (direto Alta Floresta)',
                    trechos: [
                        { de: 'LDB', para: 'GRU', tempoVooH: 1.2, custo: 450, cia: 'LATAM/Azul' },
                        { de: 'GRU', para: 'AFL', tempoVooH: 3.0, custo: 750, cia: 'Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 3,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 8.0,
                    custoTotal: 1200,
                },
                {
                    descricao: 'LDB → CGH → CGB, terrestre até Alta Floresta',
                    trechos: [
                        { de: 'LDB', para: 'CGH', tempoVooH: 1.0, custo: 400, cia: 'LATAM' },
                        { de: 'CGH', para: 'CGB', tempoVooH: 2.0, custo: 480, cia: 'Gol/LATAM' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', tempoH: 10, custo: 180, modal: 'Ônibus' },
                    tempoTotalPortaPortaH: 16.0,
                    custoTotal: 1060,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1850,
            tempoEstimadoH: 24,
            rotaDescricao: 'Londrina → Pres. Prudente → Três Lagoas → Campo Grande → Rondonópolis → Cuiabá → Sinop → Alta Floresta',
            pedagios: 185,
            combustivelEstimado: 680,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 3,
            custoAluguel: 540,
            custoTotalVeiculo: 1405,
            trecho: [
                { de: 'Londrina - PR', para: 'Presidente Prudente - SP', km: 250, tempoH: 3.5, pedagios: 45 },
                { de: 'Presidente Prudente - SP', para: 'Três Lagoas - MS', km: 320, tempoH: 4, pedagios: 30 },
                { de: 'Três Lagoas - MS', para: 'Campo Grande - MS', km: 330, tempoH: 4, pedagios: 25 },
                { de: 'Campo Grande - MS', para: 'Rondonópolis - MT', km: 360, tempoH: 4.5, pedagios: 35 },
                { de: 'Rondonópolis - MT', para: 'Cuiabá - MT', km: 210, tempoH: 2.5, pedagios: 20 },
                { de: 'Cuiabá - MT', para: 'Sinop - MT', km: 500, tempoH: 6, pedagios: 15 },
                { de: 'Sinop - MT', para: 'Alta Floresta - MT', km: 300, tempoH: 4, pedagios: 0 },
            ],
        },
    },

    // ======================================
    // SÃO PAULO HUB
    // ======================================
    {
        origem: 'São Paulo - SP',
        destino: 'Londrina - PR',
        distanciaKm: 540,
        bus: {
            direto: { tempoH: 7.5, custo: 160, operadores: ['Viação Garcia', 'Viação Cometa'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'São Paulo → Londrina (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Londrina - PR', distKm: 540, tempoH: 7.5, custo: 160, operadores: ['Viação Garcia', 'Viação Cometa'], tipo: 'leito' }],
                    tempoTotalH: 7.5,
                    custoTotal: 160,
                    baldeacoes: 0,
                    tempoEspera: 0,
                },
                {
                    descricao: 'São Paulo → Marília → Londrina',
                    trechos: [
                        { de: 'São Paulo - SP', para: 'Marília - SP', distKm: 440, tempoH: 5.5, custo: 110, operadores: ['Viação Garcia'], tipo: 'executivo' },
                        { de: 'Marília - SP', para: 'Londrina - PR', distKm: 200, tempoH: 3, custo: 60, operadores: ['Viação Garcia'], tipo: 'executivo' },
                    ],
                    tempoTotalH: 10,
                    custoTotal: 170,
                    baldeacoes: 1,
                    tempoEspera: 1.5,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → LDB (direto)',
                    trechos: [{ de: 'CGH', para: 'LDB', tempoVooH: 1.0, custo: 380, cia: 'LATAM/Azul' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 3.3,
                    custoTotal: 380,
                },
                {
                    descricao: 'GRU → LDB (direto)',
                    trechos: [{ de: 'GRU', para: 'LDB', tempoVooH: 1.0, custo: 350, cia: 'Azul' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 3.8,
                    custoTotal: 350,
                },
            ],
        },
        vehicle: {
            distanciaKm: 540,
            tempoEstimadoH: 6.5,
            rotaDescricao: 'SP → Ourinhos → Londrina (via Rod. Castelo Branco / SP-270)',
            pedagios: 120,
            combustivelEstimado: 210,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 1,
            custoAluguel: 180,
            custoTotalVeiculo: 510,
            trecho: [
                { de: 'São Paulo - SP', para: 'Ourinhos - SP', km: 380, tempoH: 4.5, pedagios: 90 },
                { de: 'Ourinhos - SP', para: 'Londrina - PR', km: 160, tempoH: 2, pedagios: 30 },
            ],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Alta Floresta - MT',
        distanciaKm: 2200,
        bus: {
            direto: null,
            alternativas: [
                {
                    descricao: 'São Paulo → Cuiabá → Alta Floresta',
                    trechos: [
                        { de: 'São Paulo - SP', para: 'Cuiabá - MT', distKm: 1600, tempoH: 22, custo: 320, operadores: ['Andorinha', 'Eucatur'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', distKm: 800, tempoH: 12, custo: 180, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 36,
                    custoTotal: 500,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → AFL (via conexão)',
                    trechos: [
                        { de: 'GRU', para: 'CGB', tempoVooH: 2.0, custo: 520, cia: 'LATAM/Gol/Azul' },
                        { de: 'CGB', para: 'AFL', tempoVooH: 1.2, custo: 350, cia: 'Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2.5,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 7.0,
                    custoTotal: 870,
                },
                {
                    descricao: 'GRU → CGB + Ônibus até Alta Floresta',
                    trechos: [
                        { de: 'GRU', para: 'CGB', tempoVooH: 2.0, custo: 520, cia: 'LATAM/Gol/Azul' },
                    ],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', tempoH: 12, custo: 180, modal: 'Ônibus' },
                    tempoTotalPortaPortaH: 15.5,
                    custoTotal: 700,
                },
            ],
        },
        vehicle: {
            distanciaKm: 2200,
            tempoEstimadoH: 28,
            rotaDescricao: 'SP → Três Lagoas → Campo Grande → Rondonópolis → Cuiabá → Sinop → Alta Floresta',
            pedagios: 220,
            combustivelEstimado: 780,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 3,
            custoAluguel: 540,
            custoTotalVeiculo: 1540,
            trecho: [
                { de: 'São Paulo - SP', para: 'Três Lagoas - MS', km: 630, tempoH: 7.5, pedagios: 85 },
                { de: 'Três Lagoas - MS', para: 'Campo Grande - MS', km: 330, tempoH: 4, pedagios: 25 },
                { de: 'Campo Grande - MS', para: 'Rondonópolis - MT', km: 360, tempoH: 4.5, pedagios: 35 },
                { de: 'Rondonópolis - MT', para: 'Cuiabá - MT', km: 210, tempoH: 2.5, pedagios: 20 },
                { de: 'Cuiabá - MT', para: 'Sinop - MT', km: 500, tempoH: 6, pedagios: 15 },
                { de: 'Sinop - MT', para: 'Alta Floresta - MT', km: 300, tempoH: 4, pedagios: 0 },
            ],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Cuiabá - MT',
        distanciaKm: 1600,
        bus: {
            direto: { tempoH: 22, custo: 320, operadores: ['Andorinha', 'Eucatur'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'São Paulo → Cuiabá (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Cuiabá - MT', distKm: 1600, tempoH: 22, custo: 320, operadores: ['Andorinha', 'Eucatur'], tipo: 'leito' }],
                    tempoTotalH: 22,
                    custoTotal: 320,
                    baldeacoes: 0,
                    tempoEspera: 0,
                },
                {
                    descricao: 'São Paulo → Campo Grande → Cuiabá',
                    trechos: [
                        { de: 'São Paulo - SP', para: 'Campo Grande - MS', distKm: 1010, tempoH: 14, custo: 230, operadores: ['Andorinha'], tipo: 'leito' },
                        { de: 'Campo Grande - MS', para: 'Cuiabá - MT', distKm: 700, tempoH: 10, custo: 160, operadores: ['Eucatur'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 26,
                    custoTotal: 390,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → CGB (direto)',
                    trechos: [{ de: 'GRU', para: 'CGB', tempoVooH: 2.0, custo: 520, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 3.5,
                    custoTotal: 520,
                },
                {
                    descricao: 'CGH → CGB (direto)',
                    trechos: [{ de: 'CGH', para: 'CGB', tempoVooH: 2.0, custo: 550, cia: 'Gol/LATAM' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 3.0,
                    custoTotal: 550,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1600,
            tempoEstimadoH: 19,
            rotaDescricao: 'SP → Três Lagoas → Campo Grande → Rondonópolis → Cuiabá',
            pedagios: 160,
            combustivelEstimado: 560,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 2,
            custoAluguel: 360,
            custoTotalVeiculo: 1080,
            trecho: [
                { de: 'São Paulo - SP', para: 'Três Lagoas - MS', km: 630, tempoH: 7.5, pedagios: 85 },
                { de: 'Três Lagoas - MS', para: 'Campo Grande - MS', km: 330, tempoH: 4, pedagios: 25 },
                { de: 'Campo Grande - MS', para: 'Rondonópolis - MT', km: 360, tempoH: 4.5, pedagios: 35 },
                { de: 'Rondonópolis - MT', para: 'Cuiabá - MT', km: 210, tempoH: 2.5, pedagios: 15 },
            ],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Manaus - AM',
        distanciaKm: 3870,
        bus: {
            direto: null,
            alternativas: [
                {
                    descricao: 'São Paulo → Cuiabá → Porto Velho → Manaus',
                    trechos: [
                        { de: 'São Paulo - SP', para: 'Cuiabá - MT', distKm: 1600, tempoH: 22, custo: 320, operadores: ['Andorinha'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Porto Velho - RO', distKm: 1450, tempoH: 22, custo: 280, operadores: ['Eucatur'], tipo: 'convencional' },
                        { de: 'Porto Velho - RO', para: 'Manaus - AM', distKm: 880, tempoH: 14, custo: 200, operadores: ['Eucatur'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 62,
                    custoTotal: 800,
                    baldeacoes: 2,
                    tempoEspera: 6,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → MAO (direto)',
                    trechos: [{ de: 'GRU', para: 'MAO', tempoVooH: 4.0, custo: 850, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 5.5,
                    custoTotal: 850,
                },
                {
                    descricao: 'GRU → BSB → MAO',
                    trechos: [
                        { de: 'GRU', para: 'BSB', tempoVooH: 1.8, custo: 400, cia: 'LATAM/Gol/Azul' },
                        { de: 'BSB', para: 'MAO', tempoVooH: 3.5, custo: 500, cia: 'LATAM/Gol' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2,
                    deslocamentoAeroportoOrigemH: 1.0,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 8.8,
                    custoTotal: 900,
                },
            ],
        },
        vehicle: {
            distanciaKm: 3870,
            tempoEstimadoH: 50,
            rotaDescricao: 'SP → Campo Grande → Cuiabá → Porto Velho → Manaus (BR-319 parcialmente)',
            pedagios: 250,
            combustivelEstimado: 1450,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 5,
            custoAluguel: 900,
            custoTotalVeiculo: 2600,
            trecho: [],
        },
    },

    // ======================================
    // CURITIBA HUB
    // ======================================
    {
        origem: 'Curitiba - PR',
        destino: 'Londrina - PR',
        distanciaKm: 380,
        bus: {
            direto: { tempoH: 5, custo: 110, operadores: ['Viação Garcia', 'Princesa dos Campos'], tipo: 'executivo' },
            alternativas: [
                {
                    descricao: 'Curitiba → Londrina (direto)',
                    trechos: [{ de: 'Curitiba - PR', para: 'Londrina - PR', distKm: 380, tempoH: 5, custo: 110, operadores: ['Viação Garcia', 'Princesa dos Campos'], tipo: 'executivo' }],
                    tempoTotalH: 5,
                    custoTotal: 110,
                    baldeacoes: 0,
                    tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CWB → LDB (direto)',
                    trechos: [{ de: 'CWB', para: 'LDB', tempoVooH: 0.8, custo: 320, cia: 'Azul' }],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 3.1,
                    custoTotal: 320,
                },
            ],
        },
        vehicle: {
            distanciaKm: 380,
            tempoEstimadoH: 4.5,
            rotaDescricao: 'Curitiba → Ponta Grossa → Londrina (via BR-376)',
            pedagios: 85,
            combustivelEstimado: 150,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 1,
            custoAluguel: 180,
            custoTotalVeiculo: 415,
            trecho: [
                { de: 'Curitiba - PR', para: 'Ponta Grossa - PR', km: 120, tempoH: 1.5, pedagios: 35 },
                { de: 'Ponta Grossa - PR', para: 'Londrina - PR', km: 260, tempoH: 3, pedagios: 50 },
            ],
        },
    },

    {
        origem: 'Curitiba - PR',
        destino: 'Alta Floresta - MT',
        distanciaKm: 2050,
        bus: {
            direto: null,
            alternativas: [
                {
                    descricao: 'Curitiba → Cuiabá → Alta Floresta',
                    trechos: [
                        { de: 'Curitiba - PR', para: 'Cuiabá - MT', distKm: 1650, tempoH: 24, custo: 350, operadores: ['Eucatur'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', distKm: 800, tempoH: 12, custo: 180, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 38,
                    custoTotal: 530,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CWB → GRU → AFL',
                    trechos: [
                        { de: 'CWB', para: 'GRU', tempoVooH: 1.0, custo: 350, cia: 'LATAM/Gol/Azul' },
                        { de: 'GRU', para: 'AFL', tempoVooH: 3.0, custo: 750, cia: 'Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 3,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 7.8,
                    custoTotal: 1100,
                },
                {
                    descricao: 'CWB → GRU → CGB + Ônibus até Alta Floresta',
                    trechos: [
                        { de: 'CWB', para: 'GRU', tempoVooH: 1.0, custo: 350, cia: 'LATAM/Gol/Azul' },
                        { de: 'GRU', para: 'CGB', tempoVooH: 2.0, custo: 520, cia: 'LATAM/Gol/Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2.5,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', tempoH: 12, custo: 180, modal: 'Ônibus' },
                    tempoTotalPortaPortaH: 18.5,
                    custoTotal: 1050,
                },
            ],
        },
        vehicle: {
            distanciaKm: 2050,
            tempoEstimadoH: 26,
            rotaDescricao: 'Curitiba → Londrina → P. Prudente → Três Lagoas → C. Grande → Rondonópolis → Cuiabá → Sinop → Alta Floresta',
            pedagios: 200,
            combustivelEstimado: 750,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 3,
            custoAluguel: 540,
            custoTotalVeiculo: 1490,
            trecho: [],
        },
    },

    // ======================================
    // BRASÍLIA HUB
    // ======================================
    {
        origem: 'Brasília - DF',
        destino: 'Alta Floresta - MT',
        distanciaKm: 1550,
        bus: {
            direto: null,
            alternativas: [
                {
                    descricao: 'Brasília → Cuiabá → Alta Floresta',
                    trechos: [
                        { de: 'Brasília - DF', para: 'Cuiabá - MT', distKm: 1130, tempoH: 16, custo: 240, operadores: ['Real Expresso', 'Eucatur'], tipo: 'leito' },
                        { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', distKm: 800, tempoH: 12, custo: 180, operadores: ['Expresso São Luiz'], tipo: 'convencional' },
                    ],
                    tempoTotalH: 30,
                    custoTotal: 420,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'BSB → CGB → AFL',
                    trechos: [
                        { de: 'BSB', para: 'CGB', tempoVooH: 1.8, custo: 420, cia: 'LATAM/Gol' },
                        { de: 'CGB', para: 'AFL', tempoVooH: 1.2, custo: 350, cia: 'Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2.5,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 6.3,
                    custoTotal: 770,
                },
                {
                    descricao: 'BSB → CGB + Ônibus até Alta Floresta',
                    trechos: [
                        { de: 'BSB', para: 'CGB', tempoVooH: 1.8, custo: 420, cia: 'LATAM/Gol' },
                    ],
                    conexoes: 0,
                    tempoConexaoH: 0,
                    deslocamentoAeroportoOrigemH: 0.5,
                    deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: { de: 'Cuiabá - MT', para: 'Alta Floresta - MT', tempoH: 12, custo: 180, modal: 'Ônibus' },
                    tempoTotalPortaPortaH: 15.3,
                    custoTotal: 600,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1550,
            tempoEstimadoH: 20,
            rotaDescricao: 'Brasília → Goiânia → Cuiabá → Sinop → Alta Floresta',
            pedagios: 140,
            combustivelEstimado: 560,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 2,
            custoAluguel: 360,
            custoTotalVeiculo: 1060,
            trecho: [],
        },
    },

    // ======================================
    // BELO HORIZONTE HUB
    // ======================================
    {
        origem: 'Belo Horizonte - MG',
        destino: 'Londrina - PR',
        distanciaKm: 1050,
        bus: {
            direto: { tempoH: 14, custo: 220, operadores: ['Gontijo', 'Viação Cometa'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'BH → Londrina (direto)',
                    trechos: [{ de: 'Belo Horizonte - MG', para: 'Londrina - PR', distKm: 1050, tempoH: 14, custo: 220, operadores: ['Gontijo', 'Viação Cometa'], tipo: 'leito' }],
                    tempoTotalH: 14,
                    custoTotal: 220,
                    baldeacoes: 0,
                    tempoEspera: 0,
                },
                {
                    descricao: 'BH → São Paulo → Londrina',
                    trechos: [
                        { de: 'Belo Horizonte - MG', para: 'São Paulo - SP', distKm: 590, tempoH: 8, custo: 150, operadores: ['Viação Cometa'], tipo: 'leito' },
                        { de: 'São Paulo - SP', para: 'Londrina - PR', distKm: 540, tempoH: 7.5, custo: 160, operadores: ['Viação Garcia'], tipo: 'leito' },
                    ],
                    tempoTotalH: 17.5,
                    custoTotal: 310,
                    baldeacoes: 1,
                    tempoEspera: 2,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CNF → LDB (via GRU)',
                    trechos: [
                        { de: 'CNF', para: 'GRU', tempoVooH: 1.2, custo: 380, cia: 'LATAM/Gol/Azul' },
                        { de: 'GRU', para: 'LDB', tempoVooH: 1.0, custo: 350, cia: 'Azul' },
                    ],
                    conexoes: 1,
                    tempoConexaoH: 2,
                    deslocamentoAeroportoOrigemH: 0.7,
                    deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null,
                    tempoTotalPortaPortaH: 5.2,
                    custoTotal: 730,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1050,
            tempoEstimadoH: 12,
            rotaDescricao: 'BH → Ribeirão Preto → Marília → Londrina',
            pedagios: 130,
            combustivelEstimado: 380,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: 1,
            custoAluguel: 180,
            custoTotalVeiculo: 690,
            trecho: [],
        },
    },

    // ======================================
    // REMAINING MAJOR ROUTES (from original DB, enriched)
    // ======================================
    {
        origem: 'São Paulo - SP',
        destino: 'Rio de Janeiro - RJ',
        distanciaKm: 430,
        bus: {
            direto: { tempoH: 6, custo: 120, operadores: ['Viação Cometa', 'Viação 1001'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → RJ (direto via Dutra)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Rio de Janeiro - RJ', distKm: 430, tempoH: 6, custo: 120, operadores: ['Viação Cometa', 'Viação 1001'], tipo: 'leito' }],
                    tempoTotalH: 6,
                    custoTotal: 120,
                    baldeacoes: 0,
                    tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → SDU (Ponte Aérea)',
                    trechos: [{ de: 'CGH', para: 'SDU', tempoVooH: 1.0, custo: 350, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 0.5, deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 3.3, custoTotal: 350,
                },
                {
                    descricao: 'GRU → GIG',
                    trechos: [{ de: 'GRU', para: 'GIG', tempoVooH: 1.0, custo: 300, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.7,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.2, custoTotal: 300,
                },
            ],
        },
        vehicle: {
            distanciaKm: 430, tempoEstimadoH: 5.5, rotaDescricao: 'SP → RJ (via Rod. Pres. Dutra)',
            pedagios: 95, combustivelEstimado: 170, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 445,
            trecho: [{ de: 'São Paulo - SP', para: 'Rio de Janeiro - RJ', km: 430, tempoH: 5.5, pedagios: 95 }],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Belo Horizonte - MG',
        distanciaKm: 590,
        bus: {
            direto: { tempoH: 8, custo: 150, operadores: ['Viação Cometa', 'Gontijo'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → BH (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Belo Horizonte - MG', distKm: 590, tempoH: 8, custo: 150, operadores: ['Viação Cometa', 'Gontijo'], tipo: 'leito' }],
                    tempoTotalH: 8, custoTotal: 150, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → CNF (direto)',
                    trechos: [{ de: 'CGH', para: 'CNF', tempoVooH: 1.2, custo: 380, cia: 'LATAM/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 0.5, deslocamentoAeroportoDestinoH: 0.7,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 3.9, custoTotal: 380,
                },
            ],
        },
        vehicle: {
            distanciaKm: 590, tempoEstimadoH: 7, rotaDescricao: 'SP → BH (via Fernão Dias)',
            pedagios: 100, combustivelEstimado: 220, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 500,
            trecho: [{ de: 'São Paulo - SP', para: 'Belo Horizonte - MG', km: 590, tempoH: 7, pedagios: 100 }],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Brasília - DF',
        distanciaKm: 1015,
        bus: {
            direto: { tempoH: 14, custo: 250, operadores: ['Real Expresso', 'Viação Cometa'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Brasília (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Brasília - DF', distKm: 1015, tempoH: 14, custo: 250, operadores: ['Real Expresso', 'Viação Cometa'], tipo: 'leito' }],
                    tempoTotalH: 14, custoTotal: 250, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → BSB (direto)',
                    trechos: [{ de: 'CGH', para: 'BSB', tempoVooH: 1.8, custo: 450, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 0.5, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.3, custoTotal: 450,
                },
                {
                    descricao: 'GRU → BSB (direto)',
                    trechos: [{ de: 'GRU', para: 'BSB', tempoVooH: 1.8, custo: 400, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.8, custoTotal: 400,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1015, tempoEstimadoH: 12, rotaDescricao: 'SP → Ribeirão Preto → Uberlândia → Brasília',
            pedagios: 140, combustivelEstimado: 380, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 700,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Salvador - BA',
        distanciaKm: 1960,
        bus: {
            direto: { tempoH: 28, custo: 350, operadores: ['Viação Itapemirim', 'Gontijo'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Salvador (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Salvador - BA', distKm: 1960, tempoH: 28, custo: 350, operadores: ['Viação Itapemirim', 'Gontijo'], tipo: 'leito' }],
                    tempoTotalH: 28, custoTotal: 350, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → SSA (direto)',
                    trechos: [{ de: 'GRU', para: 'SSA', tempoVooH: 2.3, custo: 550, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 5.3, custoTotal: 550,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1960, tempoEstimadoH: 24, rotaDescricao: 'SP → BH → Vitória da Conquista → Salvador',
            pedagios: 180, combustivelEstimado: 700, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 2, custoAluguel: 360, custoTotalVeiculo: 1240,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Recife - PE',
        distanciaKm: 2660,
        bus: {
            direto: { tempoH: 38, custo: 400, operadores: ['Viação Itapemirim'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Recife (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Recife - PE', distKm: 2660, tempoH: 38, custo: 400, operadores: ['Viação Itapemirim'], tipo: 'leito' }],
                    tempoTotalH: 38, custoTotal: 400, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → REC (direto)',
                    trechos: [{ de: 'GRU', para: 'REC', tempoVooH: 3.2, custo: 650, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 6.2, custoTotal: 650,
                },
            ],
        },
        vehicle: {
            distanciaKm: 2660, tempoEstimadoH: 33, rotaDescricao: 'SP → BH → Salvador → Recife',
            pedagios: 220, combustivelEstimado: 950, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 3, custoAluguel: 540, custoTotalVeiculo: 1710,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Curitiba - PR',
        distanciaKm: 410,
        bus: {
            direto: { tempoH: 6, custo: 100, operadores: ['Viação Catarinense', 'Viação Cometa'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Curitiba (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Curitiba - PR', distKm: 410, tempoH: 6, custo: 100, operadores: ['Viação Catarinense', 'Viação Cometa'], tipo: 'leito' }],
                    tempoTotalH: 6, custoTotal: 100, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → CWB (direto)',
                    trechos: [{ de: 'CGH', para: 'CWB', tempoVooH: 1.0, custo: 320, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 0.5, deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 3.3, custoTotal: 320,
                },
            ],
        },
        vehicle: {
            distanciaKm: 410, tempoEstimadoH: 5, rotaDescricao: 'SP → Curitiba (via Régis Bittencourt)',
            pedagios: 90, combustivelEstimado: 160, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 430,
            trecho: [{ de: 'São Paulo - SP', para: 'Curitiba - PR', km: 410, tempoH: 5, pedagios: 90 }],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Porto Alegre - RS',
        distanciaKm: 1110,
        bus: {
            direto: { tempoH: 15, custo: 220, operadores: ['Viação Planalto', 'Viação Catarinense'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Porto Alegre (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Porto Alegre - RS', distKm: 1110, tempoH: 15, custo: 220, operadores: ['Viação Planalto', 'Viação Catarinense'], tipo: 'leito' }],
                    tempoTotalH: 15, custoTotal: 220, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'CGH → POA (direto)',
                    trechos: [{ de: 'CGH', para: 'POA', tempoVooH: 1.5, custo: 420, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 0.5, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.0, custoTotal: 420,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1110, tempoEstimadoH: 13, rotaDescricao: 'SP → Curitiba → Florianópolis → Porto Alegre',
            pedagios: 160, combustivelEstimado: 410, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 750,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Goiânia - GO',
        distanciaKm: 930,
        bus: {
            direto: { tempoH: 12, custo: 200, operadores: ['Real Expresso', 'Viação Cometa'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Goiânia (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Goiânia - GO', distKm: 930, tempoH: 12, custo: 200, operadores: ['Real Expresso', 'Viação Cometa'], tipo: 'leito' }],
                    tempoTotalH: 12, custoTotal: 200, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → GYN (direto)',
                    trechos: [{ de: 'GRU', para: 'GYN', tempoVooH: 1.5, custo: 420, cia: 'LATAM/Gol' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.5, custoTotal: 420,
                },
            ],
        },
        vehicle: {
            distanciaKm: 930, tempoEstimadoH: 10.5, rotaDescricao: 'SP → Ribeirão Preto → Uberlândia → Goiânia',
            pedagios: 120, combustivelEstimado: 340, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 640,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Fortaleza - CE',
        distanciaKm: 3020,
        bus: {
            direto: { tempoH: 42, custo: 420, operadores: ['Viação Itapemirim'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Fortaleza (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Fortaleza - CE', distKm: 3020, tempoH: 42, custo: 420, operadores: ['Viação Itapemirim'], tipo: 'leito' }],
                    tempoTotalH: 42, custoTotal: 420, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → FOR (direto)',
                    trechos: [{ de: 'GRU', para: 'FOR', tempoVooH: 3.3, custo: 700, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 6.3, custoTotal: 700,
                },
            ],
        },
        vehicle: {
            distanciaKm: 3020, tempoEstimadoH: 38, rotaDescricao: 'SP → BH → Salvador → Recife → Fortaleza',
            pedagios: 250, combustivelEstimado: 1080, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 4, custoAluguel: 720, custoTotalVeiculo: 2050,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Belém - PA',
        distanciaKm: 2930,
        bus: {
            direto: { tempoH: 42, custo: 450, operadores: ['Viação Itapemirim'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Belém (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Belém - PA', distKm: 2930, tempoH: 42, custo: 450, operadores: ['Viação Itapemirim'], tipo: 'leito' }],
                    tempoTotalH: 42, custoTotal: 450, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → BEL (direto)',
                    trechos: [{ de: 'GRU', para: 'BEL', tempoVooH: 3.5, custo: 700, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.5,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 6.5, custoTotal: 700,
                },
            ],
        },
        vehicle: {
            distanciaKm: 2930, tempoEstimadoH: 38, rotaDescricao: 'SP → Brasília → Palmas → Marabá → Belém',
            pedagios: 210, combustivelEstimado: 1050, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 4, custoAluguel: 720, custoTotalVeiculo: 1980,
            trecho: [],
        },
    },

    {
        origem: 'São Paulo - SP',
        destino: 'Campo Grande - MS',
        distanciaKm: 1010,
        bus: {
            direto: { tempoH: 14, custo: 230, operadores: ['Andorinha'], tipo: 'leito' },
            alternativas: [
                {
                    descricao: 'SP → Campo Grande (direto)',
                    trechos: [{ de: 'São Paulo - SP', para: 'Campo Grande - MS', distKm: 1010, tempoH: 14, custo: 230, operadores: ['Andorinha'], tipo: 'leito' }],
                    tempoTotalH: 14, custoTotal: 230, baldeacoes: 0, tempoEspera: 0,
                },
            ],
        },
        air: {
            alternativas: [
                {
                    descricao: 'GRU → CGR (direto)',
                    trechos: [{ de: 'GRU', para: 'CGR', tempoVooH: 1.8, custo: 450, cia: 'LATAM/Gol/Azul' }],
                    conexoes: 0, tempoConexaoH: 0, deslocamentoAeroportoOrigemH: 1.0, deslocamentoAeroportoDestinoH: 0.3,
                    trechoTerrestreFinal: null, tempoTotalPortaPortaH: 4.6, custoTotal: 450,
                },
            ],
        },
        vehicle: {
            distanciaKm: 1010, tempoEstimadoH: 12, rotaDescricao: 'SP → Pres. Prudente → Campo Grande',
            pedagios: 120, combustivelEstimado: 370, consumoMedioKmL: 10, precoLitro: 5.89,
            aluguelDiaria: 180, diasEstimados: 1, custoAluguel: 180, custoTotalVeiculo: 670,
            trecho: [],
        },
    },
];

// ============================================================
// SEARCH & LOOKUP FUNCTIONS
// ============================================================

/**
 * Find an intelligence route (bidirectional)
 */
export function findIntelligenceRoute(origem, destino) {
    const normalize = s => s.toLowerCase().trim();
    const o = normalize(origem);
    const d = normalize(destino);

    return ROUTES_INTELLIGENCE.find(r =>
        (normalize(r.origem) === o && normalize(r.destino) === d) ||
        (normalize(r.origem) === d && normalize(r.destino) === o)
    ) || null;
}

/**
 * Get all Brazilian cities (extended + full IBGE database)
 */
export function getExtendedCities() {
    const extendedNames = new Set(CITIES_EXTENDED.map(c => c.nome));
    const allCities = [...extendedNames, ...ALL_BRAZILIAN_CITIES.filter(c => !extendedNames.has(c))];
    return allCities.sort();
}

/**
 * Search cities by partial name or state abbreviation (searches all 5,571 municipalities)
 */
export function searchExtendedCities(query) {
    if (!query || query.length < 2) return getExtendedCities();
    const q = query.toLowerCase();
    const isUF = q.length === 2;
    return getExtendedCities().filter(c => {
        const lower = c.toLowerCase();
        if (isUF) {
            const uf = c.split(' - ').pop().toLowerCase();
            if (uf === q) return true;
        }
        return lower.includes(q);
    });
}

/**
 * Get city info by name
 */
export function getCityInfo(nome) {
    const normalize = s => s.toLowerCase().trim();
    return CITIES_EXTENDED.find(c => normalize(c.nome) === normalize(nome)) || null;
}

/**
 * Get bus operators for a given UF combination
 */
export function getOperatorsForRoute(ufOrigem, ufDestino) {
    return Object.entries(BUS_OPERATORS)
        .filter(([, data]) => data.regiao.includes(ufOrigem) || data.regiao.includes(ufDestino))
        .map(([nome, data]) => ({ nome, ...data }));
}

/**
 * Estimate a route that doesn't exist in the database using distance approximation
 */
export function estimateRoute(origem, destino) {
    const cityOrigem = getCityInfo(origem);
    const cityDestino = getCityInfo(destino);

    if (!cityOrigem || !cityDestino) return null;

    // Haversine distance approximation
    const R = 6371;
    const dLat = (cityDestino.lat - cityOrigem.lat) * Math.PI / 180;
    const dLng = (cityDestino.lng - cityOrigem.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(cityOrigem.lat * Math.PI / 180) * Math.cos(cityDestino.lat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    const distanciaReta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanciaKm = Math.round(distanciaReta * 1.3); // Road factor 1.3x

    // Estimate times and costs
    const tempoOnibusH = Math.round(distanciaKm / 60 * 10) / 10; // ~60 km/h avg
    const tempoVeiculoH = Math.round(distanciaKm / 80 * 10) / 10; // ~80 km/h avg

    // Air estimation: check if both have airports
    const temAeroportos = cityOrigem.aeroportos.length > 0 && cityDestino.aeroportos.length > 0;
    const tempoAereoBase = distanciaKm / 700; // 700 km/h avg flight speed
    const tempoAereoH = temAeroportos
        ? Math.round((tempoAereoBase + 1.5 + (cityOrigem.hub && cityDestino.hub ? 0 : 2)) * 10) / 10
        : null;

    const custoOnibus = Math.round(distanciaKm * 0.18);
    const custoAereo = temAeroportos ? Math.round(250 + distanciaKm * 0.22) : null;
    const combustivel = Math.round(distanciaKm * 0.59); // R$5.89/L, 10km/L
    const pedagios = Math.round(distanciaKm * 0.08);
    const diasViagem = Math.ceil(tempoVeiculoH / 10);
    const aluguel = diasViagem * 180;

    return {
        origem,
        destino,
        distanciaKm,
        estimado: true,
        bus: {
            direto: tempoOnibusH <= 30 ? { tempoH: tempoOnibusH, custo: custoOnibus, operadores: ['Estimativa'], tipo: 'convencional' } : null,
            alternativas: [{
                descricao: `${origem} → ${destino} (estimativa)`,
                trechos: [{ de: origem, para: destino, distKm: distanciaKm, tempoH: tempoOnibusH, custo: custoOnibus, operadores: ['Estimativa'], tipo: 'convencional' }],
                tempoTotalH: tempoOnibusH,
                custoTotal: custoOnibus,
                baldeacoes: 0,
                tempoEspera: 0,
            }],
        },
        air: temAeroportos ? {
            alternativas: [{
                descricao: `${cityOrigem.aeroportos[0]} → ${cityDestino.aeroportos[0]} (estimativa)`,
                trechos: [{ de: cityOrigem.aeroportos[0], para: cityDestino.aeroportos[0], tempoVooH: tempoAereoBase, custo: custoAereo, cia: 'Estimativa' }],
                conexoes: cityOrigem.hub && cityDestino.hub ? 0 : 1,
                tempoConexaoH: cityOrigem.hub && cityDestino.hub ? 0 : 2,
                deslocamentoAeroportoOrigemH: 0.5,
                deslocamentoAeroportoDestinoH: 0.5,
                trechoTerrestreFinal: null,
                tempoTotalPortaPortaH: tempoAereoH,
                custoTotal: custoAereo,
            }],
        } : { alternativas: [] },
        vehicle: {
            distanciaKm,
            tempoEstimadoH: tempoVeiculoH,
            rotaDescricao: `${origem} → ${destino} (rota estimada)`,
            pedagios,
            combustivelEstimado: combustivel,
            consumoMedioKmL: 10,
            precoLitro: 5.89,
            aluguelDiaria: 180,
            diasEstimados: diasViagem,
            custoAluguel: aluguel,
            custoTotalVeiculo: combustivel + pedagios + aluguel,
            trecho: [],
        },
    };
}

/**
 * Main lookup: find route in DB or estimate
 */
export function getRouteIntelligence(origem, destino) {
    const route = findIntelligenceRoute(origem, destino);
    if (route) return route;
    return estimateRoute(origem, destino);
}

/**
 * Get all available routes in the intelligence DB
 */
export function getAllIntelligenceRoutes() {
    return ROUTES_INTELLIGENCE.map(r => ({
        origem: r.origem,
        destino: r.destino,
        distanciaKm: r.distanciaKm,
    }));
}
