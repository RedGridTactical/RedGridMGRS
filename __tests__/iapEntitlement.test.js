/**
 * Entitlement-resolution guards.
 *
 * These cover four defects found auditing the app against expo-iap 2.8.0's
 * actual native source. Every one of them silently harms a PAYING customer,
 * and none of them would surface in a normal purchase test.
 *
 *  1. iOS filters StoreKit entitlements through a native product cache that
 *     only getProducts/getSubscriptions populate. The retired annual SKU was
 *     entitled but never fetched, so an active annual subscriber's entitlement
 *     was invisible: RESTORE said "nothing to restore" and re-verification
 *     eventually revoked Pro.
 *  2. `purchase.id` is a transaction id (iOS) / order id (Android), NOT a SKU.
 *     `p.id || p.productId` therefore always resolved to a non-SKU, which got
 *     written into the "which product unlocked Pro" record and disabled
 *     subscription re-verification.
 *  3. Android PENDING purchases (payment not completed) were filtered out of
 *     the purchase path but not the restore/entitlement paths, so abandoning a
 *     payment granted Pro permanently.
 *  4. An empty entitlement result from a COLD product cache is not evidence of
 *     "no entitlement" and must never trigger revocation.
 */

const fs = require('fs');
const path = require('path');
const { entitlingSku } = require('../src/utils/iapOffers');

const LIFETIME = 'redgrid_pro_lifetime';
const MONTHLY = 'redgrid_mgrs_pro_monthly';
const ANNUAL = 'redgrid_mgrs_pro_annual';
const ALL = [LIFETIME, MONTHLY, ANNUAL];

const src = fs.readFileSync(path.join(__dirname, '..', 'src/hooks/useIAP.js'), 'utf8');

// Real serializer shapes, taken from expo-iap's native modules:
//   iOS  ExpoIapModule.swift: "id": String(transaction.id), "productId": transaction.productID
//   Kotlin ExpoIapModule.kt:  "id" to purchase.orderId,     "productId" to purchase.products.first()
const iosMonthly = {
  id: '2000000891234567',
  productId: MONTHLY,
  ids: [MONTHLY],
};
const iosAnnual = {
  id: '2000000897654321',
  productId: ANNUAL,
  ids: [ANNUAL],
};
const androidLifetime = {
  id: 'GPA.3341-2214-9976-51234',
  productId: LIFETIME,
  ids: [LIFETIME],
  purchaseStateAndroid: 1,
};
const androidPendingLifetime = {
  id: 'GPA.3341-0000-0000-00000',
  productId: LIFETIME,
  ids: [LIFETIME],
  purchaseStateAndroid: 2, // PENDING — payment not completed
};

describe('entitlingSku resolves the SKU, never the transaction id', () => {
  test('iOS monthly resolves to the product id, not the transaction id', () => {
    expect(entitlingSku(iosMonthly, ALL)).toBe(MONTHLY);
    expect(entitlingSku(iosMonthly, ALL)).not.toBe(iosMonthly.id);
  });

  test('Android lifetime resolves to the product id, not the order id', () => {
    expect(entitlingSku(androidLifetime, ALL)).toBe(LIFETIME);
    expect(entitlingSku(androidLifetime, ALL)).not.toMatch(/^GPA\./);
  });

  test('the retired annual SKU still entitles', () => {
    expect(entitlingSku(iosAnnual, ALL)).toBe(ANNUAL);
  });

  test('falls back to ids[] when productId is absent', () => {
    expect(entitlingSku({ id: 'tx1', ids: [MONTHLY] }, ALL)).toBe(MONTHLY);
  });

  test('a purchase for someone else\'s product entitles nothing', () => {
    expect(entitlingSku({ id: 'GPA.x', productId: 'com.other.app.pro' }, ALL)).toBeNull();
  });

  test('junk in, null out', () => {
    expect(entitlingSku(null, ALL)).toBeNull();
    expect(entitlingSku(undefined, ALL)).toBeNull();
    expect(entitlingSku({}, ALL)).toBeNull();
    expect(entitlingSku(iosMonthly, null)).toBeNull();
  });

  test('the old p.id || p.productId idiom would have picked the transaction id', () => {
    // Documents the bug, so nobody "simplifies" back to it.
    const legacy = iosMonthly.id || iosMonthly.productId;
    expect(legacy).toBe('2000000891234567');
    expect(ALL.includes(legacy)).toBe(false);
  });

  test('useIAP never resurrects the id-before-productId idiom', () => {
    // The pure-function tests above cannot catch a regression in the CALLER,
    // and the caller is where the bug actually lived. Pin the source.
    expect(src).not.toMatch(/\bbest\.id\s*\|\|\s*best\.productId/);
    expect(src).not.toMatch(/\bp\.id\s*\|\|\s*p\.productId/);
    expect(src).not.toMatch(/ALL_PRODUCT_IDS\.includes\(p\.id\)/);
    expect(src).not.toMatch(/p\.id === PRO_PRODUCT_ID/);
  });

  test('every purchase-to-SKU resolution goes through entitlingSku', () => {
    // The pure-function tests cannot catch a regression in the CALLERS, and the
    // callers are where the bug lived. Count the resolution sites instead:
    // reverify (x2), loadProStatus (x2), restore (x2), listener, purchase (x2).
    const uses = src.match(/entitlingSku\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(8);
    // And the import must be real.
    expect(src).toMatch(/entitlingSku[^\n]*from '\.\.\/utils\/iapOffers'|entitlingSku,/);
  });
});

describe('every entitling SKU is actually fetched', () => {
  test('ALL_PRODUCT_IDS is a subset of what we fetch', () => {
    // The invariant that broke: a SKU can be entitled but never fetched, and on
    // iOS an unfetched SKU is invisible to getAvailablePurchases forever.
    const inapp = src.match(/const INAPP_IDS = \[([^\]]*)\]/);
    const subFetch = src.match(/const SUB_FETCH_IDS = \[([^\]]*)\]/);
    const all = src.match(/const ALL_PRODUCT_IDS = \[([^\]]*)\]/);
    expect(inapp).not.toBeNull();
    expect(subFetch).not.toBeNull();
    expect(all).not.toBeNull();

    const names = (m) => m[1].split(',').map((x) => x.trim().replace(/^\.\.\./, '')).filter(Boolean);
    const fetched = new Set([...names(inapp), ...names(subFetch)]);
    // ALL_PRODUCT_IDS spreads INAPP_IDS and SUB_IDS then adds SUB_ANNUAL_ID.
    for (const n of names(all)) {
      if (n === 'INAPP_IDS') continue;
      if (n === 'SUB_IDS') { expect(fetched.has('SUB_MONTHLY_ID')).toBe(true); continue; }
      expect(fetched.has(n)).toBe(true);
    }
  });

  test('the annual SKU is passed to getSubscriptions', () => {
    expect(src).toMatch(/getSubscriptions\(SUB_FETCH_IDS\)/);
    expect(src).toMatch(/const SUB_FETCH_IDS = \[SUB_MONTHLY_ID, SUB_ANNUAL_ID\]/);
  });

  test('the paywall sale list is still monthly only', () => {
    expect(src).toMatch(/const SUB_IDS = \[SUB_MONTHLY_ID\];/);
  });
});

