/** Preflight for a prepared route: every leg is checked, a gap blocks READY, closing cancels. */
jest.mock('react', () => {
  const hooks = require('./helpers/hookHarness')();
  return { ...jest.requireActual('react'), ...hooks, useMemo: (fn, deps) => hooks.useCallback(fn, deps)() };
});
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Platform: { OS: 'ios' }, StyleSheet: { create: value => value, hairlineWidth: 1 } }));
jest.mock('../src/components/FieldInput', () => ({ TextInput: 'TextInput' }));
jest.mock('../src/components/FieldModal', () => ({ Modal: 'Modal' }));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ text: '#fff', text2: '#ddd', text3: '#aaa' }) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { body: {}, label: {}, heading: {}, data: {} } }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../src/utils/haptics', () => ({ tapLight: jest.fn(), tapMedium: jest.fn(), notifySuccess: jest.fn() }));
jest.mock('../src/hooks/useAOPackages', () => ({ useAOPackages: () => ({ aoPackages: [], loaded: true, canSaveMore: () => true }), FREE_AO_LIMIT: 1 }));
const mockTiles = { exists: async () => true, generation: 1, metadata: { name: 'QA', zoomLevels: [12], inventoryComplete: true } };
jest.mock('../src/utils/tileManager', () => ({
  CHECK_TILE_CAP: 20000,
  checkImportedMapCoverage: jest.fn().mockResolvedValue({ state: 'unscoped', zoomLevels: [], byZoom: {} }),
  getOfflineMapMetadata: jest.fn(async () => mockTiles.metadata),
  getTileCacheState: () => ({ mutating: false, generation: mockTiles.generation }),
  importedTileExists: jest.fn((z, x, y) => mockTiles.exists(z, x, y)),
  recoverOfflineTileCache: jest.fn(async () => true),
}));
jest.mock('../src/utils/fieldReadiness', () => {
  const actual = jest.requireActual('../src/utils/fieldReadiness');
  return { ...actual, navigationReadiness: jest.fn(actual.navigationReadiness) };
});
const React = require('react');
const { navigationReadiness } = require('../src/utils/fieldReadiness');
const mapStatuses = () => { render(); return navigationReadiness.mock.calls.at(-1)[0].mapStatuses; };
const tileManager = require('../src/utils/tileManager');
const { PreflightScreen } = require('../src/screens/PreflightScreen');
const { RouteCoveragePanel } = require('../src/components/RouteCoveragePanel');
const { planRouteTiles } = require('../src/utils/routeCoverage');

const nodes = v => { if (!v || typeof v !== 'object') return []; if (Array.isArray(v)) return v.flatMap(nodes); return [v, ...nodes(v.props?.children)]; };
const text = v => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(text).join('') : v?.props ? text(v.props.children) : '');
const route = { id: 'r', name: 'NORTH RIDGE', waypoints: [{ id: '1', label: 'START', lat: 38.8895, lon: -77.0353 }, { id: '2', label: 'CREEK', lat: 38.95, lon: -76.95 }, { id: '3', label: 'RIDGE', lat: 39.0, lon: -76.9 }] };
const total = planRouteTiles(route.waypoints, [12]).total;
let props;
const render = () => React.__render(() => PreflightScreen(props));
const panel = () => nodes(render()).find(n => n.type === RouteCoveragePanel);
const settle = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
beforeEach(() => {
  React.__reset(); jest.clearAllMocks();
  mockTiles.exists = async () => true; mockTiles.generation = 1;
  props = { visible: true, preparedRoute: route, isPro: true, location: { lat: 38.9, lon: -77, accuracy: 5 }, onClose: jest.fn(), onStartNavigation: jest.fn() };
});

test('opening preflight for a route checks every leg, not the viewport', async () => {
  render(); React.__effects(); await settle();
  const coverage = panel().props.coverage;
  expect(coverage.status).toBe('done');
  expect(coverage.result).toMatchObject({ state: 'complete', total, cached: total });
  expect(coverage.result.legs.map(l => l.state)).toEqual(['complete', 'complete']);
  expect(tileManager.importedTileExists).toHaveBeenCalledTimes(total);
  expect(mapStatuses()).toEqual(['ok']);
  expect(text(render())).not.toContain('fieldNav.mapsNotChecked');
});

test('a gap on one leg is reported for that leg and blocks READY', async () => {
  const last = planRouteTiles([route.waypoints[2]], [12]).tiles[0];
  mockTiles.exists = async (z, x, y) => !(x === last.x && y === last.y);
  render(); React.__effects(); await settle();
  expect(panel().props.coverage.result.legs.map(l => l.state)).toEqual(['complete', 'partial']);
  expect(mapStatuses()).toEqual(['fail']);
  expect(text(render())).toContain('preflight.summary.NOT_READY');
});

test('a check that has not finished is never READY', () => {
  mockTiles.exists = () => new Promise(() => {});
  render(); React.__effects();
  expect(panel().props.coverage.status).toBe('checking');
  expect(mapStatuses()).toEqual(['warn']);
  expect(text(render())).not.toContain('preflight.summary.READY');
});

test('closing preflight cancels the running check', async () => {
  let reads = 0;
  mockTiles.exists = async () => { reads++; if (reads === 3) { props.visible = false; render(); React.__effects(); } return true; };
  render(); React.__effects(); await settle();
  expect(reads).toBeLessThan(total);
  props.visible = true;
  expect(panel().props.coverage.result).toMatchObject({ state: 'unknown', reason: 'cancelled' });
  expect(mapStatuses()).toEqual(['warn']);
});

test('without a prepared route the route panel is absent and the viewport check is unchanged', async () => {
  props.preparedRoute = undefined; props.mapRegion = { latitude: 38.9, longitude: -77, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  render(); React.__effects(); await settle();
  expect(panel()).toBeUndefined();
  expect(tileManager.checkImportedMapCoverage).toHaveBeenCalledWith(props.mapRegion);
  expect(tileManager.importedTileExists).not.toHaveBeenCalled();
  expect(mapStatuses()).toEqual(['warn']);
});

test('no imported map is a caution for a route, not a false READY and not a hard stop', async () => {
  tileManager.getOfflineMapMetadata.mockResolvedValueOnce(null);
  render(); React.__effects(); await settle();
  expect(panel().props.coverage.result).toMatchObject({ state: 'missing', reason: 'no_map' });
  expect(mapStatuses()).toEqual(['warn']);
});
