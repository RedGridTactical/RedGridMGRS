jest.mock('expo-file-system', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-grid-import-test-'));
  const local = uri => uri.replace(/^file:\/\//, '');
  return {
    documentDirectory: `file://${root}/`, EncodingType: { Base64: 'base64' },
    getInfoAsync: jest.fn(async uri => {
      try { const s = fs.statSync(local(uri)); return { exists: true, size: s.size, isDirectory: s.isDirectory() }; }
      catch { return { exists: false }; }
    }),
    getFreeDiskStorageAsync: jest.fn(async () => 1024 * 1024 * 1024),
    makeDirectoryAsync: jest.fn(async uri => fs.mkdirSync(local(uri), { recursive: true })),
    copyAsync: jest.fn(async ({ from, to }) => fs.copyFileSync(local(from), local(to))),
    moveAsync: jest.fn(async ({ from, to }) => fs.renameSync(local(from), local(to))),
    deleteAsync: jest.fn(async uri => fs.rmSync(local(uri), { recursive: true, force: true })),
    readAsStringAsync: jest.fn(async (uri, options = {}) => {
      let bytes = fs.readFileSync(local(uri));
      if (options.length) bytes = bytes.subarray(options.position || 0, (options.position || 0) + options.length);
      return bytes.toString(options.encoding === 'base64' ? 'base64' : 'utf8');
    }),
    writeAsStringAsync: jest.fn(async (uri, data, options = {}) => fs.writeFileSync(local(uri), data, options.encoding === 'base64' ? 'base64' : 'utf8')),
  };
});
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('react-native', () => ({ Image: { getSize: jest.fn((uri, success) => success(256, 256)) } }));

const fs = require('fs');
const zlib = require('zlib');
const FileSystem = require('expo-file-system');
const SQLite = require('expo-sqlite');
const { Image } = require('react-native');
const { importRasterMBTiles, validateRasterPNG } = require('../src/utils/offlineMaps');
const { TILE_DIR, TILE_BACKUP_DIR, recoverOfflineTileCache, clearTileCache, getOfflineMapMetadata } = require('../src/utils/tileManager');
const root = FileSystem.documentDirectory.replace('file://', '');
const local = uri => uri.replace('file://', '');
const source = `${FileSystem.documentDirectory}test.mbtiles`;

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
function png() {
  const header = Buffer.alloc(13); header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  return new Uint8Array(Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc((256 * 4 + 1) * 256))), chunk('IEND', Buffer.alloc(0)),
  ]));
}
let rows, db;
beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(local(TILE_DIR), { recursive: true }); fs.writeFileSync(`${local(TILE_DIR)}old.txt`, 'previous map');
  fs.writeFileSync(local(source), Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(100)]));
  jest.clearAllMocks();
  FileSystem.getFreeDiskStorageAsync.mockResolvedValue(1024 * 1024 * 1024);
  FileSystem.moveAsync.mockImplementation(async ({ from, to }) => fs.renameSync(local(from), local(to)));
  Image.getSize.mockImplementation((uri, success) => success(256, 256));
  rows = [
    { zoom_level: 2, tile_column: 1, tile_row: 0, tile_data: png() },
    { zoom_level: 2, tile_column: 1, tile_row: 1, tile_data: png() },
  ];
  db = {
    execAsync: jest.fn(async () => {}), closeAsync: jest.fn(async () => {}),
    getAllAsync: jest.fn(async () => [{ name: 'format', value: 'png' }, { name: 'name', value: 'Training map' }, { name: 'attribution', value: 'Own test artwork' }]),
    getFirstAsync: jest.fn(async () => ({ total: rows.length, bytes: rows.reduce((n, r) => n + r.tile_data.length, 0), largest: Math.max(...rows.map(r => r.tile_data.length)) })),
    getEachAsync: jest.fn(async function* () { for (const row of rows) yield row; }),
  };
  SQLite.openDatabaseAsync.mockResolvedValue(db);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const expectPrevious = () => expect(fs.readFileSync(`${local(TILE_DIR)}old.txt`, 'utf8')).toBe('previous map');

