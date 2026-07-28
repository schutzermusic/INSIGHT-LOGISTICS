const MODE_LABELS = Object.freeze({
  bus: 'Ônibus',
  onibus: 'Ônibus',
  flight: 'Voo',
  aereo: 'Voo',
  waiting: 'Espera',
  wating: 'Espera',
  wait: 'Espera',
  rental_car: 'Veículo locado',
  rental: 'Veículo locado',
  company_car: 'Veículo da frota',
  fleet_car: 'Veículo da frota',
  local_transfer: 'Transfer',
  transfer: 'Transfer',
  hotel_rest: 'Hotel / Descanso',
  hotel: 'Hotel / Descanso',
  meal_break: 'Alimentação',
});

const normalize = (value) => String(value || '')
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export function mobilityModeLabel(mode) {
  return MODE_LABELS[normalize(mode)] || String(mode || '').trim();
}

export function formatMobilitySequence(sequence) {
  const modes = Array.isArray(sequence)
    ? sequence
    : String(sequence || '').split(/\s*\+\s*/).filter(Boolean);
  return modes.map(mobilityModeLabel).join(' + ');
}
