/**
 * LISTS workflow for field packs: share goes through the system share sheet,
 * import previews first, adds a new list and never edits or deletes one.
 */
jest.mock('react', () => {
  const hooks = require('./helpers/hookHarness')();
  return { ...jest.requireActual('react'), ...hooks, useMemo: (fn, deps) => hooks.useCallback(fn, deps)() };
});
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  StyleSheet: { create: value => value, hairlineWidth: 1 }, Platform: { OS: 'ios' } }));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ bg: '#101718', card: '#202828', text: '#fff', text2: '#ccc', text3: '#aaa', border: '#333', border2: '#222', accentText: '#f00' }) }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key, values) => key + (values?.name ? `:${values.name}` : '') }) }));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() }, allowSystemDisplay: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { body: {}, label: {}, heading: {}, data: {} } }));
jest.mock('../src/components/FieldInput', () => ({ TextInput: 'TextInput' }));
jest.mock('../src/components/FieldModal', () => ({ Modal: 'Modal' }));
jest.mock('../src/components/RouteCard', () => ({ RouteCard: 'RouteCard' }));
jest.mock('../src/screens/PreflightScreen', () => ({ PreflightScreen: 'PreflightScreen' }));
jest.mock('../src/utils/haptics', () => ({ tapLight: jest.fn(), notifySuccess: jest.fn(), notifyWarning: jest.fn() }));
jest.mock('../src/utils/clipboard', () => ({ copyTextToClipboard: jest.fn() }));
const mockMap = { metadata: null };
jest.mock('../src/utils/tileManager', () => ({
  getOfflineMapMetadata: jest.fn(async () => mockMap.metadata), getTileCacheState: () => ({ mutating: false, generation: 1 }),
  importedTileExists: jest.fn(async () => true), recoverOfflineTileCache: jest.fn(async () => true), CHECK_TILE_CAP: 20000,
}));
const mockFs = { files: {}, sizes: {} };
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/', EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async (path, text) => { mockFs.files[path] = text; }),
  readAsStringAsync: jest.fn(async path => mockFs.files[path]),
  getInfoAsync: jest.fn(async path => ({ exists: path in mockFs.files, size: mockFs.sizes[path] ?? (mockFs.files[path] || '').length })),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const React = require('react');
const FileSystem = require('expo-file-system');
const Sharing = require('expo-sharing');
const DocumentPicker = require('expo-document-picker');
const { Alert, allowSystemDisplay } = require('../src/utils/fieldAlert');
const { WaypointListsScreen } = require('../src/screens/WaypointListsScreen');
const { FieldPackModal, FieldPackImportModal } = require('../src/components/FieldPackModal');
const { buildFieldPack, serializeFieldPack, parseFieldPack, FIELD_PACK_LIMITS } = require('../src/utils/fieldPack');
const { normalizeWaypointLists } = require('../src/utils/waypoints');

const nodes = v => { if (!v || typeof v !== 'object') return []; if (Array.isArray(v)) return v.flatMap(nodes); return [v, ...nodes(v.props?.children)]; };
const byLabel = (tree, label) => nodes(tree).find(n => n.props?.accessibilityLabel === label);
const text = v => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(text).join('') : v?.props ? text(v.props.children) : '');
const NOW = Date.UTC(2026, 9, 2);
const point = (id, lat, lon) => ({ id, label: `CP ${id}`, lat, lon, source: 'manual', recordedAt: NOW });
const existing = () => normalizeWaypointLists([{ id: 'list-a', name: 'NORTH RIDGE', notes: 'n', waypoints: [point('1', 38.8895, -77.0353), point('2', 38.9, -77.02)] }]);
const packText = (name = 'NORTH RIDGE') => serializeFieldPack(buildFieldPack({ name, notes: 'from sender', waypoints: [point('a', 40.1, -75.1), point('b', 40.2, -75.2)] },
  { mapMetadata: { name: 'Sender map', bounds: [-75.3, 40, -75, 40.3], zoomLevels: [12], tileCount: 9 }, appVersion: '4.0.8', now: NOW }));
const pick = (content, { size, name = 'pack.redgridpack.json' } = {}) => {
  const uri = `file:///cache/${name}`;
  mockFs.files[uri] = content; if (size != null) mockFs.sizes[uri] = size;
  DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri, name }] });
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let props; let lists;
const render = () => React.__render(() => WaypointListsScreen(props));
beforeEach(() => {
  React.__reset(); jest.clearAllMocks(); mockFs.files = {}; mockFs.sizes = {}; mockMap.metadata = null;
  allowSystemDisplay.mockResolvedValue(true);
  lists = existing();
  props = { savedLists: lists, onSaveList: jest.fn(async list => { lists = normalizeWaypointLists([...lists, list]); props.savedLists = lists; return list; }),
    onUpdateList: jest.fn(), onDeleteList: jest.fn(), onStartRoute: jest.fn() };
});
const importPreview = tree => nodes(tree).find(n => n.type === FieldPackImportModal);

