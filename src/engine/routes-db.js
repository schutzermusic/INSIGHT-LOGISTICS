import BRAZILIAN_CITIES_ALL from '../data/brazilian-cities-db.js';

/**
 * Routes Database — Brazilian intercity route data
 * Covers major capitals and industrial hubs
 * Times in hours, distances in km, costs in BRL (averages)
 */

const CITIES = [
    'São Paulo - SP',
    'Rio de Janeiro - RJ',
    'Belo Horizonte - MG',
    'Brasília - DF',
    'Salvador - BA',
    'Recife - PE',
    'Fortaleza - CE',
    'Manaus - AM',
    'Belém - PA',
    'Curitiba - PR',
    'Porto Alegre - RS',
    'Goiânia - GO',
    'Vitória - ES',
    'Florianópolis - SC',
    'Campo Grande - MS',
    'Cuiabá - MT',
    'Macapá - AP',
    'São Luís - MA',
    'Natal - RN',
    'João Pessoa - PB',
    'Teresina - PI',
    'Maceió - AL',
    'Aracaju - SE',
    'Palmas - TO',
    'Porto Velho - RO',
    'Rio Branco - AC',
    'Boa Vista - RR',
];

/**
 * Route data: [origem, destino, distância_km, tempo_onibus_h, tempo_aereo_h, tempo_veiculo_h, custo_onibus, custo_aereo, custo_km_veiculo]
 * tempo_aereo includes avg connection + airport time
 * custo_km_veiculo = avg fuel + tolls per km
 */
const ROUTES_DATA = [
    // São Paulo hub
    ['São Paulo - SP', 'Rio de Janeiro - RJ', 430, 6, 1.5, 5.5, 120, 450, 0.85],
    ['São Paulo - SP', 'Belo Horizonte - MG', 590, 8, 1.5, 7, 150, 480, 0.80],
    ['São Paulo - SP', 'Brasília - DF', 1015, 14, 2, 12, 250, 650, 0.75],
    ['São Paulo - SP', 'Salvador - BA', 1960, 28, 2.5, 24, 350, 750, 0.70],
    ['São Paulo - SP', 'Recife - PE', 2660, 38, 3.5, 33, 400, 850, 0.68],
    ['São Paulo - SP', 'Fortaleza - CE', 3020, 42, 3.5, 38, 420, 900, 0.68],
    ['São Paulo - SP', 'Manaus - AM', 3870, 56, 4.5, 50, 550, 1200, 0.72],
    ['São Paulo - SP', 'Belém - PA', 2930, 42, 4, 38, 450, 950, 0.70],
    ['São Paulo - SP', 'Curitiba - PR', 410, 6, 1.2, 5, 100, 380, 0.90],
    ['São Paulo - SP', 'Porto Alegre - RS', 1110, 15, 2, 13, 220, 550, 0.85],
    ['São Paulo - SP', 'Goiânia - GO', 930, 12, 1.8, 10.5, 200, 520, 0.75],
    ['São Paulo - SP', 'Vitória - ES', 880, 12, 1.8, 10, 180, 500, 0.80],
    ['São Paulo - SP', 'Florianópolis - SC', 700, 9, 1.5, 8, 160, 420, 0.85],
    ['São Paulo - SP', 'Campo Grande - MS', 1010, 14, 2, 12, 230, 580, 0.72],
    ['São Paulo - SP', 'Cuiabá - MT', 1600, 22, 2.5, 19, 320, 700, 0.70],

    // Rio de Janeiro hub
    ['Rio de Janeiro - RJ', 'Belo Horizonte - MG', 440, 6.5, 1.2, 5.5, 130, 420, 0.82],
    ['Rio de Janeiro - RJ', 'Brasília - DF', 1150, 16, 2, 14, 260, 600, 0.75],
    ['Rio de Janeiro - RJ', 'Salvador - BA', 1650, 24, 2.5, 20, 300, 680, 0.70],
    ['Rio de Janeiro - RJ', 'Vitória - ES', 520, 7, 1.3, 6, 140, 400, 0.82],
    ['Rio de Janeiro - RJ', 'Curitiba - PR', 840, 11, 1.5, 10, 190, 480, 0.85],

    // Belo Horizonte hub
    ['Belo Horizonte - MG', 'Brasília - DF', 740, 10, 1.5, 8.5, 170, 450, 0.75],
    ['Belo Horizonte - MG', 'Salvador - BA', 1370, 20, 2, 16, 280, 600, 0.70],
    ['Belo Horizonte - MG', 'Vitória - ES', 520, 7, 1.3, 6, 140, 380, 0.80],
    ['Belo Horizonte - MG', 'Goiânia - GO', 870, 11, 1.5, 10, 190, 480, 0.72],

    // Brasília hub
    ['Brasília - DF', 'Salvador - BA', 1440, 20, 2.2, 17, 290, 620, 0.70],
    ['Brasília - DF', 'Goiânia - GO', 210, 3, 0.8, 2.5, 60, 280, 0.80],
    ['Brasília - DF', 'Manaus - AM', 3400, 48, 4, 44, 500, 1100, 0.72],
    ['Brasília - DF', 'Belém - PA', 2120, 30, 3, 26, 380, 800, 0.70],
    ['Brasília - DF', 'Palmas - TO', 970, 13, 1.8, 11, 210, 520, 0.70],
    ['Brasília - DF', 'Cuiabá - MT', 1130, 16, 2, 13, 240, 560, 0.70],

    // Salvador hub
    ['Salvador - BA', 'Recife - PE', 840, 12, 1.5, 10, 180, 450, 0.68],
    ['Salvador - BA', 'Aracaju - SE', 330, 5, 1, 4, 90, 320, 0.70],
    ['Salvador - BA', 'Maceió - AL', 630, 9, 1.3, 7.5, 150, 400, 0.68],

    // Recife hub
    ['Recife - PE', 'Fortaleza - CE', 800, 11, 1.5, 10, 170, 420, 0.68],
    ['Recife - PE', 'Natal - RN', 300, 4.5, 1, 3.5, 80, 300, 0.70],
    ['Recife - PE', 'João Pessoa - PB', 120, 2, 0.7, 1.5, 50, 250, 0.72],
    ['Recife - PE', 'Maceió - AL', 260, 4, 1, 3, 75, 300, 0.68],

    // Fortaleza hub
    ['Fortaleza - CE', 'São Luís - MA', 1070, 15, 2, 13, 220, 550, 0.68],
    ['Fortaleza - CE', 'Teresina - PI', 630, 9, 1.5, 7.5, 140, 400, 0.68],
    ['Fortaleza - CE', 'Natal - RN', 530, 7.5, 1.2, 6.5, 130, 380, 0.68],

    // Manaus hub
    ['Manaus - AM', 'Belém - PA', 5300, 72, 2.5, 0, 500, 700, 0],
    ['Manaus - AM', 'Porto Velho - RO', 880, 14, 2, 12, 200, 550, 0.72],
    ['Manaus - AM', 'Boa Vista - RR', 780, 11, 1.5, 9, 180, 480, 0.72],
    ['Manaus - AM', 'Rio Branco - AC', 1450, 22, 2.5, 0, 300, 650, 0],

    // South hub
    ['Curitiba - PR', 'Florianópolis - SC', 300, 4.5, 1, 3.5, 80, 320, 0.88],
    ['Curitiba - PR', 'Porto Alegre - RS', 710, 10, 1.5, 8.5, 170, 450, 0.85],
    ['Porto Alegre - RS', 'Florianópolis - SC', 470, 6.5, 1.2, 5.5, 120, 380, 0.85],

    // Center-West
    ['Goiânia - GO', 'Cuiabá - MT', 890, 12, 1.8, 10.5, 200, 480, 0.70],
    ['Campo Grande - MS', 'Cuiabá - MT', 700, 10, 1.5, 8, 160, 420, 0.70],
];

