/**
 * fieldPack.js — Portable field pack v1.
 *
 * A field pack is one saved route as a small JSON file: checkpoints in order,
 * plan notes, a reference to the map that was imported when it was made, and
 * where and when it came from. It never contains map tiles and nothing in it
 * is fetched, opened or executed. Importing a pack only ever adds a new list.
 */
import { MAX_WAYPOINTS, MAX_WAYPOINT_LISTS, newFieldId, normalizeWaypoint, normalizePlan } from './waypoints';

export const FIELD_PACK_FORMAT = 'redgrid.fieldpack';
export const FIELD_PACK_VERSION = 1;
export const FIELD_PACK_EXTENSION = '.redgridpack.json';
export const FIELD_PACK_MIME = 'application/json';
export const FIELD_PACK_LIMITS = Object.freeze({ bytes: 256 * 1024, points: MAX_WAYPOINTS, nameChars: 80 });

const POINT_SOURCES = ['gps', 'map', 'manual', 'import', 'estimated', 'unknown'];

export function fieldPackError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Printable text only: control characters are removed before length capping.
const clean = (value, limit) => (typeof value === 'string' ? value : '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, limit);
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// Accepts an ISO string or a millisecond timestamp; both are stored as ISO text.
const isoTime = value => {
  const ms = typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : NaN;
  // Beyond ±8.64e15 ms a Date is invalid and toISOString throws.
  return Number.isFinite(ms) && ms > 0 && ms <= 8.64e15 ? new Date(ms).toISOString() : null;
};
const utf8Bytes = text => {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff ? (i++, 4) : 3;
  }
  return bytes;
};

// Deterministic JSON: object keys sorted, so the same content always hashes the same.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Two independent 32-bit multiplicative hashes over the canonical text (one is
// FNV-1a, the other uses a rotated input and swapped constants), joined as 16
// hex characters. It identifies a revision and detects accidental damage or
// casual edits. It is not cryptographic and is not a security signature.
function contentRevision(content) {
  const text = canonical(content);
  let h1 = 0x811c9dc5; let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 3)), 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function packPoint(point) {
  const out = { label: clean(point.label, 80), lat: point.lat, lon: point.lon, mgrs: clean(point.mgrs, 40),
    note: clean(point.note, 280), source: POINT_SOURCES.includes(point.source) ? point.source : 'unknown',
    recordedAt: finite(point.recordedAt), accuracyM: finite(point.accuracyM) };
  if (finite(point.elevation) != null) out.elevation = point.elevation;
  return out;
}

function packMapReference(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const bounds = Array.isArray(metadata.bounds) && metadata.bounds.length === 4 && metadata.bounds.every(v => finite(v) != null)
    ? metadata.bounds.map(Number) : null;
  const zoomLevels = Array.isArray(metadata.zoomLevels)
    ? metadata.zoomLevels.filter(z => Number.isInteger(z) && z >= 0 && z <= 19).slice(0, 20) : [];
  return {
    name: clean(metadata.name, 120) || 'Imported map', attribution: clean(metadata.attribution, 2048),
    bounds, zoomLevels, tileCount: Number.isInteger(metadata.tileCount) && metadata.tileCount >= 0 ? metadata.tileCount : null,
    importedAt: isoTime(metadata.importedAt), tilesIncluded: false,
  };
}

/** A short, human-comparable form of the content revision. */
export const shortRevision = revision => (typeof revision === 'string' ? revision.slice(0, 8).toUpperCase() : '');

/** Count of points per original source in a pack, e.g. { gps: 2, estimated: 1 }. */
export function packPointSources(pack) {
  const counts = {};
  for (const point of pack?.route?.points || []) counts[point.source] = (counts[point.source] || 0) + 1;
  return counts;
}

/**
 * Build a pack from one saved list.
 *
 * Estimated points keep `source: 'estimated'` but are exported as coordinates
 * only: their dead-reckoning origin, bearing and distance are not included.
 * Callers must tell the user (see fieldPack.estimatedNote). `mapMetadata` is the imported map's
 * metadata or null; only its description is referenced, never its tiles.
 */
