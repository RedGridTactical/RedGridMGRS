/** useFoldGeometry: a late initial snapshot never overwrites a newer fold event; silence means no fold. */
jest.mock('react', () => require('./helpers/hookHarness')());
const mockListeners = [];
const mockNative = { getCurrent: jest.fn() };
const mockRN = {
  Platform: { OS: 'android' },
  NativeModules: { RedGridWindowLayout: mockNative },
  NativeEventEmitter: function () { return { addListener: (name, fn) => { mockListeners.push({ name, fn }); return { remove: () => { const i = mockListeners.findIndex(l => l.fn === fn); if (i >= 0) mockListeners.splice(i, 1); } }; } }; },
  useWindowDimensions: () => ({ width: 800, height: 900, fontScale: 1 }),
};
jest.mock('react-native', () => mockRN);
const React = require('react');
const { useFoldGeometry, FOLD_EVENT } = require('../src/hooks/useFoldGeometry');
const render = () => React.__render(useFoldGeometry);
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const feature = left => ({ features: [{ bounds: { left, top: 0, right: left + 20, bottom: 900 }, orientation: 'VERTICAL', state: 'HALF_OPENED', isSeparating: true, occlusionType: 'FULL' }] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => { React.__reset(); mockListeners.length = 0; mockNative.getCurrent.mockReset(); });
afterEach(() => React.__unmount());

test('initial snapshot is used when no event has arrived', async () => {
  mockNative.getCurrent.mockResolvedValue(feature(390));
  render(); React.__effects(); await flush();
  expect(render()[0].bounds.left).toBe(390);
});

test('a fold event that arrives before the slow initial snapshot wins; the late snapshot is discarded', async () => {
  const slow = deferred(); mockNative.getCurrent.mockReturnValue(slow.promise);
  render(); React.__effects();
  expect(mockListeners).toHaveLength(1); expect(mockListeners[0].name).toBe(FOLD_EVENT);
  mockListeners[0].fn(feature(500));
  expect(render()[0].bounds.left).toBe(500);
  slow.resolve(feature(390)); await flush();
  expect(render()[0].bounds.left).toBe(500);
});

test('a later event still replaces an earlier event', async () => {
  mockNative.getCurrent.mockResolvedValue({ features: [] });
  render(); React.__effects(); await flush();
  mockListeners[0].fn(feature(300)); mockListeners[0].fn(feature(310));
  expect(render()[0].bounds.left).toBe(310);
});

test('silence, a rejected snapshot or malformed payloads give an empty list', async () => {
  mockNative.getCurrent.mockRejectedValue(new Error('no window'));
  render(); React.__effects(); await flush();
  expect(render()).toEqual([]);
  mockListeners[0].fn({ features: [{ bounds: { left: 'x' }, orientation: 'VERTICAL' }] });
  expect(render()).toEqual([]);
});

test('unmount removes the listener and ignores a snapshot that resolves afterwards', async () => {
  const slow = deferred(); mockNative.getCurrent.mockReturnValue(slow.promise);
  render(); React.__effects();
  React.__unmount(); expect(mockListeners).toHaveLength(0);
  slow.resolve(feature(390)); await flush();
});
