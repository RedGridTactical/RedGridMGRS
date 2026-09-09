jest.mock('react', () => {
  const hooks = require('./helpers/hookHarness')();
  return { ...jest.requireActual('react'), ...hooks, useMemo: (fn, deps) => hooks.useCallback(fn, deps)() };
});
jest.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }),
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  StyleSheet: { create: value => value, hairlineWidth: 1 }, Platform: { OS: 'ios', select: value => value.ios },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  Animated: { Value: jest.fn(), View: 'AnimatedView' },
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', UrlTile: 'UrlTile', LocalTile: 'LocalTile' }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue() }));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ bg: '#101718', card: '#202828', text: '#fff', text2: '#ccc', text3: '#aaa', border: '#333', accentText: '#f00' }) }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key, values) => key + (values?.name ? `:${values.name}` : '') }) }));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() }, allowSystemDisplay: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { body: {}, label: {}, heading: {}, data: {} } }));
jest.mock('../src/components/FieldInput', () => ({ TextInput: 'TextInput' }));
jest.mock('../src/components/FieldModal', () => ({ Modal: 'Modal' }));
jest.mock('../src/components/MGRSGridOverlay', () => ({ MGRSGridOverlay: 'MGRSGridOverlay' }));
jest.mock('../src/components/RouteOverlay', () => ({ RouteOverlay: 'RouteOverlay' }));
jest.mock('../src/components/TeamMarkers', () => ({ TeamMarkers: 'TeamMarkers' }));
jest.mock('../src/screens/PreflightScreen', () => ({ PreflightScreen: 'PreflightScreen' }));
jest.mock('../src/utils/haptics', () => ({ tapLight: jest.fn(), tapMedium: jest.fn(), notifySuccess: jest.fn(), notifyError: jest.fn(), notifyWarning: jest.fn() }));
jest.mock('../src/utils/tileManager', () => ({
  getLocalTilePathTemplate: () => null, recoverOfflineTileCache: () => Promise.resolve(), getOfflineMapMetadata: () => Promise.resolve(null), checkTilesForRegion: () => Promise.resolve({ missing: [] }),
}));
jest.mock('../src/utils/offlineMaps', () => ({ importRasterMBTiles: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const React = require('react');
const { Alert } = require('../src/utils/fieldAlert');
const { MapScreen } = require('../src/screens/MapScreen');
const { ActiveNavigationBar } = require('../src/components/ActiveNavigationBar');
const { WaypointListsScreen } = require('../src/screens/WaypointListsScreen');
const POINTS = [{ id: 'a', label: 'ALPHA', lat: 38.9, lon: -77, mgrs: '18S UJ 26565 07581', note: 'Bridge' }, { id: 'b', label: 'BRAVO', lat: 38.901, lon: -77 }];
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value.type === 'Modal' && !value.props.visible) return [];
  return [value, ...nodes(value.props?.children)];
}
function text(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.props ? text(value.props.children) : '';
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'TouchableOpacity' && (node.props.accessibilityLabel === label || text(node) === label));
const input = (tree, label) => nodes(tree).find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label);
afterEach(() => { React.__reset(); jest.clearAllMocks(); });

function mapHarness(save = jest.fn().mockResolvedValue()) {
  let draft = { active: true, id: 'plan-draft', name: 'TRAIL PLAN', waypoints: POINTS.map(point => ({ ...point })) };
  const open = jest.fn();
  const props = { isPro: true, savedLists: [{ id: 'base', name: 'POINTS', waypoints: POINTS }],
    onSaveList: save, onOpenSavedRoute: open, onRouteDraftChange: change => { draft = typeof change === 'function' ? change(draft) : change; } };
  const render = () => React.__render(() => MapScreen({ ...props, routeDraft: draft }));
  return { render, save, open, getDraft: () => draft };
}

