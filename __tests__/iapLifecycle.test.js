jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(), getProducts: jest.fn(), getSubscriptions: jest.fn(),
  getAvailablePurchases: jest.fn(), getPurchaseHistories: jest.fn(), requestPurchase: jest.fn(), finishTransaction: jest.fn(),
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
let React, IAP, Storage, Alert, AppState, useIAP, data, returnedIds, catalog, owned;
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
  AppState = require('react-native').AppState;
  AppState.addEventListener.mockReturnValue({ remove: jest.fn() });
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
  IAP.getPurchaseHistories.mockResolvedValue([]);
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


const emitPurchase = async purchase => {
  const callback = IAP.purchaseUpdatedListener.mock.calls.at(-1)[0];
  await callback(purchase);
  await settle();
};
const iosPurchase = (sku = LIFETIME, id = 'tx-lifetime', extra = {}) => ({
  productId: sku, id, transactionId: id, ...extra,
});
function cachedIdentity(sku = LIFETIME, id = 'tx-lifetime') {
  cachedPro(sku);
  data.set('rg_pro_transaction_v1', JSON.stringify({ productId: sku, transactionId: id }));
}
function resume() {
  const callback = AppState.addEventListener.mock.calls.at(-1)[1];
  callback('background'); callback('active');
}

test.each(['ios', 'android'])('%s clean startup silently recovers an existing lifetime purchase', async platform => {
  React.__reset(); setup(platform);
  owned = [iosPurchase(LIFETIME, 'restored', platform === 'android' ? { purchaseStateAndroid: 1, purchaseToken: 'token' } : {})];
  expect((await mount()).isPro).toBe(true);
  expect(data.get('rg_pro_unlocked')).toBe('true');
  expect(data.get('rg_pro_product_v1')).toBe(LIFETIME);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(IAP.initConnection).toHaveBeenCalledTimes(1);
});

test.each(['ios', 'android'])('%s lifetime and legacy access survive old-cache migration and empty queries', async platform => {
  for (const sku of [LIFETIME, 'unknown']) {
    React.__reset(); setup(platform); cachedPro(sku, false);
    expect((await mount()).isPro).toBe(true);
    expect(data.get('rg_pro_product_v1')).toBe(sku);
    await render().restore();
    expect(render().isPro).toBe(true);
  }
});

test.each(['ios', 'android'])('%s monthly results never downgrade cached lifetime or legacy permanent access', async platform => {
  for (const sku of [LIFETIME, 'unknown']) {
    React.__reset(); setup(platform); cachedPro(sku);
    owned = [iosPurchase(MONTHLY, 'tx-monthly')];
    await mount(); await render().restore(); await emitPurchase(owned[0]);
    expect(render().isPro).toBe(true);
    expect(data.get('rg_pro_product_v1')).toBe(sku);
    expect(data.has('rg_pro_transaction_v1')).toBe(false);
  }
});

