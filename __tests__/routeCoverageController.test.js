/**
 * Route coverage: cancellation, progress, stale-result invalidation and the
 * words shown for each state.
 */
jest.mock('expo-file-system', () => ({ documentDirectory: 'file:///local/', cacheDirectory: 'file:///cache/', getInfoAsync: jest.fn(async () => ({ exists: false })) }));
const { checkRouteCoverage, createRouteCoverageController, routeFingerprint, planRouteTiles } = require('../src/utils/routeCoverage');
const { describeRouteCoverage } = require('../src/utils/routeCoverageText');

const A = { lat: 38.8895, lon: -77.0353, label: 'START' };
const B = { lat: 39.2904, lon: -76.6122, label: 'CREEK' };
const C = { lat: 39.4, lon: -76.5, label: 'RIDGE' };
const metadata = { name: 'QA', zoomLevels: [12], inventoryComplete: true };
const deps = (exists, overrides = {}) => ({ getMetadata: async () => metadata, tileExists: jest.fn(exists), recover: async () => true,
  cacheState: () => ({ mutating: false, generation: 1 }), ...overrides });
const t = (key, values) => key + (values ? `|${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')}` : '');
const total = planRouteTiles([A, B], [12]).total;

describe('checkRouteCoverage cancellation and progress', () => {
  test('cancelling mid-check stops file reads and reports unknown with no counts', async () => {
    let reads = 0;
    const d = deps(async () => { reads++; return true; });
    const result = await checkRouteCoverage([A, B], { shouldCancel: () => reads >= 5 }, d);
    expect(result).toMatchObject({ state: 'unknown', reason: 'cancelled', cached: 0, total: 0, legs: [] });
    expect(reads).toBe(5);
    expect(reads).toBeLessThan(total);
  });

  test('cancelling before the check starts never touches the map', async () => {
    const d = deps(async () => true, { getMetadata: jest.fn(async () => metadata) });
    expect(await checkRouteCoverage([A, B], { shouldCancel: () => true }, d)).toMatchObject({ state: 'unknown', reason: 'cancelled' });
    expect(d.getMetadata).not.toHaveBeenCalled();
    expect(d.tileExists).not.toHaveBeenCalled();
  });

  test('progress is monotonic, bounded by the total and ends at the total', async () => {
    const seen = [];
    const result = await checkRouteCoverage([A, B], { onProgress: (done, all) => seen.push([done, all]) }, deps(async () => true));
    expect(result.state).toBe('complete');
    expect(seen[0]).toEqual([0, total]);
    expect(seen[seen.length - 1]).toEqual([total, total]);
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
    expect(seen.length).toBeLessThanOrEqual(Math.ceil(total / 25) + 2);
  });

  test('a throwing progress or cancel callback cannot produce a false complete', async () => {
    expect((await checkRouteCoverage([A, B], { onProgress: () => { throw new Error('ui'); } }, deps(async () => true))).state).toBe('complete');
    expect(await checkRouteCoverage([A, B], { shouldCancel: () => { throw new Error('ui'); } }, deps(async () => true))).toMatchObject({ state: 'unknown', reason: 'cancelled' });
  });

  test('a tile read failure is unknown, never missing', async () => {
    expect(await checkRouteCoverage([A, B], {}, deps(async () => { throw new Error('io'); }))).toMatchObject({ state: 'unknown', reason: 'check_failed' });
  });
});

