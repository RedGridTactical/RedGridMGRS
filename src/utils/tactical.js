/**
 * tactical.js — Pure math utilities for tactical land navigation tools.
 * No external dependencies. No network. No storage.
 */

import { toMGRS, formatMGRS } from './mgrs';
import { geodesicDestination, gridToTrue, trueToGrid, vincentyInverse } from './geodesy';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ─── BACK AZIMUTH ────────────────────────────────────────────────────────────
/**
 * Returns the back azimuth (reciprocal bearing) in degrees 0–360.
 */
export function backAzimuth(bearing) {
  return isBearing(bearing) ? (bearing + 180) % 360 : null;
}

export function isBearing(value) {
  return Number.isFinite(value) && value >= 0 && value <= 360;
}

/** Every displayed absolute bearing names its north reference. */
export function formatBearing(value, reference, pad = false) {
  const suffix = { true: 'T', magnetic: 'M', grid: 'G' }[reference];
  if (!isBearing(value) || !suffix) return '—';
  const degrees = String(Math.round(value) % 360);
  return `${pad ? degrees.padStart(3, '0') : degrees}°${suffix}`;
}

/** No north-up fallback: an arrow relative to the phone needs TRUE heading. */
export function relativeWaypointBearing(trueBearing, heading, reference) {
  if (!isBearing(trueBearing) || !isBearing(heading) || reference !== 'true') return null;
  return (trueBearing - heading + 360) % 360;
}

// ─── DEAD RECKONING ──────────────────────────────────────────────────────────
/**
 * From a known MGRS position, compute new position after traveling
 * `distanceM` ground meters on `headingDeg`. Headings default to true north;
 * callers accepting a grid azimuth must explicitly pass 'grid'.
 * Returns { lat, lon, mgrs, mgrsFormatted }
 */
export function deadReckoning(startLat, startLon, headingDeg, distanceM, headingReference = 'true') {
  if (!isFinite(distanceM) || distanceM < 0) return null;
  if (headingReference !== 'true' && headingReference !== 'grid') return null;
  const trueHeading = headingReference === 'grid'
    ? gridToTrue(headingDeg, startLat, startLon)
    : headingDeg;
  if (trueHeading == null) return null;
  // Ellipsoidal (Vincenty direct), not spherical: DR error lands as displaced
  // POSITION, and this function's output is printed to 1 m of MGRS.
  // geodesicDestination falls back to the sphere if the iteration fails.
  const dest = geodesicDestination(startLat, startLon, trueHeading, distanceM);
  if (!dest) return null;

  const { lat, lon } = dest;
  const mgrs = toMGRS(lat, lon, 5);
  return { lat, lon, mgrs, mgrsFormatted: formatMGRS(mgrs) };
}

