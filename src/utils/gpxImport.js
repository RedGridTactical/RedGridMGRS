/** Bounded, local XML import. No DTD, entity expansion, external resource or network support. */
import { newFieldId, normalizeWaypoint, normalizePlan } from './waypoints';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_NODES = 20000;
const MAX_DEPTH = 64;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const local = name => name.split(':').pop();
const numeric = value => {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
function entities(value) {
  // One pass: &amp;lt; means literal &lt;, not another round of entity expansion.
  return value.replace(/&([^;\s<&]+);|&/g, (match, entity) => {
    const standard = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.prototype.hasOwnProperty.call(standard, entity)) return standard[entity];
    if (/^#(?:x[0-9a-fA-F]+|[0-9]+)$/.test(entity || '')) {
      const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)) return String.fromCodePoint(code);
    }
    return fail('INVALID_XML_ENTITY');
  });
}
function checkSize(xml) {
  if (typeof xml !== 'string' || !xml.trim()) fail('EMPTY_IMPORT');
  if (xml.length > MAX_IMPORT_BYTES) fail('IMPORT_TOO_LARGE');
  let bytes = 0;
  for (const char of xml) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes > MAX_IMPORT_BYTES) fail('IMPORT_TOO_LARGE');
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff)) fail('INVALID_XML');
  }
}
function xmlTree(xml) {
  checkSize(xml);
  xml = xml.replace(/^\uFEFF/, '');
  const document = { name: '', children: [], text: '' };
  const stack = [document];
  let offset = 0, count = 0;
  while (offset < xml.length) {
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset);
      const text = xml.slice(offset, end < 0 ? xml.length : end);
      if (text.includes(']]>')) fail('INVALID_XML');
      stack[stack.length - 1].text += entities(text);
      offset = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4);
      if (end < 0 || xml.slice(offset + 4, end).includes('--')) fail('INVALID_XML');
      offset = end + 3; continue;
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9);
      if (end < 0 || stack.length === 1) fail('INVALID_XML');
      stack[stack.length - 1].text += xml.slice(offset + 9, end);
      offset = end + 3; continue;
    }
    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2);
      if (end < 0) fail('INVALID_XML');
      offset = end + 2; continue;
    }
    if (xml.startsWith('<!', offset)) fail('XML_DECLARATION_UNSUPPORTED');
    // Find the end outside quoted attribute values (which may legally contain '>').
    let end = offset + 1, quote = null;
    for (; end < xml.length; end++) {
      const char = xml[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === xml.length) fail('INVALID_XML');
    const tag = xml.slice(offset + 1, end);
    offset = end + 1;
    if (tag.startsWith('/')) {
      const match = /^\/([A-Za-z_][\w.:-]*)\s*$/.exec(tag);
      if (!match || stack.length === 1 || stack[stack.length - 1].name !== match[1]) fail('INVALID_XML');
      stack.pop(); continue;
    }
    const match = /^([A-Za-z_][\w.:-]*)/.exec(tag);
    if (!match || ++count > MAX_NODES || stack.length > MAX_DEPTH) fail('INVALID_XML');
    const name = match[1];
    let remaining = tag.slice(name.length);
    const selfClosing = /\/\s*$/.test(remaining);
    if (selfClosing) remaining = remaining.replace(/\/\s*$/, '');
    const attrs = {};
    while (remaining.trim()) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(remaining);
      if (!attr || Object.prototype.hasOwnProperty.call(attrs, attr[1]) || attr[3].includes('<')) fail('INVALID_XML');
      attrs[attr[1]] = entities(attr[3]);
      remaining = remaining.slice(attr[0].length);
    }
    const parentNS = stack[stack.length - 1].namespaces || {};
    const namespaces = { ...parentNS };
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'xmlns') namespaces[''] = value;
      else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
    });
    const prefix = name.includes(':') ? name.split(':')[0] : '';
    if (prefix && !namespaces[prefix]) fail('INVALID_XML_NAMESPACE');
    const node = { name, local: local(name), namespace: namespaces[prefix] || '', namespaces, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.text.trim()) fail('INVALID_XML');
  return document.children[0];
}
const child = (node, name) => node.children.find(item => item.local === name);
const childText = (node, name) => child(node, name)?.text?.trim() || '';
function descendants(node, name, result = []) {
  for (const item of node.children) {
    if (item.local === name) result.push(item);
    descendants(item, name, result);
  }
  return result;
}
function attribute(node, name) { return node.attrs[name]; }

const ROUTE_NAMESPACE = 'https://redgridtactical.com/xmlns/route/1';
function gpxMetadata(node) {
  const extensions = child(node, 'extensions');
  const values = {};
  extensions?.children.forEach(item => {
    if (item.namespace === ROUTE_NAMESPACE) values[item.local] = item.text.trim();
  });
  return values;
}
function kmlMetadata(node) {
  const values = {};
  child(node, 'ExtendedData')?.children.forEach(item => {
    if (item.local === 'Data' && item.attrs.name?.startsWith('rg_')) values[item.attrs.name.slice(3)] = childText(item, 'value');
  });
  return values;
}
function provenanceMetadata(text) {
  if (!text) return {};
  try {
    if (text.length > 10000) return { invalidProvenance: true };
    const provenance = JSON.parse(text);
    return provenance?.kind === 'dead-reckoning' ? { provenance } : { invalidProvenance: true };
  } catch { return { invalidProvenance: true }; }
}
function importedPlan(node, metadata) {
  return { name: childText(node, 'name'), notes: metadata.notes || childText(node, 'desc'),
    paceMinPerKm: numeric(metadata.paceMinPerKm), plannedStartAt: numeric(metadata.plannedStartAt),
    createdAt: numeric(metadata.createdAt), updatedAt: numeric(metadata.updatedAt) };
}

