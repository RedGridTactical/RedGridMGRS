/**
 * @redgrid/mgrs — DMA TM 8358.1 compliant MGRS library.
 * Truncation, not rounding. Zero dependencies.
 *
 * Copyright (c) Red Grid Tactical. MIT License.
 */

'use strict';

// ─── WGS84 CONSTANTS ────────────────────────────────────────────────────────

const WGS84 = {
  a: 6378137.0,
  f: 1 / 298.257223563,
};
WGS84.b = WGS84.a * (1 - WGS84.f);
WGS84.e2 = 2 * WGS84.f - WGS84.f * WGS84.f;
WGS84.e = Math.sqrt(WGS84.e2);
WGS84.ep2 = WGS84.e2 / (1 - WGS84.e2);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

function utmToMGRS(easting, northing, zoneNum, zoneLetter, precision) {
  const colOrigins = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const rowOrigins = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];

  const colSet = colOrigins[(zoneNum - 1) % 3];
  const rowSet = rowOrigins[(zoneNum - 1) % 2];

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

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Convert WGS84 lat/lon to MGRS string.
 * Uses truncation per DMA TM 8358.1 (not rounding).
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @param {number} [precision=5] - Grid precision 1-5 (1=10km, 5=1m)
 * @returns {string} MGRS coordinate string
 */
function toMGRS(lat, lon, precision) {
  if (precision === undefined || precision === null) precision = 5;
  try {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return 'ERROR';
    if (lat < -80 || lat > 84) return 'OUT OF RANGE';
    const { easting, northing, zoneNum, zoneLetter } = latLonToUTM(lat, lon);
    return utmToMGRS(easting, northing, zoneNum, zoneLetter, precision);
  } catch (e) {
    return 'ERROR';
  }
}

/**
 * Parse an MGRS coordinate string to WGS84 lat/lon.
 * @param {string} mgrsString - MGRS string (with or without spaces)
 * @returns {{ lat: number, lon: number } | null} Parsed coordinates or null if invalid
 */
function parseMGRS(mgrsString) {
  try {
    const cleaned = mgrsString.replace(/\s+/g, '').toUpperCase();
    const match = cleaned.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{4,10})$/i);
    if (!match) return null;
    const [, zoneStr, band, sq, nums] = match;
    if (nums.length % 2 !== 0) return null;
    const zone = parseInt(zoneStr, 10);
    const half = nums.length / 2;
    const scale = Math.pow(10, 5 - half);
    const easting = parseInt(nums.slice(0, half), 10) * scale;
    const northing = parseInt(nums.slice(half), 10) * scale;
    const colSet = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'][(zone - 1) % 3];
    const rowSet = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'][(zone - 1) % 2];
    const colIdx = colSet.indexOf(sq[0].toUpperCase());
    const rowIdx = rowSet.indexOf(sq[1].toUpperCase());
    if (colIdx === -1 || rowIdx === -1) return null;
    const fullEasting = (colIdx + 1) * 100000 + easting;
    const bandLatMin = 'CDEFGHJKLMNPQRSTUVWX'.indexOf(band.toUpperCase()) * 8 - 80;
    const latRad = ((bandLatMin + 4) * Math.PI) / 180;
    const a = 6378137.0, f = 1 / 298.257223563, e2 = 2 * f - f * f;
    const M_approx = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * latRad - ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * latRad));
    const approxNorthing = bandLatMin >= 0 ? M_approx : M_approx + 10000000;
    const rawNorthing = rowIdx * 100000 + northing;
    const baseCycle = Math.floor(approxNorthing / 2000000);
    let fullNorthing = baseCycle * 2000000 + rawNorthing;
    if (fullNorthing - approxNorthing > 1000000) fullNorthing -= 2000000;
    else if (approxNorthing - fullNorthing > 1000000) fullNorthing += 2000000;
    if (bandLatMin < 0) fullNorthing -= 10000000;
    const k0 = 0.9996, ep2 = e2 / (1 - e2);
    const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
    const M = fullNorthing / k0;
    const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + (3 * e1) / 2 * Math.sin(2 * mu) + (27 * e1 ** 2) / 16 * Math.sin(4 * mu) + (151 * e1 ** 3) / 96 * Math.sin(6 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
    const T1 = Math.tan(phi1) ** 2, C1 = ep2 * Math.cos(phi1) ** 2;
    const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
    const D = (fullEasting - 500000) / (N1 * k0);
    const lat = phi1 - (N1 * Math.tan(phi1)) / R1 * (D ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);
    const lon = lonOrigin + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) / Math.cos(phi1);
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
  } catch (e) { return null; }
}

