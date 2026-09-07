// Deterministic hook harness, matching the existing display hook regression tests.
jest.mock('react', () => {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  return {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!equal(previous?.deps, deps)) pending.push(() => {
        previous?.cleanup?.();
        slots[i] = { deps, effect, cleanup: effect() };
      });
    },
    __render(hook) { cursor = 0; return hook(); },
    __effects() { const effects = pending; pending = []; effects.forEach(effect => effect()); },
    __unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    __replayEffects() {
      slots.forEach(slot => slot?.cleanup?.());
      slots.forEach(slot => { if (slot?.effect) slot.cleanup = slot.effect(); });
    },
    __reset() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; cursor = 0; pending = []; },
  };
});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
}));

const React = require('react');
const Location = require('expo-location');
const { useLocation } = require('../src/hooks/useLocation');
const render = () => React.__render(useLocation);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const fix = { coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 5, altitude: 12, heading: 90, speed: 0 } };
let positionSubscription;
let headingSubscription;

async function mount() { render(); React.__effects(); await flush(); return render(); }
beforeEach(() => {
  React.__reset();
  jest.useFakeTimers();
  jest.resetAllMocks();
  positionSubscription = { remove: jest.fn() };
  headingSubscription = { remove: jest.fn() };
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue(fix);
  Location.watchPositionAsync.mockResolvedValue(positionSubscription);
  Location.watchHeadingAsync.mockResolvedValue(headingSubscription);
});
afterEach(() => { React.__reset(); jest.clearAllTimers(); jest.useRealTimers(); });

test('a permission prompt pending beyond ten seconds can grant and start GPS exactly once', async () => {
  let answer;
  Location.requestForegroundPermissionsAsync.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await mount();
  await jest.advanceTimersByTimeAsync(20000);
  expect(render()).toMatchObject({ permissionStatus: null, error: null, isLoading: true });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  // Repeated Retry must not stack native prompts or duplicate watcher setup.
  render().retry(); render().retry();
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  answer({ status: 'granted' });
  await flush();
  expect(render()).toMatchObject({ permissionStatus: 'granted', error: null, isLoading: false, location: { lat: 37.7749, lon: -122.4194 } });
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(Location.watchHeadingAsync).toHaveBeenCalledTimes(1);
});

test('an explicit denial reports denied and never starts GPS', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
  await mount();
  expect(render()).toMatchObject({ permissionStatus: 'denied', isLoading: false });
  expect(render().error).toMatch(/permission denied/i);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});

test('the fifteen-second GPS deadline begins after the permission decision', async () => {
  let answer;
  Location.requestForegroundPermissionsAsync.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  Location.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(() => {}));
  await mount();
  await jest.advanceTimersByTimeAsync(20000);
  answer({ status: 'granted' }); await flush();
  await jest.advanceTimersByTimeAsync(14999);
  expect(render()).toMatchObject({ permissionStatus: 'granted', error: null, isLoading: true });
  await jest.advanceTimersByTimeAsync(1);
  expect(render()).toMatchObject({ error: 'GPS Error: Position timeout', isLoading: false });
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});

test('retry after a denial can grant without leaving old watchers', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
  await mount();
  await render().retry(); await flush();
  expect(render()).toMatchObject({ permissionStatus: 'granted', error: null, isLoading: false });
  await render().retry(); await flush();
  expect(positionSubscription.remove).toHaveBeenCalledTimes(1);
  expect(headingSubscription.remove).toHaveBeenCalledTimes(1);
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2);
});

test('unmount while a native watcher is being created removes the late subscription', async () => {
  let finishWatch;
  Location.watchPositionAsync.mockImplementationOnce(() => new Promise(resolve => { finishWatch = resolve; }));
  await mount();
  React.__unmount();
  finishWatch(positionSubscription); await flush();
  expect(positionSubscription.remove).toHaveBeenCalledTimes(1);
  expect(Location.watchHeadingAsync).not.toHaveBeenCalled();
});

test('effect replay reuses a pending OS prompt and only the current request starts GPS', async () => {
  let answer;
  Location.requestForegroundPermissionsAsync.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await mount();
  React.__replayEffects(); await flush();
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  answer({ status: 'granted' }); await flush();
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(render()).toMatchObject({ error: null, isLoading: false });
});

test('true versus magnetic compass reference is preserved', async () => {
  await mount();
  const headingCallback = Location.watchHeadingAsync.mock.calls[0][0];
  headingCallback({ trueHeading: 91, magHeading: 80 });
  expect(render()).toMatchObject({ compassHeading: 91, compassReference: 'true' });
  headingCallback({ trueHeading: -1, magHeading: 80 });
  expect(render()).toMatchObject({ compassHeading: 80, compassReference: 'magnetic' });
});