test.each(['ios', 'android'])('%s lifetime persists after restart while the store is offline', async platform => {
  React.__reset(); setup(platform); await mount();
  await emitPurchase(iosPurchase());
  React.__reset();
  IAP.getAvailablePurchases.mockRejectedValue(new Error('offline'));
  await mount();
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(LIFETIME);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([
  { revocationDateIOS: 123 },
  { expirationDateIOS: Date.parse('2026-08-01T00:00:00Z') },
  { isUpgradedIOS: true },
])('iOS invalid transaction %j never grants from query, Restore, listener or checkout', async invalid => {
  owned = [iosPurchase(LIFETIME, 'bad-transaction', invalid)];
  await mount(); await render().restore(); await emitPurchase(owned[0]);
  IAP.requestPurchase.mockResolvedValue(owned[0]);
  await render().purchase('lifetime');
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});

test('an iOS refund for the exact recorded lifetime rechecks before removing only entitlement keys', async () => {
  cachedIdentity(); data.set('rg_saved_incidents', 'retained');
  await mount();
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
  expect(data.has('rg_pro_transaction_v1')).toBe(false);
  expect(data.get('rg_saved_incidents')).toBe('retained');
  expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(2);
});

test.each([['different-lifetime', LIFETIME], ['old-monthly', MONTHLY]])('unrelated revoked %s does not remove the recorded lifetime', async (id, sku) => {
  cachedIdentity(); await mount();
  await emitPurchase(iosPurchase(sku, id, { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('tx-lifetime');
});

test.each([LIFETIME, 'unknown'])('legacy %s without transaction identity survives an ambiguous refund', async sku => {
  cachedPro(sku); await mount();
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(sku);
});

test.each([LIFETIME, MONTHLY, ANNUAL])('a refunded lifetime retains a separate valid %s entitlement', async sku => {
  cachedIdentity(); await mount();
  owned = [iosPurchase(sku, 'other-valid')];
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(sku);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('other-valid');
});

test('revoked older renewal sharing an original transaction does not revoke current renewal', async () => {
  cachedIdentity(MONTHLY, 'new-renewal');
  data.set('rg_pro_verified_at_v1', String(Date.now()));
  await mount();
  await emitPurchase(iosPurchase(MONTHLY, 'old-renewal', {
    originalTransactionIdentifierIOS: 'same-original', revocationDateIOS: Date.now(),
  }));
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-renewal');
});

test('a revoked exact lifetime remains accessible during an outage and reconciles on resume', async () => {
  cachedIdentity(); await mount();
  IAP.getAvailablePurchases.mockRejectedValue(new Error('offline'));
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
  IAP.getAvailablePurchases.mockResolvedValue([]);
  jest.setSystemTime(Date.now() + 60001); resume(); await settle();
  expect(render().isPro).toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('an incomplete catalog cannot prove there are no entitlements after a refund', async () => {
  cachedIdentity(); await mount(); returnedIds = [LIFETIME]; catalog.clear();
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
});

test('a stale positive Restore cannot regrant a transaction revoked while its query was pending', async () => {
  cachedIdentity(); await mount();
  let releaseRestore;
  IAP.getAvailablePurchases.mockImplementationOnce(() => new Promise(resolve => { releaseRestore = resolve; }));
  const restoring = render().restore(); await flush();
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(false);
  releaseRestore([iosPurchase()]); await restoring; await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});

test('a refund query finishing after a new valid lifetime grant cannot remove the new purchase', async () => {
  cachedIdentity(); await mount();
  let releaseRefund;
  IAP.getAvailablePurchases.mockImplementationOnce(() => new Promise(resolve => { releaseRefund = resolve; }));
  const refunding = emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  await flush();
  await emitPurchase(iosPurchase(LIFETIME, 'new-lifetime'));
  releaseRefund([]); await refunding;
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-lifetime');
});

test('a stale checkout promise cannot resurrect its refunded transaction', async () => {
  await mount(); let finishCheckout;
  IAP.requestPurchase.mockImplementationOnce(() => new Promise(resolve => { finishCheckout = resolve; }));
  const checkout = render().purchase(); await flush();
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  finishCheckout(iosPurchase()); await checkout; await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});

test('an older different lifetime event cannot overwrite the identity of a newer known purchase', async () => {
  cachedIdentity(LIFETIME, 'new-lifetime'); await mount();
  await emitPurchase(iosPurchase(LIFETIME, 'old-lifetime'));
  await emitPurchase(iosPurchase(LIFETIME, 'old-lifetime', { revocationDateIOS: Date.now() }));
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-lifetime');
});

test.each(['ios', 'android'])('%s foreground recovery is silent, throttled and deduplicated', async platform => {
  React.__reset(); setup(platform); await mount();
  const initialCalls = IAP.getAvailablePurchases.mock.calls.length;
  resume(); await settle(); expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(initialCalls);
  jest.setSystemTime(Date.now() + 60001);
  let complete;
  IAP.getAvailablePurchases.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  resume(); await settle();
  jest.setSystemTime(Date.now() + 60001); resume(); await settle();
  expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(initialCalls + 1);
  complete([iosPurchase()]); await settle();
  expect(render().isPro).toBe(true);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('Android pending delivery stays locked until completion and is then acknowledged', async () => {
  React.__reset(); setup('android'); await mount();
  const payment = iosPurchase(LIFETIME, 'GPA-test', { purchaseStateAndroid: 2, purchaseToken: 'local-token' });
  await emitPurchase(payment);
  expect(render().isPro).toBe(false); expect(IAP.finishTransaction).not.toHaveBeenCalled();
  await emitPurchase({ ...payment, purchaseStateAndroid: 1 });
  expect(render().isPro).toBe(true); expect(IAP.finishTransaction).toHaveBeenCalledTimes(1);
});


test('a matching verified refund survives offline restart and waits for complete reconciliation', async () => {
  cachedIdentity(); await mount();
  IAP.getAvailablePurchases.mockRejectedValue(new Error('offline'));
  await emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(true);
  React.__reset(); await mount();
  expect(render().isPro).toBe(true);
  IAP.getAvailablePurchases.mockResolvedValue([]);
  jest.setSystemTime(Date.now() + 60001); resume(); await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('a newer grant wins when a verified refund query waits for the old verification clock', async () => {
  cachedIdentity(); await mount();
  let finishClock;
  Storage.getItem.mockImplementation(async key => {
    if (key === 'rg_pro_verified_at_v1') return new Promise(resolve => { finishClock = resolve; });
    return data.get(key) ?? null;
  });
  const refunding = emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  await flush(); expect(finishClock).toBeDefined();
  await emitPurchase(iosPurchase(LIFETIME, 'new-lifetime'));
  finishClock(String(Date.now())); await refunding;
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-lifetime');
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});


test('Android unspecified payment state neither grants nor acknowledges', async () => {
  React.__reset(); setup('android');
  const unpaid = iosPurchase(LIFETIME, 'GPA-unspecified', { purchaseStateAndroid: 0, purchaseToken: 'local-token' });
  owned = [unpaid]; await mount(); await render().restore(); await emitPurchase(unpaid);
  IAP.requestPurchase.mockResolvedValue([unpaid]); await render().purchase();
  expect(render().isPro).toBe(false);
  expect(IAP.finishTransaction).not.toHaveBeenCalled();
});

test('an exact refund arriving before cache hydration completes still matches the saved lifetime', async () => {
  cachedIdentity(); let finishIdentity;
  Storage.getItem.mockImplementation(async key => {
    if (key === 'rg_pro_transaction_v1') return new Promise(resolve => { finishIdentity = resolve; });
    return data.get(key) ?? null;
  });
  await mount();
  const refunding = emitPurchase(iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() }));
  await flush();
  finishIdentity(JSON.stringify({ productId: LIFETIME, transactionId: 'tx-lifetime' }));
  await refunding; await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});


test.each([MONTHLY, ANNUAL])('iOS currentEntitlements restores billing-grace %s on a clean startup', async sku => {
  // StoreKit includes a grace-period subscription in currentEntitlements even
  // though its last paid transaction expiry is past. It exposes no grace flag.
  owned = [iosPurchase(sku, 'grace-transaction', { expirationDateIOS: Date.now() - 86400000 })];
  expect((await mount()).isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(sku);
  expect(data.get('rg_pro_verified_at_v1')).toBe(String(Date.now()));
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([MONTHLY, ANNUAL])('explicit Restore accepts current-query billing grace for %s', async sku => {
  await mount();
  owned = [iosPurchase(sku, 'restored-grace', { expirationDateIOS: Date.now() - 86400000 })];
  await render().restore();
  expect(render().isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(sku);
  expect(Alert.alert).toHaveBeenLastCalledWith('iap.restoredTitle', 'iap.restoredBody');
});

test('an expired subscription update or checkout does not claim the grace allowed to a current query', async () => {
  await mount();
  const expired = iosPurchase(MONTHLY, 'old-paid-period', { expirationDateIOS: Date.now() - 86400000 });
  await emitPurchase(expired);
  expect(render().isPro).toBe(false);
  IAP.requestPurchase.mockResolvedValue(expired);
  await render().purchase('monthly');
  expect(render().isPro).toBe(false);
  owned = [expired];
  await render().restore();
  expect(render().isPro).toBe(true);
});

test.each([{ revocationDateIOS: 123 }, { isUpgradedIOS: true }])('current-query grace never overrides invalid transaction %j', async invalid => {
  owned = [iosPurchase(MONTHLY, 'invalid-grace', { expirationDateIOS: Date.now() - 86400000, ...invalid })];
  await mount(); await render().restore();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});

test('a current-query billing-grace result cannot resurrect a known revoked subscription', async () => {
  const grace = iosPurchase(MONTHLY, 'refunded-grace', { expirationDateIOS: Date.now() - 86400000 });
  owned = [grace]; await mount();
  expect(render().isPro).toBe(true);
  // Simulate a stale current query omitting the revocation field.
  await emitPurchase({ ...grace, revocationDateIOS: Date.now() });
  expect(render().isPro).toBe(false);
  await render().restore();
  expect(render().isPro).toBe(false);
});

test('cached subscriber revalidation honors current-query grace after an old local verification clock', async () => {
  cachedIdentity(MONTHLY, 'grace-transaction');
  owned = [iosPurchase(MONTHLY, 'grace-transaction', { expirationDateIOS: Date.now() - 86400000 })];
  expect((await mount()).isPro).toBe(true);
  expect(data.get('rg_pro_verified_at_v1')).toBe(String(Date.now()));
});

test('startup recovers an exact lifetime refund completed while the app was closed', async () => {
  cachedIdentity(); data.set('rg_saved_incidents', 'retained');
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  expect((await mount()).isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
  expect(data.get('rg_saved_incidents')).toBe('retained');
  expect(IAP.getPurchaseHistories).toHaveBeenCalledWith({ alsoPublishToEventListener: false, onlyIncludeActiveItems: false });
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([LIFETIME, MONTHLY, ANNUAL])('closed-app refund recovery retains another valid %s purchase', async sku => {
  cachedIdentity();
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  owned = [iosPurchase(sku, 'other-owned')];
  expect((await mount()).isPro).toBe(true);
  expect(data.get('rg_pro_product_v1')).toBe(sku);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('other-owned');
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test.each([LIFETIME, 'unknown'])('historical refunds cannot revoke identity-less legacy %s access', async sku => {
  cachedPro(sku);
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  expect((await mount()).isPro).toBe(true);
  expect(IAP.getPurchaseHistories).not.toHaveBeenCalled();
  expect(data.get('rg_pro_product_v1')).toBe(sku);
});

test('a historical refund of original transaction 0 cannot revoke newer lifetime transaction 1', async () => {
  cachedIdentity(LIFETIME, '1');
  IAP.getPurchaseHistories.mockResolvedValue([
    iosPurchase(LIFETIME, '0', { originalTransactionIdentifierIOS: '0', revocationDateIOS: Date.now() }),
    iosPurchase(LIFETIME, '1', { originalTransactionIdentifierIOS: '0' }),
    iosPurchase(MONTHLY, '1', { revocationDateIOS: Date.now() }),
  ]);
  expect((await mount()).isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('1');
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test.each([[], undefined, {}, [iosPurchase(LIFETIME, 'tx-lifetime')]])('incomplete or non-refund history %j cannot revoke lifetime', async history => {
  cachedIdentity(); IAP.getPurchaseHistories.mockResolvedValue(history);
  expect((await mount()).isPro).toBe(true);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('history errors or an unavailable history API preserve lifetime and still query active ownership', async () => {
  cachedIdentity(); IAP.getPurchaseHistories.mockRejectedValue(new Error('history unavailable'));
  expect((await mount()).isPro).toBe(true);
  expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(1);
  React.__reset(); setup(); cachedIdentity(); IAP.getPurchaseHistories = undefined;
  expect((await mount()).isPro).toBe(true);
  expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(1);
});

test('a timed-out history query preserves access and its late refund result has no side effects', async () => {
  cachedIdentity(); let releaseHistory;
  IAP.getPurchaseHistories.mockImplementationOnce(() => new Promise(resolve => { releaseHistory = resolve; }));
  expect((await mount()).isPro).toBe(true);
  jest.advanceTimersByTime(5001); await settle();
  expect(IAP.getAvailablePurchases).toHaveBeenCalledTimes(1);
  releaseHistory([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]); await settle();
  expect(render().isPro).toBe(true);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('history proof survives restart when the active query is unavailable, then reconciles on foreground', async () => {
  cachedIdentity();
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  IAP.getAvailablePurchases.mockRejectedValue(new Error('offline'));
  expect((await mount()).isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_pending_revocation_v1')).transactionId).toBe('tx-lifetime');
  React.__reset(); IAP.getPurchaseHistories.mockRejectedValue(new Error('offline'));
  expect((await mount()).isPro).toBe(true);
  IAP.getAvailablePurchases.mockResolvedValue([]);
  jest.setSystemTime(Date.now() + 60001); resume(); await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('historical refund still cannot revoke access with an incomplete current catalog', async () => {
  cachedIdentity(); returnedIds = [LIFETIME, MONTHLY];
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  expect((await mount()).isPro).toBe(true);
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(true);
});

test('expired historical ownership is never used to grant Pro or bypass current subscription expiry', async () => {
  cachedIdentity(MONTHLY, 'expired');
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(MONTHLY, 'expired', { expirationDateIOS: Date.now() - 86400000 })]);
  expect((await mount()).isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});

test('Android never queries historical refunds or revokes a cached lifetime from absent ownership', async () => {
  React.__reset(); setup('android'); cachedIdentity();
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  expect((await mount()).isPro).toBe(true);
  expect(IAP.getPurchaseHistories).not.toHaveBeenCalled();
});

test('a historical refund query cannot overwrite a newer purchase arriving while it was pending', async () => {
  cachedIdentity(MONTHLY, 'old-monthly'); let releaseHistory;
  IAP.getPurchaseHistories.mockImplementationOnce(() => new Promise(resolve => { releaseHistory = resolve; }));
  await mount(); await emitPurchase(iosPurchase(LIFETIME, 'new-lifetime'));
  releaseHistory([iosPurchase(MONTHLY, 'old-monthly', { revocationDateIOS: Date.now() })]); await settle();
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-lifetime');
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('a negative current query after historical refund cannot remove a newer lifetime grant', async () => {
  cachedIdentity(); let releaseCurrent;
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  IAP.getAvailablePurchases.mockImplementationOnce(() => new Promise(resolve => { releaseCurrent = resolve; }));
  await mount(); expect(releaseCurrent).toBeDefined();
  await emitPurchase(iosPurchase(LIFETIME, 'new-lifetime'));
  releaseCurrent([]); await settle();
  expect(render().isPro).toBe(true);
  expect(JSON.parse(data.get('rg_pro_transaction_v1')).transactionId).toBe('new-lifetime');
  expect(data.has('rg_pro_pending_revocation_v1')).toBe(false);
});

test('history refund proof rejects an older Restore response for the refunded transaction', async () => {
  cachedIdentity(); await mount(); let releaseRestore;
  IAP.getAvailablePurchases.mockImplementationOnce(() => new Promise(resolve => { releaseRestore = resolve; }));
  const restoring = render().restore(); await flush();
  IAP.getPurchaseHistories.mockResolvedValue([iosPurchase(LIFETIME, 'tx-lifetime', { revocationDateIOS: Date.now() })]);
  jest.setSystemTime(Date.now() + 60001); resume(); await settle();
  expect(render().isPro).toBe(false);
  releaseRestore([iosPurchase()]); await restoring; await settle();
  expect(render().isPro).toBe(false);
  expect(data.has('rg_pro_unlocked')).toBe(false);
});
