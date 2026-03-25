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
  if (!str) return '';
  return str
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
  if (wp.lat != null && wp.lon != null && !isNaN(wp.lat) && !isNaN(wp.lon)) {
    return { lat: wp.lat, lon: wp.lon };
  }
  if (wp.mgrs) return parseMGRSToLatLon(wp.mgrs);
  return null;
}

/**
 * Export waypoints as a GPX 1.1 XML string.
 * @param {Array} waypoints - Array of { label, mgrs, lat?, lon? }
 * @param {string} name - Name for the GPX document
 * @returns {string} GPX XML string
 */
export function exportAsGPX(waypoints = [], name = 'Red Grid Export') {
  const safeName = escapeXml(name);
  const wptEntries = (waypoints || [])
    .map(wp => {
      const coords = resolveCoords(wp);
      if (!coords) return '';
      const label = escapeXml(wp.label || 'WP');
      const mgrs = escapeXml(wp.mgrs || '');
      return `  <wpt lat="${coords.lat}" lon="${coords.lon}">\n    <name>${label}</name>\n    <desc>${mgrs}</desc>\n  </wpt>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Red Grid MGRS"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
${wptEntries}
</gpx>`;
}

/**
 * Export waypoints as a KML 2.2 XML string.
 * @param {Array} waypoints - Array of { label, mgrs, lat?, lon? }
 * @param {string} name - Name for the KML document
 * @returns {string} KML XML string
 */
export function exportAsKML(waypoints = [], name = 'Red Grid Export') {
  const safeName = escapeXml(name);
  const placemarks = (waypoints || [])
    .map(wp => {
      const coords = resolveCoords(wp);
      if (!coords) return '';
      const label = escapeXml(wp.label || 'WP');
      const mgrs = escapeXml(wp.mgrs || '');
      return `    <Placemark>\n      <name>${label}</name>\n      <description>${mgrs}</description>\n      <Point>\n        <coordinates>${coords.lon},${coords.lat},0</coordinates>\n      </Point>\n    </Placemark>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
${placemarks}
  </Document>
</kml>`;
}
