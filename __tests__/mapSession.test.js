/** The in-memory map session survives MapScreen unmounts without storing junk. */
const { createMapSession, reduceMapSession, restoreRegion, restoreSelectedMarker, resolvePendingSelection } = require('../src/utils/mapSession');

const region = { latitude: 38.9, longitude: -77.03, latitudeDelta: 0.05, longitudeDelta: 0.05 };

test('starts empty and frozen', () => {
  const s = createMapSession();
  expect(s).toEqual({ region: null, selectedMarkerKey: null, waypointForm: null });
  expect(Object.isFrozen(s)).toBe(true);
});

test('keeps a valid region, copies it, and ignores invalid ones', () => {
  const s = reduceMapSession(createMapSession(), { region });
  expect(s.region).toEqual(region);
  expect(s.region).not.toBe(region);
  const bad = [{ latitude: NaN }, { ...region, latitudeDelta: 0 }, { ...region, latitude: 91 }, { ...region, longitude: -181 }, 'x', 5];
  for (const value of bad) expect(reduceMapSession(s, { region: value })).toBe(s);
  expect(reduceMapSession(s, { region: null }).region).toBeNull();
});

test('returns the same object when nothing changes and ignores unknown keys and junk patches', () => {
  const s = reduceMapSession(createMapSession(), { region });
  expect(reduceMapSession(s, { region })).toBe(s);
  expect(reduceMapSession(s, { bogus: 1 })).toBe(s);
  expect(reduceMapSession(s, null)).toBe(s);
  expect(reduceMapSession(undefined, undefined)).toEqual(createMapSession());
});

test('remembers a selected marker by key and re-finds it among current markers', () => {
  const s = reduceMapSession(createMapSession(), { selectedMarkerKey: 'list1:wp2' });
  const markers = [{ mapKey: 'list1:wp1' }, { mapKey: 'list1:wp2', label: 'B' }];
  expect(restoreSelectedMarker(s, markers)).toEqual({ mapKey: 'list1:wp2', label: 'B' });
  expect(restoreSelectedMarker(s, [{ mapKey: 'other' }])).toBeNull();
  expect(restoreSelectedMarker(reduceMapSession(s, { selectedMarkerKey: '' }), markers)).toBeNull();
  expect(restoreSelectedMarker(s, null)).toBeNull();
});

test('keeps an unsaved long-press waypoint form and drops a malformed one', () => {
  const pending = { id: 'p1', newListId: 'l1', lat: 38.9, lon: -77.03, mgrs: '18S UJ 23478 06483' };
  const s = reduceMapSession(createMapSession(), { waypointForm: { pending, label: 'OP 1', listId: 'list1', visible: true } });
  expect(s.waypointForm).toEqual({ pending, label: 'OP 1', listId: 'list1', visible: true });
  expect(s.waypointForm.pending).not.toBe(pending);
  expect(reduceMapSession(s, { waypointForm: { pending: { lat: NaN, lon: 1 } } })).toBe(s);
  expect(reduceMapSession(s, { waypointForm: { label: 'no pending' } })).toBe(s);
  expect(reduceMapSession(s, { waypointForm: null }).waypointForm).toBeNull();
  expect(reduceMapSession(s, { waypointForm: { pending, label: 7 } }).waypointForm.label).toBe('');
});

test('restores the remembered viewport or the fallback', () => {
  const fallback = { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 };
  expect(restoreRegion(createMapSession(), fallback)).toBe(fallback);
  expect(restoreRegion(reduceMapSession(createMapSession(), { region }), fallback)).toEqual(region);
  expect(restoreRegion(null, fallback)).toBe(fallback);
});

test('a full session round trip (unmount, remount) loses nothing', () => {
  let session = createMapSession();
  session = reduceMapSession(session, { region });
  session = reduceMapSession(session, { selectedMarkerKey: 'a:b' });
  session = reduceMapSession(session, { waypointForm: { pending: { lat: 1, lon: 2 }, label: 'X', listId: null } });
  const remount = { region: restoreRegion(session, null), marker: restoreSelectedMarker(session, [{ mapKey: 'a:b' }]), form: session.waypointForm };
  expect(remount.region).toEqual(region);
  expect(remount.marker).toEqual({ mapKey: 'a:b' });
  expect(remount.form.label).toBe('X');
});

describe('selection restore while lists are still loading', () => {
  const markers = [{ mapKey: 'l1:a' }, { mapKey: 'l1:b', label: 'B' }];
  test('finds the marker when it is already present', () => {
    expect(resolvePendingSelection({ key: 'l1:b', markers, listsLoading: true })).toEqual({ marker: { mapKey: 'l1:b', label: 'B' }, waiting: false });
  });
  test('keeps waiting while lists load and the key is unseen, then gives up once loading ends', () => {
    expect(resolvePendingSelection({ key: 'l2:z', markers: [], listsLoading: true })).toEqual({ marker: null, waiting: true });
    expect(resolvePendingSelection({ key: 'l2:z', markers, listsLoading: false })).toEqual({ marker: null, waiting: false });
  });
  test('no key means nothing to restore', () => {
    expect(resolvePendingSelection({ key: null, markers, listsLoading: true })).toEqual({ marker: null, waiting: false });
    expect(resolvePendingSelection({ key: 'l1:a', markers: null, listsLoading: true })).toEqual({ marker: null, waiting: true });
  });
  test('mount sequence: empty lists at mount, lists arrive, selection restored; the session key is kept meanwhile', () => {
    let session = reduceMapSession(createMapSession(), { selectedMarkerKey: 'l1:b' });
    let selected = restoreSelectedMarker(session, []);
    let pending = selected ? null : session.selectedMarkerKey;
    expect(selected).toBeNull(); expect(pending).toBe('l1:b');
    // what MapScreen publishes while waiting
    session = reduceMapSession(session, { selectedMarkerKey: selected?.mapKey || pending || null });
    expect(session.selectedMarkerKey).toBe('l1:b');
    const step = resolvePendingSelection({ key: pending, markers, listsLoading: false });
    expect(step.marker.label).toBe('B');
  });
});