describe('coverage controller', () => {
  const gate = () => { let release; const wait = new Promise(resolve => { release = resolve; }); return { wait, release }; };
  const done = { state: 'complete', reason: null, cached: 3, missing: 0, total: 3, legs: [{ index: 0, state: 'complete' }], zoomLevels: [12], generation: 1 };

  test('reports checking with progress, then done for the same route', async () => {
    const states = [];
    const controller = createRouteCoverageController({ onChange: s => states.push(s.status), cacheState: () => ({ mutating: false, generation: 1 }),
      check: async (_points, options) => { options.onProgress(1, 3); return done; } });
    const snapshot = await controller.start([A, B]);
    expect(states).toEqual(['checking', 'checking', 'done']);
    expect(snapshot.result.state).toBe('complete');
    expect(controller.sync([A, B]).status).toBe('done');
  });

  test('cancel discards the running check and its late result', async () => {
    const g = gate();
    let cancelSeen = false;
    const controller = createRouteCoverageController({ cacheState: () => ({ mutating: false, generation: 1 }),
      check: async (_points, options) => { await g.wait; cancelSeen = options.shouldCancel(); return done; } });
    const running = controller.start([A, B]);
    controller.cancel();
    expect(controller.getSnapshot()).toMatchObject({ status: 'done', result: { state: 'unknown', reason: 'cancelled' } });
    g.release(); await running;
    expect(cancelSeen).toBe(true);
    expect(controller.getSnapshot().result.reason).toBe('cancelled');
  });

  test('a result goes stale when a coordinate changes, a point is added, or the order changes', async () => {
    const make = async () => { const c = createRouteCoverageController({ check: async () => done, cacheState: () => ({ mutating: false, generation: 1 }) }); await c.start([A, B]); return c; };
    expect((await make()).sync([A, { ...B, lat: B.lat + 0.001 }]).status).toBe('stale');
    expect((await make()).sync([A, B, C]).status).toBe('stale');
    expect((await make()).sync([B, A]).status).toBe('stale');
    // Renaming a point does not change what was checked.
    expect((await make()).sync([{ ...A, label: 'RENAMED' }, B]).status).toBe('done');
    expect((await make()).sync([A, B]).result).toBe(done);
  });

  test('a result goes stale when the imported map changes or is being changed', async () => {
    let state = { mutating: false, generation: 1 };
    const controller = createRouteCoverageController({ check: async () => done, cacheState: () => state });
    await controller.start([A, B]);
    state = { mutating: false, generation: 2 };
    expect(controller.sync([A, B])).toMatchObject({ status: 'stale', result: null });
    await controller.start([A, B]);
    state = { mutating: true, generation: 1 };
    expect(controller.sync([A, B]).status).toBe('stale');
  });

  test('"no map" also goes stale once a map is imported', async () => {
    let state = { mutating: false, generation: 4 };
    const controller = createRouteCoverageController({ cacheState: () => state,
      check: async () => ({ state: 'missing', reason: 'no_map', cached: 0, missing: 0, total: 0, legs: [], zoomLevels: [] }) });
    await controller.start([A, B]);
    expect(controller.sync([A, B]).status).toBe('done');
    state = { mutating: false, generation: 5 };
    expect(controller.sync([A, B]).status).toBe('stale');
  });

  test('editing the route during a check discards that check', async () => {
    const g = gate();
    const controller = createRouteCoverageController({ check: async () => { await g.wait; return done; }, cacheState: () => ({ mutating: false, generation: 1 }) });
    const running = controller.start([A, B]);
    expect(controller.sync([A, C]).status).toBe('stale');
    g.release(); await running;
    expect(controller.getSnapshot()).toMatchObject({ status: 'stale', result: null });
  });

  test('a newer check supersedes an older one', async () => {
    const first = gate();
    const results = [first.wait.then(() => ({ ...done, total: 111 })), Promise.resolve({ ...done, total: 222 })];
    const controller = createRouteCoverageController({ check: () => results.shift(), cacheState: () => ({ mutating: false, generation: 1 }) });
    const old = controller.start([A, B]);
    await controller.start([A, C]);
    first.release(); await old;
    expect(controller.getSnapshot().result.total).toBe(222);
  });

  test('dispose stops a running check without notifying', async () => {
    const g = gate(); const onChange = jest.fn();
    const controller = createRouteCoverageController({ onChange, check: async () => { await g.wait; return done; }, cacheState: () => ({ mutating: false, generation: 1 }) });
    const running = controller.start([A, B]);
    onChange.mockClear(); controller.dispose(); g.release(); await running;
    expect(onChange).not.toHaveBeenCalled();
  });

  test('fingerprint depends only on ordered coordinates', () => {
    expect(routeFingerprint([A, B])).toBe(routeFingerprint([{ lat: A.lat, lon: A.lon }, { lat: B.lat, lon: B.lon }]));
    expect(routeFingerprint([A, B])).not.toBe(routeFingerprint([B, A]));
    expect(routeFingerprint(null)).toBe('');
  });
});