test('Map DONE retains the draft until the named route is durably saved, then opens that saved plan', async () => {
  const write = deferred(); const h = mapHarness(jest.fn(() => write.promise));
  button(h.render(), 'workflow.saveRoute').props.onPress();
  const saving = button(h.render(), 'workflow.saveAndOpen').props.onPress();
  expect(h.open).not.toHaveBeenCalled();
  expect(h.getDraft().waypoints).toHaveLength(2);
  expect(h.save.mock.calls[0][0]).toMatchObject({ id: 'plan-draft', name: 'TRAIL PLAN', waypoints: [{ id: 'a', note: 'Bridge' }, { id: 'b' }] });
  write.resolve(); await saving;
  expect(h.open).toHaveBeenCalledWith('plan-draft');
  expect(h.getDraft()).toMatchObject({ active: false, waypoints: [] });
});

test('failed Map route save keeps name/order, shows failure and retries the same id', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(); const h = mapHarness(save);
  button(h.render(), 'workflow.saveRoute').props.onPress();
  await button(h.render(), 'workflow.saveAndOpen').props.onPress();
  expect(text(h.render())).toContain('workflow.saveFailed');
  expect(h.getDraft().name).toBe('TRAIL PLAN'); expect(h.open).not.toHaveBeenCalled();
  await button(h.render(), 'workflow.saveAndOpen').props.onPress();
  expect(save.mock.calls.map(call => call[0].id)).toEqual(['plan-draft', 'plan-draft']);
});

test('Map review reorders entire points accessibly and refuses unnamed save', async () => {
  const h = mapHarness(); button(h.render(), 'workflow.saveRoute').props.onPress();
  button(h.render(), 'workflow.moveDownLabel:ALPHA').props.onPress();
  expect(h.getDraft().waypoints.map(point => point.id)).toEqual(['b', 'a']);
  expect(h.getDraft().waypoints[1].note).toBe('Bridge');
  input(h.render(), 'workflow.routeName').props.onChangeText('  ');
  await button(h.render(), 'workflow.saveAndOpen').props.onPress();
  expect(h.save).not.toHaveBeenCalled(); expect(text(h.render())).toContain('workflow.nameRequired');
});

test('Map discard requires a destructive confirmation; keeping editing preserves draft', () => {
  const h = mapHarness(); button(h.render(), 'workflow.saveRoute').props.onPress();
  button(h.render(), 'workflow.keepEditing').props.onPress(); expect(h.getDraft().waypoints).toHaveLength(2);
  button(h.render(), 'workflow.saveRoute').props.onPress(); button(h.render(), 'workflow.discard').props.onPress();
  expect(h.getDraft().waypoints).toHaveLength(2);
  Alert.alert.mock.calls.at(-1)[2].find(item => item.style === 'destructive').onPress();
  expect(h.getDraft().waypoints).toHaveLength(0);
});

test('final point Review waits for durable confirmation and remains recoverable after failure', async () => {
  const write = deferred(); const review = jest.fn(); const retry = jest.fn().mockResolvedValue();
  const props = { waypoint: POINTS[0], route: { id: 'run', index: 0, waypoints: [POINTS[0]] }, onConfirmPoint: () => write.promise, onReview: review, onRetrySave: retry };
  const render = () => React.__render(() => ActiveNavigationBar(props));
  button(render(), 'fieldNav.finish').props.onPress();
  const saving = Alert.alert.mock.calls.at(-1)[2][1].onPress();
  expect(review).not.toHaveBeenCalled(); expect(button(render(), 'fieldNav.finish').props.disabled).toBe(true);
  write.reject(new Error('disk full')); await saving;
  expect(review).not.toHaveBeenCalled(); expect(text(render())).toContain('workflow.saveFailed');
  await button(render(), 'workflow.retry').props.onPress(); expect(retry).toHaveBeenCalledTimes(1); expect(review).toHaveBeenCalledTimes(1);
});

test('failed first destination save still exposes recovery with no waypoint', () => {
  const tree = React.__render(() => ActiveNavigationBar({ waypoint: null, saveError: true, onRetrySave: jest.fn() }));
  expect(text(tree)).toContain('workflow.saveFailed'); expect(button(tree, 'workflow.retry')).toBeDefined();
});

