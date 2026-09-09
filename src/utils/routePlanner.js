/**
 * routePlanner.js — Route planning utilities for mission planning.
 * Pure math, no external dependencies, no network, no storage.
 */

import { calculateDistance, calculateBearing, toMGRS, formatMGRS, formatDistance } from './mgrs';

/**
 * Calculate bearing and distance for each leg, plus total distance.
 * @param {Array<{lat: number, lon: number, name?: string}>} waypoints
 * @returns {{ legs: Array, totalDistance: number }} totalDistance in meters
 */
export function calculateRoute(waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return { legs: [], totalDistance: 0 };
  }
  const legs = getRouteLegs(waypoints);
  const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);
  return { legs, totalDistance };
}

/**
 * Return array of leg objects for consecutive waypoint pairs.
 * @param {Array<{lat: number, lon: number, name?: string}>} waypoints
 * @returns {Array<{from: object, to: object, bearing: number, distance: number, mgrs: string}>}
 */
export function getRouteLegs(waypoints) {
  if (!waypoints || waypoints.length < 2) return [];
  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const distance = calculateDistance(from.lat, from.lon, to.lat, to.lon);
    const bearing = calculateBearing(from.lat, from.lon, to.lat, to.lon);
    const mgrs = toMGRS(to.lat, to.lon, 5);
    legs.push({
      from: { lat: from.lat, lon: from.lon, name: from.label || from.name || '' },
      to: { lat: to.lat, lon: to.lon, name: to.label || to.name || '', note: to.note || '' },
      bearing: Math.round(bearing * 10) / 10,
      distance: Math.round(distance * 10) / 10,
      mgrs: formatMGRS(mgrs),
      distanceFormatted: formatDistance(distance),
    });
  }
  return legs;
}

/**
 * Nearest-neighbor route optimization to minimize total distance.
 * Starts from startPoint, greedily picks the closest unvisited waypoint.
 * @param {Array<{lat: number, lon: number, name?: string}>} waypoints
 * @param {{lat: number, lon: number}} startPoint
 * @returns {Array<{lat: number, lon: number, name?: string}>} reordered waypoints
 */
export function optimizeRoute(waypoints, startPoint) {
  if (!waypoints || waypoints.length <= 1) return waypoints || [];
  if (!startPoint) return [...waypoints];

  const remaining = [...waypoints];
  const ordered = [];
  let current = startPoint;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(current.lat, current.lon, remaining[i].lat, remaining[i].lon);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0];
    ordered.push(nearest);
    current = nearest;
  }

  return ordered;
}

/**
 * Estimate travel time given distance and pace.
 * @param {number} distanceM — distance in meters
 * @param {number} paceMinPerKm — pace in minutes per kilometer
 * @returns {number} estimated time in minutes
 */
export function estimateTime(distanceM, paceMinPerKm) {
  if (!distanceM || distanceM <= 0 || !paceMinPerKm || paceMinPerKm <= 0) return 0;
  return (distanceM / 1000) * paceMinPerKm;
}

/**
 * Format estimated time as "Xhr Ymin" or just "Ymin".
 * @param {number} minutes
 * @returns {string}
 */
export function formatTime(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0min';
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}min`;
  return `${h}hr ${m}min`;
}

/** Move one complete point, retaining its label, notes and provenance. */
export function moveRoutePoint(points, id, direction) {
  if (!Array.isArray(points) || ![-1, 1].includes(direction)) return points;
  const index = points.findIndex(point => point.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= points.length) return points;
  const next = [...points];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Optional planning inputs. UTC is explicit; impossible dates never roll over. */
export function parseRoutePlanInputs({ pace = '', plannedStart = '', notes = '' }) {
  const paceText = String(pace).trim();
  const paceMinPerKm = paceText ? Number(paceText) : null;
  if (paceText && (!/^\d+(?:\.\d+)?$/.test(paceText) || !Number.isFinite(paceMinPerKm)
    || paceMinPerKm < 1 || paceMinPerKm > 120)) throw new Error('invalid-pace');
  const startText = String(plannedStart).trim();
  let plannedStartAt = null;
  if (startText) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startText)) throw new Error('invalid-start');
    plannedStartAt = Date.parse(startText.replace(' ', 'T') + ':00.000Z');
    if (!Number.isFinite(plannedStartAt) || plannedStartAt <= 0
      || new Date(plannedStartAt).toISOString().slice(0, 16).replace('T', ' ') !== startText) {
      throw new Error('invalid-start');
    }
  }
  return { paceMinPerKm, plannedStartAt, notes: String(notes).trim().slice(0, 500) };
}
