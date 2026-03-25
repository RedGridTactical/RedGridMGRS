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
      from: { lat: from.lat, lon: from.lon, name: from.name || '' },
      to: { lat: to.lat, lon: to.lon, name: to.name || '' },
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
  if (!minutes || minutes <= 0) return '0min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  return `${h}hr ${m}min`;
}
