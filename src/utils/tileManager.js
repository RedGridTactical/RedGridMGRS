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
let tileCacheGeneration = 0;
let recoveryPromise = null;

export function beginTileCacheMutation({ recovery = false } = {}) {
  if (tileCacheMutation) return false;
  tileCacheMutation = true;
  if (!recovery) tileCacheGeneration++;
  return true;
}
export function endTileCacheMutation() { tileCacheMutation = false; }

/** Recover an interrupted directory promotion without discarding the old map. */
export function recoverOfflineTileCache() {
  // Preflight checks multiple zoom levels concurrently. Every reader must wait
  // for the same interrupted promotion, not report missing tiles mid-recovery.
  if (recoveryPromise) return recoveryPromise;
  if (!FileSystem || !TILE_DIR || !beginTileCacheMutation({ recovery: true })) return Promise.resolve(false);
  recoveryPromise = (async () => {
    const previous = await FileSystem.getInfoAsync(TILE_BACKUP_DIR);
    if (!previous.exists) return true;
    const current = await FileSystem.getInfoAsync(TILE_DIR);
    if (!current.exists) {
      tileCacheGeneration++;
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
  if (!(await recoverOfflineTileCache())) return null;
  try {
    const metadata = JSON.parse(await FileSystem.readAsStringAsync(`${TILE_DIR}metadata.json`));
    // A persisted inventory remains authoritative when an entire zoom directory
    // has been lost. Missing files must not silently narrow the required zooms.
    if (Array.isArray(metadata.zoomLevels)) {
      const valid = metadata.zoomLevels.length > 0 && metadata.zoomLevels.every(z => Number.isInteger(z) && z >= 0 && z <= 19);
      return valid ? { ...metadata, zoomLevels: [...new Set(metadata.zoomLevels)].sort((a, b) => a - b) } : { ...metadata, zoomLevels: [], inventoryComplete: false };
    }
    // Older imports only stored min/max and total count. Infer their zoom set
    // only when every original tile is still accounted for. Otherwise a lost
    // intermediate zoom could make the remaining subset appear complete.
    const directories = await FileSystem.readDirectoryAsync(TILE_DIR);
    const zoomLevels = directories.filter(name => /^(?:[0-9]|1[0-9])$/.test(name)).map(Number).sort((a, b) => a - b);
    let tileCount = 0;
    for (const z of zoomLevels) {
      for (const x of await FileSystem.readDirectoryAsync(`${TILE_DIR}${z}/`)) {
        if (!/^\d+$/.test(x) || Number(x) >= 2 ** z) continue;
        const files = await FileSystem.readDirectoryAsync(`${TILE_DIR}${z}/${x}/`);
        tileCount += files.filter(name => /^\d+\.png$/.test(name) && Number(name.slice(0, -4)) < 2 ** z).length;
      }
    }
    const inventoryComplete = tileCount === metadata.tileCount && tileCount > 0 &&
      zoomLevels[0] === metadata.minZoom && zoomLevels[zoomLevels.length - 1] === metadata.maxZoom;
    return { ...metadata, zoomLevels, inventoryComplete };
  } catch { return null; }
}

/** Read local file coverage only, at zoom levels actually present in the import. */
export async function checkImportedMapCoverage(region) {
  const empty = { metadata: null, zoomLevels: [], byZoom: {}, cached: 0, missing: 0, total: 0 };
  if (!region) return { ...empty, state: 'unscoped' };
  if (!validMapRegion(region) || Math.abs(region.latitude) + region.latitudeDelta / 2 > 85.05112878) return { ...empty, state: 'uncheckable' };
  try {
    const generation = tileCacheGeneration;
    const metadata = await getOfflineMapMetadata();
    if (tileCacheMutation || tileCacheGeneration !== generation) return { ...empty, state: 'uncheckable' };
    if (!metadata) return { ...empty, state: 'no_map' };
    const zoomLevels = metadata.zoomLevels;
    const base = { ...empty, metadata, zoomLevels };
    if (!zoomLevels.length || metadata.inventoryComplete === false) return { ...base, state: 'uncheckable' };
    const total = zoomLevels.reduce((sum, z) => sum + countTilesForRegion(region, z), 0);
    // Apply the limit to the entire check, not separately per zoom.
    if (total < 1 || total > CHECK_TILE_CAP) return { ...base, total, state: 'uncheckable' };
    const byZoom = {};
    let cached = 0;
    for (const zoom of zoomLevels) {
      if (tileCacheMutation || tileCacheGeneration !== generation) return { ...base, state: 'uncheckable' };
      const coverage = await checkTilesForRegion(region, [zoom]);
      if (coverage.tooLarge || coverage.unavailable) return { ...base, state: 'uncheckable' };
      byZoom[zoom] = coverage;
      cached += coverage.cached;
    }
    if (tileCacheMutation || tileCacheGeneration !== generation) return { ...base, state: 'uncheckable' };
    return { ...base, byZoom, cached, total, missing: total - cached, state: cached === total ? 'complete' : 'incomplete' };
  } catch { return { ...empty, state: 'uncheckable' }; }
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
  const latRad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
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
  const tiles = [];
  for (const { minX, maxX, minY, maxY } of tileRanges(region, zoom)) {
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) tiles.push({ z: zoom, x, y });
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
  return tileRanges(region, zoom).reduce((sum, r) => sum + (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1), 0);
}

function validMapRegion(region) {
  return region && ['latitude', 'longitude', 'latitudeDelta', 'longitudeDelta'].every(key => Number.isFinite(region[key])) &&
    Math.abs(region.latitude) <= 90 && Math.abs(region.longitude) <= 180 && region.latitudeDelta > 0 && region.longitudeDelta > 0;
}

// Split wrapped viewports so a dateline crossing does not silently omit the
// western half. Merge overlapping low-zoom ranges to count each tile once.
function tileRanges(region, zoom) {
  if (!validMapRegion(region) || !Number.isInteger(zoom) || zoom < 0 || zoom > 19) return [];
  const minY = latLonToTile(region.latitude + region.latitudeDelta / 2, 0, zoom).y;
  const maxY = latLonToTile(region.latitude - region.latitudeDelta / 2, 0, zoom).y;
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const spans = region.longitudeDelta >= 360 ? [[-180, 180]] : west < -180 ? [[west + 360, 180], [-180, east]] :
    east > 180 ? [[west, 180], [-180, east - 360]] : [[west, east]];
  const ranges = spans.map(([a, b]) => ({ minX: latLonToTile(0, a, zoom).x, maxX: latLonToTile(0, b, zoom).x, minY, maxY })).sort((a, b) => a.minX - b.minX);
  if (ranges.length === 2 && ranges[1].minX <= ranges[0].maxX + 1) return [{ ...ranges[0], maxX: Math.max(ranges[0].maxX, ranges[1].maxX) }];
  return ranges;
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
  if (!(await recoverOfflineTileCache())) return { cached: 0, missing: 0, total: 0, unavailable: true };
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
