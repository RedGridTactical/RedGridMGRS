/**
 * tileManager.js — Offline OSM tile download and cache manager.
 * Downloads OpenStreetMap tiles for a region at specified zoom levels,
 * stores them locally using expo-file-system for offline map usage.
 *
 * NO tracking, NO analytics. Tiles stored locally only.
 */

let FileSystem = null;
try { FileSystem = require('expo-file-system'); } catch {}

const TILE_DIR = FileSystem?.documentDirectory
  ? `${FileSystem.documentDirectory}map_tiles/`
  : null;

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILE_URL = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';

/**
 * Convert lat/lon to tile coordinates at a given zoom level.
 */
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/**
 * Get the local file path for a tile.
 */
function tilePath(z, x, y) {
  if (!TILE_DIR) return null;
  return `${TILE_DIR}${z}/${x}/${y}.png`;
}

/**
 * Get the remote URL for a tile.
 */
function tileUrl(z, x, y, dark = false) {
  const template = dark ? DARK_TILE_URL : OSM_TILE_URL;
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/**
 * Ensure the directory structure exists for a tile.
 */
async function ensureTileDir(z, x) {
  if (!FileSystem || !TILE_DIR) return;
  const dir = `${TILE_DIR}${z}/${x}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {}
}

/**
 * Check if a specific tile exists locally.
 */
async function tileExists(z, x, y) {
  if (!FileSystem || !TILE_DIR) return false;
  try {
    const path = tilePath(z, x, y);
    if (!path) return false;
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Download a single tile to local storage.
 * @returns {boolean} true if downloaded successfully
 */
async function downloadTile(z, x, y, dark = false) {
  if (!FileSystem || !TILE_DIR) return false;
  try {
    await ensureTileDir(z, x);
    const path = tilePath(z, x, y);
    const url = tileUrl(z, x, y, dark);
    if (!path) return false;

    const result = await FileSystem.downloadAsync(url, path);
    return result?.status === 200;
  } catch {
    return false;
  }
}

/**
 * Get all tile coordinates for a region at a specific zoom level.
 * @param {object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number} zoom - Zoom level (1-19)
 * @returns {Array<{z, x, y}>} Array of tile coordinates
 */
function getTilesForRegion(region, zoom) {
  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;
  const maxLon = region.longitude + region.longitudeDelta / 2;

  const topLeft = latLonToTile(maxLat, minLon, zoom);
  const bottomRight = latLonToTile(minLat, maxLon, zoom);

  const tiles = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/**
 * Download all tiles for a region at specified zoom levels.
 * @param {object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number[]} zoomLevels - Array of zoom levels to download (e.g. [10, 12, 14])
 * @param {function} onProgress - Optional callback: (downloaded, total) => void
 * @param {object} options - { dark: boolean } - download dark CartoDB tiles if true
 * @returns {{ downloaded: number, failed: number, skipped: number, total: number }}
 */
export async function downloadTilesForRegion(region, zoomLevels = [10, 12, 14], onProgress, options = {}) {
  if (!FileSystem || !TILE_DIR) {
    return { downloaded: 0, failed: 0, skipped: 0, total: 0 };
  }

  const dark = options.dark || false;
  let allTiles = [];
  for (const zoom of zoomLevels) {
    allTiles = allTiles.concat(getTilesForRegion(region, zoom));
  }

  const total = allTiles.length;
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  // Download in batches of 5 to avoid overwhelming the network
  const BATCH_SIZE = 5;
  for (let i = 0; i < allTiles.length; i += BATCH_SIZE) {
    const batch = allTiles.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        const exists = await tileExists(z, x, y);
        if (exists) {
          skipped++;
          return;
        }
        const ok = await downloadTile(z, x, y, dark);
        if (ok) downloaded++;
        else failed++;
      })
    );
    if (onProgress) {
      onProgress(downloaded + skipped, total);
    }
  }

  return { downloaded, failed, skipped, total };
}

/**
 * Check if tiles exist for a region at specified zoom levels.
 * @param {object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number[]} zoomLevels - Zoom levels to check
 * @returns {{ cached: number, missing: number, total: number }}
 */
export async function checkTilesForRegion(region, zoomLevels = [10, 12, 14]) {
  if (!FileSystem || !TILE_DIR) {
    return { cached: 0, missing: 0, total: 0 };
  }

  let allTiles = [];
  for (const zoom of zoomLevels) {
    allTiles = allTiles.concat(getTilesForRegion(region, zoom));
  }

  const total = allTiles.length;
  let cached = 0;

  for (const { z, x, y } of allTiles) {
    if (await tileExists(z, x, y)) cached++;
  }

  return { cached, missing: total - cached, total };
}

/**
 * Get the local tile URI if it exists, otherwise return the remote URL.
 * Useful for tile overlay with offline fallback.
 */
export async function getTileUri(z, x, y) {
  if (await tileExists(z, x, y)) {
    return tilePath(z, x, y);
  }
  return tileUrl(z, x, y);
}

/**
 * Clear all cached tiles.
 * @returns {boolean} true if cleared successfully
 */
export async function clearTileCache() {
  if (!FileSystem || !TILE_DIR) return false;
  try {
    const info = await FileSystem.getInfoAsync(TILE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the local path template for LocalTile component.
 * Strips file:// prefix since LocalTile expects a filesystem path.
 * @returns {string|null} Local tile path template, or null if unavailable
 */
export function getLocalTilePathTemplate() {
  if (!TILE_DIR) return null;
  // Strip file:// prefix — LocalTile needs a raw filesystem path
  const dir = TILE_DIR.replace(/^file:\/\//, '');
  return `${dir}{z}/{x}/{y}.png`;
}

// Export helpers for testing
export { latLonToTile, getTilesForRegion, TILE_DIR };
