/**
 * tileManager.js — Local raster tile cache and map coverage helpers.
 * Public basemap services remain available for interactive viewing. Bulk
 * prefetch requires explicit provider permission and is disabled here.
 *
 * NO tracking, NO analytics. Tiles stored locally only.
 */

let FileSystem = null;
try { FileSystem = require('expo-file-system'); } catch {}

const TILE_DIR = FileSystem?.documentDirectory
  ? `${FileSystem.documentDirectory}map_tiles/`
  : null;

export const TILE_BACKUP_DIR = FileSystem?.documentDirectory
  ? `${FileSystem.documentDirectory}map_tiles_previous/`
  : null;
let tileCacheMutation = false;
let recoveryPromise = null;

export function beginTileCacheMutation() {
  if (tileCacheMutation) return false;
  tileCacheMutation = true;
  return true;
}
export function endTileCacheMutation() { tileCacheMutation = false; }

/** Recover an interrupted directory promotion without discarding the old map. */
export function recoverOfflineTileCache() {
  // Preflight checks multiple zoom levels concurrently. Every reader must wait
  // for the same interrupted promotion, not report missing tiles mid-recovery.
  if (recoveryPromise) return recoveryPromise;
  if (!FileSystem || !TILE_DIR || !beginTileCacheMutation()) return Promise.resolve(false);
  recoveryPromise = (async () => {
    const previous = await FileSystem.getInfoAsync(TILE_BACKUP_DIR);
    if (!previous.exists) return true;
    const current = await FileSystem.getInfoAsync(TILE_DIR);
    if (!current.exists) {
      await FileSystem.moveAsync({ from: TILE_BACKUP_DIR, to: TILE_DIR });
    } else {
      await FileSystem.deleteAsync(TILE_BACKUP_DIR, { idempotent: true });
    }
    return true;
  })().finally(() => {
    recoveryPromise = null;
    endTileCacheMutation();
  });
  return recoveryPromise;
}

export async function getOfflineMapMetadata() {
  if (!FileSystem || !TILE_DIR) return null;
  await recoverOfflineTileCache();
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(`${TILE_DIR}metadata.json`));
  } catch { return null; }
}

