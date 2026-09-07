jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyNavigation, normalizeNavigation, transitionNavigation, validPosition,
  saveNavigation, loadNavigation, FIELD_NAVIGATION_KEY,
} from '../src/utils/fieldNavigation';
import { navigationReadiness, locationPermissionReadiness } from '../src/utils/fieldReadiness';

const list = {
  id: 'training', name: 'TRAINING LOOP',
  waypoints: [
    { id: 'start', label: 'START', lat: 37.7749, lon: -122.4194 },
    { id: 'finish', label: 'FINISH', lat: 37.7749, lon: -122.416 },
  ],
};
const start = (state = emptyNavigation(), now = 1000) => transitionNavigation(state, { type: 'start', list, now });
const confirm = (state, now) => transitionNavigation(state, { type: 'confirm', routeId: state.route.id, index: state.route.index, now });

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.getItem.mockResolvedValue(null);
});

test('route order is snapshotted and begins at the first saved point', () => {
  const input = { ...list, waypoints: list.waypoints.map(point => ({ ...point })) };
  const state = transitionNavigation(emptyNavigation(), { type: 'start', list: input, now: 1000 });
  input.waypoints[0].lat = 0;
  input.waypoints.reverse();
  expect(state.waypoint.label).toBe('START');
  expect(state.waypoint.lat).toBe(list.waypoints[0].lat);
  expect(state.route.waypoints.map(point => point.id)).toEqual(['start', 'finish']);
  expect(state.waypoint.mgrs).toMatch(/^10S /);
});

test('explicit point confirmation advances once; a repeated stale dialog cannot skip a point', () => {
  const initial = start();
  const next = confirm(initial, 2000);
  expect(next.route.index).toBe(1);
  expect(next.waypoint.label).toBe('FINISH');
  expect(next.route.confirmed).toEqual([{ index: 0, confirmedAt: 2000 }]);
  expect(transitionNavigation(next, { type: 'confirm', routeId: initial.route.id, index: 0, now: 3000 })).toBe(next);
});

test('restarting the same route within one timestamp invalidates its old confirmation', () => {
  const initial = start();
  const restarted = start(initial);
  expect(restarted.route.id).not.toBe(initial.route.id);
  expect(transitionNavigation(restarted, { type: 'confirm', routeId: initial.route.id, index: 0, now: 2000 })).toBe(restarted);
});

test('final confirmation saves a reviewable plan with manual timestamps and clears destination', () => {
  const finished = confirm(confirm(start(), 2000), 3000);
  expect(finished.route).toBeNull();
  expect(finished.waypoint).toBeNull();
  expect(finished.history[0]).toMatchObject({ status: 'completed', startedAt: 1000, endedAt: 3000 });
  expect(finished.history[0].confirmed).toHaveLength(2);
  expect(finished.history[0].waypoints).toHaveLength(2);
  expect(finished.history[0].track).toBeUndefined();
});

test('stopping or replacing a destination preserves partial progress without marking arrival', () => {
  const partial = confirm(start(), 2000);
  const replaced = transitionNavigation(partial, { type: 'waypoint', waypoint: { lat: 0, lon: 0, label: 'ZERO' }, now: 3000 });
  expect(replaced.waypoint).toMatchObject({ lat: 0, lon: 0, label: 'ZERO' });
  expect(replaced.route).toBeNull();
  expect(replaced.history[0]).toMatchObject({ status: 'stopped', index: 1 });
  expect(replaced.history[0].confirmed).toHaveLength(1);
});

test('invalid route input cannot replace a valid active route or silently skip a bad point', () => {
  const state = start();
  for (const waypoints of [[], [{ lat: NaN, lon: 0 }], [list.waypoints[0], { lat: 40, lon: 181 }], Array(21).fill(list.waypoints[0])]) {
    expect(transitionNavigation(state, { type: 'start', list: { ...list, waypoints } })).toBe(state);
  }
  expect(validPosition({ lat: 0, lon: 0 })).toBe(true);
});

test('route progress survives storage and restores the destination from the saved route index', async () => {
  const state = confirm(start(), 2000);
  await saveNavigation(state);
  const serialized = AsyncStorage.setItem.mock.calls[0][1];
  AsyncStorage.getItem.mockResolvedValue(serialized);
  const restored = await loadNavigation();
  expect(restored).toEqual(state);
  expect(restored.waypoint.label).toBe('FINISH');
  const corruptDestination = { ...state, waypoint: list.waypoints[0] };
  expect(normalizeNavigation(corruptDestination).waypoint.label).toBe('FINISH');
});

test('corrupted and version-mismatched saved state cannot create a destination', async () => {
  AsyncStorage.getItem.mockResolvedValue('{broken');
  expect(await loadNavigation()).toEqual(emptyNavigation());
  expect(normalizeNavigation({ ...start(), version: 9 })).toEqual(emptyNavigation());
  expect(normalizeNavigation({ version: 1, waypoint: { lat: 999, lon: 0 } }).waypoint).toBeNull();
});

test('a delayed write never overtakes a later confirmation', async () => {
  let finishWrite;
  AsyncStorage.setItem.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve; }));
  const initial = start();
  const first = saveNavigation(initial);
  const next = confirm(initial, 2000);
  const second = saveNavigation(next);
  await Promise.resolve();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  finishWrite();
  await Promise.all([first, second]);
  expect(AsyncStorage.setItem.mock.calls.at(-1)).toEqual([FIELD_NAVIGATION_KEY, JSON.stringify(next)]);
});

test('failed storage is visible to caller and later saves can recover', async () => {
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(saveNavigation(start())).rejects.toThrow('disk full');
  await expect(saveNavigation(confirm(start(), 2000))).resolves.toBeUndefined();
});

test('review history is bounded and can be cleared without removing an active route', () => {
  let state = emptyNavigation();
  for (let i = 0; i < 12; i++) {
    state = start(state, 1000 + i * 100);
    state = transitionNavigation(state, { type: 'stop', routeId: state.route.id, now: 1050 + i * 100 });
  }
  expect(state.history).toHaveLength(10);
  expect(state.history[0].startedAt).toBe(2100);
  state = start(state, 3000);
  const cleared = transitionNavigation(state, { type: 'clearHistory' });
  expect(cleared.history).toEqual([]);
  expect(cleared.route).toEqual(state.route);
  expect(cleared.waypoint).toEqual(state.waypoint);
});

describe('solo readiness', () => {
  const checks = { gps: 'ok', permissions: 'ok', device: 'ok', mesh: 'warn' };
  test('radio absence does not downgrade solo navigation but does downgrade a radio team', () => {
    expect(navigationReadiness(checks)).toBe('READY');
    expect(navigationReadiness({ ...checks, mode: 'team' })).toBe('CAUTION');
    expect(navigationReadiness({ ...checks, mode: 'team', mesh: 'ok' })).toBe('READY');
  });
  test('loading, GPS failure and missing map coverage remain explicit', () => {
    expect(navigationReadiness({ ...checks, gps: 'idle' })).toBe('CAUTION');
    expect(navigationReadiness({ ...checks, gps: 'fail' })).toBe('NOT_READY');
    expect(navigationReadiness({ ...checks, mapStatuses: ['ok', 'fail'] })).toBe('NOT_READY');
  });
  test('only location permission is required for navigation', () => {
    expect(locationPermissionReadiness('granted')).toBe('ok');
    expect(locationPermissionReadiness('denied')).toBe('fail');
    expect(locationPermissionReadiness('unavailable')).toBe('fail');
    expect(locationPermissionReadiness('undetermined')).toBe('warn');
  });
});