export function buildFieldPack(list, { mapMetadata = null, appVersion = '', now = Date.now() } = {}) {
  if (!list || !Array.isArray(list.waypoints) || list.waypoints.length === 0) throw fieldPackError('EMPTY_ROUTE');
  if (list.waypoints.length > FIELD_PACK_LIMITS.points) throw fieldPackError('TOO_MANY_POINTS');
  const plan = normalizePlan(list);
  const points = list.waypoints.map((point, index) => packPoint(normalizeWaypoint(point, index)));
  const content = {
    route: { name: clean(list.name, FIELD_PACK_LIMITS.nameChars) || 'ROUTE', notes: clean(plan.notes, 500),
      paceMinPerKm: plan.paceMinPerKm, plannedStartAt: plan.plannedStartAt, points },
    mapReference: packMapReference(mapMetadata),
  };
  return {
    format: FIELD_PACK_FORMAT, version: FIELD_PACK_VERSION,
    revision: contentRevision(content),
    provenance: { app: 'Red Grid MGRS', appVersion: clean(appVersion, 20), exportedAt: new Date(now).toISOString(),
      listUpdatedAt: finite(list.updatedAt) ? new Date(list.updatedAt).toISOString() : null },
    ...content,
  };
}

export function serializeFieldPack(pack) {
  const text = JSON.stringify(pack, null, 1);
  if (utf8Bytes(text) > FIELD_PACK_LIMITS.bytes) throw fieldPackError('TOO_LARGE');
  return text;
}

/** File name made only of safe characters; never a path. */
export function fieldPackFileName(name) {
  const base = clean(String(name ?? ''), 80).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `${base || 'route'}${FIELD_PACK_EXTENSION}`;
}

/**
 * Validate pack text. Returns the normalized pack; throws fieldPackError with
 * code TOO_LARGE | NOT_A_PACK | UNSUPPORTED_VERSION | INVALID_ROUTE | INVALID_POINT | REVISION_MISMATCH.
 * Unknown keys are ignored and never carried into the result.
 */
