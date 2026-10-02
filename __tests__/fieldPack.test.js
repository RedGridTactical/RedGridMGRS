/**
 * Field pack v1: bounded, versioned, validated; importing only ever adds a new
 * list; pack origin survives saving and reopening.
 */
const {
  buildFieldPack, serializeFieldPack, parseFieldPack, fieldPackToList, fieldPackFileName, compareMapReference,
  uniqueListName, shortRevision, packPointSources, assertReadablePackFile, FIELD_PACK_LIMITS, FIELD_PACK_FORMAT, FIELD_PACK_VERSION,
} = require('../src/utils/fieldPack');
const { normalizeWaypointLists, normalizePackProvenance, MAX_WAYPOINT_LISTS } = require('../src/utils/waypoints');

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const point = (id, lat, lon, extra = {}) => ({ id, label: `CP ${id}`, lat, lon, note: '', source: 'manual', recordedAt: NOW - 1000, ...extra });
const list = (extra = {}) => ({ id: 'list-a', name: 'NORTH RIDGE', notes: 'Meet at trailhead', paceMinPerKm: 15, plannedStartAt: NOW + 3600000, updatedAt: NOW - 5000,
  waypoints: [point('1', 38.8895, -77.0353, { source: 'gps', accuracyM: 5, note: 'Start' }), point('2', 38.9, -77.02), point('3', 38.91, -77.01, { elevation: 120 })], ...extra });
const mapMetadata = { name: 'Practice area', attribution: '© Example', bounds: [-77.1, 38.8, -76.9, 39.0], zoomLevels: [12, 13], tileCount: 50, importedAt: '2026-10-01T10:00:00.000Z', tilesByZoom: { 12: 25, 13: 25 } };
const codeOf = fn => { try { fn(); return null; } catch (error) { return error.code; } };
const roundtrip = (l = list(), options = { mapMetadata, appVersion: '4.0.8', now: NOW }) => parseFieldPack(serializeFieldPack(buildFieldPack(l, options)));