describe('entitlement queries warm the product cache first', () => {
  const before = (haystack, a, b) => haystack.indexOf(a) < haystack.indexOf(b);

  test('restore fetches products before asking for purchases', () => {
    const i = src.indexOf('const restore = useCallback');
    const block = src.slice(i, i + 2500);
    expect(block).toContain('fetchProductDetails()');
    expect(before(block, 'fetchProductDetails()', 'getAvailablePurchases()')).toBe(true);
  });

  test('reverifyEntitlement fetches products before asking, and gates revocation on a warm cache', () => {
    const i = src.indexOf('const reverifyEntitlement');
    expect(i).toBeGreaterThan(-1);
    // Slice to the revocation itself so the ordering assertion is meaningful
    // rather than dependent on an arbitrary window size.
    const revokeAt = src.indexOf('removeItem(PRO_KEY)', i);
    expect(revokeAt).toBeGreaterThan(i);
    const block = src.slice(i, revokeAt);

    expect(block).toContain('fetchProductDetailsRef.current');
    expect(block).toMatch(/cacheWarm/);
    // A cold cache must bail out before any revocation is reachable.
    expect(block).toMatch(/if \(!cacheWarm\) return;/);
    expect(before(block, 'fetchProductDetailsRef.current', 'getAvailablePurchases()')).toBe(true);
  });

  test('loadProStatus warms the cache too', () => {
    const i = src.indexOf('const loadProStatus');
    const block = src.slice(i, i + 3000);
    expect(block).toContain('fetchProductDetailsRef.current');
  });
});

describe('Android PENDING purchases never grant Pro', () => {
  // Mirrors the helper in useIAP.js. Kept literal so the assertion is about the
  // rule, not about importing the module (which pulls in react-native).
  const isPendingAndroid = (p, isAndroid) =>
    isAndroid && p?.purchaseStateAndroid != null && Number(p.purchaseStateAndroid) === 2;

  test('a pending Android lifetime is excluded', () => {
    expect(isPendingAndroid(androidPendingLifetime, true)).toBe(true);
  });

  test('a purchased Android lifetime is included', () => {
    expect(isPendingAndroid(androidLifetime, true)).toBe(false);
  });

  test('iOS purchases have no such field and are never treated as pending', () => {
    expect(isPendingAndroid(iosMonthly, false)).toBe(false);
    expect(isPendingAndroid(iosMonthly, true)).toBe(false);
  });

  test('all three query paths apply the pending filter', () => {
    const sites = src.match(/!isPendingAndroid\(p\) && entitlingSku\(p, ALL_PRODUCT_IDS\)/g) || [];
    // restore(), reverifyEntitlement(), loadProStatus()
    expect(sites.length).toBe(3);
  });
});

describe('iOS deferred payment is not reported as a failure', () => {
  test('E_DEFERRED_PAYMENT is handled before the failure counter', () => {
    const i = src.indexOf("e?.code === 'E_DEFERRED_PAYMENT'");
    expect(i).toBeGreaterThan(-1);
    // Search forward from the deferred branch: the purchaseErrorListener
    // classifies the same three outcomes with an identical line, and this
    // test is about ordering inside purchase()'s own catch.
    const failedAt = src.indexOf("trackEvent(wasCancelled ? 'purchase_cancelled' : 'purchase_failed')", i);
    expect(failedAt).toBeGreaterThan(-1);
    // Must return before reaching the outage canary.
    expect(i).toBeLessThan(failedAt);
    expect(src.slice(i, failedAt)).toMatch(/trackEvent\('purchase_deferred'\)/);
    expect(src.slice(i, failedAt)).toMatch(/return;/);
  });
});
