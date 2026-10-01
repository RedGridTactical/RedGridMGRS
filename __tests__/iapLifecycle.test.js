jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(), getProducts: jest.fn(), getSubscriptions: jest.fn(),
  getAvailablePurchases: jest.fn(), requestPurchase: jest.fn(), finishTransaction: jest.fn(),
  purchaseUpdatedListener: jest.fn(), purchaseErrorListener: jest.fn(),
}));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../src/i18n', () => ({ t: key => key }));
jest.mock('../src/utils/analytics', () => ({ trackEvent: jest.fn() }));

const fs = require('fs');
const LIFETIME = 'redgrid_pro_lifetime';
const MONTHLY = 'redgrid_mgrs_pro_monthly';
const ANNUAL = 'redgrid_mgrs_pro_annual';
const ALL = [LIFETIME, MONTHLY, ANNUAL];
let React, IAP, Storage, Alert, useIAP, data, returnedIds, catalog, owned;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const render = () => React.__render(useIAP);
async function settle() { await flush(); const value = render(); React.__effects(); await flush(); return render(); }
async function mount() { render(); React.__effects(); return settle(); }
function cachedPro(sku = MONTHLY, validated = true) {
  data.set('rg_pro_unlocked', 'true');
  if (validated) data.set('rg_pro_validated_v2', 'true');
  data.set('rg_pro_product_v1', sku);
  data.set('rg_pro_verified_at_v1', String(Date.now() - 30 * 86400000));
}
function setup(platform = 'ios') {
  jest.resetModules();
  React = require('react');
  require('react-native').Platform.OS = platform;
  IAP = require('expo-iap'); Storage = require('@react-native-async-storage/async-storage');
  Alert = require('../src/utils/fieldAlert').Alert;
  useIAP = require('../src/hooks/useIAP').useIAP;
  data = new Map(); returnedIds = ALL; catalog = new Set(); owned = [];
  Storage.getItem.mockImplementation(async key => data.get(key) ?? null);
  Storage.setItem.mockImplementation(async (key, value) => { data.set(key, value); });
  Storage.removeItem.mockImplementation(async key => { data.delete(key); });
  IAP.initConnection.mockImplementation(async () => { catalog.clear(); return true; });
  // Model the actual native cache and public wrapper's requested-SKU filter.
  const fetch = async ids => {
    ids.filter(id => returnedIds.includes(id)).forEach(id => catalog.add(id));
    return [...catalog].filter(id => ids.includes(id)).map(id => ({ id, displayPrice: '$test' }));
  };
  IAP.getProducts.mockImplementation(fetch); IAP.getSubscriptions.mockImplementation(fetch);
  IAP.getAvailablePurchases.mockImplementation(async () => owned.filter(p => platform === 'android' || catalog.has(p.productId)));
  IAP.finishTransaction.mockResolvedValue(true);
  IAP.purchaseUpdatedListener.mockReturnValue({ remove: jest.fn() });
  IAP.purchaseErrorListener.mockReturnValue({ remove: jest.fn() });
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T12:00:00Z')); setup(); });
afterEach(() => { React.__reset(); jest.clearAllTimers(); jest.useRealTimers(); });

test.each([MONTHLY, ANNUAL])('partial iOS catalog cannot revoke a cached %s subscription', async sku => {
  cachedPro(sku); owned = [{ productId: sku, id: 'transaction-1' }]; returnedIds = [LIFETIME];
  expect((await mount()).isPro).toBe(true);
  expect(await IAP.getAvailablePurchases()).toEqual([]); // Native hides the actual owned SKU.
  expect(data.get('rg_pro_unlocked')).toBe('true');
  expect(Storage.removeItem).not.toHaveBeenCalled();
});
test('monthly resolved but annual absent is still not a complete iOS entitlement query', async () => {
  cachedPro(MONTHLY); returnedIds = [LIFETIME, MONTHLY]; owned = [{ productId: ANNUAL }];
  expect((await mount()).isPro).toBe(true);
  await render().restore();
  expect(Alert.alert).toHaveBeenLastCalledWith('iap.restoreUnavailableTitle', 'iap.restoreUnavailableBody');
});
test('a complete negative catalog/query can revoke an old subscription, never lifetime', async () => {
  cachedPro(); expect((await mount()).isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
  React.__reset(); setup(); cachedPro(LIFETIME);
  expect((await mount()).isPro).toBe(true);
});
test('a complete negative inside the existing grace window preserves paid access', async () => {
  cachedPro(); data.set('rg_pro_verified_at_v1', String(Date.now() - 86400000));
  expect((await mount()).isPro).toBe(true);
});
test('legacy flags survive partial catalogs and malformed purchase responses', async () => {
  cachedPro(ANNUAL, false); returnedIds = [LIFETIME];
  expect((await mount()).isPro).toBe(true);
  React.__reset(); setup(); cachedPro(MONTHLY, false);
  IAP.getAvailablePurchases.mockResolvedValue(undefined);
  expect((await mount()).isPro).toBe(true);
});
test('legacy annual restores without putting annual on sale', async () => {
  owned = [{ id: 'transaction-annual', productId: ANNUAL }]; await mount();
  await render().restore();
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(ANNUAL);
  expect(Object.keys(render().products)).toEqual(['lifetime', 'monthly']);
  expect(Alert.alert).toHaveBeenLastCalledWith('iap.restoredTitle', 'iap.restoredBody');
});
test('a positive entitlement restores even when another catalog request fails', async () => {
  returnedIds = [MONTHLY]; owned = [{ productId: MONTHLY }]; await mount(); await render().restore();
  expect(render().isPro).toBe(true);
});
test('only complete empty results say nothing to restore; a malformed query is unavailable', async () => {
  await mount(); await render().restore();
  expect(Alert.alert).toHaveBeenLastCalledWith('iap.nothingToRestoreTitle', 'iap.nothingToRestoreBody');
  IAP.getAvailablePurchases.mockResolvedValue({}); await render().restore();
  expect(Alert.alert).toHaveBeenLastCalledWith('iap.restoreUnavailableTitle', 'iap.restoreUnavailableBody');
});
test('startup and restore share one connection instead of clearing a populated ProductStore', async () => {
  cachedPro(); owned = [{ productId: MONTHLY }];
  render(); React.__effects(); const restoring = render().restore(); await settle(); await restoring;
  expect(IAP.initConnection).toHaveBeenCalledTimes(1);
  expect(render().isPro).toBe(true);
});
test('Android paid restoration is independent of price catalog and pending payments stay locked', async () => {
  React.__reset(); setup('android'); returnedIds = [];
  owned = [{ productId: MONTHLY, purchaseStateAndroid: 1, purchaseTokenAndroid: 'test-token' }];
  await mount(); await render().restore();
  expect(render().isPro).toBe(true);
  expect(IAP.finishTransaction).toHaveBeenCalled();
  React.__reset(); setup('android');
  owned = [{ productId: LIFETIME, purchaseStateAndroid: 2, purchaseTokenAndroid: 'test-token' }];
  await mount(); await render().restore(); expect(render().isPro).toBe(false);
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});
test('the installed native library still has the cache contract this regression models', () => {
  const swift = fs.readFileSync(require.resolve('expo-iap/package.json').replace('package.json', 'ios/ExpoIapModule.swift'), 'utf8');
  expect(swift).toMatch(/productStore\?\.getProduct\(productID: transaction\.productID\)/);
  expect(swift).toMatch(/self\.productStore = ProductStore\(\)/);
  const wrapper = fs.readFileSync(require.resolve('expo-iap/package.json').replace('package.json', 'src/index.ts'), 'utf8');
  expect(wrapper).toMatch(/onlyIncludeActiveItems = true/);
  expect(wrapper).toMatch(/return products\.concat\(subscriptions\)/);
});
test('an older negative recheck cannot overwrite a restore that completed while storage was pending', async () => {
  cachedPro();
  let finishOldClock;
  Storage.getItem.mockImplementation(async key => {
    if (key === 'rg_pro_verified_at_v1') return new Promise(resolve => { finishOldClock = resolve; });
    return data.get(key) ?? null;
  });
  await mount(); expect(finishOldClock).toBeDefined();
  owned = [{ productId: LIFETIME }]; await render().restore();
  expect(render().isPro).toBe(true);
  finishOldClock(String(Date.now() - 30 * 86400000)); await settle();
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_unlocked')).toBe('true');
  expect(data.get('rg_pro_product_v1')).toBe(LIFETIME);
});
test('a positive restore is persisted after any already-started revocation writes', async () => {
  cachedPro(); let finishRemoval;
  Storage.removeItem.mockImplementationOnce(key => new Promise(resolve => {
    finishRemoval = () => { data.delete(key); resolve(); };
  }));
  await mount(); expect(finishRemoval).toBeDefined(); expect(render().isPro).toBe(false);
  owned = [{ productId: LIFETIME }];
  const restoring = render().restore(); await flush(); expect(render().isPro).toBe(true);
  finishRemoval(); await restoring; await settle();
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_unlocked')).toBe('true');
  expect(data.get('rg_pro_product_v1')).toBe(LIFETIME);
});