function gpxCandidates(root) {
  const candidates = [];
  for (const item of root.children) {
    if (item.local === 'wpt') candidates.push(item);
    if (item.local === 'rte') candidates.push(...item.children.filter(node => node.local === 'rtept'));
    if (item.local === 'trk') candidates.push(...descendants(item, 'trkpt').map(node => ({ ...node, unsupported: true })));
  }
  return candidates.map((node, index) => {
    const lat = numeric(attribute(node, 'lat')), lon = numeric(attribute(node, 'lon'));
    const metadata = gpxMetadata(node);
    const elevationText = childText(node, 'ele');
    const elevation = elevationText ? numeric(elevationText) : undefined;
    return { name: childText(node, 'name') || `WP ${index + 1}`, lat, lon, elevation,
      note: metadata.note || childText(node, 'desc') || childText(node, 'cmt'),
      recordedAt: numeric(metadata.recordedAt), accuracyM: numeric(metadata.accuracyM), ...provenanceMetadata(metadata.provenance),
      invalid: node.unsupported || lat === null || lon === null || elevation === null };
  });
}
function kmlCandidates(root) {
  return descendants(root, 'Placemark').map((node, index) => {
    const metadata = kmlMetadata(node);
    const points = node.children.filter(item => item.local === 'Point');
    const coordinateText = points.length === 1 ? childText(points[0], 'coordinates') : '';
    const parts = coordinateText.trim().split(/\s*,\s*/);
    const lon = numeric(parts[0]), lat = numeric(parts[1]);
    const elevation = parts.length === 3 ? numeric(parts[2]) : undefined;
    return { name: childText(node, 'name') || `WP ${index + 1}`, lat, lon, elevation,
      note: metadata.note || childText(node, 'description'),
      recordedAt: numeric(metadata.recordedAt), accuracyM: numeric(metadata.accuracyM), ...provenanceMetadata(metadata.provenance),
      invalid: points.length !== 1 || parts.length < 2 || parts.length > 3 || lat === null || lon === null || elevation === null };
  });
}
function candidates(xml, format) {
  const root = xmlTree(xml);
  if (!['gpx', 'kml'].includes(root.local) || (format && root.local !== format.toLowerCase())) fail('IMPORT_FORMAT_MISMATCH');
  const plans = root.local === 'gpx' ? root.children.filter(item => item.local === 'rte') : descendants(root, 'Document');
  const plan = plans.length === 1 ? importedPlan(plans[0], root.local === 'gpx' ? gpxMetadata(plans[0]) : kmlMetadata(plans[0])) : null;
  return { format: root.local, plan, warnings: plans.length > 1 ? ['MULTIPLE_PLANS'] : [], candidates: root.local === 'gpx' ? gpxCandidates(root) : kmlCandidates(root) };
}
function validCandidate(point) {
  return !point.invalid && !point.invalidProvenance && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && point.lat >= -80 && point.lat <= 84 && point.lon >= -180 && point.lon <= 180;
}

export function previewWaypointImport(xml, { format, limit = 20, existingPoints = [] } = {}) {
  const result = { format: format || null, points: [], counts: { total: 0, accepted: 0, rejected: 0, truncated: 0, duplicates: 0 }, errors: [], warnings: [], plan: null };
  try {
    if (!Number.isInteger(limit) || limit < 0 || limit > 20) fail('INVALID_IMPORT_LIMIT');
    const parsed = candidates(xml, format);
    result.format = parsed.format;
    result.plan = parsed.plan ? { name: parsed.plan.name.slice(0, 80), ...normalizePlan(parsed.plan) } : null;
    result.warnings = parsed.warnings;
    const identity = point => `${point.lat},${point.lon},${String(point.label || point.name || '').trim()}`;
    const seen = new Set(existingPoints.map(identity));
    for (const point of parsed.candidates) {
      result.counts.total++;
      if (!validCandidate(point)) { result.counts.rejected++; continue; }
      let canonical;
      try { canonical = normalizeWaypoint({ ...point, id: newFieldId(), source: 'import' }, result.points.length); }
      catch { result.counts.rejected++; continue; }
      const key = identity(point);
      if (seen.has(key)) { result.counts.duplicates++; continue; }
      seen.add(key);
      if (result.points.length >= limit) { result.counts.truncated++; continue; }
      result.points.push(canonical);
    }
    result.counts.accepted = result.points.length;
  } catch (error) {
    result.points = [];
    result.errors.push(error.code || 'INVALID_IMPORT');
  }
  return result;
}

// Compatibility readers preserve the established name/lat/lon/elevation shape.
function legacyParse(xml, format) {
  try {
    return candidates(xml, format).candidates.filter(validCandidate).map(point => {
      const result = { name: point.name, lat: point.lat, lon: point.lon };
      if (point.elevation !== undefined) result.elevation = point.elevation;
      return result;
    });
  } catch { return []; }
}
export const parseGPX = xml => legacyParse(xml, 'gpx');
export const parseKML = xml => legacyParse(xml, 'kml');