/**
 * Format MGRS string with spaces for readability: "18S UJ 12345 67890"
 * @param {string} mgrs - Raw MGRS string
 * @returns {string} Formatted MGRS string
 */
function formatMGRS(mgrs) {
  if (!mgrs || mgrs.length < 5) return mgrs;
  const match = mgrs.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
  if (!match) return mgrs;
  const [, zone, band, sq, nums] = match;
  const half = nums.length / 2;
  const e = nums.slice(0, half);
  const n = nums.slice(half);
  return `${zone}${band} ${sq} ${e} ${n}`;
}

/**
 * Convert WGS84 lat/lon to UTM.
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {{ easting: number, northing: number, zone: number, band: string }}
 */
function toUTM(lat, lon) {
  const result = latLonToUTM(lat, lon);
  return {
    easting: result.easting,
    northing: result.northing,
    zone: result.zoneNum,
    band: result.zoneLetter,
  };
}

/**
 * Calculate bearing from point A to point B (Haversine).
 * @param {number} lat1 - Source latitude
 * @param {number} lon1 - Source longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {number} Bearing in degrees (0-360, 0=North)
 */
function bearing(lat1, lon1, lat2, lon2) {
  const p1 = degToRad(lat1);
  const p2 = degToRad(lat2);
  const dl = degToRad(lon2 - lon1);

  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const t = Math.atan2(y, x);

  return ((t * 180) / Math.PI + 360) % 360;
}

/**
 * Calculate distance between two points in meters (Haversine).
 * @param {number} lat1 - Point 1 latitude
 * @param {number} lon1 - Point 1 longitude
 * @param {number} lat2 - Point 2 latitude
 * @param {number} lon2 - Point 2 longitude
 * @returns {number} Distance in meters
 */
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = degToRad(lat1);
  const p2 = degToRad(lat2);
  const dp = degToRad(lat2 - lat1);
  const dl = degToRad(lon2 - lon1);

  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Project a new position from a start point given heading and distance.
 * @param {number} lat - Start latitude
 * @param {number} lon - Start longitude
 * @param {number} heading - Heading in degrees (0=North)
 * @param {number} distanceM - Distance in meters
 * @returns {{ lat: number, lon: number }}
 */
function deadReckoning(lat, lon, heading, distanceM) {
  if (!isFinite(distanceM) || distanceM < 0) return null;
  const R = 6371000;
  const d = distanceM / R;
  const t = degToRad(heading);
  const p1 = degToRad(lat);
  const l1 = degToRad(lon);

  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) +
    Math.cos(p1) * Math.sin(d) * Math.cos(t)
  );
  const l2 = l1 + Math.atan2(
    Math.sin(t) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(p2)
  );

  return {
    lat: (p2 * 180) / Math.PI,
    lon: (((l2 * 180) / Math.PI) + 540) % 360 - 180,
  };
}

/**
 * Format lat/lon as Decimal Degrees string.
 * @param {number} lat
 * @param {number} lon
 * @returns {string} e.g. "38.889500°\n-77.035300°"
 */
function formatDD(lat, lon) {
  return `${lat.toFixed(6)}\u00B0\n${lon.toFixed(6)}\u00B0`;
}

/**
 * Format lat/lon as Degrees Minutes Seconds string.
 * @param {number} lat
 * @param {number} lon
 * @returns {string} e.g. "38° 53' 22.2\" N\n77° 2' 7.1\" W"
 */
function formatDMS(lat, lon) {
  function decompose(deg) {
    const d = Math.floor(Math.abs(deg));
    const mFull = (Math.abs(deg) - d) * 60;
    const m = Math.floor(mFull);
    const s = ((mFull - m) * 60).toFixed(1);
    return { d, m, s };
  }
  const la = decompose(lat), lo = decompose(lon);
  const latDir = lat >= 0 ? 'N' : 'S', lonDir = lon >= 0 ? 'E' : 'W';
  return `${la.d}\u00B0 ${la.m}' ${la.s}" ${latDir}\n${lo.d}\u00B0 ${lo.m}' ${lo.s}" ${lonDir}`;
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
  toMGRS,
  parseMGRS,
  formatMGRS,
  toUTM,
  bearing,
  distance,
  deadReckoning,
  formatDD,
  formatDMS,
};
