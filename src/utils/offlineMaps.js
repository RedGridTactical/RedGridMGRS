/** Local MBTiles import. No provider requests, telemetry or remote file reads. */
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Image } from 'react-native';
import {
  TILE_DIR, TILE_BACKUP_DIR, beginTileCacheMutation, endTileCacheMutation,
  recoverOfflineTileCache,
} from './tileManager';

export const OFFLINE_MAP_LIMITS = Object.freeze({
  tiles: 5000,
  archiveBytes: 256 * 1024 * 1024,
  extractedBytes: 128 * 1024 * 1024,
  tileBytes: 512 * 1024,
  reserveBytes: 32 * 1024 * 1024,
});
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function readUint32(bytes, at) {
  return ((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) +
    (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
}

/** Check complete PNG structure and CRCs before handing it to the decoder. */
export function validateRasterPNG(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > OFFLINE_MAP_LIMITS.tileBytes ||
      bytes.length < 57 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) {
    fail('UNSUPPORTED_TILE', 'Use MBTiles containing 256 × 256 PNG raster tiles.');
  }
  let at = 8;
  let hasHeader = false;
  let hasData = false;
  while (at + 12 <= bytes.length) {
    const length = readUint32(bytes, at);
    const end = at + 12 + length;
    if (end > bytes.length) fail('INVALID_TILE', 'A map tile is truncated.');
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    let crc = 0xffffffff;
    for (let i = at + 4; i < end - 4; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== readUint32(bytes, end - 4)) {
      fail('INVALID_TILE', 'A map tile failed its integrity check.');
    }
    if (!hasHeader && type !== 'IHDR') fail('INVALID_TILE', 'A map tile has no PNG header.');
    if (type === 'IHDR') {
      if (hasHeader || length !== 13 || readUint32(bytes, at + 8) !== 256 || readUint32(bytes, at + 12) !== 256) {
        fail('UNSUPPORTED_TILE', 'Only 256 × 256 PNG tiles are supported.');
      }
      hasHeader = true;
    }
    if (type === 'IDAT') hasData = true;
    if (type === 'IEND') {
      if (length !== 0 || !hasData || end !== bytes.length) fail('INVALID_TILE', 'A map tile is incomplete.');
      return true;
    }
    at = end;
  }
  fail('INVALID_TILE', 'A map tile has no PNG end marker.');
}

function toBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    result += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < bytes.length ? BASE64[c & 63] : '=');
  }
  return result;
}
function cancelled(shouldCancel) {
  if (shouldCancel?.()) fail('IMPORT_CANCELLED', 'Map import cancelled. Your previous map is unchanged.');
}
function plainText(value, maxLength) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}
function latitudeAtTile(y, n) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
}
async function assertSpace(bytes) {
  const free = await FileSystem.getFreeDiskStorageAsync();
  if (!Number.isFinite(free) || free < bytes + OFFLINE_MAP_LIMITS.reserveBytes) {
    fail('INSUFFICIENT_STORAGE', 'There is not enough free storage to safely import this map.');
  }
}
async function verifyDecodedTile(uri) {
  await new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => {
      if (width === 256 && height === 256) resolve();
      else reject(Object.assign(new Error('Only 256 × 256 PNG tiles are supported.'), { code: 'UNSUPPORTED_TILE' }));
    }, () => reject(Object.assign(new Error('A map tile could not be decoded.'), { code: 'INVALID_TILE' })));
  });
}

/**
 * Import a document-picker file:// copy of an MBTiles 1.x PNG map.
 * The source is copied, opened query-only, validated and extracted to staging.
 * Replacement happens only after every tile decodes; failed promotion restores
 * the previous directory. recoverOfflineTileCache handles an interrupted swap.
 * Bounds are derived from actual tile coordinates, never trusted from metadata.
 */
