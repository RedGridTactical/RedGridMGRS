/** Store review requests: launch never asks, equal gates, one shared cooldown, native only, serialized, context-safe. */
jest.mock('react', () => require('./helpers/hookHarness')());
const mockRN = { AppState: { currentState: 'active' }, Linking: { canOpenURL: jest.fn(), openURL: jest.fn() }, Platform: { OS: 'ios' } };
jest.mock('react-native', () => mockRN);
const mockStore = new Map();
const mockStorage = {
  getItem: jest.fn(async key => (mockStore.has(key) ? mockStore.get(key) : null)),
  setItem: jest.fn(async (key, value) => { mockStore.set(key, value); }),
};
jest.mock('@react-native-async-storage/async-storage', () => mockStorage);
const mockReview = { isAvailableAsync: jest.fn(), requestReview: jest.fn() };
jest.mock('expo-store-review', () => mockReview);

const React = require('react');
const { useStoreReview, evaluateReviewGates, parseTimestamp, REVIEW_KEYS, REVIEW_GATES } = require('../src/hooks/useStoreReview');
const DAY = 86400000;
const NOW = 1_800_000_000_000;
const render = () => React.__render(useStoreReview);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const seedEligible = () => { mockStore.set(REVIEW_KEYS.APP_OPENS, '5'); mockStore.set(REVIEW_KEYS.INSTALL_DATE, String(NOW - 10 * DAY)); };

beforeEach(() => {
  React.__reset(); mockStore.clear(); mockStorage.getItem.mockClear(); mockStorage.setItem.mockClear();
  mockReview.isAvailableAsync.mockReset().mockResolvedValue(true); mockReview.requestReview.mockReset().mockResolvedValue(undefined);
  mockRN.Linking.canOpenURL.mockReset().mockResolvedValue(true); mockRN.Linking.openURL.mockReset().mockResolvedValue(undefined);
  mockRN.AppState.currentState = 'active';
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { React.__unmount(); jest.restoreAllMocks(); });

describe('pure gates', () => {
  test('strict timestamps: malformed values fail closed', () => {
    expect(parseTimestamp(null)).toBeNull(); expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('123')).toBe(123);
    expect(Number.isNaN(parseTimestamp('12a'))).toBe(true); expect(Number.isNaN(parseTimestamp('-5'))).toBe(true); expect(Number.isNaN(parseTimestamp(5))).toBe(true);
    expect(evaluateReviewGates({ opens: '9', installDate: 'yesterday', lastRequest: null, lastPositive: null }, NOW)).toBe('malformed');
    expect(evaluateReviewGates({ opens: '9', installDate: String(NOW - 9 * DAY), lastRequest: 'x', lastPositive: null }, NOW)).toBe('malformed');
  });
  test('usage gates are the same for everyone and the cooldown honours both legacy timestamps', () => {
    const base = { opens: '3', installDate: String(NOW - 2 * DAY), lastRequest: null, lastPositive: null };
    expect(evaluateReviewGates(base, NOW)).toBe('eligible');
    expect(evaluateReviewGates({ ...base, opens: '2' }, NOW)).toBe('opens');
    expect(evaluateReviewGates({ ...base, installDate: String(NOW - 2 * DAY + 1) }, NOW)).toBe('install-age');
    expect(evaluateReviewGates({ ...base, opens: null }, NOW)).toBe('opens');
    expect(evaluateReviewGates({ ...base, installDate: null }, NOW)).toBe('install-age');
    expect(evaluateReviewGates({ ...base, lastRequest: String(NOW - 119 * DAY) }, NOW)).toBe('cooldown');
    expect(evaluateReviewGates({ ...base, lastPositive: String(NOW - 100 * DAY) }, NOW)).toBe('cooldown');
    expect(evaluateReviewGates({ ...base, lastRequest: String(NOW - 200 * DAY), lastPositive: String(NOW - 30 * DAY) }, NOW)).toBe('cooldown');
    expect(evaluateReviewGates({ ...base, lastRequest: String(NOW - 121 * DAY), lastPositive: String(NOW - 130 * DAY) }, NOW)).toBe('eligible');
    expect(REVIEW_GATES).toEqual({ minOpens: 3, minDaysInstalled: 2, cooldownDays: 120 });
  });
});

describe('launch', () => {
  test('records install date and opens once per launch and never touches the review API or a URL', async () => {
    const hook = render();
    expect(await hook.recordLaunch()).toBe(true);
    expect(await hook.recordLaunch()).toBe(false);
    expect(mockStore.get(REVIEW_KEYS.INSTALL_DATE)).toBe(String(NOW));
    expect(mockStore.get(REVIEW_KEYS.APP_OPENS)).toBe('1');
    expect(mockReview.isAvailableAsync).not.toHaveBeenCalled(); expect(mockReview.requestReview).not.toHaveBeenCalled();
    expect(mockRN.Linking.openURL).not.toHaveBeenCalled();
  });
  test('a malformed stored open count restarts at 1 and a malformed install date is replaced', async () => {
    mockStore.set(REVIEW_KEYS.APP_OPENS, 'lots'); mockStore.set(REVIEW_KEYS.INSTALL_DATE, 'bad');
    await render().recordLaunch();
    expect(mockStore.get(REVIEW_KEYS.APP_OPENS)).toBe('1'); expect(mockStore.get(REVIEW_KEYS.INSTALL_DATE)).toBe(String(NOW));
  });
});

