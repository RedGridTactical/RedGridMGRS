jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn() }, Share: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const React = require('react');
const { AppState } = require('react-native');
const Storage = require('@react-native-async-storage/async-storage');
const { useReferralTrial } = require('../src/hooks/useReferralTrial');
const render = () => React.__render(useReferralTrial);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let data, foreground, remove;
async function mount() { render(); React.__effects(); await flush(); return render(); }
function trialFor(ms) { data.set('rg_trial_redemption_v2', JSON.stringify({ version: 2, received: true, expiresAt: new Date(Date.now() + ms).toISOString() })); }
beforeEach(() => {
  React.__reset(); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T12:00:00Z')); jest.resetAllMocks(); data = new Map();
  Storage.getItem.mockImplementation(async key => data.get(key) ?? null);
  remove = jest.fn(); AppState.addEventListener.mockImplementation((event, handler) => { foreground = handler; return { remove }; });
});
afterEach(() => { React.__reset(); jest.clearAllTimers(); jest.useRealTimers(); });
test('trial expires while the app remains open, at the exact stored deadline', async () => {
  trialFor(2000); expect(await mount()).toMatchObject({ active: true, daysLeft: 1 });
  await jest.advanceTimersByTimeAsync(1999); expect(render().active).toBe(true);
  await jest.advanceTimersByTimeAsync(1); expect(render()).toMatchObject({ active: false, daysLeft: 0 });
});
test('the days-remaining label changes without requiring a tab switch', async () => {
  trialFor(86400000 + 1000); expect((await mount()).daysLeft).toBe(2);
  await jest.advanceTimersByTimeAsync(1000); expect(render()).toMatchObject({ active: true, daysLeft: 1 });
});
test('foreground revokes an elapsed gift before a hanging storage read can return', async () => {
  trialFor(1000); await mount();
  jest.setSystemTime(new Date(Date.now() + 2000)); // Simulate a suspended JS timer.
  Storage.getItem.mockImplementation(() => new Promise(() => {}));
  foreground('active'); expect(render()).toMatchObject({ active: false, daysLeft: 0 });
});
test('temporary storage failure keeps only the already known unexpired trial', async () => {
  trialFor(1000); await mount(); Storage.getItem.mockRejectedValue(new Error('bridge unavailable'));
  await render().refresh(); expect(render().active).toBe(true);
  await jest.advanceTimersByTimeAsync(1000); expect(render().active).toBe(false);
});
test('explicit refresh picks up redemption and ignores a late older response', async () => {
  await mount(); let finishOld;
  Storage.getItem.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  const old = render().refresh(); trialFor(1000);
  await render().refresh(); expect(render().active).toBe(true);
  finishOld(null); await old; expect(render().active).toBe(true);
});
test('unmount removes its timer/listener and ignores a late response', async () => {
  trialFor(1000); await mount(); expect(jest.getTimerCount()).toBe(1);
  React.__unmount(); expect(remove).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});
