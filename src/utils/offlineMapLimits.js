/** Import limits for local MBTiles maps. Shared by the importer and the screens that explain it. */
export const OFFLINE_MAP_LIMITS = Object.freeze({
  tiles: 5000,
  archiveBytes: 256 * 1024 * 1024,
  extractedBytes: 128 * 1024 * 1024,
  tileBytes: 512 * 1024,
  reserveBytes: 32 * 1024 * 1024,
});