test('saved-plan point edit preserves precise GPS coordinates and provenance when only a label changes', async () => {
  let savedList = { id: 'plan', name: 'TRAIL', waypoints: [{ ...POINTS[0], source: 'gps', recordedAt: Date.now(), accuracyM: 3 }] };
  const initialPoint = { ...savedList.waypoints[0] };
  const props = { savedLists: [savedList], onUpdateList: jest.fn(async (id, update) => { savedList = update(savedList); props.savedLists = [savedList]; }) };
  const render = () => React.__render(() => WaypointListsScreen(props));
  render(); React.__effects();
  button(render(), 'Edit ALPHA coordinate').props.onPress();
  input(render(), 'workflow.pointLabel').props.onChangeText('TRAILHEAD');
  await button(render(), 'Save edited coordinate').props.onPress();
  expect(savedList.waypoints[0]).toMatchObject({ ...initialPoint, label: 'TRAILHEAD' });
});

test('saved-plan reorder applies to latest canonical list and leaves active route snapshot untouched', async () => {
  let savedList = { id: 'plan', name: 'TRAIL', waypoints: POINTS.map(point => ({ ...point })) };
  const activeRoute = JSON.parse(JSON.stringify({ ...savedList, index: 0 }));
  const props = { savedLists: [savedList], activeRoute, onUpdateList: jest.fn(async (id, update) => { savedList = update(savedList); props.savedLists = [savedList]; }) };
  const render = () => React.__render(() => WaypointListsScreen(props));
  render(); React.__effects();
  await button(render(), 'workflow.moveDownLabel:ALPHA').props.onPress();
  expect(savedList.waypoints.map(point => point.id)).toEqual(['b', 'a']);
  expect(activeRoute.waypoints.map(point => point.id)).toEqual(['a', 'b']);
});

test('failed saved-plan edits stay editable and do not report success or close the editor', async () => {
  const props = { savedLists: [{ id: 'plan', name: 'TRAIL', waypoints: [POINTS[0]] }], onUpdateList: jest.fn().mockRejectedValue(new Error('disk full')) };
  const render = () => React.__render(() => WaypointListsScreen(props));
  render(); React.__effects(); button(render(), 'Edit ALPHA coordinate').props.onPress();
  input(render(), 'workflow.pointLabel').props.onChangeText('KEEP THIS');
  await button(render(), 'Save edited coordinate').props.onPress();
  expect(input(render(), 'workflow.pointLabel').props.value).toBe('KEEP THIS');
  expect(text(render())).toContain('workflow.saveFailed');
  expect(props.savedLists[0].waypoints[0].label).toBe('ALPHA');
});

test('Map checkbox picker selects overlapping points from different lists independently', () => {
  let draft = { active: true, name: '', waypoints: [] };
  const props = { isPro: true, savedLists: [{ id: 'one', name: 'ONE', waypoints: [POINTS[0]] }, { id: 'two', name: 'TWO', waypoints: [POINTS[0]] }],
    onRouteDraftChange: change => { draft = typeof change === 'function' ? change(draft) : change; } };
  const render = () => React.__render(() => MapScreen({ ...props, routeDraft: draft }));
  button(render(), 'workflow.chooseSaved').props.onPress();
  const checks = () => nodes(render()).filter(node => node.props?.accessibilityRole === 'checkbox');
  checks()[1].props.onPress();
  expect(checks().map(node => node.props.accessibilityState.checked)).toEqual([false, true]);
  checks()[0].props.onPress();
  expect(draft.waypoints).toHaveLength(2);
  expect(draft.waypoints[0].id).not.toBe(draft.waypoints[1].id);
});

