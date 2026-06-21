/**
 * routeCard.js — pure helpers for the Route Card feature.
 * No React, no native modules, no network, no storage — safe to unit-test.
 */
import { getRouteLegs } from './routePlanner';
import { formatDistance } from './mgrs';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Tactical date-time group in Zulu: DDHHMMZMONYY (e.g. "211430ZJUN26"). */
export function buildDTG(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}Z` +
    `${MONTHS[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
}

/**
 * Compute the route legs + total distance for a waypoint list.
 * @param {{waypoints: Array<{label?: string, lat: number, lon: number, mgrs?: string}>}} list
 * @returns {{ legs: Array, totalDistance: number }}
 */
export function buildRouteSummary(list) {
  if (!list || !Array.isArray(list.waypoints) || list.waypoints.length < 2) {
    return { legs: [], totalDistance: 0 };
  }
  const pts = list.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, name: w.label }));
  const legs = getRouteLegs(pts);
  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  return { legs, totalDistance };
}

/** Printable text version of a route card (share fallback / copy). */
export function buildRouteCardText(list, legs, totalDistance, dtg) {
  const lines = [];
  lines.push(`ROUTE CARD — ${list.name}`);
  lines.push(`DTG ${dtg}`);
  lines.push(`${legs.length} LEG${legs.length === 1 ? '' : 'S'} · ${formatDistance(totalDistance)} TOTAL`);
  lines.push('');
  const first = list.waypoints[0];
  lines.push(`START  ${first.label}  ${first.mgrs}`);
  legs.forEach((leg, i) => {
    const brg = String(Math.round(leg.bearing)).padStart(3, '0');
    lines.push(`${String(i + 1).padStart(2, '0')}  ${leg.to.name || 'WP'}  ${brg}° / ${leg.distanceFormatted}  ${leg.mgrs}`);
  });
  lines.push('');
  lines.push('Red Grid MGRS · offline · no network');
  return lines.join('\n');
}
