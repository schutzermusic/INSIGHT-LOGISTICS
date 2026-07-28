/**
 * Simplified Brazil national border, as real [lng, lat] degrees.
 *
 * Deliberately NOT the SVG `BRAZIL_PATH` in BrazilMap.jsx — that one is in
 * viewBox units for a flat 2D projection and is meaningless on a globe. These
 * are geographic coordinates, so the outline sits on the actual country.
 *
 * ~45 points: enough to read as Brazil at dashboard zoom, few enough to stay
 * cheap to draw. It traces clockwise from the northern Roraima tip, down the
 * Atlantic coast to Chuí, then back up the western land borders.
 *
 * This is a HUD graphic, not a cartographic source — do not use it for
 * anything that needs real border accuracy.
 */
export const BRAZIL_OUTLINE = [
  // ── North: Roraima → Amapá ──
  [-60.0, 5.2], [-60.7, 4.6], [-59.8, 3.9], [-58.0, 4.1], [-55.9, 2.5],
  [-54.2, 2.2], [-51.6, 4.4], [-50.9, 2.2], [-50.0, 1.8],
  // ── Atlantic coast: Pará → Rio Grande do Sul ──
  [-48.5, -0.7], [-46.0, -1.2], [-44.3, -2.5], [-41.8, -2.9], [-38.5, -3.7],
  [-36.6, -5.0], [-35.2, -5.8], [-34.8, -7.1], [-34.9, -8.05], [-35.7, -9.7],
  [-37.1, -11.0], [-38.5, -13.0], [-39.0, -14.8], [-39.2, -17.7], [-40.3, -20.3],
  [-42.0, -22.9], [-43.2, -23.0], [-46.3, -23.9], [-48.5, -25.5], [-48.5, -27.6],
  [-50.0, -30.0], [-52.3, -32.2], [-53.4, -33.7],
  // ── South and west land borders: Uruguay → Bolivia → Peru ──
  [-55.6, -30.9], [-56.0, -28.5], [-54.6, -25.6], [-54.3, -24.0], [-57.6, -22.1],
  [-58.2, -20.2], [-58.4, -16.3], [-60.2, -15.1], [-60.4, -13.5], [-62.1, -13.0],
  [-65.3, -11.0], [-68.8, -11.0], [-70.6, -9.8], [-72.9, -9.4], [-73.8, -7.3],
  // ── Northwest: Amazonas → Colombia → Venezuela, closing on Roraima ──
  [-72.9, -5.1], [-70.0, -4.4], [-69.4, -1.2], [-69.8, 0.6], [-67.9, 1.7],
  [-67.1, 2.8], [-64.8, 4.2], [-63.4, 3.9], [-61.4, 4.5], [-60.0, 5.2],
];

/** Flat [lng, lat, lng, lat, ...] — the shape Cesium.fromDegreesArray wants. */
export const BRAZIL_OUTLINE_FLAT = BRAZIL_OUTLINE.flat();
