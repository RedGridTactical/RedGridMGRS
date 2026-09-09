/**
 * GPX/KML Export Utility
 * Generates GPX and KML XML strings from waypoint data.
 * Pure JavaScript — no external dependencies, no network calls.
 */

import { parseMGRSToLatLon } from './mgrs';

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Resolve lat/lon for a waypoint. Uses lat/lon if present, otherwise
 * converts MGRS to lat/lon via parseMGRSToLatLon.
 * @returns {{ lat: number, lon: number } | null}
 */
function resolveCoords(wp) {
  if (!wp) return null;
  if (Number.isFinite(wp.lat) && Number.isFinite(wp.lon) && wp.lat >= -80 && wp.lat <= 84 && wp.lon >= -180 && wp.lon <= 180) {
    return { lat: wp.lat, lon: wp.lon };
  }
  // Explicit invalid coordinates must not silently fall back to an unrelated grid.
  if (wp.lat != null || wp.lon != null) return null;
  if (wp.mgrs) return parseMGRSToLatLon(wp.mgrs);
  return null;
}

const PLAN_FIELDS = ['notes', 'paceMinPerKm', 'plannedStartAt', 'createdAt', 'updatedAt'];
const POINT_FIELDS = ['note', 'source', 'recordedAt', 'accuracyM', 'provenance'];
function extensions(value, fields, format) {
  const fieldValue = key => key === 'provenance' ? JSON.stringify(value[key]) : value[key];
  const entries = fields.filter(key => value?.[key] != null && value[key] !== '').map(key => format === 'kml'
    ? `<Data name="rg_${key}"><value>${escapeXml(fieldValue(key))}</value></Data>`
    : `<rg:${key}>${escapeXml(fieldValue(key))}</rg:${key}>`).join('');
  if (!entries) return '';
  return format === 'kml' ? `<ExtendedData>${entries}</ExtendedData>` : `<extensions>${entries}</extensions>`;
}

/**
 * Export waypoints as a GPX 1.1 XML string.
 * @param {Array} waypoints - Array of { label, mgrs, lat?, lon? }
 * @param {string} name - Name for the GPX document
 * @returns {string} GPX XML string
 */
export function exportAsGPX(waypoints = [], name = 'Red Grid Export', plan = null) {
  const safeName = escapeXml(name);
  const wptEntries = (waypoints || [])
    .map(wp => {
      const coords = resolveCoords(wp);
      if (!coords) return '';
      const label = escapeXml(wp.label || 'WP');
      const mgrs = escapeXml(wp.mgrs || '');
      const tag = plan ? 'rtept' : 'wpt';
      return `  <${tag} lat="${coords.lat}" lon="${coords.lon}">\n    <name>${label}</name>\n    <desc>${mgrs}</desc>\n    ${extensions(wp, POINT_FIELDS, 'gpx')}\n  </${tag}>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Red Grid MGRS"
  xmlns="http://www.topografix.com/GPX/1/1" xmlns:rg="https://redgridtactical.com/xmlns/route/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
${plan ? `<rte>\n<name>${safeName}</name>\n<desc>${escapeXml(plan.notes || '')}</desc>\n${extensions(plan, PLAN_FIELDS, 'gpx')}\n${wptEntries}\n</rte>` : wptEntries}
</gpx>`;
}

/**
 * Export waypoints as a KML 2.2 XML string.
 * @param {Array} waypoints - Array of { label, mgrs, lat?, lon? }
 * @param {string} name - Name for the KML document
 * @returns {string} KML XML string
 */
export function exportAsKML(waypoints = [], name = 'Red Grid Export', plan = null) {
  const safeName = escapeXml(name);
  const placemarks = (waypoints || [])
    .map(wp => {
      const coords = resolveCoords(wp);
      if (!coords) return '';
      const label = escapeXml(wp.label || 'WP');
      const mgrs = escapeXml(wp.mgrs || '');
      return `    <Placemark>\n      <name>${label}</name>\n      <description>${mgrs}</description>\n      ${extensions(wp, POINT_FIELDS, 'kml')}\n      <Point>\n        <coordinates>${coords.lon},${coords.lat},0</coordinates>\n      </Point>\n    </Placemark>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
    ${extensions(plan, PLAN_FIELDS, 'kml')}
${placemarks}
  </Document>
</kml>`;
}
