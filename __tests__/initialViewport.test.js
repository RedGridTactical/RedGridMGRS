/** The map's initial viewport is captured once per mount; a later distant fix never moves the labels alone. */
jest.mock('react', () => require('./helpers/hookHarness')());
const React = require('react');
const { useInitialViewport, useMapViewport, initialViewportFor, DEFAULT_MAP_REGION } = require('../src/hooks/useInitialViewport');
const { createMapSession, reduceMapSession } = require('../src/utils/mapSession');

const SF = { lat: 37.7749, lon: -122.4194 };
const remembered = { latitude: 47.6, longitude: -122.3, latitudeDelta: 0.02, longitudeDelta: 0.02 };
beforeEach(() => React.__reset());
afterEach(() => React.__unmount());

describe('initialViewportFor (pure)', () => {
  test('restored session viewport wins over an available fix and the default', () => {
    const session = reduceMapSession(createMapSession(), { region: remembered });
    expect(initialViewportFor({ session, location: SF })).toEqual(remembered);
  });
  test('a fix available at mount centres the map; otherwise the default is used', () => {
    expect(initialViewportFor({ session: createMapSession(), location: SF })).toEqual({ latitude: SF.lat, longitude: SF.lon, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    expect(initialViewportFor({ session: createMapSession(), location: null })).toBe(DEFAULT_MAP_REGION);
    expect(initialViewportFor({ session: null, location: { lat: NaN, lon: 1 } })).toBe(DEFAULT_MAP_REGION);
  });
});

describe('useInitialViewport (per mount)', () => {
  test('absent GPS at mount, then a distant fix: the viewport (footer/coverage/overlay source) stays at the mount viewport', () => {
    const session = createMapSession();
    const first = React.__render(() => useInitialViewport(session, null));
    expect(first).toBe(DEFAULT_MAP_REGION);
    const afterFix = React.__render(() => useInitialViewport(session, SF));
    expect(afterFix).toBe(first);
    // What MapScreen displays: mapRegion (from a real region event) or the mount viewport.
    const displayed = mapRegion => mapRegion || afterFix;
    expect(displayed(null)).toBe(DEFAULT_MAP_REGION);
    const regionEvent = { latitude: SF.lat, longitude: SF.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    expect(displayed(regionEvent)).toBe(regionEvent);
  });
  test('a new mount with a remembered viewport starts there, and a fix at mount is used only when nothing is remembered', () => {
    const session = reduceMapSession(createMapSession(), { region: remembered });
    expect(React.__render(() => useInitialViewport(session, SF))).toEqual(remembered);
    React.__reset();
    expect(React.__render(() => useInitialViewport(createMapSession(), SF)).latitude).toBe(SF.lat);
  });
});

describe('useMapViewport: an untouched initial map survives unmount and later fixes', () => {
  const flush = () => React.__effects();
  test('no GPS at mount -> delayed SF fix -> unmount (tab change / fold to compact) -> remount starts at DC', () => {
    // App-owned session ref, exactly as App.js keeps it.
    let session = createMapSession();
    const onSessionChange = patch => { session = reduceMapSession(session, patch); };
    // Mount 1: no fix yet, no native region event ever fires.
    let hook = React.__render(() => useMapViewport(session, null, onSessionChange)); flush();
    expect(hook.initialRegion).toBe(DEFAULT_MAP_REGION);
    expect(hook.mapRegion).toBe(DEFAULT_MAP_REGION);
    expect(session.region).toEqual(DEFAULT_MAP_REGION);
    // A distant fix arrives; the map is untouched, so nothing moves and the session keeps DC.
    hook = React.__render(() => useMapViewport(session, SF, onSessionChange)); flush();
    expect(hook.mapRegion).toBe(DEFAULT_MAP_REGION);
    expect(session.region).toEqual(DEFAULT_MAP_REGION);
    // Unmount (GRID tab / fold to compact), then remount on MAP with the fix available.
    React.__unmount(); React.__reset();
    hook = React.__render(() => useMapViewport(session, SF, onSessionChange)); flush();
    expect(hook.initialRegion).toEqual(DEFAULT_MAP_REGION);
    expect(hook.mapRegion).toEqual(DEFAULT_MAP_REGION);
  });
  test('a real region event moves the viewport and is what the next mount restores', () => {
    let session = createMapSession();
    const onSessionChange = patch => { session = reduceMapSession(session, patch); };
    let hook = React.__render(() => useMapViewport(session, null, onSessionChange)); flush();
    const panned = { latitude: SF.lat, longitude: SF.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    hook.setMapRegion(panned);
    hook = React.__render(() => useMapViewport(session, SF, onSessionChange)); flush();
    expect(hook.mapRegion).toEqual(panned);
    expect(session.region).toEqual(panned);
    React.__unmount(); React.__reset();
    hook = React.__render(() => useMapViewport(session, null, onSessionChange)); flush();
    expect(hook.initialRegion).toEqual(panned);
  });
});
