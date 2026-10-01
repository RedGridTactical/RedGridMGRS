jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('react', () => require('./helpers/hookHarness')());
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { loadWaypointLists, saveWaypointLists, loadAOPackages, saveAOPackages } from '../src/utils/storage';
import { loadNavigation, saveNavigation, emptyNavigation, transitionNavigation } from '../src/utils/fieldNavigation';
import { normalizeWaypointLists } from '../src/utils/waypoints';
import { useWaypointLists } from '../src/hooks/useWaypointLists';
import { useFieldNavigation } from '../src/hooks/useFieldNavigation';
import { useAOPackages } from '../src/hooks/useAOPackages';

let data;
const point = { id: 'p', label: 'ZERO', lat: 0, lon: 0, mgrs: 'WRONG', source: 'gps', recordedAt: 1200, accuracyM: 0, note: 'Field note' };
const list = { id: 'route', name: 'FIELD ROUTE', waypoints: [point], notes: 'Plan note', paceMinPerKm: 12, plannedStartAt: 5000 };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const render = hook => React.__render(hook);
beforeEach(() => {
  React.__reset();
  data = {};
  AsyncStorage.getItem.mockReset().mockImplementation(async key => data[key] ?? null);
  AsyncStorage.setItem.mockReset().mockImplementation(async (key, value) => { data[key] = value; });
});
afterEach(() => { React.__unmount(); jest.useRealTimers(); });

