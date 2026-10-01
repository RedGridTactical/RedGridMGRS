/**
 * Route-wide imported-tile coverage: planning (pure) and checking (local files
 * only). Legs are covered, not just checkpoints; anything that cannot be fully
 * verified is reported as unknown.
 */
const mockFiles = new Set();
let mockMetadata = null;
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///local/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async path => ({ exists: mockFiles.has(path) })),
  readAsStringAsync: jest.fn(async () => { if (!mockMetadata) throw new Error('missing'); return JSON.stringify(mockMetadata); }),
  readDirectoryAsync: jest.fn(async () => []),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));
const fs = require('expo-file-system');
const { latLonToTile, checkImportedMapCoverage, beginTileCacheMutation, endTileCacheMutation } = require('../src/utils/tileManager');
const { planRouteTiles, checkRouteCoverage, validateRoutePoints, ROUTE_COVERAGE_LIMITS } = require('../src/utils/routeCoverage');

const keys = plan => new Set(plan.tiles.map(t => `${t.z}/${t.x}/${t.y}`));
const DC = { lat: 38.8895, lon: -77.0353 };
const BALTIMORE = { lat: 39.2904, lon: -76.6122 };

// Tiles under the straight map line, found by dense sampling in projected space.
function sampledTiles(a, b, zoom, samples = 20000) {
  const n = 2 ** zoom;
  const proj = p => ({ x: ((p.lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n });
  const pa = proj(a); const pb = proj(b);
  const out = new Set();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    out.add(`${zoom}/${Math.floor(pa.x + (pb.x - pa.x) * t)}/${Math.floor(pa.y + (pb.y - pa.y) * t)}`);
  }
  return out;
}

describe('validateRoutePoints', () => {
  test.each([
    [undefined, 'no_route'], [[], 'no_route'], ['route', 'no_route'],
    [[{ lat: 'x', lon: 1 }], 'invalid_point'], [[{ lat: 1 }], 'invalid_point'], [[null], 'invalid_point'],
    [[{ lat: NaN, lon: 0 }], 'invalid_point'], [[{ lat: 91, lon: 0 }], 'invalid_point'], [[{ lat: 0, lon: 181 }], 'invalid_point'],
    [[{ lat: 86, lon: 0 }], 'outside_map_projection'],
  ])('%p is rejected as %s', (input, reason) => {
    expect(validateRoutePoints(input)).toMatchObject({ ok: false, reason });
  });

  test('reports which point is invalid and caps the number of points', () => {
    expect(validateRoutePoints([DC, { lat: 0, lon: 999 }])).toMatchObject({ ok: false, reason: 'invalid_point', index: 1 });
    const many = Array.from({ length: ROUTE_COVERAGE_LIMITS.maxWaypoints + 1 }, () => DC);
    expect(validateRoutePoints(many)).toMatchObject({ ok: false, reason: 'too_many_points' });
  });
});

describe('planRouteTiles', () => {
  test('a single point plans exactly its own tile at each zoom, matching tileManager', () => {
    const plan = planRouteTiles([DC], [10, 14]);
    expect(plan.ok).toBe(true);
    expect(plan.total).toBe(2);
    for (const z of [10, 14]) {
      const t = latLonToTile(DC.lat, DC.lon, z);
      expect(keys(plan).has(`${z}/${t.x}/${t.y}`)).toBe(true);
    }
  });

  test('legs are covered, not only checkpoints', () => {
    const plan = planRouteTiles([DC, BALTIMORE], [13]);
    const expected = sampledTiles(DC, BALTIMORE, 13);
    expect(expected.size).toBeGreaterThan(10);
    for (const k of expected) expect(keys(plan).has(k)).toBe(true);
    // Not a bounding box: far fewer tiles than the rectangle spanned by the endpoints.
    const a = latLonToTile(DC.lat, DC.lon, 13); const b = latLonToTile(BALTIMORE.lat, BALTIMORE.lon, 13);
    expect(plan.total).toBeLessThan((Math.abs(a.x - b.x) + 1) * (Math.abs(a.y - b.y) + 1));
  });

  test.each([
    [{ lat: 10, lon: 10 }, { lat: 10.3, lon: 10 }],
    [{ lat: 10, lon: 10 }, { lat: 10, lon: 10.4 }],
    [{ lat: -33.9, lon: 18.4 }, { lat: -33.6, lon: 18.9 }],
    [{ lat: 51.5, lon: 0.2 }, { lat: 51.3, lon: -0.3 }],
  ])('every tile under the line %p -> %p is planned', (a, b) => {
    const plan = planRouteTiles([a, b], [14]);
    for (const k of sampledTiles(a, b, 14)) expect(keys(plan).has(k)).toBe(true);
  });

  test('a leg across the antimeridian takes the short way and wraps tile x', () => {
    const plan = planRouteTiles([{ lat: 0.5, lon: 179.9 }, { lat: 0.5, lon: -179.9 }], [8]);
    expect(plan.ok).toBe(true);
    expect([...keys(plan)].map(k => Number(k.split('/')[1])).sort((a, b) => a - b)).toEqual([0, 255]);
    const reverse = planRouteTiles([{ lat: 0.5, lon: -179.9 }, { lat: 0.5, lon: 179.9 }], [8]);
    expect(keys(reverse)).toEqual(keys(plan));
  });

  test('a point exactly on the antimeridian is planned in range', () => {
    const plan = planRouteTiles([{ lat: 0, lon: 180 }], [5]);
    expect(plan.tiles[0].x).toBe(latLonToTile(0, 180, 5).x);
  });

  test('legs with no shortest direction are refused, not guessed', () => {
    expect(planRouteTiles([{ lat: 0, lon: -90 }, { lat: 0, lon: 90 }], [3])).toMatchObject({ ok: false, reason: 'ambiguous_leg', index: 0 });
  });

  test('long legs check the drawn line only within the hard tile budget', () => {
    const a = { lat: 60, lon: 10 }; const b = { lat: 60, lon: 15.4 };
    const plan = planRouteTiles([a, b], [12]);
    expect(plan.ok).toBe(true);
    for (const tile of sampledTiles(a, b, 12)) expect(keys(plan).has(tile)).toBe(true);
    expect(plan.tiles.every(t => t.y === latLonToTile(a.lat, a.lon, 12).y)).toBe(true);
  });

  test.each([{ maxTiles: 20001 }, { maxTiles: Infinity }, { maxWaypoints: 501 }, { maxWaypoints: Infinity }, { maxWaypoints: -1 }, null])('caller cannot disable work limits: %p', options => {
    expect(planRouteTiles([DC], [14], options)).toMatchObject({ ok: false, reason: 'invalid_options' });
  });

  test('corridorTiles adds neighbours on each side and is bounded', () => {
    const bare = planRouteTiles([DC, BALTIMORE], [12]);
    const wide = planRouteTiles([DC, BALTIMORE], [12], { corridorTiles: 1 });
    expect(wide.total).toBeGreaterThan(bare.total);
    for (const k of keys(bare)) expect(keys(wide).has(k)).toBe(true);
    expect(planRouteTiles([DC], [12], { corridorTiles: 99 })).toMatchObject({ ok: false, reason: 'invalid_options' });
  });

  test('shared tiles are counted once across legs and zooms are reported separately', () => {
    const plan = planRouteTiles([DC, BALTIMORE, DC], [11, 12]);
    const once = planRouteTiles([DC, BALTIMORE], [11, 12]);
    expect(plan.total).toBe(once.total);
    expect(plan.byZoom[11] + plan.byZoom[12]).toBe(plan.total);
    expect(plan.legs).toHaveLength(2);
  });

  test('budget overruns stop early and stay fast', () => {
    const started = Date.now();
    // Rejected by arithmetic before any tile is enumerated.
    expect(planRouteTiles([{ lat: 0, lon: 0 }, { lat: 0, lon: 170 }], [19])).toMatchObject({ ok: false, reason: 'budget_exceeded' });
    // Enumeration stops at the unique-tile cap.
    expect(planRouteTiles([{ lat: 0, lon: 0 }, { lat: 0, lon: 60 }], [19])).toMatchObject({ ok: false, reason: 'budget_exceeded' });
    expect(planRouteTiles([DC, BALTIMORE], [16], { maxTiles: 10 })).toMatchObject({ ok: false, reason: 'budget_exceeded' });
    expect(Date.now() - started).toBeLessThan(500);
  });

  test.each([[[]], [[20]], [[-1]], [[10.5]], ['14'], [undefined]])('zoom levels %p are rejected', zooms => {
    expect(planRouteTiles([DC], zooms)).toMatchObject({ ok: false, reason: 'invalid_zoom_levels' });
  });
});

describe('checkRouteCoverage states (injected dependencies)', () => {
  const metadata = { name: 'QA', zoomLevels: [12], inventoryComplete: true };
  const route = [DC, BALTIMORE];
  const planned = planRouteTiles(route, [12]);
  const deps = (exists, overrides = {}) => ({
    getMetadata: async () => metadata, tileExists: jest.fn(exists), recover: async () => true,
    cacheState: () => ({ mutating: false, generation: 1 }), ...overrides,
  });

  test('complete when every planned tile exists', async () => {
    const result = await checkRouteCoverage(route, {}, deps(async () => true));
    expect(result).toMatchObject({ state: 'complete', reason: null, cached: planned.total, missing: 0, total: planned.total });
    expect(result.legs).toEqual([expect.objectContaining({ index: 0, state: 'complete' })]);
  });

  test('missing when none exist; partial when some do, with per-leg and per-zoom detail', async () => {
    expect(await checkRouteCoverage(route, {}, deps(async () => false))).toMatchObject({ state: 'missing', cached: 0, missing: planned.total });
    const start = latLonToTile(DC.lat, DC.lon, 12);
    const partial = await checkRouteCoverage([DC, BALTIMORE, DC], {}, deps(async (z, x, y) => x === start.x && y === start.y));
    expect(partial).toMatchObject({ state: 'partial', cached: 1 });
    expect(partial.byZoom[12]).toEqual({ cached: 1, missing: planned.total - 1, total: planned.total });
    expect(partial.legs.map(l => l.state)).toEqual(['partial', 'partial']);
  });

  test('no imported map is missing with reason no_map', async () => {
    expect(await checkRouteCoverage(route, {}, deps(async () => true, { getMetadata: async () => null }))).toMatchObject({ state: 'missing', reason: 'no_map', total: 0 });
  });

  test.each([
    ['unverified inventory', { getMetadata: async () => ({ ...metadata, inventoryComplete: false }) }, {}, 'map_inventory_unverified'],
    ['empty zoom inventory', { getMetadata: async () => ({ ...metadata, zoomLevels: [] }) }, {}, 'map_inventory_unverified'],
    ['interrupted recovery', { recover: async () => false }, {}, 'map_unavailable'],
    ['map mutation in progress', { cacheState: () => ({ mutating: true, generation: 1 }) }, {}, 'map_changing'],
    ['budget too small', {}, { maxTiles: 3 }, 'budget_exceeded'],
    ['metadata read failure', { getMetadata: async () => { throw new Error('io'); } }, {}, 'check_failed'],
  ])('unknown for %s', async (_label, overrides, options, reason) => {
    const d = deps(async () => true, overrides);
    expect(await checkRouteCoverage(route, options, d)).toMatchObject({ state: 'unknown', reason, cached: 0, total: 0 });
    expect(d.tileExists).not.toHaveBeenCalled();
  });

  test('invalid routes are unknown and never touch the map', async () => {
    const d = deps(async () => true, { getMetadata: jest.fn(async () => metadata) });
    expect(await checkRouteCoverage([DC, { lat: 0, lon: 500 }], {}, d)).toMatchObject({ state: 'unknown', reason: 'invalid_point', index: 1 });
    expect(await checkRouteCoverage([], {}, d)).toMatchObject({ state: 'unknown', reason: 'no_route' });
    expect(d.getMetadata).not.toHaveBeenCalled();
  });

  test('a map replaced mid-check yields unknown, not a stale answer', async () => {
    let generation = 1; let calls = 0;
    const d = deps(async () => { if (++calls === 3) generation = 2; return true; }, { cacheState: () => ({ mutating: false, generation }) });
    expect(await checkRouteCoverage(route, {}, d)).toMatchObject({ state: 'unknown', reason: 'map_changing' });
    expect(d.tileExists.mock.calls.length).toBeLessThan(planned.total);
  });

  test('a requested zoom the package lacks cannot be complete', async () => {
    const result = await checkRouteCoverage(route, { zoomLevels: [12, 13] }, deps(async z => z === 12));
    expect(result.state).toBe('partial');
    expect(result.byZoom[13].cached).toBe(0);
  });
});

describe('checkRouteCoverage against tileManager storage (mocked files)', () => {
  const route = [DC, BALTIMORE];
  const plan = planRouteTiles(route, [11]);
  const pathOf = t => `file:///local/map_tiles/${t.z}/${t.x}/${t.y}.png`;
  beforeEach(() => { mockFiles.clear(); mockMetadata = { name: 'QA', zoomLevels: [11], tileCount: plan.total }; jest.clearAllMocks(); });

  test('complete, then partial when one leg tile file is removed, then missing', async () => {
    plan.tiles.forEach(t => mockFiles.add(pathOf(t)));
    expect(await checkRouteCoverage(route)).toMatchObject({ state: 'complete', total: plan.total, zoomLevels: [11] });
    const middle = plan.tiles[Math.floor(plan.total / 2)];
    mockFiles.delete(pathOf(middle));
    expect(await checkRouteCoverage(route)).toMatchObject({ state: 'partial', missing: 1 });
    mockFiles.clear();
    expect(await checkRouteCoverage(route)).toMatchObject({ state: 'missing', cached: 0 });
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  test('no metadata file means no map; a mutation in progress means unknown', async () => {
    mockMetadata = null;
    expect(await checkRouteCoverage(route)).toMatchObject({ state: 'missing', reason: 'no_map' });
    mockMetadata = { name: 'QA', zoomLevels: [11] };
    expect(beginTileCacheMutation()).toBe(true);
    try { expect(await checkRouteCoverage(route)).toMatchObject({ state: 'unknown' }); } finally { endTileCacheMutation(); }
  });

  test('the existing viewport API is unchanged', async () => {
    const t = latLonToTile(DC.lat, DC.lon, 11);
    mockFiles.add(pathOf({ z: 11, ...t }));
    const region = { latitude: DC.lat, longitude: DC.lon, latitudeDelta: 0.001, longitudeDelta: 0.001 };
    expect(await checkImportedMapCoverage(region)).toMatchObject({ state: 'complete', total: 1, cached: 1, zoomLevels: [11] });
    expect(await checkImportedMapCoverage(null)).toMatchObject({ state: 'unscoped' });
  });
});


describe('strict tile readiness IO', () => {
  test('stat errors stay unknown rather than implying a missing file', async () => {
    const { importedTileExists } = require('../src/utils/tileManager');
    fs.getInfoAsync.mockRejectedValueOnce(new Error('storage error'));
    await expect(importedTileExists(12, 1, 1)).rejects.toThrow('storage error');
    const result = await checkRouteCoverage([DC], {}, {
      recover: async () => true,
      cacheState: () => ({ mutating: false, generation: 0 }),
      getMetadata: async () => ({ zoomLevels: [12], inventoryComplete: true }),
      tileExists: async () => { throw new Error('storage error'); },
    });
    expect(result).toMatchObject({ state: 'unknown', reason: 'check_failed' });
  });
  test('a directory at a tile path is not a usable tile file', async () => {
    const { importedTileExists } = require('../src/utils/tileManager');
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true, isDirectory: true });
    expect(await importedTileExists(12, 1, 1)).toBe(false);
  });
});
