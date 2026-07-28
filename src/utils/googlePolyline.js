/**
 * Decode a Google encoded polyline into [longitude, latitude] coordinates.
 *
 * Kept independent from Google Maps so every map renderer (2D and Cesium) uses
 * the exact same route geometry returned by the backend.
 */
export function decodeGooglePolyline(encoded) {
  if (!encoded) return [];

  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let byte;
    let shift = 0;
    let result = 0;
    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([longitude / 1e5, latitude / 1e5]);
  }

  return coordinates;
}
