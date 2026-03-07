/**
 * tactical.js — Pure math utilities for tactical land navigation tools.
 * No external dependencies. No network. No storage.
 */

import { toMGRS, formatMGRS } from './mgrs';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ─── BACK AZIMUTH ────────────────────────────────────────────────────────────
/**
 * Returns the back azimuth (reciprocal bearing) in degrees 0–360.
 */
export function backAzimuth(bearing) {
  return (bearing + 180) % 360;
}

// ─── DEAD RECKONING ──────────────────────────────────────────────────────────
/**
 * From a known MGRS position, compute new position after traveling
 * `distanceM` meters on `headingDeg` (true/grid north).
 * Returns { lat, lon, mgrs, mgrsFormatted }
 */
export function deadReckoning(startLat, startLon, headingDeg, distanceM) {
  if (!isFinite(distanceM) || distanceM < 0) return null;
  const R = 6371000; // Earth radius metres
  const δ = distanceM / R;
  const θ = headingDeg * DEG;
  const φ1 = startLat * DEG;
  const λ1 = startLon * DEG;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  const lat = φ2 * RAD;
  const lon = ((λ2 * RAD) + 540) % 360 - 180;
  const mgrs = toMGRS(lat, lon, 5);
  return { lat, lon, mgrs, mgrsFormatted: formatMGRS(mgrs) };
}

// ─── RESECTION ───────────────────────────────────────────────────────────────
/**
 * Two-point resection: given two known points (lat/lon) and the magnetic
 * bearing FROM your position TO each, compute your position.
 *
 * Uses intersection of two bearing lines (forward intersection geometry).
 * Returns { lat, lon, mgrs, mgrsFormatted } or null if lines are parallel/coincident.
 */
export function resection(lat1, lon1, bearing1Deg, lat2, lon2, bearing2Deg) {
  // Convert to radians
  const φ1 = lat1 * DEG, λ1 = lon1 * DEG;
  const φ2 = lat2 * DEG, λ2 = lon2 * DEG;
  const θ13 = bearing1Deg * DEG; // bearing from pt1 toward unknown
  const θ23 = bearing2Deg * DEG; // bearing from pt2 toward unknown

  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;

  const δ12 = 2 * Math.asin(Math.sqrt(
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  ));

  if (Math.abs(δ12) < 1e-6) return null; // same point

  // Initial/final bearings between the two known points
  const θa = Math.acos(Math.max(-1, Math.min(1, (Math.sin(φ2) - Math.sin(φ1) * Math.cos(δ12)) /
    (Math.sin(δ12) * Math.cos(φ1)))));
  const θb = Math.acos(Math.max(-1, Math.min(1, (Math.sin(φ1) - Math.sin(φ2) * Math.cos(δ12)) /
    (Math.sin(δ12) * Math.cos(φ2)))));

  const θ12 = Math.sin(λ2 - λ1) > 0 ? θa : (2 * Math.PI - θa);
  const θ21 = Math.sin(λ2 - λ1) > 0 ? (2 * Math.PI - θb) : θb;

  const α1 = θ13 - θ12; // angle at pt1
  const α2 = θ21 - θ23; // angle at pt2
  const α3 = Math.acos(Math.max(-1, Math.min(1, -Math.cos(α1) * Math.cos(α2) + Math.sin(α1) * Math.sin(α2) * Math.cos(δ12))));

  const δ13 = Math.atan2(
    Math.sin(δ12) * Math.sin(α1) * Math.sin(α2),
    Math.cos(α2) + Math.cos(α1) * Math.cos(α3)
  );

  const φ3 = Math.asin(
    Math.sin(φ1) * Math.cos(δ13) +
    Math.cos(φ1) * Math.sin(δ13) * Math.cos(θ13)
  );
  const λ3 = λ1 + Math.atan2(
    Math.sin(θ13) * Math.sin(δ13) * Math.cos(φ1),
    Math.cos(δ13) - Math.sin(φ1) * Math.sin(φ3)
  );

  const lat = φ3 * RAD;
  const lon = ((λ3 * RAD) + 540) % 360 - 180;

  if (isNaN(lat) || isNaN(lon)) return null;

  const mgrs = toMGRS(lat, lon, 5);
  return { lat, lon, mgrs, mgrsFormatted: formatMGRS(mgrs) };
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
 * Returns grid/true bearing (0–360).
 */
export function applyDeclination(magneticBearing, declinationDeg) {
  return ((magneticBearing + declinationDeg) + 360) % 360;
}

export function removeDeclination(trueBearing, declinationDeg) {
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