export async function importRasterMBTiles(uri, { onProgress, shouldCancel } = {}) {
  if (!TILE_DIR || !FileSystem.documentDirectory || !/^file:\/\//.test(uri || '')) {
    fail('LOCAL_FILE_REQUIRED', 'Choose a local MBTiles file from Files.');
  }
  await recoverOfflineTileCache();
  if (!beginTileCacheMutation()) fail('IMPORT_BUSY', 'Another map operation is already running.');
  const staging = `${FileSystem.documentDirectory}map_import_${Date.now()}_${Math.random().toString(36).slice(2)}/`;
  const extracted = `${staging}tiles/`;
  let db = null;
  let previousMoved = false;
  try {
    cancelled(shouldCancel);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || !Number.isFinite(info.size) ||
        info.size < 100 || info.size > OFFLINE_MAP_LIMITS.archiveBytes) {
      fail('INVALID_MAP_FILE', 'Choose an MBTiles file no larger than 256 MB.');
    }
    await assertSpace(info.size);
    await FileSystem.makeDirectoryAsync(extracted, { intermediates: true });
    const databaseUri = `${staging}source.mbtiles`;
    await FileSystem.copyAsync({ from: uri, to: databaseUri });
    const header = await FileSystem.readAsStringAsync(databaseUri, {
      encoding: FileSystem.EncodingType.Base64, position: 0, length: 16,
    });
    if (header !== 'U1FMaXRlIGZvcm1hdCAzAA==') fail('INVALID_MAP_FILE', 'This file is not a SQLite MBTiles map.');
    cancelled(shouldCancel);
    // SDK 53 has no readOnly open option. Work only on our copied database.
    db = await SQLite.openDatabaseAsync('source.mbtiles', { useNewConnection: true }, staging);
    await db.execAsync('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
    const metadataRows = await db.getAllAsync('SELECT name, value FROM metadata LIMIT 129');
    if (metadataRows.length > 128) fail('INVALID_MAP_FILE', 'This map has too much metadata.');
    const values = Object.create(null);
    for (const row of metadataRows) {
      if (typeof row.name !== 'string' || typeof row.value !== 'string' || row.value.length > 8192 || values[row.name] !== undefined) {
        fail('INVALID_MAP_FILE', 'This map has invalid metadata.');
      }
      values[row.name] = row.value;
    }
    if (values.format?.toLowerCase() !== 'png' || (values.scheme && values.scheme.toLowerCase() !== 'tms')) {
      fail('UNSUPPORTED_MAP', 'Use a raster MBTiles map with PNG tiles and TMS tile rows. Vector, JPEG and XYZ archives are not supported.');
    }
    const stats = await db.getFirstAsync(`SELECT COUNT(*) AS total, SUM(length(tile_data)) AS bytes, MAX(length(tile_data)) AS largest
      FROM (SELECT tile_data FROM tiles LIMIT ${OFFLINE_MAP_LIMITS.tiles + 1})`);
    if (!stats || stats.total < 1 || stats.total > OFFLINE_MAP_LIMITS.tiles || !Number.isFinite(stats.bytes) ||
        stats.bytes > OFFLINE_MAP_LIMITS.extractedBytes || stats.largest > OFFLINE_MAP_LIMITS.tileBytes) {
      fail('MAP_LIMIT_EXCEEDED', 'Use a map with 1–5,000 tiles and at most 128 MB of PNG tile data.');
    }
    await assertSpace(stats.bytes);
    cancelled(shouldCancel);
    const seen = new Set();
    const directories = new Set();
    let imported = 0, bytes = 0, minZoom = 19, maxZoom = 0;
    let west = 180, south = 90, east = -180, north = -90;
    for await (const row of db.getEachAsync(`SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles LIMIT ${OFFLINE_MAP_LIMITS.tiles + 1}`)) {
      cancelled(shouldCancel);
      const { zoom_level: z, tile_column: x, tile_row: tmsY, tile_data: data } = row;
      const n = 2 ** z;
      if (!Number.isInteger(z) || z < 0 || z > 19 || !Number.isInteger(x) || !Number.isInteger(tmsY) ||
          x < 0 || x >= n || tmsY < 0 || tmsY >= n || imported >= OFFLINE_MAP_LIMITS.tiles) {
        fail('INVALID_TILE_COORDINATE', 'This map contains an invalid tile coordinate.');
      }
      const y = n - 1 - tmsY;
      const key = `${z}/${x}/${y}`;
      if (seen.has(key)) fail('DUPLICATE_TILE', 'This map contains duplicate tile coordinates.');
      seen.add(key);
      validateRasterPNG(data);
      bytes += data.length;
      if (bytes > OFFLINE_MAP_LIMITS.extractedBytes) fail('MAP_LIMIT_EXCEEDED', 'This map exceeds the import size limit.');
      const directory = `${extracted}${z}/${x}/`;
      if (!directories.has(directory)) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        directories.add(directory);
      }
      const tileUri = `${directory}${y}.png`;
      await FileSystem.writeAsStringAsync(tileUri, toBase64(data), { encoding: FileSystem.EncodingType.Base64 });
      await verifyDecodedTile(tileUri);
      minZoom = Math.min(minZoom, z); maxZoom = Math.max(maxZoom, z);
      west = Math.min(west, x / n * 360 - 180); east = Math.max(east, (x + 1) / n * 360 - 180);
      north = Math.max(north, latitudeAtTile(y, n)); south = Math.min(south, latitudeAtTile(y + 1, n));
      imported++;
      onProgress?.(imported, stats.total);
    }
    if (imported !== stats.total || bytes !== stats.bytes) fail('INVALID_MAP_FILE', 'The map tile inventory changed while importing.');
    const metadata = {
      name: plainText(values.name, 120) || 'Imported map',
      attribution: plainText(values.attribution, 2048),
      minZoom, maxZoom, bounds: [west, south, east, north], tileCount: imported,
      importedAt: new Date().toISOString(), format: 'png', tileSize: 256,
    };
    await FileSystem.writeAsStringAsync(`${extracted}metadata.json`, JSON.stringify(metadata));
    await db.closeAsync(); db = null;
    cancelled(shouldCancel);
    const current = await FileSystem.getInfoAsync(TILE_DIR);
    if (current.exists) {
      await FileSystem.moveAsync({ from: TILE_DIR, to: TILE_BACKUP_DIR });
      previousMoved = true;
    }
    try {
      await FileSystem.moveAsync({ from: extracted, to: TILE_DIR });
    } catch (error) {
      if (previousMoved) {
        await FileSystem.moveAsync({ from: TILE_BACKUP_DIR, to: TILE_DIR });
        previousMoved = false;
      }
      throw error;
    }
    // The new map is committed. Cleanup errors must not report import failure.
    try { await FileSystem.deleteAsync(TILE_BACKUP_DIR, { idempotent: true }); } catch {}
    return { imported, total: imported, metadata };
  } catch (error) {
    if (error.code) throw error;
    fail('IMPORT_FAILED', 'This map could not be imported. Your previous map is preserved.');
  } finally {
    try { if (db) await db.closeAsync(); } catch {}
    // If restoring the previous map also failed, keep its backup for recovery.
    try { await FileSystem.deleteAsync(staging, { idempotent: true }); } catch {}
    endTileCacheMutation();
  }
}