// Shared endpoints for interactive map viewing. Imported map packages carry
// their own provider attribution in local metadata.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DARK_TILE_URL = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';
export const TOPO_TILE_URL = 'https://tile.opentopomap.org/{z}/{x}/{y}.png';

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
function tileUrl(z, x, y, style = 'standard') {
  const template = style === 'dark' ? DARK_TILE_URL : style === 'topo' ? TOPO_TILE_URL : OSM_TILE_URL;
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
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
 * Count tiles for a region at a zoom level WITHOUT materializing them.
 * O(1) — safe at any viewport size (a world-view region at zoom 16 is billions
 * of tiles; enumerating that hangs the JS thread, counting it is arithmetic).
 */
function countTilesForRegion(region, zoom) {
  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;
  const maxLon = region.longitude + region.longitudeDelta / 2;

  const topLeft = latLonToTile(maxLat, minLon, zoom);
  const bottomRight = latLonToTile(minLat, maxLon, zoom);

  const w = bottomRight.x - topLeft.x + 1;
  const h = bottomRight.y - topLeft.y + 1;
  return (w > 0 && h > 0) ? w * h : 0;
}

// Enumeration safety caps. Above CHECK_TILE_CAP a coverage check would mean
// that many serial filesystem stats — callers get { tooLarge: true } instead
// and should tell the user to zoom in.
export const CHECK_TILE_CAP = 20000;


/**
 * Existing public providers are not an approved offline map supply.
 * OSM explicitly prohibits prefetch; permission for the other configured
 * endpoints has not been established. Unknown styles must fail closed too.
 */
export function getOfflineDownloadPolicy(style = 'standard') {
  return {
    allowed: false,
    code: 'OFFLINE_PROVIDER_NOT_PERMITTED',
    reason: style === 'standard'
      ? 'OpenStreetMap public tiles do not permit offline downloads. Import a permitted offline map instead.'
      : 'Offline download permission is not established for this map provider. Import a permitted offline map instead.',
  };
}

/** Retained API for existing callers; never downloads or deletes cached maps. */
export async function downloadTilesForRegion(region, zoomLevels, onProgress, options = {}) {
  const style = options.style || (options.dark ? 'dark' : 'standard');
  const policy = getOfflineDownloadPolicy(style);
  return {
    downloaded: 0, failed: 0, skipped: 0, total: 0,
    blocked: true, code: policy.code, reason: policy.reason,
  };
}

/**
 * Check if tiles exist for a region at specified zoom levels.
 * @param {object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number[]} zoomLevels - Zoom levels to check
 * @returns {{ cached: number, missing: number, total: number }}
 */
export async function checkTilesForRegion(region, zoomLevels = [10, 12, 14]) {
  await recoverOfflineTileCache();
  if (!FileSystem || !TILE_DIR) {
    return { cached: 0, missing: 0, total: 0 };
  }

  // Guard: at wide zoom-outs the tile count explodes (country view ≈ millions,
  // world view ≈ billions at z16). Enumerating + stat-ing those hangs the JS
  // thread. Count arithmetically first and bail out with tooLarge instead.
  let estimatedCount = 0;
  for (const zoom of zoomLevels) estimatedCount += countTilesForRegion(region, zoom);
  if (estimatedCount > CHECK_TILE_CAP) {
    return { cached: 0, missing: estimatedCount, total: estimatedCount, tooLarge: true };
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
  await recoverOfflineTileCache();
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
  if (!FileSystem || !TILE_DIR || !beginTileCacheMutation()) return false;
  try {
    await FileSystem.deleteAsync(TILE_BACKUP_DIR, { idempotent: true });
    const info = await FileSystem.getInfoAsync(TILE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
    }
    return true;
  } catch {
    return false;
  } finally {
    endTileCacheMutation();
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

// Average bytes-per-tile, used purely for "this download will cost about ~X MB"
// pre-flight estimates. Real OSM/CARTO 256x256 PNG tiles fall in a 6–35 KB range
// depending on terrain density; 22 KB is a midpoint that matches the long-run
// average observed on Red Grid's existing tile cache. Topo tiles trend higher
// (~30 KB), dark/light are lower (~15–20 KB).
export const AVG_TILE_BYTES = 22 * 1024;

/**
 * Pre-flight estimate for a region + zoom set, with a per-zoom breakdown.
 * No network, no disk I/O — just the same lat/lon math `getTilesForRegion`
 * already uses. Safe to call on every viewport change.
 *
 * @param {object} region - { latitude, longitude, latitudeDelta, longitudeDelta }
 * @param {number[]} zoomLevels - Zoom levels to estimate (defaults match download)
 * @param {number} bytesPerTile - Override average bytes-per-tile if needed
 * @returns {{ totalTiles, byZoom: { [z]: number }, estimatedBytes }}
 */
export function estimateTilesForRegion(region, zoomLevels = [10, 12, 14], bytesPerTile = AVG_TILE_BYTES) {
  // Defensive: missing/zero region → no work
  if (!region || typeof region.latitude !== 'number' || typeof region.longitude !== 'number') {
    return { totalTiles: 0, byZoom: {}, estimatedBytes: 0 };
  }
  if (!Array.isArray(zoomLevels) || zoomLevels.length === 0) {
    return { totalTiles: 0, byZoom: {}, estimatedBytes: 0 };
  }

  const byZoom = {};
  let totalTiles = 0;
  for (const zoom of zoomLevels) {
    if (typeof zoom !== 'number' || zoom < 0 || zoom > 19) continue;
    const count = countTilesForRegion(region, zoom);
    byZoom[zoom] = count;
    totalTiles += count;
  }

  return {
    totalTiles,
    byZoom,
    estimatedBytes: totalTiles * bytesPerTile,
  };
}

// Export helpers for testing
export { latLonToTile, getTilesForRegion, countTilesForRegion, TILE_DIR };