describe('automatic request', () => {
  test('eligible: native request attempted once, attempt time recorded, no URL, outcome is only "attempted"', async () => {
    seedEligible();
    expect(await render().requestReviewIfEligible()).toBe('attempted');
    expect(mockReview.requestReview).toHaveBeenCalledTimes(1);
    expect(mockStore.get(REVIEW_KEYS.LAST_REVIEW_REQUEST)).toBe(String(NOW));
    expect(mockRN.Linking.openURL).not.toHaveBeenCalled(); expect(mockRN.Linking.canOpenURL).not.toHaveBeenCalled();
  });
  test('Pro has no bypass: the same usage gates block everyone', async () => {
    mockStore.set(REVIEW_KEYS.APP_OPENS, '2'); mockStore.set(REVIEW_KEYS.INSTALL_DATE, String(NOW - 10 * DAY));
    expect(await render().requestReviewIfEligible({ isPro: true })).toBe('gated:opens');
    mockStore.set(REVIEW_KEYS.APP_OPENS, '3'); mockStore.set(REVIEW_KEYS.INSTALL_DATE, String(NOW - 1 * DAY));
    expect(await render().requestReviewIfEligible({ isPro: true })).toBe('gated:install-age');
    expect(mockReview.requestReview).not.toHaveBeenCalled();
  });
  test('legacy positive-moment timestamp migrates into the shared cooldown', async () => {
    seedEligible(); mockStore.set(REVIEW_KEYS.LAST_POSITIVE_PROMPT, String(NOW - 50 * DAY));
    expect(await render().requestReviewIfEligible()).toBe('gated:cooldown');
    mockStore.set(REVIEW_KEYS.LAST_POSITIVE_PROMPT, String(NOW - 121 * DAY));
    expect(await render().requestReviewIfEligible()).toBe('attempted');
  });
  test('unavailable native API means no request and no URL fallback on either platform', async () => {
    seedEligible();
    for (const os of ['ios', 'android']) {
      mockRN.Platform.OS = os; mockReview.isAvailableAsync.mockResolvedValueOnce(false);
      expect(await render().requestReviewIfEligible()).toBe('unavailable');
    }
    mockReview.isAvailableAsync.mockRejectedValueOnce(new Error('no module'));
    expect(await render().requestReviewIfEligible()).toBe('unavailable');
    expect(mockReview.requestReview).not.toHaveBeenCalled(); expect(mockRN.Linking.openURL).not.toHaveBeenCalled();
    expect(mockStore.has(REVIEW_KEYS.LAST_REVIEW_REQUEST)).toBe(false);
  });
  test('malformed stored timestamps and storage failures fail closed', async () => {
    seedEligible(); mockStore.set(REVIEW_KEYS.LAST_REVIEW_REQUEST, '12-05-2026');
    expect(await render().requestReviewIfEligible()).toBe('gated:malformed');
    mockStore.delete(REVIEW_KEYS.LAST_REVIEW_REQUEST);
    mockStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await render().requestReviewIfEligible()).toBe('storage');
    mockStorage.setItem.mockRejectedValueOnce(new Error('disk'));
    expect(await render().requestReviewIfEligible()).toBe('storage');
    expect(mockReview.requestReview).not.toHaveBeenCalled();
  });
  test('two overlapping calls produce exactly one native request', async () => {
    seedEligible(); const gate = deferred(); mockReview.isAvailableAsync.mockReturnValueOnce(gate.promise);
    const hook = render();
    const first = hook.requestReviewIfEligible(); const second = hook.requestReviewIfEligible();
    expect(await second).toBe('busy');
    gate.resolve(true); expect(await first).toBe('attempted');
    expect(mockReview.requestReview).toHaveBeenCalledTimes(1);
    expect(await hook.requestReviewIfEligible()).toBe('gated:cooldown');
  });
  test('backgrounding, a Tactical switch or a screen change during the awaits cancels the request', async () => {
    seedEligible();
    const gate = deferred(); mockReview.isAvailableAsync.mockReturnValueOnce(gate.promise);
    let pending = render().requestReviewIfEligible();
    mockRN.AppState.currentState = 'background'; gate.resolve(true);
    expect(await pending).toBe('background');
    mockRN.AppState.currentState = 'active';
    let tactical = false;
    const gate2 = deferred(); mockReview.isAvailableAsync.mockReturnValueOnce(gate2.promise);
    pending = render().requestReviewIfEligible({ isContextStable: () => !tactical });
    tactical = true; gate2.resolve(true);
    expect(await pending).toBe('context');
    expect(await render().requestReviewIfEligible({ isContextStable: () => false })).toBe('context');
    expect(mockReview.requestReview).not.toHaveBeenCalled();
    expect(mockStore.has(REVIEW_KEYS.LAST_REVIEW_REQUEST)).toBe(false);
  });
  test('unmounting during the awaits cancels the request', async () => {
    seedEligible(); const gate = deferred(); mockReview.isAvailableAsync.mockReturnValueOnce(gate.promise);
    render(); React.__effects();
    const pending = render().requestReviewIfEligible();
    React.__unmount(); gate.resolve(true);
    expect(await pending).toBe('unmounted');
    expect(mockReview.requestReview).not.toHaveBeenCalled();
  });
  test('a rejected native request is still only an attempt and never falls back to a URL', async () => {
    seedEligible(); mockReview.requestReview.mockRejectedValueOnce(new Error('quota'));
    expect(await render().requestReviewIfEligible()).toBe('attempted');
    expect(mockRN.Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('manual Rate This App', () => {
  test('opens the write-review URL and nothing else', async () => {
    mockRN.Platform.OS = 'ios';
    expect(await render().openStoreReview()).toBe(true);
    expect(mockRN.Linking.openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6759629554?action=write-review');
    expect(mockReview.requestReview).not.toHaveBeenCalled();
    mockRN.Linking.canOpenURL.mockResolvedValueOnce(false);
    expect(await render().openStoreReview()).toBe(false);
  });
});