const records = [
  ['lists', 'rg_waypoint_lists', loadWaypointLists, () => saveWaypointLists([])],
  ['navigation', 'rg_field_navigation_v1', loadNavigation, () => saveNavigation(emptyNavigation())],
  ['areas', 'rg_ao_packages_v1', loadAOPackages, () => saveAOPackages([])],
];
test.each(records)('%s corruption cannot be overwritten by an empty save', async (_, key, read, write) => {
  const original = '{unreadable'; data[key] = original;
  await expect(read()).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
  await expect(write()).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
  expect(data[key]).toBe(original); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test.each(records)('%s read failure does not authorize replacing unknown data', async (_, key, read, write) => {
  AsyncStorage.getItem.mockRejectedValue(new Error('read unavailable'));
  await expect(read()).rejects.toThrow('read unavailable');
  await expect(write()).rejects.toThrow('read unavailable');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test('native writes stay ordered after the first caller times out', async () => {
  jest.useFakeTimers(); let release;
  AsyncStorage.setItem.mockImplementationOnce((key, value) => new Promise(resolve => {
    release = () => { data[key] = value; resolve(); };
  }));
  const first = saveWaypointLists([list]); const firstResult = first.catch(error => error);
  await flush();
  await jest.advanceTimersByTimeAsync(5001);
  expect((await firstResult).code).toBe('STORAGE_TIMEOUT');
  const second = saveWaypointLists([{ ...list, name: 'SECOND' }]);
  await flush(); expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  release(); await second;
  expect(JSON.parse(data.rg_waypoint_lists)[0].name).toBe('SECOND');
});
test('canonical migration keeps legacy MGRS-only points, zero values and provenance', async () => {
  const saved = normalizeWaypointLists([list]);
  expect(saved[0].waypoints[0]).toMatchObject({ lat: 0, lon: 0, accuracyM: 0, source: 'gps', note: 'Field note' });
  expect(saved[0].waypoints[0].mgrs).not.toBe('WRONG');
  await saveWaypointLists(saved);
  expect(await loadWaypointLists()).toEqual(saved);
  const legacy = normalizeWaypointLists([{ id: 'old', waypoints: [{ mgrs: saved[0].waypoints[0].mgrs }] }]);
  expect(legacy[0].waypoints[0].lat).toBeGreaterThanOrEqual(0);
});
test('canonical limits and invalid points reject a whole save without truncating existing data', async () => {
  await saveWaypointLists([list]); const original = data.rg_waypoint_lists;
  for (const invalid of [Array.from({ length: 11 }, (_, i) => ({ ...list, id: String(i) })),
    [{ ...list, waypoints: Array.from({ length: 21 }, (_, i) => ({ ...point, id: String(i) })) }],
    [{ ...list, waypoints: [{ ...point, lat: Infinity }] }], [{ ...list, waypoints: [{ ...point, lon: 181 }] }]]) {
    await expect(saveWaypointLists(invalid)).rejects.toThrow(); expect(data.rg_waypoint_lists).toBe(original);
  }
});
test('two rapid list mutations retain both changes, and resolve after native acknowledgment', async () => {
  render(useWaypointLists); React.__effects(); await flush();
  let hook = render(useWaypointLists), release;
  AsyncStorage.setItem.mockImplementationOnce((key, value) => new Promise(resolve => {
    release = () => { data[key] = value; resolve(); };
  }));
  const first = hook.saveList(list), second = hook.saveList({ ...list, id: 'second' });
  await flush(); hook = render(useWaypointLists);
  expect(hook.lists).toEqual([]); expect(hook.isSaving).toBe(true);
  release(); await Promise.all([first, second]);
  expect(render(useWaypointLists).lists.map(item => item.id)).toEqual(['route', 'second']);
});
test('list failure preserves acknowledged state and retries the exact candidate', async () => {
  data.rg_waypoint_lists = JSON.stringify(normalizeWaypointLists([list]));
  render(useWaypointLists); React.__effects(); await flush();
  const hook = render(useWaypointLists);
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(hook.updateList('route', item => ({ ...item, name: 'REVISED' }))).rejects.toThrow('disk full');
  expect(render(useWaypointLists).lists[0].name).toBe('FIELD ROUTE');
  await expect(hook.deleteList('route')).rejects.toMatchObject({ code: 'SAVE_PENDING' });
  await hook.retrySave(); expect(render(useWaypointLists).lists[0].name).toBe('REVISED');
  expect(JSON.parse(data.rg_waypoint_lists)[0].name).toBe('REVISED');
});
test('failed startup blocks writes, then Retry Load restores actual existing data', async () => {
  data.rg_waypoint_lists = JSON.stringify(normalizeWaypointLists([list]));
  AsyncStorage.getItem.mockRejectedValueOnce(new Error('locked'));
  render(useWaypointLists); React.__effects(); await flush();
  let hook = render(useWaypointLists); expect(hook.loaded).toBe(false); expect(hook.loadError).toBeTruthy();
  await expect(hook.saveList({ ...list, id: 'new' })).rejects.toMatchObject({ code: 'STORAGE_NOT_LOADED' });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await hook.retryLoad(); hook = render(useWaypointLists); expect(hook.loaded).toBe(true); expect(hook.lists).toHaveLength(1);
});
test('route start, manual completion and review notes keep immutable plan/provenance', async () => {
  render(useFieldNavigation); React.__effects(); await flush(); const hook = render(useFieldNavigation);
  await hook.startRoute(list); let state = render(useFieldNavigation);
  expect(state.route).toMatchObject({ notes: 'Plan note', paceMinPerKm: 12, plannedStartAt: 5000 });
  expect(state.waypoint).toMatchObject({ source: 'gps', recordedAt: 1200, accuracyM: 0, note: 'Field note' });
  await hook.confirmPoint(state.route.id, 0); state = render(useFieldNavigation);
  await hook.updateReviewNotes(state.history[0].id, 'Reviewed locally');
  expect((await loadNavigation()).history[0].reviewNotes).toBe('Reviewed locally');
  expect(Object.keys(state.history[0].confirmed[0]).sort()).toEqual(['confirmedAt', 'index']);
});
test('AO concurrent saves use latest acknowledged array instead of a render closure', async () => {
  render(useAOPackages); React.__effects(); await flush(); const hook = render(useAOPackages);
  const args = { name: 'AREA', region: { latitude: 0, longitude: 0, latitudeDelta: 0.01, longitudeDelta: 0.01 } };
  await Promise.all([hook.addAOPackage(args), hook.addAOPackage({ ...args, name: 'SECOND' })]);
  expect(render(useAOPackages).aoPackages.map(item => item.name)).toEqual(['AREA', 'SECOND']);
});

test('estimated points retain origin versus calculation times across storage and route snapshots', async () => {
  const estimated = { ...point, source: 'estimated', provenance: { kind: 'dead-reckoning',
    origin: { lat: 1, lon: 2, label: 'PIN', source: 'last-known', observedAt: 100, pinnedAt: 200, accuracy: 0 },
    gridBearing: 360, distanceMeters: 100, calculatedAt: 300 } };
  await saveWaypointLists([{ ...list, waypoints: [estimated] }]);
  const stored = (await loadWaypointLists())[0];
  const navigation = transitionNavigation(emptyNavigation(), { type: 'start', list: stored, now: 500 });
  expect(navigation.waypoint).toMatchObject({ source: 'estimated', provenance: { gridBearing: 0,
    origin: { source: 'last-known', observedAt: 100, pinnedAt: 200, accuracy: 0 }, calculatedAt: 300 } });
  await saveNavigation(navigation);
  expect((await loadNavigation()).waypoint.provenance).toEqual(navigation.waypoint.provenance);
});