describe('describeRouteCoverage', () => {
  const snap = (result, status = 'done') => ({ status, result, progress: null });
  test('never reports ok unless every leg is complete', () => {
    const cases = [
      [{ status: 'idle' }, 'warn', 'routeCoverage.notChecked'],
      [{ status: 'stale' }, 'warn', 'routeCoverage.stale'],
      [{ status: 'checking', progress: null }, 'warn', 'routeCoverage.starting'],
      [{ status: 'checking', progress: { done: 3, total: 9 } }, 'warn', 'routeCoverage.checking|done=3,total=9'],
      [snap({ state: 'unknown', reason: 'cancelled' }), 'warn', 'routeCoverage.cancelled'],
      [snap({ state: 'unknown', reason: 'budget_exceeded' }), 'warn', 'routeCoverage.unknown routeCoverage.reason.budget'],
      [snap({ state: 'unknown', reason: 'invalid_point', index: 2 }), 'warn', 'routeCoverage.unknown routeCoverage.reason.point|number=3'],
      [snap({ state: 'unknown', reason: 'ambiguous_leg', index: 0 }), 'warn', 'routeCoverage.unknown routeCoverage.reason.leg|number=1'],
      [snap({ state: 'unknown', reason: 'something_new' }), 'warn', 'routeCoverage.unknown'],
      [snap({ state: 'missing', reason: 'no_map' }), 'warn', 'routeCoverage.noMap'],
      [snap({ state: 'missing', reason: null, total: 4, legs: [] }), 'fail', 'routeCoverage.missing'],
      [snap({ state: 'partial', missing: 2, total: 9, legs: [] }), 'fail', 'routeCoverage.partial|missing=2,total=9'],
      [snap({ state: 'complete', total: 9, legs: [] }), 'ok', 'routeCoverage.complete|count=9'],
    ];
    for (const [snapshot, status, summary] of cases) expect(describeRouteCoverage(snapshot, [A, B], t)).toMatchObject({ status, summary });
    expect(describeRouteCoverage(undefined, [A, B], t).status).toBe('warn');
  });

  test('legs are named by the point they lead to, with their own state', () => {
    const view = describeRouteCoverage(snap({ state: 'partial', missing: 1, total: 5, zoomLevels: [12, 14],
      legs: [{ index: 0, state: 'complete' }, { index: 1, state: 'missing' }, { index: 2, state: 'partial' }, { index: 3, state: 'odd' }] }), [A, B, C, { lat: 1, lon: 1 }, { name: 'END' }], t);
    expect(view.legs).toEqual([
      { key: '0', label: '1 → 2 · CREEK', state: 'routeCoverage.legComplete', status: 'ok' },
      { key: '1', label: '2 → 3 · RIDGE', state: 'routeCoverage.legMissing', status: 'fail' },
      { key: '2', label: '3 → 4 · WP 4', state: 'routeCoverage.legPartial', status: 'fail' },
      { key: '3', label: '4 → 5 · END', state: 'routeCoverage.legUnknown', status: 'warn' },
    ]);
    expect(view.detail).toBe('routeCoverage.detail|zooms=12, 14');
  });

  test('a one-point route is described as that point', () => {
    const view = describeRouteCoverage(snap({ state: 'complete', total: 1, legs: [{ index: 0, state: 'complete' }], zoomLevels: [12] }), [A], t);
    expect(view.legs[0].label).toBe('1 · START');
  });
});
