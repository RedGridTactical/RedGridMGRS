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
    readDirectoryAsync: jest.fn(async uri => fs.readdirSync(local(uri))),
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
const { TILE_DIR, TILE_BACKUP_DIR, recoverOfflineTileCache, clearTileCache, getOfflineMapMetadata, checkImportedMapCoverage, beginTileCacheMutation, endTileCacheMutation } = require('../src/utils/tileManager');
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
  expect(result.metadata).toMatchObject({ name: 'Training map', minZoom: 2, maxZoom: 2, zoomLevels: [2], tilesByZoom: { 2: 2 }, attribution: 'Own test artwork' });
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

describe('imported-map preflight', () => {
  const inside = { latitude: -30, longitude: -45, latitudeDelta: 1, longitudeDelta: 1 };
  test('checks the imported zoom, not legacy default zooms, and requires files', async () => {
    await importRasterMBTiles(source);
    expect(await checkImportedMapCoverage(inside)).toMatchObject({ state: 'complete', zoomLevels: [2], total: 1, cached: 1 });
    fs.unlinkSync(`${local(TILE_DIR)}2/1/2.png`);
    expect(await checkImportedMapCoverage(inside)).toMatchObject({ state: 'incomplete', total: 1, cached: 0, missing: 1 });
  });
  test('reports absent coverage outside imported bounds instead of clipping the requested area', async () => {
    await importRasterMBTiles(source);
    expect(await checkImportedMapCoverage({ ...inside, longitude: 45 })).toMatchObject({ state: 'incomplete', cached: 0 });
  });
  test('preserves a non-contiguous actual zoom inventory, including old metadata', async () => {
    rows.push({ zoom_level: 4, tile_column: 6, tile_row: 6, tile_data: png() });
    const result = await importRasterMBTiles(source);
    expect(result.metadata.zoomLevels).toEqual([2, 4]);
    delete result.metadata.zoomLevels; delete result.metadata.tilesByZoom;
    fs.writeFileSync(`${local(TILE_DIR)}metadata.json`, JSON.stringify(result.metadata));
    expect((await getOfflineMapMetadata()).zoomLevels).toEqual([2, 4]);
    const checked = await checkImportedMapCoverage(inside);
    expect(checked.zoomLevels).toEqual([2, 4]);
    expect(Object.keys(checked.byZoom)).toEqual(['2', '4']);
  });
  test('never treats a list-only check, legacy cache or concurrent import as ready', async () => {
    expect((await checkImportedMapCoverage(null)).state).toBe('unscoped');
    expect((await checkImportedMapCoverage(inside)).state).toBe('no_map');
    await importRasterMBTiles(source);
    expect(beginTileCacheMutation()).toBe(true);
    try { expect((await checkImportedMapCoverage(inside)).state).not.toBe('complete'); }
    finally { endTileCacheMutation(); }
  });
  test('bounds the total work across zooms and rejects invalid regions', async () => {
    rows.push({ zoom_level: 19, tile_column: 1, tile_row: 1, tile_data: png() });
    await importRasterMBTiles(source);
    expect((await checkImportedMapCoverage({ ...inside, latitudeDelta: 90, longitudeDelta: 180 })).state).toBe('uncheckable');
    expect((await checkImportedMapCoverage({ ...inside, latitude: NaN })).state).toBe('uncheckable');
  });
  test('checks both sides of the antimeridian with no duplicate low-zoom tiles', async () => {
    rows = [0, 3].map(x => ({ zoom_level: 2, tile_column: x, tile_row: 1, tile_data: png() }));
    await importRasterMBTiles(source);
    expect(await checkImportedMapCoverage({ latitude: -30, longitude: 179.9, latitudeDelta: 1, longitudeDelta: 1 })).toMatchObject({ state: 'complete', total: 2, cached: 2 });
    fs.unlinkSync(`${local(TILE_DIR)}2/0/2.png`);
    expect(await checkImportedMapCoverage({ latitude: -30, longitude: 179.9, latitudeDelta: 1, longitudeDelta: 1 })).toMatchObject({ state: 'incomplete', cached: 1, total: 2 });
  });
});

test('preflight refuses polar extent instead of clamping it into cached Mercator tiles', async () => {
  rows = [{ zoom_level: 0, tile_column: 0, tile_row: 0, tile_data: png() }];
  await importRasterMBTiles(source);
  for (const latitude of [89, -89, 85]) {
    expect((await checkImportedMapCoverage({ latitude, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 })).state).toBe('uncheckable');
  }
});

test('persisted zoom inventory still requires a deleted zoom directory', async () => {
  rows.push({ zoom_level: 4, tile_column: 6, tile_row: 6, tile_data: png() });
  await importRasterMBTiles(source);
  fs.rmSync(`${local(TILE_DIR)}4`, { recursive: true });
  const coverage = await checkImportedMapCoverage({ latitude: -30, longitude: -45, latitudeDelta: 1, longitudeDelta: 1 });
  expect(coverage).toMatchObject({ state: 'incomplete', zoomLevels: [2, 4] });
  expect(coverage.byZoom[4].missing).toBeGreaterThan(0);
});

test('legacy inventory cannot become complete by losing an intermediate zoom', async () => {
  rows.push({ zoom_level: 3, tile_column: 3, tile_row: 3, tile_data: png() });
  rows.push({ zoom_level: 4, tile_column: 6, tile_row: 6, tile_data: png() });
  const result = await importRasterMBTiles(source);
  delete result.metadata.zoomLevels; delete result.metadata.tilesByZoom;
  fs.writeFileSync(`${local(TILE_DIR)}metadata.json`, JSON.stringify(result.metadata));
  fs.rmSync(`${local(TILE_DIR)}3`, { recursive: true });
  expect((await checkImportedMapCoverage({ latitude: -30, longitude: -45, latitudeDelta: 1, longitudeDelta: 1 })).state).toBe('uncheckable');
});

test('a completed cache mutation during the final tile stat invalidates coverage', async () => {
  await importRasterMBTiles(source);
  const original = FileSystem.getInfoAsync.getMockImplementation();
  let mutated = false;
  FileSystem.getInfoAsync.mockImplementation(async uri => {
    const result = await original(uri);
    if (!mutated && uri.endsWith('/2/1/2.png')) {
      mutated = true;
      expect(beginTileCacheMutation()).toBe(true);
      endTileCacheMutation();
    }
    return result;
  });
  try {
    expect((await checkImportedMapCoverage({ latitude: -30, longitude: -45, latitudeDelta: 1, longitudeDelta: 1 })).state).toBe('uncheckable');
    expect(mutated).toBe(true);
  } finally { FileSystem.getInfoAsync.mockImplementation(original); }
});