describe('importing a field pack from LISTS', () => {
  test('shows a preview first; confirming adds a new list and changes no existing list', async () => {
    pick(packText());
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(props.onSaveList).not.toHaveBeenCalled();
    const preview = importPreview(render()).props.preview;
    expect(preview).toMatchObject({ fileName: 'pack.redgridpack.json', mapRelation: 'absent', listName: 'NORTH RIDGE (2)', renamed: true });
    expect(preview.pack.route.points).toHaveLength(2);

    const before = JSON.stringify(lists[0]);
    await importPreview(render()).props.onConfirm();
    expect(props.onSaveList).toHaveBeenCalledTimes(1);
    expect(props.onUpdateList).not.toHaveBeenCalled();
    expect(props.onDeleteList).not.toHaveBeenCalled();
    expect(lists).toHaveLength(2);
    expect(JSON.stringify(lists[0])).toBe(before);
    expect(lists[1]).toMatchObject({ name: 'NORTH RIDGE (2)', notes: 'from sender', pack: { mapReference: { name: 'Sender map' } } });
    expect(lists[1].waypoints.every(p => p.source === 'import')).toBe(true);
    expect(importPreview(render()).props.preview).toBeNull();
  });

  test('cancelling the preview saves nothing', async () => {
    pick(packText('SOLO'));
    await byLabel(render(), 'fieldPack.import').props.onPress();
    importPreview(render()).props.onCancel();
    expect(importPreview(render()).props.preview).toBeNull();
    expect(props.onSaveList).not.toHaveBeenCalled();
  });

  test('the sender map is compared by description with the map on this device', async () => {
    mockMap.metadata = { name: 'Sender map', bounds: [-75.3, 40, -75, 40.3], zoomLevels: [12], tileCount: 9 };
    pick(packText('SOLO'));
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(importPreview(render()).props.preview).toMatchObject({ mapRelation: 'same', renamed: false, listName: 'SOLO' });
    mockMap.metadata = { name: 'Other', bounds: [0, 0, 1, 1], tileCount: 1 };
    React.__reset();
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(importPreview(render()).props.preview.mapRelation).toBe('different');
  });

  test.each([
    ['an oversize file is refused before it is read', () => pick('{}', { size: FIELD_PACK_LIMITS.bytes + 1 }), 'fieldPack.errors.tooLarge', false],
    ['a non-pack file', () => pick('<gpx></gpx>'), 'fieldPack.errors.invalid', true],
    ['a pack from a newer version', () => pick(JSON.stringify({ ...JSON.parse(packText()), version: 99 })), 'fieldPack.errors.version', true],
    ['an edited pack', () => { const p = JSON.parse(packText()); p.route.points[0].lat = 41; pick(JSON.stringify(p)); }, 'fieldPack.errors.damaged', true],
    ['a pack with an unusable point', () => { const p = JSON.parse(packText()); p.route.points[0].lat = 'north'; pick(JSON.stringify(p)); }, 'fieldPack.errors.point', true],
  ])('%s', async (_label, arrange, messageKey, read) => {
    arrange();
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(Alert.alert).toHaveBeenLastCalledWith('fieldPack.importTitle', messageKey);
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(read ? 1 : 0);
    expect(importPreview(render()).props.preview).toBeNull();
    expect(props.onSaveList).not.toHaveBeenCalled();
  });

  test('ten existing lists refuse the import before the picker opens', async () => {
    props.savedLists = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, waypoints: [] }));
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('fieldPack.importTitle', 'fieldPack.errors.listLimit');
  });

  test('a failed save keeps the preview open and the lists unchanged', async () => {
    props.onSaveList = jest.fn(async () => { throw new Error('disk'); });
    pick(packText('SOLO'));
    await byLabel(render(), 'fieldPack.import').props.onPress();
    await importPreview(render()).props.onConfirm();
    expect(importPreview(render()).props.preview).not.toBeNull();
    expect(importPreview(render()).props.failed).toBe(true);
    expect(lists).toHaveLength(1);
  });

  test('while the list is being committed the preview can be neither cancelled nor confirmed twice', async () => {
    let finish;
    props.onSaveList = jest.fn(list => new Promise(resolve => { finish = () => { lists = normalizeWaypointLists([...lists, list]); props.savedLists = lists; resolve(list); }; }));
    pick(packText('SOLO'));
    await byLabel(render(), 'fieldPack.import').props.onPress();
    const committing = importPreview(render()).props.onConfirm();
    await flush();
    const during = importPreview(render()).props;
    expect(during.busy).toBe(true);
    during.onCancel();
    await during.onConfirm();
    expect(importPreview(render()).props.preview).not.toBeNull();
    expect(props.onSaveList).toHaveBeenCalledTimes(1);
    finish(); await committing;
    expect(importPreview(render()).props).toMatchObject({ preview: null, busy: false });
    expect(lists).toHaveLength(2);
  });

  test.each([
    ['a remote uri', { uri: 'https://example.com/pack.json', name: 'pack.json', size: 100 }],
    ['a directory', { uri: 'file:///cache/dir', name: 'dir', size: 100, directory: true }],
    ['a file of unknown size', { uri: 'file:///cache/unknown.json', name: 'unknown.json', unknownSize: true }],
  ])('%s is refused without being read', async (_label, asset) => {
    if (asset.uri.startsWith('file')) mockFs.files[asset.uri] = packText();
    // Queue the override only when it will be consumed; the remote case is refused before any file lookup.
    if (asset.uri.startsWith('file')) FileSystem.getInfoAsync.mockImplementationOnce(async () => ({ exists: true, isDirectory: !!asset.directory, ...(asset.unknownSize ? {} : { size: 100 }) }));
    DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: asset.uri, name: asset.name, ...(asset.size != null ? { size: asset.size } : {}) }] });
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('fieldPack.importTitle', 'fieldPack.errors.read');
    expect(importPreview(render()).props.preview).toBeNull();
  });

  test('a dismissed picker and a refused system display do nothing', async () => {
    DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true });
    await byLabel(render(), 'fieldPack.import').props.onPress();
    allowSystemDisplay.mockResolvedValue(false);
    await byLabel(render(), 'fieldPack.import').props.onPress();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('field pack sheet', () => {
  const sheet = extra => React.__render(() => FieldPackModal({ visible: true, list: lists[0], appVersion: '4.0.8', onClose: jest.fn(), ...extra }));
  const shareButton = tree => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n) === 'fieldPack.share');

  test('LISTS opens the sheet for the selected list', () => {
    render(); React.__effects();
    byLabel(render(), 'fieldPack.button').props.onPress();
    const modal = nodes(render()).find(n => n.type === FieldPackModal);
    expect(modal.props).toMatchObject({ visible: true, list: lists[0] });
  });

  test('share writes one bounded JSON pack to the cache and hands it to the system share sheet', async () => {
    mockMap.metadata = { name: 'Local map', bounds: [-78, 38, -77, 39], zoomLevels: [12], tileCount: 4 };
    sheet(); React.__effects(); await flush();
    await shareButton(sheet()).props.onPress();
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    const [path, options] = Sharing.shareAsync.mock.calls[0];
    expect(path).toBe('file:///cache/NORTH_RIDGE.redgridpack.json');
    expect(options).toMatchObject({ mimeType: 'application/json' });
    const written = parseFieldPack(mockFs.files[path]);
    expect(written.route.points.map(p => p.label)).toEqual(['CP 1', 'CP 2']);
    expect(written.mapReference).toMatchObject({ name: 'Local map', tilesIncluded: false });
    expect(Object.keys(mockFs.files)).toEqual([path]);
  });

  test('the sheet states that map files are not included and offers the route check', async () => {
    const tree = sheet();
    expect(text(tree)).toContain('fieldPack.mapsNotIncluded');
    expect(text(tree)).toContain('fieldPack.noMapReference');
    expect(text(tree)).not.toContain('fieldPack.estimatedNote');
  });

  test('an empty list cannot be shared', () => {
    const tree = sheet({ list: { id: 'e', name: 'EMPTY', waypoints: [] } });
    expect(text(tree)).toContain('fieldPack.empty');
    expect(shareButton(tree)).toBeUndefined();
  });

  test('sharing is skipped when the system display is not allowed or sharing is unavailable', async () => {
    allowSystemDisplay.mockResolvedValue(false);
    await shareButton(sheet()).props.onPress();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    allowSystemDisplay.mockResolvedValue(true); Sharing.isAvailableAsync.mockResolvedValueOnce(false);
    React.__reset();
    await shareButton(sheet()).props.onPress();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('waypoints.sharingUnavailable', 'waypoints.sharingUnavailableMsg');
  });

  test('an imported list shows where it came from; estimated points are disclosed', () => {
    const imported = { ...lists[0], pack: { revision: 'abcdef0123456789', exportedAt: '2026-10-01T00:00:00.000Z', mapReference: { name: 'Sender map' } },
      waypoints: [...lists[0].waypoints, { ...point('3', 38.95, -77.0), source: 'estimated', provenance: { kind: 'dead-reckoning',
        origin: { lat: 38.9, lon: -77.0, source: 'manual', pinnedAt: NOW }, gridBearing: 0, distanceMeters: 5500, calculatedAt: NOW } }] };
    const tree = sheet({ list: imported });
    expect(text(tree)).toContain('fieldPack.importedFrom');
    expect(text(tree)).toContain('fieldPack.senderMap:Sender map');
    expect(text(tree)).toContain('fieldPack.estimatedNote');
  });
});
