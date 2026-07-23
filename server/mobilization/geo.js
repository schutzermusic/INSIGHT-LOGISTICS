/**
 * Geo resolver + hub selection for the mobilization search.
 *
 * Reuses the existing in-code Brazilian city dataset (src/engine/
 * routes-intelligence-db.js) — no duplicate geo source. Resolves origin/
 * destination to graph nodes and picks relevant intermediate airport hubs that
 * lie roughly "on the way", so the candidate graph is wide enough for the
 * generator to find multimodal alternatives (§10–11).
 *
 * @module server/mobilization/geo
 */

import { getCityInfo, getCityInfoFuzzy, getExtendedCitiesData } from '../../src/engine/routes-intelligence-db.js';

// UF → IANA timezone (approximate; Brazil no longer observes DST) (§14).
const UF_TZ = {
  AC: 'America/Rio_Branco',
  AM: 'America/Manaus', RR: 'America/Boa_Vista', RO: 'America/Porto_Velho',
  MT: 'America/Cuiaba', MS: 'America/Campo_Grande',
  PA: 'America/Belem', AP: 'America/Belem', TO: 'America/Araguaina',
};
export function tzForUf(uf) {
  return UF_TZ[uf] || 'America/Sao_Paulo';
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
export function roadKm(a, b) {
  return Math.round(haversineKm(a, b) * 1.3);
}

/**
 * Resolve a city name to a graph node.
 * @param {string} name
 * @returns {null|{ id: string, city: string, uf: string, lat: number, lng: number, timezone: string, airports: string[], hub: boolean }}
 */
export function resolveNode(name) {
  const c = getCityInfoFuzzy(name) || getCityInfo(name);
  if (!c || c.lat == null || c.lng == null) return null;
  return {
    id: c.nome,
    city: String(c.nome).split(' - ')[0],
    uf: c.uf,
    lat: c.lat,
    lng: c.lng,
    timezone: tzForUf(c.uf),
    airports: c.aeroportos || [],
    hub: !!c.hub,
  };
}

/**
 * Pick intermediate airport hubs that are roughly on the origin→destination
 * corridor, so multimodal chains (bus→…→flight→…→bus) become possible.
 * @param {object} origin
 * @param {object} destination
 * @param {number} [max]
 * @returns {object[]} hub nodes
 */
export function selectHubs(origin, destination, max = 6) {
  const direct = roadKm(origin, destination);
  const all = getExtendedCitiesData();

  return all
    .filter((c) => c.lat != null && c.aeroportos && c.aeroportos.length > 0)
    .map((c) => {
      const node = {
        id: c.nome,
        city: String(c.nome).split(' - ')[0],
        uf: c.uf,
        lat: c.lat,
        lng: c.lng,
        timezone: tzForUf(c.uf),
        airports: c.aeroportos,
        hub: !!c.hub,
      };
      const detour = roadKm(origin, node) + roadKm(node, destination);
      return { node, detour };
    })
    .filter(({ node, detour }) =>
      node.id !== origin.id && node.id !== destination.id && detour <= direct * 1.6)
    .sort((a, b) => a.detour - b.detour)
    .slice(0, max)
    .map(({ node }) => node);
}
