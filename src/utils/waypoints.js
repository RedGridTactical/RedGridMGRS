/** Canonical local field points, used by maps, lists, imports and route snapshots. */
import { toMGRS, formatMGRS, parseMGRSToLatLon } from './mgrs';
import { fieldDataError } from './durableStorage';

export const MAX_WAYPOINT_LISTS = 10;
export const MAX_WAYPOINTS = 20;
let sequence = 0;
export const newFieldId = () => `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export function validFieldPosition(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
    && point.lat >= -80 && point.lat <= 84 && point.lon >= -180 && point.lon <= 180;
}
const text = (value, limit, fallback = '') => String(value ?? fallback).trim().slice(0, limit);
const time = value => Number.isFinite(value) && value > 0 ? value : null;

export function normalizeWaypoint(point, index = 0) {
  // Older lists could store only an MGRS string; migrate only absent coordinates.
  if (point && point.lat == null && point.lon == null && typeof point.mgrs === 'string') {
    const parsed = parseMGRSToLatLon(point.mgrs);
    if (parsed) point = { ...point, lat: parsed.lat, lon: parsed.lon };
  }
  if (!validFieldPosition(point)) throw fieldDataError('INVALID_POINT', 'Waypoint is outside the supported MGRS area');
  const source = ['gps', 'map', 'manual', 'import', 'estimated', 'unknown'].includes(point.source) ? point.source : 'unknown';
  const accuracy = point.accuracyM ?? point.accuracy;
  const result = {
    id: text(point.id, 120, `point-${index}`) || `point-${index}`,
    label: text(point.label || point.name, 80, `WP ${index + 1}`) || `WP ${index + 1}`,
    lat: point.lat, lon: point.lon, mgrs: formatMGRS(toMGRS(point.lat, point.lon, 5)),
    note: text(point.note ?? point.description, 280), source,
    recordedAt: time(point.recordedAt ?? point.createdAt),
    accuracyM: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
  };
  if (source === 'estimated' || point.provenance?.kind === 'dead-reckoning') {
    const p = point.provenance, origin = p?.origin;
    if (!p || p.kind !== 'dead-reckoning' || !validFieldPosition(origin)
      || !['current', 'last-known', 'manual', 'saved'].includes(origin.source)
      || !Number.isFinite(p.gridBearing) || p.gridBearing < 0 || p.gridBearing > 360
      || !Number.isFinite(p.distanceMeters) || p.distanceMeters <= 0 || p.distanceMeters > 10000000
      || !time(p.calculatedAt) || !time(origin.pinnedAt)) throw fieldDataError('INVALID_ESTIMATE', 'Estimate provenance is incomplete');
    result.provenance = { kind: 'dead-reckoning',
      origin: { lat: origin.lat, lon: origin.lon, source: origin.source,
        label: text(origin.label, 80), mgrs: formatMGRS(toMGRS(origin.lat, origin.lon, 5)),
        pinnedAt: origin.pinnedAt, observedAt: time(origin.observedAt),
        accuracy: Number.isFinite(origin.accuracy) && origin.accuracy >= 0 ? origin.accuracy : null },
      gridBearing: p.gridBearing % 360, distanceMeters: p.distanceMeters, calculatedAt: p.calculatedAt };
  }
  if (Number.isFinite(point.elevation)) result.elevation = point.elevation;
  return result;
}

export function normalizePlan(value) {
  return {
    createdAt: time(value.createdAt), updatedAt: time(value.updatedAt),
    paceMinPerKm: Number.isFinite(value.paceMinPerKm) && value.paceMinPerKm >= 1 && value.paceMinPerKm <= 120 ? value.paceMinPerKm : null,
    plannedStartAt: time(value.plannedStartAt), notes: text(value.notes, 500),
  };
}

export function normalizeWaypointList(list, index = 0) {
  if (!list || typeof list !== 'object' || !Array.isArray(list.waypoints) || list.waypoints.length > MAX_WAYPOINTS) {
    throw fieldDataError('INVALID_LIST', 'A route may contain up to 20 valid points');
  }
  const waypoints = list.waypoints.map(normalizeWaypoint);
  if (new Set(waypoints.map(point => point.id)).size !== waypoints.length) {
    throw fieldDataError('DUPLICATE_ID', 'Waypoint IDs must be unique within a route');
  }
  return { id: text(list.id, 120, `list-${index}`) || `list-${index}`, name: text(list.name, 80, 'ROUTE') || 'ROUTE', ...normalizePlan(list), waypoints };
}

export function normalizeWaypointLists(lists) {
  if (!Array.isArray(lists) || lists.length > MAX_WAYPOINT_LISTS) throw fieldDataError('LIST_LIMIT', 'Up to 10 saved routes are supported');
  const normalized = lists.map(normalizeWaypointList);
  if (new Set(normalized.map(list => list.id)).size !== normalized.length) throw fieldDataError('DUPLICATE_ID', 'Route IDs must be unique');
  return normalized;
}