test('first save has visible pending feedback and unresolved save errors block new route actions', () => {
  let tree = React.__render(() => ActiveNavigationBar({ waypoint: null, isSaving: true }));
  expect(text(tree)).toContain('workflow.saving');
  tree = React.__render(() => ActiveNavigationBar({ waypoint: POINTS[0], route: { id: 'run', index: 0, waypoints: [POINTS[0]] }, saveError: true, onRetrySave: jest.fn() }));
  expect(button(tree, 'fieldNav.finish').props.disabled).toBe(true);
  expect(button(tree, 'workflow.retry').props.disabled).toBeFalsy();
});

test('changing an estimated point coordinate clears the old DR calculation provenance', async () => {
  let savedList = { id: 'plan', name: 'TRAIL', waypoints: [{ ...POINTS[0], source: 'estimated', provenance: { kind: 'dead-reckoning' } }] };
  const props = { savedLists: [savedList], onUpdateList: async (id, update) => { savedList = update(savedList); props.savedLists = [savedList]; } };
  const render = () => React.__render(() => WaypointListsScreen(props));
  render(); React.__effects(); button(render(), 'Edit ALPHA coordinate').props.onPress();
  input(render(), 'Edit MGRS coordinate').props.onChangeText('18S UJ 26652 07579');
  await button(render(), 'Save edited coordinate').props.onPress();
  expect(savedList.waypoints[0]).toMatchObject({ source: 'manual', provenance: null, accuracyM: null });
});

test('Lists opens the Map-requested saved route after consuming the request on mount', () => {
  const props = { savedLists: [{ id: 'old', name: 'EXISTING', waypoints: [POINTS[0]] },
    { id: 'map-plan', name: 'MAP PLAN', waypoints: POINTS }], selectedListId: 'map-plan' };
  props.onListRequestHandled = jest.fn(() => { props.selectedListId = null; });
  const render = () => React.__render(() => WaypointListsScreen(props));
  const selected = tree => nodes(tree).filter(node => node.props?.accessibilityRole === 'tab' && node.props.accessibilityState.selected).map(node => node.key);
  render(); React.__effects();
  const tree = render(); React.__effects();
  expect(props.onListRequestHandled).toHaveBeenCalledTimes(1);
  expect(selected(tree)).toEqual(['map-plan']);
  expect(selected(render())).toEqual(['map-plan']);
});

test('Lists waits for a requested plan and does not reselect it after consumption or later list edits', () => {
  const props = { savedLists: [{ id: 'old', name: 'EXISTING', waypoints: [POINTS[0]] }], selectedListId: 'map-plan' };
  props.onListRequestHandled = jest.fn(() => { props.selectedListId = null; });
  const render = () => React.__render(() => WaypointListsScreen(props));
  const selected = tree => nodes(tree).find(node => node.props?.accessibilityRole === 'tab' && node.props.accessibilityState.selected)?.key;
  render(); React.__effects(); render(); React.__effects();
  expect(props.onListRequestHandled).not.toHaveBeenCalled();
  props.savedLists = [...props.savedLists, { id: 'map-plan', name: 'MAP PLAN', waypoints: POINTS }];
  render(); React.__effects(); render(); React.__effects();
  expect(selected(render())).toBe('map-plan');
  button(render(), 'EXISTING, 1 of 20 waypoints').props.onPress();
  render(); React.__effects();
  props.savedLists = props.savedLists.map(list => ({ ...list, notes: 'Updated' }));
  render(); React.__effects();
  expect(selected(render())).toBe('old');
  expect(props.onListRequestHandled).toHaveBeenCalledTimes(1);
  props.selectedListId = 'map-plan';
  render(); React.__effects(); render(); React.__effects();
  expect(selected(render())).toBe('map-plan');
  expect(props.onListRequestHandled).toHaveBeenCalledTimes(2);
});

test('Map DONE announces saving a selected route using its localized action', () => {
  const h = mapHarness();
  expect(button(h.render(), 'workflow.saveRoute')).toBeDefined();
  button(h.render(), 'workflow.saveRoute').props.onPress();
  expect(button(h.render(), 'workflow.saveAndOpen')).toBeDefined();
});
