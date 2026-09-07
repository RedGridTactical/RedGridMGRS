// A small deterministic hook harness exposes renders before passive effects.
// This catches the first-frame race; native queue behavior is tested separately.
jest.mock('react', () => {
  const slots = [];
  let cursor = 0;
  let pending = [];
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
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
    __render(hook, enabled) { cursor = 0; return hook(enabled); },
    __effects() { const run = pending; pending = []; run.forEach(effect => effect()); },
    __reset() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; cursor = 0; pending = []; },
  };
});
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }));
jest.mock('expo-navigation-bar', () => ({ getVisibilityAsync: jest.fn(async () => 'visible'), setVisibilityAsync: jest.fn(async () => {}) }), { virtual: true });
jest.mock('expo-brightness', () => ({ getBrightnessAsync: jest.fn(async () => 0.8), setBrightnessAsync: jest.fn(async () => {}) }));
const React = require('react');
const Brightness = require('expo-brightness');
const Storage = require('@react-native-async-storage/async-storage');
const { AppState } = require('react-native');
const { useTacticalBrightness } = require('../src/hooks/useTacticalBrightness');
const flush = () => new Promise(resolve => setImmediate(resolve));
const render = enabled => React.__render(useTacticalBrightness, enabled);
async function settle(enabled) {
  render(enabled); React.__effects(); await flush();
  render(enabled); React.__effects(); await flush();
  return render(enabled);
}
beforeEach(() => {
  React.__reset(); jest.clearAllMocks();
  Storage.getItem.mockResolvedValue(null); Storage.setItem.mockResolvedValue();
  Brightness.getBrightnessAsync.mockResolvedValue(0.8); Brightness.setBrightnessAsync.mockResolvedValue();
});

test('first Tactical render is covered before its passive effect or native write runs', async () => {
  expect((await settle(false)).ready).toBe(true);
  let complete;
  Brightness.setBrightnessAsync.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  expect(render(true).ready).toBe(false); // Before running the entry effect.
  React.__effects(); await flush();
  expect(render(true).ready).toBe(false);
  complete(); await flush();
  expect(render(true).ready).toBe(true);
});

test('an intensity change invalidates the previous ready result synchronously', async () => {
  const display = await settle(true);
  expect(display.ready).toBe(true);
  display.changeLevel(-1);
  expect(render(true).ready).toBe(false);
  React.__effects(); await flush();
  expect(render(true).ready).toBe(true);
  expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.03);
});

test('background and foreground transitions require a fresh dim completion', async () => {
  expect((await settle(true)).ready).toBe(true);
  const listener = AppState.addEventListener.mock.calls[0][1];
  listener('background');
  expect(render(true).ready).toBe(false);
  React.__effects(); await flush();
  expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.8);
  listener('active');
  expect(render(true).ready).toBe(false);
  React.__effects(); await flush();
  expect(render(true).ready).toBe(true);
  expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.06);
});

test('a failed preference write is caught and does not block later intensity changes', async () => {
  const display = await settle(true);
  Storage.setItem.mockRejectedValueOnce(new Error('storage full'));
  display.changeLevel(-1); render(true); React.__effects(); await flush();
  render(true).changeLevel(1); render(true); React.__effects(); await flush();
  expect(render(true).level).toBe(0.06);
  expect(Storage.setItem).toHaveBeenLastCalledWith('rg_night_brightness_v1', '0.06');
});


test('repeated or batched active events do not leave the display covered forever', async () => {
  expect((await settle(true)).ready).toBe(true);
  const listener = AppState.addEventListener.mock.calls[0][1];
  listener('inactive'); listener('active');
  expect(render(true).ready).toBe(false);
  React.__effects(); await flush();
  expect(render(true).ready).toBe(true);
  listener('active');
  expect(render(true).ready).toBe(false);
  React.__effects(); await flush();
  expect(render(true).ready).toBe(true);
});
