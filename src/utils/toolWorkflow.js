import { deadReckoning } from './tactical';
import { toMGRS, formatMGRS, parseMGRSToLatLon } from './mgrs';
import { isFreshPosition } from './position';

/** Accept complete decimal values, never a valid numeric prefix or blank zero. */
export function parseToolNumber(value, { min = -Number.MAX_VALUE, max = Number.MAX_VALUE, integer = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) return null;
  return number;
}

export function validToolPoint(point, { mgrs = false } = {}) {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= (mgrs ? -80 : -90) && point.lat <= (mgrs ? 84 : 90) && point.lon >= -180 && point.lon <= 180;
}

export function manualDROrigin({ format, grid, latitude, longitude }) {
  if (format === 'mgrs') {
    try { const point = parseMGRSToLatLon(grid); return validToolPoint(point, { mgrs: true }) ? point : null; } catch { return null; }
  }
  const lat = parseToolNumber(latitude, { min: -80, max: 84 });
  const lon = parseToolNumber(longitude, { min: -180, max: 180 });
  return lat === null || lon === null ? null : { lat, lon };
}

export function pinDROrigin(point, source, now = Date.now()) {
  if (!validToolPoint(point, { mgrs: true }) || !Number.isFinite(now)) return null;
  if (source === 'current' && !isFreshPosition(point, now)) return null;
  if (source === 'last-known' && (!Number.isFinite(point.timestamp) || point.timestamp <= 0)) return null;
  if (!['current', 'last-known', 'manual', 'saved'].includes(source)) return null;
  return {
    lat: point.lat, lon: point.lon, source, pinnedAt: now,
    label: String(point.label || point.name || '').slice(0, 80),
    mgrs: formatMGRS(toMGRS(point.lat, point.lon, 5)),
    observedAt: Number.isFinite(point.timestamp) ? point.timestamp : null,
    accuracy: Number.isFinite(point.accuracy) && point.accuracy >= 0 ? point.accuracy : null,
  };
}

export function calculatePinnedDR(origin, heading, distance, now = Date.now()) {
  const bearing = parseToolNumber(heading, { min: 0, max: 360 });
  const meters = parseToolNumber(distance, { min: 0, max: 10000000 });
  if (!validToolPoint(origin, { mgrs: true }) || bearing === null || meters === null || meters <= 0) return null;
  try {
    const result = deadReckoning(origin.lat, origin.lon, bearing, meters, 'grid');
    if (!result || !validToolPoint(result, { mgrs: true })) return null;
    return { ...result, provenance: { kind: 'dead-reckoning', origin: { ...origin }, gridBearing: bearing, distanceMeters: meters, calculatedAt: now } };
  } catch { return null; }
}

export function createDeviceAnnotation(position, now = Date.now()) {
  if (!validToolPoint(position, { mgrs: true }) || !isFreshPosition(position, now)) return null;
  return { grid: formatMGRS(toMGRS(position.lat, position.lon, 5)), lat: position.lat, lon: position.lon,
    fixTimestamp: position.timestamp, annotatedAt: now, source: position.source || 'internal',
    accuracy: Number.isFinite(position.accuracy) && position.accuracy >= 0 ? position.accuracy : null };
}

/** Bound output memory while avoiding upscaling a smaller original image. */
export function photoExportSize(width, height, maxEdge = 2048) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(maxEdge) || maxEdge < 1) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatWorkflowUTC(timestamp) {
  if (!Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z') : '—';
}