describe('build and serialize', () => {
  test('pack carries route, notes, map reference, provenance and a revision; never tiles', () => {
    const pack = buildFieldPack(list(), { mapMetadata, appVersion: '4.0.8', now: NOW });
    expect(pack).toMatchObject({ format: FIELD_PACK_FORMAT, version: FIELD_PACK_VERSION,
      route: { name: 'NORTH RIDGE', notes: 'Meet at trailhead', paceMinPerKm: 15 },
      mapReference: { name: 'Practice area', tileCount: 50, zoomLevels: [12, 13], tilesIncluded: false },
      provenance: { app: 'Red Grid MGRS', appVersion: '4.0.8', exportedAt: new Date(NOW).toISOString() } });
    expect(pack.route.points).toHaveLength(3);
    expect(pack.route.points[0]).toMatchObject({ label: 'CP 1', lat: 38.8895, lon: -77.0353, source: 'gps', accuracyM: 5, note: 'Start' });
    expect(pack.revision).toMatch(/^[0-9a-f]{16}$/);
    const text = serializeFieldPack(pack);
    expect(text).not.toMatch(/tilesByZoom|tile_data|base64|https?:\/\//);
    expect(text.length).toBeLessThan(4000);
  });

  test('revision is stable for the same content and changes when a coordinate changes', () => {
    const a = buildFieldPack(list(), { mapMetadata, now: NOW });
    const b = buildFieldPack(list(), { mapMetadata, now: NOW + 99999 });
    expect(b.revision).toBe(a.revision);
    const moved = list(); moved.waypoints[1] = point('2', 38.9001, -77.02);
    expect(buildFieldPack(moved, { mapMetadata, now: NOW }).revision).not.toBe(a.revision);
    expect(shortRevision(a.revision)).toHaveLength(8);
  });

  test('no imported map means a null map reference', () => {
    expect(buildFieldPack(list(), { now: NOW }).mapReference).toBeNull();
  });

  test('empty and over-limit routes are refused', () => {
    expect(codeOf(() => buildFieldPack(list({ waypoints: [] })))).toBe('EMPTY_ROUTE');
    expect(codeOf(() => buildFieldPack(list({ waypoints: Array.from({ length: 21 }, (_, i) => point(String(i), 38 + i / 100, -77)) })))).toBe('TOO_MANY_POINTS');
  });

  test('estimated points export as coordinates with their source, without dead-reckoning origin', () => {
    const estimated = point('e', 38.92, -77.0, { source: 'estimated', provenance: { kind: 'dead-reckoning',
      origin: { lat: 38.9, lon: -77.0, source: 'manual', pinnedAt: NOW - 5000 }, gridBearing: 10, distanceMeters: 2200, calculatedAt: NOW - 4000 } });
    const pack = buildFieldPack(list({ waypoints: [estimated] }), { now: NOW });
    expect(pack.route.points[0].source).toBe('estimated');
    expect(pack.route.points[0].provenance).toBeUndefined();
    expect(JSON.stringify(pack)).not.toMatch(/gridBearing|dead-reckoning/);
    expect(packPointSources(pack)).toEqual({ estimated: 1 });
  });

  test('file names contain only safe characters and never a path', () => {
    expect(fieldPackFileName('../../etc/passwd')).toBe('etc_passwd.redgridpack.json');
    expect(fieldPackFileName('NORTH RIDGE / 練習')).toBe('NORTH_RIDGE.redgridpack.json');
    expect(fieldPackFileName('')).toBe('route.redgridpack.json');
    expect(fieldPackFileName('A'.repeat(200)).length).toBeLessThanOrEqual(40 + '.redgridpack.json'.length);
  });
});

describe('parse and validate', () => {
  test('a pack round-trips exactly', () => {
    const original = buildFieldPack(list(), { mapMetadata, appVersion: '4.0.8', now: NOW });
    const parsed = roundtrip();
    expect(parsed.revision).toBe(original.revision);
    expect(parsed.route).toEqual(original.route);
    expect(parsed.mapReference).toEqual(original.mapReference);
    expect(parsed.provenance).toEqual(original.provenance);
  });

  test.each([
    ['not json', '{nope'], ['an array', '[]'], ['another format', JSON.stringify({ format: 'gpx', version: 1 })],
    ['a missing version', JSON.stringify({ format: FIELD_PACK_FORMAT, route: {} })], ['a number', '42'], ['non-text input', null],
  ])('%s is not a pack', (_label, text) => {
    expect(codeOf(() => parseFieldPack(text))).toBe('NOT_A_PACK');
  });

  test('a newer format version is refused, not half-read', () => {
    const pack = { ...buildFieldPack(list(), { now: NOW }), version: FIELD_PACK_VERSION + 1 };
    expect(codeOf(() => parseFieldPack(JSON.stringify(pack)))).toBe('UNSUPPORTED_VERSION');
  });

  test('oversize input is refused before parsing', () => {
    const spy = jest.spyOn(JSON, 'parse');
    expect(codeOf(() => parseFieldPack('x'.repeat(FIELD_PACK_LIMITS.bytes + 1)))).toBe('TOO_LARGE');
    expect(codeOf(() => parseFieldPack('é'.repeat(FIELD_PACK_LIMITS.bytes / 2 + 1)))).toBe('TOO_LARGE');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test.each([
    ['no points', p => { p.route.points = []; }, 'INVALID_ROUTE'],
    ['too many points', p => { p.route.points = Array.from({ length: 21 }, () => p.route.points[0]); }, 'INVALID_ROUTE'],
    ['missing route', p => { delete p.route; }, 'INVALID_ROUTE'],
    ['text coordinates', p => { p.route.points[0].lat = '38.9'; }, 'INVALID_POINT'],
    ['out-of-range latitude', p => { p.route.points[0].lat = 89; }, 'INVALID_POINT'],
    ['non-finite longitude', p => { p.route.points[0].lon = null; }, 'INVALID_POINT'],
    ['a null point', p => { p.route.points[1] = null; }, 'INVALID_POINT'],
  ])('%s is rejected', (_label, mutate, code) => {
    const pack = buildFieldPack(list(), { now: NOW });
    mutate(pack);
    expect(codeOf(() => parseFieldPack(JSON.stringify(pack)))).toBe(code);
  });

  test('edited or damaged content no longer matches its revision', () => {
    const pack = buildFieldPack(list(), { mapMetadata, now: NOW });
    const edited = JSON.parse(JSON.stringify(pack)); edited.route.points[0].lon = -77.5;
    expect(codeOf(() => parseFieldPack(JSON.stringify(edited)))).toBe('REVISION_MISMATCH');
    const renamedMap = JSON.parse(JSON.stringify(pack)); renamedMap.mapReference.name = 'Another map';
    expect(codeOf(() => parseFieldPack(JSON.stringify(renamedMap)))).toBe('REVISION_MISMATCH');
  });

  test('unknown keys are ignored and never carried into the result', () => {
    const pack = buildFieldPack(list(), { mapMetadata, now: NOW });
    const noisy = { ...pack, script: 'alert(1)', tiles: ['AAAA'], route: { ...pack.route, url: 'https://example.com/x', points: pack.route.points.map(p => ({ ...p, onLoad: 'x' })) } };
    const parsed = parseFieldPack(JSON.stringify(noisy));
    expect(Object.keys(parsed).sort()).toEqual(['format', 'mapReference', 'provenance', 'revision', 'route', 'version']);
    expect(JSON.stringify(parsed)).not.toMatch(/alert|example\.com|onLoad|AAAA/);
  });

  test('control characters are stripped and text is capped', () => {
    const dirty = list({ name: 'RIDGE\u0000\u0007', notes: 'ok\u0001' });
    dirty.waypoints[0] = point('1', 38.8895, -77.0353, { label: `A\u0002${'B'.repeat(200)}` });
    const parsed = roundtrip(dirty);
    expect(parsed.route.name).toBe('RIDGE');
    expect(parsed.route.notes).toBe('ok');
    expect(parsed.route.points[0].label.length).toBeLessThanOrEqual(80);
    // eslint-disable-next-line no-control-regex
    expect(JSON.stringify(parsed)).not.toMatch(/\\u000[0-8]/);
  });

  test('MGRS text in the file is recomputed from coordinates', () => {
    const pack = buildFieldPack(list(), { now: NOW });
    const expected = pack.route.points[0].mgrs;
    const forged = JSON.parse(JSON.stringify(pack)); forged.route.points[0].mgrs = '00X XX 00000 00000';
    // The coordinates are unchanged, so the content revision still matches and the label text is corrected.
    expect(parseFieldPack(JSON.stringify(forged)).route.points[0].mgrs).toBe(expected);
  });
});

describe('import is non-destructive', () => {
  const existing = () => normalizeWaypointLists([list(), list({ id: 'list-b', name: 'RETURN' })]);

  test('adds a new list with fresh ids and leaves existing lists untouched', () => {
    const lists = existing();
    const snapshot = JSON.stringify(lists);
    const added = fieldPackToList(roundtrip(), lists, { now: NOW });
    expect(JSON.stringify(lists)).toBe(snapshot);
    expect(lists.map(l => l.id)).not.toContain(added.id);
    expect(added.name).toBe('NORTH RIDGE (2)');
    expect(new Set(added.waypoints.map(p => p.id)).size).toBe(3);
    expect(added.waypoints.every(p => p.source === 'import' && p.accuracyM === null)).toBe(true);
    const next = normalizeWaypointLists([...lists, added]);
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual(JSON.parse(snapshot));
  });

  test('names never collide, even repeatedly', () => {
    const lists = [{ name: 'NORTH RIDGE' }, { name: 'NORTH RIDGE (2)' }];
    expect(uniqueListName('north ridge', lists)).toBe('NORTH RIDGE (3)');
    expect(uniqueListName('A'.repeat(80), [{ name: 'A'.repeat(80) }])).toHaveLength(80);
    expect(uniqueListName('NEW', lists)).toBe('NEW');
  });

  test('a full list set refuses the import', () => {
    const full = Array.from({ length: MAX_WAYPOINT_LISTS }, (_, i) => ({ id: `l${i}`, name: `L${i}`, waypoints: [] }));
    expect(codeOf(() => fieldPackToList(roundtrip(), full))).toBe('LIST_LIMIT');
  });

  test('id collisions are retried a bounded number of times', () => {
    const newId = jest.fn(() => 'list-a');
    expect(codeOf(() => fieldPackToList(roundtrip(), existing(), { newId }))).toBe('ID_UNAVAILABLE');
    expect(newId.mock.calls.length).toBeLessThan(12);
  });
});

describe('pack origin persists with the saved list', () => {
  test('revision, exporter and sender map reference survive save and reopen', () => {
    const pack = roundtrip();
    const added = fieldPackToList(pack, [], { now: NOW });
    const reopened = normalizeWaypointLists(JSON.parse(JSON.stringify(normalizeWaypointLists([added]))));
    expect(reopened[0].pack).toEqual({ revision: pack.revision, version: 1, app: 'Red Grid MGRS', appVersion: '4.0.8',
      exportedAt: new Date(NOW).toISOString(), importedAt: NOW, pointSources: { gps: 1, manual: 2 },
      mapReference: { ...pack.mapReference } });
    expect(reopened[0].pack.mapReference.tilesIncluded).toBe(false);
  });

  test('lists without a pack are unchanged and damaged pack records are dropped, not fatal', () => {
    expect(normalizeWaypointLists([list()])[0]).not.toHaveProperty('pack');
    expect(normalizeWaypointLists([list({ pack: { revision: 'zzz', mapReference: { name: 'x' } } })])[0]).not.toHaveProperty('pack');
    expect(normalizePackProvenance({ revision: 'a'.repeat(16), app: 'X'.repeat(500), pointSources: { gps: 999, hacked: 3 }, mapReference: { name: 'M', bounds: [1, 2, 'x', 4], tilesIncluded: true } }))
      .toMatchObject({ app: 'X'.repeat(40), pointSources: {}, mapReference: { name: 'M', bounds: null, tilesIncluded: false } });
  });

  test('editing an imported list keeps its origin', () => {
    const added = normalizeWaypointLists([fieldPackToList(roundtrip(), [], { now: NOW })])[0];
    const edited = normalizeWaypointLists([{ ...added, name: 'RENAMED', waypoints: added.waypoints.slice(0, 2) }])[0];
    expect(edited.pack.revision).toBe(added.pack.revision);
  });
});

describe('map reference comparison is descriptive only', () => {
  const ref = buildFieldPack(list(), { mapMetadata, now: NOW }).mapReference;
  test.each([
    [null, mapMetadata, 'none'], [ref, null, 'absent'], [ref, mapMetadata, 'same'],
    [ref, { ...mapMetadata, tileCount: 49 }, 'different'], [ref, { ...mapMetadata, bounds: [-77.2, 38.8, -76.9, 39.0] }, 'different'],
    [ref, { ...mapMetadata, name: 'Other' }, 'different'],
  ])('relation %#', (reference, local, expected) => {
    expect(compareMapReference(reference, local)).toBe(expected);
  });
});

describe('map reference import time', () => {
  test('the importer\'s ISO string and a numeric timestamp are both kept', () => {
    const iso = '2026-10-01T10:00:00.000Z';
    expect(buildFieldPack(list(), { mapMetadata, now: NOW }).mapReference.importedAt).toBe(iso);
    expect(buildFieldPack(list(), { mapMetadata: { ...mapMetadata, importedAt: Date.parse(iso) }, now: NOW }).mapReference.importedAt).toBe(iso);
    expect(buildFieldPack(list(), { mapMetadata: { ...mapMetadata, importedAt: 'soon' }, now: NOW }).mapReference.importedAt).toBeNull();
    const kept = normalizeWaypointLists([fieldPackToList(roundtrip(), [], { now: NOW })])[0].pack.mapReference.importedAt;
    expect(kept).toBe(iso);
    expect(normalizePackProvenance({ revision: 'a'.repeat(16), mapReference: { name: 'M', importedAt: Date.parse(iso) } }).mapReference.importedAt).toBe(iso);
  });
});

describe('picked file checks before reading', () => {
  const ok = { exists: true, isDirectory: false, size: 1200 };
  test('a local regular file within the limit is accepted', () => {
    expect(assertReadablePackFile({ uri: 'file:///cache/a.json', size: 1200 }, ok)).toBe('file:///cache/a.json');
    expect(assertReadablePackFile({ uri: 'file:///cache/a.json' }, ok)).toBe('file:///cache/a.json');
  });
  test.each([
    ['a remote url', { uri: 'https://example.com/a.json', size: 10 }, ok, 'UNREADABLE'],
    ['a content uri', { uri: 'content://provider/a', size: 10 }, ok, 'UNREADABLE'],
    ['a missing uri', { size: 10 }, ok, 'UNREADABLE'],
    ['a missing file', { uri: 'file:///a' }, { exists: false }, 'UNREADABLE'],
    ['a directory', { uri: 'file:///a' }, { exists: true, isDirectory: true, size: 10 }, 'UNREADABLE'],
    ['no file info', { uri: 'file:///a', size: 10 }, null, 'UNREADABLE'],
    ['an unknown size', { uri: 'file:///a' }, { exists: true }, 'UNREADABLE'],
    ['a negative size', { uri: 'file:///a', size: -1 }, ok, 'UNREADABLE'],
    ['a non-finite size', { uri: 'file:///a', size: Infinity }, ok, 'UNREADABLE'],
    ['a text size', { uri: 'file:///a', size: '10' }, ok, 'UNREADABLE'],
    ['an understated picker size', { uri: 'file:///a', size: 10 }, { ...ok, size: FIELD_PACK_LIMITS.bytes + 1 }, 'TOO_LARGE'],
    ['an oversize file', { uri: 'file:///a', size: FIELD_PACK_LIMITS.bytes + 1 }, ok, 'TOO_LARGE'],
    ['an empty file', { uri: 'file:///a', size: 0 }, { ...ok, size: 0 }, 'NOT_A_PACK'],
  ])('%s is refused', (_label, file, info, code) => {
    expect(codeOf(() => assertReadablePackFile(file, info))).toBe(code);
  });
});

describe('out-of-range numeric dates in optional metadata', () => {
  const huge = [1e30, 8.64e15 + 1, Number.MAX_VALUE, -5, Infinity, NaN];
  test.each(huge)('a provenance date of %p is dropped and the list still loads', value => {
    const stored = list({ pack: { revision: 'a'.repeat(16), exportedAt: value, importedAt: NOW, mapReference: { name: 'M', importedAt: value } } });
    let loaded;
    expect(() => { loaded = normalizeWaypointLists([stored]); }).not.toThrow();
    expect(loaded[0].waypoints).toHaveLength(3);
    expect(loaded[0].pack).toMatchObject({ revision: 'a'.repeat(16), exportedAt: null, mapReference: { name: 'M', importedAt: null } });
  });
  test.each(huge)('a map import time of %p does not break building or parsing a pack', value => {
    expect(buildFieldPack(list(), { mapMetadata: { ...mapMetadata, importedAt: value }, now: NOW }).mapReference.importedAt).toBeNull();
    const pack = JSON.parse(serializeFieldPack(buildFieldPack(list(), { mapMetadata, now: NOW })));
    pack.provenance.exportedAt = value === Infinity || Number.isNaN(value) ? 1e30 : value;
    expect(parseFieldPack(JSON.stringify(pack)).provenance.exportedAt).toBeNull();
  });
  test('the largest valid Date value is still accepted', () => {
    expect(normalizePackProvenance({ revision: 'a'.repeat(16), exportedAt: 8.64e15 }).exportedAt).toBe('+275760-09-13T00:00:00.000Z');
  });
});
