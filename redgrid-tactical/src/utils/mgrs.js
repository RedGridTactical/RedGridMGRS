/**
 * MGRS Coordinate Conversion Utility
 * Pure JavaScript implementation — no external dependencies, no network calls.
 * Based on the Defense Mapping Agency Technical Manual (DMA TM 8358.1).
 */

const MGRS_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const WGS84 = {
  a: 6378137.0,
  f: 1 / 298.257223563,
};

WGS84.b = WGS84.a * (1 - WGS84.f);
WGS84.e2 = 2 * WGS84.f - WGS84.f * WGS84.f;
WGS84.e = Math.sqrt(WGS84.e2);
WGS84.ep2 = WGS84.e2 / (1 - WGS84.e2);

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function getZoneNumber(lat, lon) {
  // Special zones for Norway/Svalbard
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) return 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) return 31;
    if (lon >= 9 && lon < 21) return 33;
    if (lon >= 21 && lon < 33) return 35;
    if (lon >= 33 && lon < 42) return 37;
  }
  return Math.floor((lon + 180) / 6) + 1;
}

function getZoneLetter(lat) {
  const letters = 'CDEFGHJKLMNPQRSTUVWXX';
  if (lat >= -80 && lat <= 84) {
    return letters[Math.floor((lat + 80) / 8)];
  }
  return null;
}

function latLonToUTM(lat, lon) {
  const latRad = degToRad(lat);
  const lonRad = degToRad(lon);
  const zoneNum = getZoneNumber(lat, lon);
  const lonOrigin = (zoneNum - 1) * 6 - 180 + 3;
  const lonOriginRad = degToRad(lonOrigin);

  const { a, e2, ep2 } = WGS84;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  let easting =
    0.9996 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000;

  let northing =
    0.9996 *
    (M +
      N *
        Math.tan(latRad) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  if (lat < 0) northing += 10000000;

  return {
    easting: Math.round(easting),
    northing: Math.round(northing),
    zoneNum,
    zoneLetter: getZoneLetter(lat),
  };
}

function utmToMGRS(easting, northing, zoneNum, zoneLetter, precision = 5) {
  // Column letter set
  const colSets = 6;
  const colOrigins = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const rowOrigins = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];

  const setNum = ((zoneNum - 1) % colSets) + 1;
  const colSet = colOrigins[Math.floor((setNum - 1) / 2)];
  const rowSet = rowOrigins[(setNum - 1) % 2];

  const colIdx = Math.floor(easting / 100000) - 1;
  const colLetter = colSet[colIdx];

  const rowIdx = Math.floor((northing % 2000000) / 100000);
  const rowLetter = rowSet[rowIdx];

  const e = Math.floor(easting % 100000);
  const n = Math.floor(northing % 100000);

  const divisor = Math.pow(10, 5 - precision);
  const eStr = String(Math.floor(e / divisor)).padStart(precision, '0');
  const nStr = String(Math.floor(n / divisor)).padStart(precision, '0');

  return `${zoneNum}${zoneLetter}${colLetter}${rowLetter}${eStr}${nStr}`;
}

/**
 * Convert WGS84 lat/lon to MGRS string
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @param {number} precision - Grid precision (1-5, default 5 = 1m)
 * @returns {string} MGRS coordinate string
 */
export function toMGRS(lat, lon, precision = 5) {
  try {
    if (lat < -80 || lat > 84) return 'OUT OF RANGE';
    const { easting, northing, zoneNum, zoneLetter } = latLonToUTM(lat, lon);
    return utmToMGRS(easting, northing, zoneNum, zoneLetter, precision);
  } catch (e) {
    return 'ERROR';
  }
}

/**
 * Format MGRS string with spaces for readability: 18S UJ 12345 67890
 * @param {string} mgrs - Raw MGRS string
 * @returns {string} Formatted MGRS string
 */
export function formatMGRS(mgrs) {
  if (!mgrs || mgrs.length < 5) return mgrs;
  // Parse: zone number (1-2 digits) + zone letter (1) + grid square (2) + easting/northing
  const match = mgrs.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
  if (!match) return mgrs;
  const [, zone, band, sq, nums] = match;
  const half = nums.length / 2;
  const e = nums.slice(0, half);
  const n = nums.slice(half);
  return `${zone}${band} ${sq} ${e} ${n}`;
}

/**
 * Calculate bearing from point A to point B
 * @param {number} lat1 - Source latitude
 * @param {number} lon1 - Source longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {number} Bearing in degrees (0-360, 0=North)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = degToRad(lat1);
  const φ2 = degToRad(lat2);
  const Δλ = degToRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = degToRad(lat1);
  const φ2 = degToRad(lat2);
  const Δφ = degToRad(lat2 - lat1);
  const Δλ = degToRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format distance to human-readable string
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