/** A magnetic fallback cannot fill a grid azimuth without known declination. */
export function compassToGridHeading(headingDeg, headingReference, lat, lon) {
  if (headingReference !== 'true' || !isBearing(headingDeg)
    || !Number.isFinite(lat) || lat < -80 || lat > 84
    || !Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  return trueToGrid(headingDeg, lat, lon);
}

// ─── RESECTION ───────────────────────────────────────────────────────────────
/**
 * Two-point local resection from TRUE initial bearings FROM the observer TO
 * each landmark. Magnetic input must be explicitly corrected by the caller.
 *
 * A planar intersection provides a nearby seed only. Newton refinement solves
 * the two observer-to-landmark WGS84 inverse azimuths, avoiding both the
 * antipodal intersection and the erroneous assumption that a geodesic's back
 * bearing is its initial bearing +180 at the other endpoint.
 *
 * Bounded to MGRS latitudes, landmarks within 100 km of the result and crossing
 * angles 5–175 degrees. Returns null for invalid, weak or inconsistent geometry.
 */
export function resection(lat1, lon1, bearing1Deg, lat2, lon2, bearing2Deg) {
  const validPoint = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -80 && lat <= 84 && lon >= -180 && lon <= 180;
  if (!validPoint(lat1, lon1) || !validPoint(lat2, lon2)
    || !isBearing(bearing1Deg) || !isBearing(bearing2Deg)) return null;
  const wrapDifference = (a, b) => ((a - b + 540) % 360) - 180;
  const separation = Math.abs(wrapDifference(bearing1Deg, bearing2Deg));
  if (separation < 5 || separation > 175) return null;
  const baseline = vincentyInverse(lat1, lon1, lat2, lon2);
  if (!baseline || baseline.distance < 1 || baseline.distance > 200000) return null;

  const east2 = baseline.distance * Math.sin(baseline.initialBearing * DEG);
  const north2 = baseline.distance * Math.cos(baseline.initialBearing * DEG);
  const u1 = [Math.sin(bearing1Deg * DEG), Math.cos(bearing1Deg * DEG)];
  const u2 = [Math.sin(bearing2Deg * DEG), Math.cos(bearing2Deg * DEG)];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const range1 = -cross([east2, north2], u2) / cross(u1, u2);
  if (!(range1 > 0) || range1 > 120000) return null;
  let east = -range1 * u1[0], north = -range1 * u1[1];

  const evaluate = (e, n) => {
    const range = Math.hypot(e, n);
    if (!Number.isFinite(range) || range > 120000) return null;
    const point = geodesicDestination(lat1, lon1, Math.atan2(e, n) * RAD, range);
    if (!point || !validPoint(point.lat, point.lon)) return null;
    const a = vincentyInverse(point.lat, point.lon, lat1, lon1);
    const b = vincentyInverse(point.lat, point.lon, lat2, lon2);
    if (!a || !b || a.distance < 1 || b.distance < 1) return null;
    return { point, a, b, errors: [wrapDifference(a.initialBearing, bearing1Deg), wrapDifference(b.initialBearing, bearing2Deg)] };
  };

  for (let iteration = 0; iteration < 15; iteration += 1) {
    const current = evaluate(east, north);
    if (!current) return null;
    const [a, b] = current.errors;
    if (Math.max(Math.abs(a), Math.abs(b)) < 1e-7) {
      if (current.a.distance > 100000 || current.b.distance > 100000) return null;
      const { lat, lon } = current.point;
      const mgrs = toMGRS(lat, lon, 5);
      return { lat, lon, mgrs, mgrsFormatted: formatMGRS(mgrs) };
    }
    // One-metre finite differences in the seed's local east/north coordinates.
    const e = evaluate(east + 1, north), n = evaluate(east, north + 1);
    if (!e || !n) return null;
    const j11 = wrapDifference(e.errors[0], a), j12 = wrapDifference(n.errors[0], a);
    const j21 = wrapDifference(e.errors[1], b), j22 = wrapDifference(n.errors[1], b);
    const determinant = j11 * j22 - j12 * j21;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
    east -= (j22 * a - j12 * b) / determinant;
    north -= (j11 * b - j21 * a) / determinant;
  }
  return null;
}

// ─── PACE COUNT ──────────────────────────────────────────────────────────────
/**
 * Convert total paces to distance in metres.
 * pacesPerHundredMeters: user-calibrated (typical: 62–66 for adult male).
 */
export function pacesToDistance(paces, pacesPerHundredMeters) {
  if (!pacesPerHundredMeters || pacesPerHundredMeters <= 0) return 0;
  return (paces / pacesPerHundredMeters) * 100;
}

/**
 * Convert distance in metres to paces.
 */
export function distanceToPaces(meters, pacesPerHundredMeters) {
  return Math.round((meters / 100) * pacesPerHundredMeters);
}

// ─── MAGNETIC DECLINATION ────────────────────────────────────────────────────
/**
 * Apply declination correction to a magnetic bearing.
 * declinationDeg: positive = east, negative = west.
 * Returns TRUE bearing (0–360); grid conversion additionally needs convergence.
 */
export function applyDeclination(magneticBearing, declinationDeg) {
  if (!isBearing(magneticBearing) || !Number.isFinite(declinationDeg) || Math.abs(declinationDeg) > 180) return null;
  return ((magneticBearing + declinationDeg) + 360) % 360;
}

export function removeDeclination(trueBearing, declinationDeg) {
  if (!isBearing(trueBearing) || !Number.isFinite(declinationDeg) || Math.abs(declinationDeg) > 180) return null;
  return ((trueBearing - declinationDeg) + 360) % 360;
}

// ─── TIME-DISTANCE-SPEED ─────────────────────────────────────────────────────
/**
 * Given distance (m) and speed (km/h), returns travel time in minutes.
 */
export function timeToTravel(distanceM, speedKmh) {
  if (!speedKmh || speedKmh <= 0) return null;
  return (distanceM / 1000 / speedKmh) * 60;
}

/**
 * Format minutes as "Xhr Ymin" or just "Ymin".
 */
export function formatMinutes(mins) {
  if (mins == null || isNaN(mins)) return '--';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}min`;
  return `${h}hr ${m}min`;
}

// ─── SOLAR BEARING ───────────────────────────────────────────────────────────
/**
 * Compute approximate solar azimuth (bearing from north, clockwise) for a
 * given date/time (JS Date object) and location (decimal degrees).
 * Accurate to ~1° — sufficient for field orientation.
 */
export function solarBearing(date, lat, lon) {
  const JD = dateToJD(date);
  const n = JD - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const λSun = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const ε = (23.439 - 0.0000004 * n) * DEG;
  const sinDec = Math.sin(ε) * Math.sin(λSun);
  const dec = Math.asin(sinDec);

  // Hour angle
  const UT = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const GMST = (6.697375 + 0.0657098242 * n + UT) % 24;
  const LMST = (GMST + lon / 15 + 24) % 24;
  const HA = (LMST - (λSun * RAD / 15) + 12 + 24) % 24 - 12; // hours
  const H = HA * 15 * DEG; // radians

  const φ = lat * DEG;
  const sinAlt = Math.sin(φ) * sinDec + Math.cos(φ) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const cosAz = (sinDec - Math.sin(φ) * sinAlt) / (Math.cos(φ) * Math.cos(alt));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (Math.sin(H) > 0) az = 360 - az;

  const altDeg = alt * RAD;
  return { azimuth: az, altitude: altDeg, isDay: altDeg > -0.833 };
}

/**
 * Compute approximate lunar azimuth.
 */
export function lunarBearing(date, lat, lon) {
  const JD = dateToJD(date);
  const n = JD - 2451545.0;
  // Simplified lunar position
  const L = (218.316 + 13.176396 * n) % 360;
  const M = ((134.963 + 13.064993 * n) % 360) * DEG;
  const F = ((93.272 + 13.229350 * n) % 360) * DEG;
  const λ = (L + 6.289 * Math.sin(M)) * DEG;
  const β = (5.128 * Math.sin(F)) * DEG;
  const ε = (23.439 - 0.0000004 * n) * DEG;

  const sinDec = Math.sin(ε) * Math.sin(λ) * Math.cos(β) + Math.cos(ε) * Math.sin(β);
  const dec = Math.asin(sinDec);

  const UT = date.getUTCHours() + date.getUTCMinutes() / 60;
  const GMST = (6.697375 + 0.0657098242 * n + UT) % 24;
  const LMST = (GMST + lon / 15 + 24) % 24;
  const RA = Math.atan2(Math.cos(ε) * Math.sin(λ) * Math.cos(β) - Math.sin(ε) * Math.sin(β), Math.cos(λ) * Math.cos(β)) * RAD / 15;
  const HA = (LMST - RA + 24) % 24;
  const H = HA * 15 * DEG;

  const φ = lat * DEG;
  const sinAlt = Math.sin(φ) * sinDec + Math.cos(φ) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const cosAz = (sinDec - Math.sin(φ) * sinAlt) / (Math.cos(φ) * Math.cos(alt));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (Math.sin(H) > 0) az = 360 - az;

  return { azimuth: az, altitude: alt * RAD, isUp: alt * RAD > 0 };
}

function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// ─── MGRS PRECISION ──────────────────────────────────────────────────────────
export const PRECISION_LABELS = {
  1: '10km (2-digit)',
  2: '1km  (4-digit)',
  3: '100m (6-digit)',
  4: '10m  (8-digit)',
  5: '1m  (10-digit)',
};