export function parseFieldPack(text) {
  if (typeof text !== 'string') throw fieldPackError('NOT_A_PACK');
  if (text.length > FIELD_PACK_LIMITS.bytes || utf8Bytes(text) > FIELD_PACK_LIMITS.bytes) throw fieldPackError('TOO_LARGE');
  let raw;
  try { raw = JSON.parse(text); } catch { throw fieldPackError('NOT_A_PACK'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== FIELD_PACK_FORMAT) throw fieldPackError('NOT_A_PACK');
  if (!Number.isInteger(raw.version) || raw.version < 1) throw fieldPackError('NOT_A_PACK');
  if (raw.version > FIELD_PACK_VERSION) throw fieldPackError('UNSUPPORTED_VERSION');
  const route = raw.route;
  if (!route || typeof route !== 'object' || !Array.isArray(route.points) || route.points.length === 0) throw fieldPackError('INVALID_ROUTE');
  if (route.points.length > FIELD_PACK_LIMITS.points) throw fieldPackError('INVALID_ROUTE');

  const points = route.points.map((point, index) => {
    if (!point || typeof point !== 'object' || typeof point.lat !== 'number' || typeof point.lon !== 'number') throw fieldPackError('INVALID_POINT');
    try {
      // Coordinates are authoritative; any MGRS text in the file is recomputed.
      const normalized = normalizeWaypoint({ label: clean(point.label, 80), lat: point.lat, lon: point.lon,
        note: clean(point.note, 280), source: 'unknown', recordedAt: finite(point.recordedAt), accuracyM: finite(point.accuracyM),
        ...(finite(point.elevation) != null ? { elevation: point.elevation } : {}) }, index);
      return packPoint({ ...normalized, source: POINT_SOURCES.includes(point.source) ? point.source : 'unknown' });
    } catch { throw fieldPackError('INVALID_POINT'); }
  });
  const plan = normalizePlan({ notes: typeof route.notes === 'string' ? clean(route.notes, 500) : '',
    paceMinPerKm: route.paceMinPerKm, plannedStartAt: route.plannedStartAt });
  const content = {
    route: { name: clean(route.name, FIELD_PACK_LIMITS.nameChars) || 'ROUTE', notes: plan.notes,
      paceMinPerKm: plan.paceMinPerKm, plannedStartAt: plan.plannedStartAt, points },
    mapReference: packMapReference(raw.mapReference),
  };
  const revision = contentRevision(content);
  if (raw.revision !== revision) throw fieldPackError('REVISION_MISMATCH');
  const provenance = raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : {};
  return {
    format: FIELD_PACK_FORMAT, version: raw.version, revision,
    provenance: { app: clean(provenance.app, 40), appVersion: clean(provenance.appVersion, 20),
      exportedAt: isoTime(provenance.exportedAt), listUpdatedAt: isoTime(provenance.listUpdatedAt) },
    ...content,
  };
}

/**
 * How the pack's map reference relates to the map imported on this device,
 * by description only (name, tile count, bounds). 'same' means the
 * descriptions match; it does not show the tiles are identical or that the
 * route is covered. Coverage must be checked separately.
 */
export function compareMapReference(reference, localMetadata) {
  if (!reference) return 'none';
  if (!localMetadata) return 'absent';
  const sameBounds = Array.isArray(reference.bounds) && Array.isArray(localMetadata.bounds)
    && reference.bounds.every((value, i) => Math.abs(value - localMetadata.bounds[i]) < 1e-6);
  return reference.name === (clean(localMetadata.name, 120) || 'Imported map') && reference.tileCount === localMetadata.tileCount && sameBounds
    ? 'same' : 'different';
}

/** A list name that no existing list uses, so an import can never replace one. */
export function uniqueListName(name, existingLists = []) {
  const taken = new Set(existingLists.map(list => String(list?.name ?? '').toUpperCase()));
  const base = (clean(name, FIELD_PACK_LIMITS.nameChars) || 'ROUTE').toUpperCase();
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, FIELD_PACK_LIMITS.nameChars - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  throw fieldPackError('LIST_LIMIT');
}

/**
 * Turn a validated pack into a brand-new list. Existing lists are only read:
 * fresh ids, a non-colliding name, and every point stored as an imported point.
 */
export function fieldPackToList(pack, existingLists = [], { now = Date.now(), newId = newFieldId } = {}) {
  if (existingLists.length >= MAX_WAYPOINT_LISTS) throw fieldPackError('LIST_LIMIT');
  const ids = new Set(existingLists.map(list => list?.id));
  let id = newId();
  for (let attempt = 0; ids.has(id); attempt++) {
    if (attempt >= 8) throw fieldPackError('ID_UNAVAILABLE');
    id = newId();
  }
  const pointSources = {};
  for (const point of pack.route.points) pointSources[point.source] = (pointSources[point.source] || 0) + 1;
  return {
    id, name: uniqueListName(pack.route.name, existingLists), createdAt: now,
    // The sender's revision, origin and map reference are kept with the list so
    // they survive saving and reopening. The reference is the sender's map, not
    // a statement about maps on this device.
    pack: { revision: pack.revision, version: pack.version, app: pack.provenance.app, appVersion: pack.provenance.appVersion,
      exportedAt: pack.provenance.exportedAt, importedAt: now, pointSources, mapReference: pack.mapReference },
    notes: pack.route.notes, paceMinPerKm: pack.route.paceMinPerKm, plannedStartAt: pack.route.plannedStartAt,
    waypoints: pack.route.points.map(point => ({
      id: newId(), label: point.label, lat: point.lat, lon: point.lon, note: point.note,
      source: 'import', recordedAt: point.recordedAt, accuracyM: null,
      ...(point.elevation != null ? { elevation: point.elevation } : {}),
    })),
  };
}

/**
 * Decide whether a picked file may be read as a pack. Only a local file with
 * a known size within the limit is accepted; anything else is refused before
 * its contents are loaded.
 * @param {{ uri?: string, size?: number }} file  picker result
 * @param {{ exists?: boolean, isDirectory?: boolean, size?: number }} info  file system info for the same uri
 */
export function assertReadablePackFile(file, info) {
  const uri = file?.uri;
  if (typeof uri !== 'string' || !/^file:\/\//i.test(uri)) throw fieldPackError('UNREADABLE');
  if (!info || info.exists !== true || info.isDirectory === true) throw fieldPackError('UNREADABLE');
  const sizes = [file.size, info.size].filter(value => value != null);
  if (!sizes.length || !sizes.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw fieldPackError('UNREADABLE');
  if (Math.max(...sizes) > FIELD_PACK_LIMITS.bytes) throw fieldPackError('TOO_LARGE');
  if (Math.max(...sizes) === 0) throw fieldPackError('NOT_A_PACK');
  return uri;
}
