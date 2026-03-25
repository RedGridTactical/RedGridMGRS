/**
 * GPX/KML Import Utility
 * Parses GPX and KML XML strings into waypoint arrays.
 * Pure JavaScript — regex-based parsing, no XML library dependency.
 * Handles malformed input gracefully (returns empty array).
 */

/**
 * Parse a GPX XML string into waypoints.
 * Extracts <wpt> elements with lat, lon, name, and elevation.
 * @param {string} xmlString - GPX XML content
 * @returns {Array<{name: string, lat: number, lon: number, elevation?: number}>}
 */
export function parseGPX(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];
  try {
    const waypoints = [];
    const wptRegex = /<wpt\s[^>]*lat\s*=\s*"([^"]*)"[^>]*lon\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/wpt>/gi;
    let match;
    while ((match = wptRegex.exec(xmlString)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const body = match[3];
      const nameMatch = body.match(/<name>([\s\S]*?)<\/name>/i);
      const eleMatch = body.match(/<ele>([\s\S]*?)<\/ele>/i);

      const wp = {
        name: nameMatch ? unescapeXml(nameMatch[1].trim()) : `WP ${waypoints.length + 1}`,
        lat,
        lon,
      };

      if (eleMatch) {
        const ele = parseFloat(eleMatch[1].trim());
        if (!isNaN(ele)) wp.elevation = ele;
      }

      waypoints.push(wp);
    }
    return waypoints;
  } catch {
    return [];
  }
}

/**
 * Parse a KML XML string into waypoints.
 * Extracts <Placemark> elements with <Point><coordinates> data.
 * @param {string} xmlString - KML XML content
 * @returns {Array<{name: string, lat: number, lon: number, elevation?: number}>}
 */
export function parseKML(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];
  try {
    const waypoints = [];
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/gi;
    let match;
    while ((match = placemarkRegex.exec(xmlString)) !== null) {
      const body = match[1];

      // Only parse Point placemarks (skip LineString, Polygon, etc.)
      const coordMatch = body.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
      if (!coordMatch) continue;

      // KML coordinates are lon,lat,alt
      const parts = coordMatch[1].trim().split(',');
      if (parts.length < 2) continue;

      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const nameMatch = body.match(/<name>([\s\S]*?)<\/name>/i);

      const wp = {
        name: nameMatch ? unescapeXml(nameMatch[1].trim()) : `WP ${waypoints.length + 1}`,
        lat,
        lon,
      };

      if (parts.length >= 3) {
        const ele = parseFloat(parts[2]);
        if (!isNaN(ele) && ele !== 0) wp.elevation = ele;
      }

      waypoints.push(wp);
    }
    return waypoints;
  } catch {
    return [];
  }
}

/**
 * Unescape basic XML entities.
 */
function unescapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