test('imports both TMS rows into XYZ paths, validates pixels and saves actual bounds', async () => {
  const result = await importRasterMBTiles(source);
  expect(result.imported).toBe(2);
  expect(fs.existsSync(`${local(TILE_DIR)}2/1/3.png`)).toBe(true);
  expect(fs.existsSync(`${local(TILE_DIR)}2/1/2.png`)).toBe(true);
  expect(Buffer.compare(fs.readFileSync(`${local(TILE_DIR)}2/1/3.png`), Buffer.from(rows[0].tile_data))).toBe(0);
  expect(result.metadata).toMatchObject({ name: 'Training map', minZoom: 2, maxZoom: 2, attribution: 'Own test artwork' });
  expect(result.metadata.bounds[0]).toBe(-90); expect(result.metadata.bounds[2]).toBe(0);
  expect(result.metadata.bounds[3]).toBe(0); expect(result.metadata.bounds[1]).toBeCloseTo(-85.05112878);
  expect(Image.getSize).toHaveBeenCalledTimes(2);
  expect(db.execAsync).toHaveBeenCalledWith('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
  expect(await getOfflineMapMetadata()).toEqual(result.metadata);
  expect(fs.existsSync(`${local(TILE_DIR)}old.txt`)).toBe(false);
  expect(fs.existsSync(local(TILE_BACKUP_DIR))).toBe(false);
});

test('rejects remote URLs before opening a database or touching existing maps', async () => {
  await expect(importRasterMBTiles('https://example.com/map.mbtiles')).rejects.toMatchObject({ code: 'LOCAL_FILE_REQUIRED' });
  expect(SQLite.openDatabaseAsync).not.toHaveBeenCalled(); expectPrevious();
});
test('rejects an invalid SQLite header', async () => {
  fs.writeFileSync(local(source), Buffer.alloc(116));
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'INVALID_MAP_FILE' }); expectPrevious();
});
test('rejects vector archives with the old map intact', async () => {
  db.getAllAsync.mockResolvedValue([{ name: 'format', value: 'pbf' }]);
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'UNSUPPORTED_MAP' }); expectPrevious();
});
test('rejects more than 5000 tiles without extracting them', async () => {
  db.getFirstAsync.mockResolvedValue({ total: 5001, bytes: 100, largest: 1 });
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'MAP_LIMIT_EXCEEDED' });
  expect(db.getEachAsync).not.toHaveBeenCalled(); expectPrevious();
});
test('rejects a bad PNG checksum and preserves the previous map', async () => {
  rows[0].tile_data[35] ^= 1;
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'INVALID_TILE' }); expectPrevious();
});
test('rejects a PNG the native image decoder cannot open', async () => {
  Image.getSize.mockImplementation((uri, success, error) => error());
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'INVALID_TILE' }); expectPrevious();
});
test('rejects an out-of-range coordinate before using it as a path', async () => {
  rows[0].tile_column = '../escape';
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'INVALID_TILE_COORDINATE' }); expectPrevious();
});
test('rejects duplicate coordinates instead of silently overwriting a tile', async () => {
  rows[1] = { ...rows[0] };
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'DUPLICATE_TILE' }); expectPrevious();
});
test('cancels after one extracted tile without replacing the existing map', async () => {
  let stop = false;
  await expect(importRasterMBTiles(source, { onProgress: () => { stop = true; }, shouldCancel: () => stop })).rejects.toMatchObject({ code: 'IMPORT_CANCELLED' });
  expectPrevious(); expect(fs.readdirSync(root).some(name => name.startsWith('map_import_'))).toBe(false);
});
test('rolls back the old directory if promotion fails', async () => {
  FileSystem.moveAsync.mockImplementation(async ({ from, to }) => {
    if (from.includes('/map_import_')) throw new Error('disk error');
    fs.renameSync(local(from), local(to));
  });
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'IMPORT_FAILED' }); expectPrevious();
});
test('retains a recoverable backup if both promotion and immediate rollback fail', async () => {
  FileSystem.moveAsync.mockImplementation(async ({ from, to }) => {
    if (from !== TILE_DIR) throw new Error('disk error');
    fs.renameSync(local(from), local(to));
  });
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'IMPORT_FAILED' });
  expect(fs.existsSync(local(TILE_BACKUP_DIR))).toBe(true);
  FileSystem.moveAsync.mockImplementation(async ({ from, to }) => fs.renameSync(local(from), local(to)));
  await recoverOfflineTileCache(); expectPrevious();
});
test('recovers a previous map after interruption between directory renames', async () => {
  fs.renameSync(local(TILE_DIR), local(TILE_BACKUP_DIR));
  await recoverOfflineTileCache(); expectPrevious();
});
test('refuses clear-cache during import so an in-flight map is not deleted', async () => {
  const cleared = [];
  await importRasterMBTiles(source, { onProgress: () => { cleared.push(clearTileCache()); } });
  expect(await Promise.all(cleared)).toEqual([false, false]);
});
test('rejects insufficient free disk space before making a source copy', async () => {
  FileSystem.getFreeDiskStorageAsync.mockResolvedValue(10);
  await expect(importRasterMBTiles(source)).rejects.toMatchObject({ code: 'INSUFFICIENT_STORAGE' });
  expect(FileSystem.copyAsync).not.toHaveBeenCalled(); expectPrevious();
});
test('PNG validation requires the complete file, not just a plausible header', () => {
  expect(() => validateRasterPNG(png().subarray(0, 33))).toThrow();
  expect(validateRasterPNG(png())).toBe(true);
});


test('concurrent recovery readers wait until the old map is back in place', async () => {
  fs.renameSync(local(TILE_DIR), local(TILE_BACKUP_DIR));
  let complete;
  FileSystem.moveAsync.mockImplementationOnce(({ from, to }) => new Promise(resolve => {
    complete = () => { fs.renameSync(local(from), local(to)); resolve(); };
  }));
  const first = recoverOfflineTileCache();
  await new Promise(resolve => setImmediate(resolve));
  let secondDone = false;
  const second = recoverOfflineTileCache().then(() => { secondDone = true; });
  await new Promise(resolve => setImmediate(resolve));
  expect(secondDone).toBe(false);
  complete();
  await Promise.all([first, second]);
  expectPrevious();
});
