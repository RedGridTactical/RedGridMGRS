/**
 * Test suite for src/utils/analytics.js
 * On-device analytics — AsyncStorage mock
 */

const store = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
  setItem: jest.fn((key, val) => { store[key] = val; return Promise.resolve(); }),
  removeItem: jest.fn((key) => { delete store[key]; return Promise.resolve(); }),
}));

const {
  trackEvent, trackScreen, trackSession, getAnalytics, resetAnalytics,
} = require('../src/utils/analytics');

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
});

describe('analytics', () => {
  test('getAnalytics returns empty shape when no data exists', async () => {
    const data = await getAnalytics();
    expect(data.screens).toEqual({});
    expect(data.events).toEqual({});
    expect(data.sessions).toBe(0);
    expect(data.firstSeen).toBeTruthy();
    expect(data.lastSeen).toBeTruthy();
  });

  test('trackSession increments session count', async () => {
    await trackSession();
    await trackSession();
    await trackSession();
    const data = await getAnalytics();
    expect(data.sessions).toBe(3);
  });

  test('trackEvent increments event counter', async () => {
    await trackEvent('purchase_tap');
    await trackEvent('purchase_tap');
    await trackEvent('share_tap');
    const data = await getAnalytics();
    expect(data.events.purchase_tap).toBe(2);
    expect(data.events.share_tap).toBe(1);
  });

  test('trackScreen increments screen counter', async () => {
    await trackScreen('grid');
    await trackScreen('grid');
    await trackScreen('tools');
    const data = await getAnalytics();
    expect(data.screens.grid).toBe(2);
    expect(data.screens.tools).toBe(1);
  });

  test('resetAnalytics clears all data', async () => {
    await trackSession();
    await trackEvent('test');
    await trackScreen('grid');
    await resetAnalytics();
    const data = await getAnalytics();
    expect(data.sessions).toBe(0);
    expect(data.events).toEqual({});
    expect(data.screens).toEqual({});
  });

  test('firstSeen is preserved across calls', async () => {
    await trackSession();
    const first = (await getAnalytics()).firstSeen;
    await trackSession();
    await trackEvent('x');
    const later = (await getAnalytics()).firstSeen;
    expect(later).toBe(first);
  });

  test('lastSeen is set to today', async () => {
    await trackSession();
    const data = await getAnalytics();
    const today = new Date().toISOString().slice(0, 10);
    expect(data.lastSeen).toBe(today);
  });

  test('handles corrupted storage gracefully', async () => {
    store['rg_analytics'] = 'not-json{{{';
    await expect(trackSession()).resolves.toBeUndefined();
  });
});
