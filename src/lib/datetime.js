/**
 * Timezone-aware date helpers for the Manual Mobilization Simulator (§23).
 *
 * The labor engine classifies journeys by LOCAL wall-clock time in each
 * activity's IANA timezone, so the UI must convert a local datetime-local value
 * ("YYYY-MM-DDTHH:mm") into a UTC ISO instant using that zone — never by string
 * math (§23). Brazil no longer observes DST, so a single offset pass is exact.
 */

/** IANA zones offered in the manual editor (Brazil corridors, §14). */
export const BR_TIMEZONES = [
  { id: 'America/Sao_Paulo', label: 'Brasília / SP (UTC-3)' },
  { id: 'America/Cuiaba', label: 'Cuiabá / MT (UTC-4)' },
  { id: 'America/Campo_Grande', label: 'Campo Grande / MS (UTC-4)' },
  { id: 'America/Manaus', label: 'Manaus / AM (UTC-4)' },
  { id: 'America/Porto_Velho', label: 'Porto Velho / RO (UTC-4)' },
  { id: 'America/Boa_Vista', label: 'Boa Vista / RR (UTC-4)' },
  { id: 'America/Rio_Branco', label: 'Rio Branco / AC (UTC-5)' },
  { id: 'America/Belem', label: 'Belém / PA (UTC-3)' },
  { id: 'America/Araguaina', label: 'Araguaína / TO (UTC-3)' },
  { id: 'America/Fortaleza', label: 'Fortaleza / NE (UTC-3)' },
];

/**
 * Convert a local wall-clock "YYYY-MM-DDTHH:mm" in `tz` to a UTC ISO string.
 * @param {string} localStr
 * @param {string} tz — IANA timezone
 * @returns {string|null} ISO 8601 UTC, or null when input is empty/invalid
 */
export function zonedLocalToUtcIso(localStr, tz) {
  if (!localStr) return null;
  const [datePart, timePart = '00:00'] = localStr.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;

  const asUtcMs = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(asUtcMs))) parts[p.type] = p.value;
  let ph = Number(parts.hour);
  if (ph === 24) ph = 0;
  const asSeenMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day), ph, Number(parts.minute), Number(parts.second)
  );
  const offset = asSeenMs - asUtcMs;
  return new Date(asUtcMs - offset).toISOString();
}

/** Format a UTC ISO instant as local wall time in `tz` (e.g. "05/01 14:30"). */
export function formatInTz(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/** Human duration from minutes: "6h30", "45min". */
export function formatDuration(min) {
  if (min == null || Number.isNaN(min)) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