// Parse into structured objects
const ROUTES = ROUTES_DATA.map(r => ({
    origem: r[0],
    destino: r[1],
    distanciaKm: r[2],
    tempoOnibusH: r[3],
    tempoAereoH: r[4],
    tempoVeiculoH: r[5],
    custoOnibus: r[6],
    custoAereo: r[7],
    custoKmVeiculo: r[8],
}));

/**
 * Search for a route (bidirectional)
 */
export function findRoute(origem, destino) {
    const normalize = s => s.toLowerCase().trim();
    const o = normalize(origem);
    const d = normalize(destino);

    return ROUTES.find(r =>
        (normalize(r.origem) === o && normalize(r.destino) === d) ||
        (normalize(r.origem) === d && normalize(r.destino) === o)
    ) || null;
}

/**
 * Get all available cities (route cities + full IBGE database)
 */
export function getCities() {
    const routeCities = new Set(CITIES);
    const allCities = [...routeCities, ...BRAZILIAN_CITIES_ALL.filter(c => !routeCities.has(c))];
    return allCities.sort();
}

/**
 * Estimate vehicle total cost for a route
 */
export function estimateVehicleCost(route) {
    if (!route || route.custoKmVeiculo === 0) return null;
    const combustivel = route.distanciaKm * route.custoKmVeiculo;
    const pedagios = route.distanciaKm * 0.08; // avg R$0.08/km in tolls
    const aluguel = Math.ceil(route.tempoVeiculoH / 24 + 1) * 180; // R$180/day rental
    return {
        combustivel: Math.round(combustivel),
        pedagios: Math.round(pedagios),
        aluguel: Math.round(aluguel),
        total: Math.round(combustivel + pedagios + aluguel),
    };
}

/**
 * Search cities by partial name or state abbreviation (all 5,571 municipalities)
 */
export function searchCities(query) {
    if (!query || query.length < 2) return getCities();
    const q = query.toLowerCase();
    const isUF = q.length === 2;
    return getCities().filter(c => {
        const lower = c.toLowerCase();
        if (isUF) {
            const uf = c.split(' - ').pop().toLowerCase();
            if (uf === q) return true;
        }
        return lower.includes(q);
    });
}
