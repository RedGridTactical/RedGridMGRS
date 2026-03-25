/**
 * MGRSGridOverlay — Renders MGRS grid lines as react-native-maps Polylines.
 *
 * At low zoom: 100km Grid Zone Designator boundaries.
 * At higher zoom: 1km grid lines within the visible viewport.
 * Grid lines are semi-transparent, coloured to match theme accent.
 *
 * No network calls. Pure local computation using UTM/MGRS math.
 */
import React, { useMemo } from 'react';
import { useColors } from '../utils/ThemeContext';

let MapPolyline = null;
try {
  const Maps = require('react-native-maps');
  MapPolyline = Maps.Polyline;
} catch {}

/**
 * Convert lat/lon to UTM easting/northing (lightweight, for grid calculation only).
 */
function latLonToUTMSimple(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  let zoneNum = Math.floor((lon + 180) / 6) + 1;
  // Special zones for Norway/Svalbard
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zoneNum = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zoneNum = 31;
    else if (lon >= 9 && lon < 21) zoneNum = 33;
    else if (lon >= 21 && lon < 33) zoneNum = 35;
    else if (lon >= 33 && lon < 42) zoneNum = 37;
  }

  const lonOrigin = (zoneNum - 1) * 6 - 180 + 3;
  const lonOriginRad = (lonOrigin * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
    ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
    ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
    ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad)
  );

  const easting = 0.9996 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const northing = 0.9996 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  return { easting, northing: lat < 0 ? northing + 10000000 : northing, zoneNum };
}

/**
 * Inverse: UTM easting/northing to lat/lon.
 */
function utmToLatLon(easting, northing, zoneNum, southern) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const M = southern ? (northing - 10000000) / k0 : northing / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu +
    (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
    (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3 / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (easting - 500000) / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D ** 2 / 2 -
    (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24 +
    (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
  );

  const lonOrigin = ((zoneNum - 1) * 6 - 180 + 3) * Math.PI / 180;
  const lon = lonOrigin + (
    D -
    (1 + 2 * T1 + C1) * D ** 3 / 6 +
    (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
  ) / Math.cos(phi1);

  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/**
 * Estimate zoom level from region delta.
 */
function regionToZoom(latDelta) {
  return Math.round(Math.log2(360 / latDelta));
}

/**
 * Generate grid lines for the current map viewport.
 * Returns an array of { coordinates: [{latitude, longitude}...], type: '100k' | '1k' }
 */
function computeGridLines(region) {
  if (!region) return [];

  const zoom = regionToZoom(region.latitudeDelta);
  const lines = [];

  const minLat = Math.max(-80, region.latitude - region.latitudeDelta / 2);
  const maxLat = Math.min(84, region.latitude + region.latitudeDelta / 2);
  const minLon = region.longitude - region.longitudeDelta / 2;
  const maxLon = region.longitude + region.longitudeDelta / 2;

  // Always draw UTM zone boundaries (every 6 degrees longitude) — these are 100km GZD boundaries
  const startZoneLon = Math.floor(minLon / 6) * 6;
  for (let lon = startZoneLon; lon <= maxLon; lon += 6) {
    if (lon < minLon - 1) continue;
    lines.push({
      coordinates: [
        { latitude: minLat, longitude: lon },
        { latitude: maxLat, longitude: lon },
      ],
      type: '100k',
    });
  }

  // Latitude band boundaries (every 8 degrees, C through X)
  const startBandLat = Math.floor((minLat + 80) / 8) * 8 - 80;
  for (let lat = startBandLat; lat <= maxLat; lat += 8) {
    if (lat < minLat - 1) continue;
    lines.push({
      coordinates: [
        { latitude: lat, longitude: minLon },
        { latitude: lat, longitude: maxLon },
      ],
      type: '100k',
    });
  }

  // At higher zoom levels (zoom >= 12), add 1km grid lines
  if (zoom >= 12) {
    const centerLat = region.latitude;
    const centerLon = region.longitude;
    const southern = centerLat < 0;

    // Determine UTM zone for the center of the viewport
    const center = latLonToUTMSimple(centerLat, centerLon);
    const zoneNum = center.zoneNum;

    // Calculate UTM bounds for the viewport
    const tl = latLonToUTMSimple(maxLat, minLon);
    const br = latLonToUTMSimple(minLat, maxLon);

    // Round to nearest 1000m (1km)
    const minE = Math.floor(Math.min(tl.easting, br.easting) / 1000) * 1000;
    const maxE = Math.ceil(Math.max(tl.easting, br.easting) / 1000) * 1000;
    const minN = Math.floor(Math.min(tl.northing, br.northing) / 1000) * 1000;
    const maxN = Math.ceil(Math.max(tl.northing, br.northing) / 1000) * 1000;

    // Limit the number of lines to prevent performance issues
    const eastRange = maxE - minE;
    const northRange = maxN - minN;
    if (eastRange < 100000 && northRange < 100000) {
      // Vertical lines (constant easting)
      for (let e = minE; e <= maxE; e += 1000) {
        try {
          const p1 = utmToLatLon(e, minN, zoneNum, southern);
          const p2 = utmToLatLon(e, maxN, zoneNum, southern);
          if (p1 && p2 && isFinite(p1.lat) && isFinite(p2.lat)) {
            lines.push({
              coordinates: [
                { latitude: p1.lat, longitude: p1.lon },
                { latitude: p2.lat, longitude: p2.lon },
              ],
              type: '1k',
            });
          }
        } catch {}
      }

      // Horizontal lines (constant northing)
      for (let n = minN; n <= maxN; n += 1000) {
        try {
          const p1 = utmToLatLon(minE, n, zoneNum, southern);
          const p2 = utmToLatLon(maxE, n, zoneNum, southern);
          if (p1 && p2 && isFinite(p1.lat) && isFinite(p2.lat)) {
            lines.push({
              coordinates: [
                { latitude: p1.lat, longitude: p1.lon },
                { latitude: p2.lat, longitude: p2.lon },
              ],
              type: '1k',
            });
          }
        } catch {}
      }
    }
  }

  return lines;
}

/**
 * MGRSGridOverlay — renders MGRS grid lines on a react-native-maps MapView.
 * @param {object} region - Current map region { latitude, longitude, latitudeDelta, longitudeDelta }
 */
export function MGRSGridOverlay({ region }) {
  const colors = useColors();

  const gridLines = useMemo(() => {
    if (!region) return [];
    return computeGridLines(region);
  }, [
    region?.latitude?.toFixed(3),
    region?.longitude?.toFixed(3),
    region?.latitudeDelta?.toFixed(3),
    region?.longitudeDelta?.toFixed(3),
  ]);

  if (!MapPolyline || !gridLines.length) return null;

  return gridLines.map((line, idx) => (
    <MapPolyline
      key={`grid-${line.type}-${idx}`}
      coordinates={line.coordinates}
      strokeColor={line.type === '100k' ? `${colors.accent}88` : `${colors.accent}44`}
      strokeWidth={line.type === '100k' ? 2 : 1}
      lineDashPattern={line.type === '1k' ? [4, 4] : undefined}
    />
  ));
}

// Export for testing
export { computeGridLines, regionToZoom, latLonToUTMSimple, utmToLatLon };
