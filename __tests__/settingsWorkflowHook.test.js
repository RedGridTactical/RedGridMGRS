jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('../src/utils/storage', () => ({
  loadSettings: jest.fn(), saveDeclination: jest.fn(), savePaceCount: jest.fn(), saveCoordFormat: jest.fn(),
  saveShakeToSpeak: jest.fn(), saveTacticalSound: jest.fn(), saveGridCrossing: jest.fn(), saveGridScale: jest.fn(),
  saveDisplayPreferences: jest.fn(), DEFAULT_DISPLAY_PREFERENCES: { theme: 'standard', tacticalMode: false },
  effectiveDisplayTheme: p => p.tacticalMode ? 'red' : p.theme,
  updateDisplayPreferences: (p, change) => ({ ...p, ...change }),
}));
const React = require('react');
const storage = require('../src/utils/storage');
const { useSettings } = require('../src/hooks/useSettings');
const render = () => React.__render(useSettings);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
beforeEach(() => {
  React.__reset(); Object.values(storage).forEach(value => value.mockReset?.());
  storage.loadSettings.mockResolvedValue({});
});
afterEach(() => React.__unmount());

test('pending unrelated setting is not reported as a failed save', async () => {
  render(); React.__effects(); await flush(); const hook = render();
  const slow = deferred(); storage.savePaceCount.mockReturnValueOnce(slow.promise);
  const pending = hook.setPaceCount(70); await hook.setDeclination(10);
  expect(render().saveError).toBe(false); expect(render().paceCount).toBe(62);
  slow.resolve(); await pending; expect(render().paceCount).toBe(70);
});
test('old failed write cannot replace a later same-key success or leave a false Retry', async () => {
  render(); React.__effects(); await flush(); const hook = render();
  const slow = deferred(); storage.saveDeclination.mockReturnValueOnce(slow.promise);
  const first = hook.setDeclination(5); await hook.setDeclination(10);
  slow.reject(new Error('old failure')); expect(await first).toBe(false);
  expect(render().declination).toBe(10); expect(render().saveError).toBe(false);
});
test('Retry does not replay its stale second-key snapshot over a newer user choice', async () => {
  render(); React.__effects(); await flush(); const hook = render();
  storage.saveDeclination.mockRejectedValueOnce(new Error('full'));
  storage.savePaceCount.mockRejectedValueOnce(new Error('full'));
  await hook.setDeclination(5); await hook.setPaceCount(70);
  expect(render().saveError).toBe(true);
  const slow = deferred(); storage.saveDeclination.mockReturnValueOnce(slow.promise);
  const retry = hook.retrySave(); await flush();
  await hook.setPaceCount(80); slow.resolve(); await retry;
  expect(storage.savePaceCount.mock.calls.map(call => call[0])).toEqual([70,80]);
  expect(render().paceCount).toBe(80); expect(render().saveError).toBe(false);
});
test('a late initial read cannot overwrite an explicitly changed setting', async () => {
  const load = deferred(); storage.loadSettings.mockReturnValueOnce(load.promise);
  render(); React.__effects(); const hook = render();
  await hook.setTacticalSound(true); load.resolve({ tacticalSound: false }); await flush();
  expect(render().tacticalSound).toBe(true);
});
test('Strict Mode replay cannot let the discarded first read overwrite the second read', async () => {
  const first = deferred(), second = deferred();
  storage.loadSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  render(); React.__effects(); React.__replayEffects();
  second.resolve({ declination: 20 }); await flush(); first.resolve({ declination: 5 }); await flush();
  expect(render().declination).toBe(20);
});
