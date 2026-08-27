/**
 * Purchase DELIVERY guards (4.0.3).
 *
 * Two defects fixed here are invisible to any purchase you make by hand, which
 * is exactly why both survived so long:
 *
 *  1. iOS listener deafness. initConnection tears down StoreKit's
 *     Transaction.updates observer and only the 0->1 JS listener transition
 *     re-arms it. Subscribing before connecting created the observer and then
 *     killed it for the process lifetime. Buying in-app still worked, because
 *     requestPurchase emits its own event — so testing looked clean while
 *     Ask-to-Buy, offer codes and cross-device purchases were dropped.
 *
 *  2. Android acknowledgement. finishTransaction IS the acknowledgement, and
 *     Play auto-refunds anything unacknowledged after 72 h. A purchase that
 *     settled while the app was closed arrived only via getAvailablePurchases,
 *     which unlocked Pro and never acknowledged.
 *
 * Neither can be reproduced in jest, so the pure predicate is unit-tested and
 * the CALLER is pinned against the source. Pure-function tests alone did not
 * catch the `p.id || p.productId` regression; source pins did.
 */
const fs = require('fs');
const path = require('path');
const { needsAndroidAck } = require('../src/utils/iapOffers');

const LIFETIME = 'redgrid_pro_lifetime';
const MONTHLY = 'redgrid_mgrs_pro_monthly';
const ANNUAL = 'redgrid_mgrs_pro_annual';
const ALL = [LIFETIME, MONTHLY, ANNUAL];

const src = fs.readFileSync(path.join(__dirname, '..', 'src/hooks/useIAP.js'), 'utf8');
const offersSrc = fs.readFileSync(path.join(__dirname, '..', 'src/utils/iapOffers.js'), 'utf8');

const owned = (over = {}) => ({
  id: 'GPA.3341-2214-9976-51234',
  productId: LIFETIME,
  ids: [LIFETIME],
  purchaseStateAndroid: 1,
  purchaseToken: 'tok_abc123',
  ...over,
});

describe('needsAndroidAck decides what still has to be acknowledged', () => {
  test('an owned, unacknowledged purchase needs acknowledging', () => {
    expect(needsAndroidAck(owned({ isAcknowledgedAndroid: false }), ALL)).toBe(true);
  });

  test('an already-acknowledged purchase is skipped', () => {
    expect(needsAndroidAck(owned({ isAcknowledgedAndroid: true }), ALL)).toBe(false);
  });

  test('a missing acknowledgement flag retries rather than assumes done', () => {
    // Acknowledging twice is idempotent; missing it once costs the sale.
    const p = owned();
    delete p.isAcknowledgedAndroid;
    expect(needsAndroidAck(p, ALL)).toBe(true);
  });

  test('PENDING is never acknowledged — payment has not completed', () => {
    expect(needsAndroidAck(owned({ purchaseStateAndroid: 2 }), ALL)).toBe(false);
  });

  test('a purchase with no token cannot be acknowledged', () => {
    const p = owned();
    delete p.purchaseToken;
    expect(needsAndroidAck(p, ALL)).toBe(false);
  });

  test('the purchaseTokenAndroid alias is accepted', () => {
    const p = owned();
    delete p.purchaseToken;
    p.purchaseTokenAndroid = 'tok_xyz';
    expect(needsAndroidAck(p, ALL)).toBe(true);
  });

  test('a SKU we do not sell is not ours to acknowledge', () => {
    expect(needsAndroidAck(owned({ productId: 'com.someone.else', ids: [] }), ALL)).toBe(false);
  });

  test('the Play order id alone never qualifies a purchase', () => {
    // purchase.id is the GPA order id, not a SKU.
    expect(needsAndroidAck({ id: 'GPA.3341-2214-9976-51234', purchaseToken: 't' }, ALL)).toBe(false);
  });

  test('subscriptions are acknowledged too, not just lifetime', () => {
    expect(needsAndroidAck(owned({ productId: MONTHLY, ids: [MONTHLY] }), ALL)).toBe(true);
    expect(needsAndroidAck(owned({ productId: ANNUAL, ids: [ANNUAL] }), ALL)).toBe(true);
  });

  test('junk input is refused rather than thrown on', () => {
    expect(needsAndroidAck(null, ALL)).toBe(false);
    expect(needsAndroidAck(undefined, ALL)).toBe(false);
    expect(needsAndroidAck({}, ALL)).toBe(false);
  });

  test('reads the acknowledgement fields the library actually returns', () => {
    expect(offersSrc).toMatch(/isAcknowledgedAndroid/);
    expect(offersSrc).toMatch(/purchaseTokenAndroid/);
  });
});

describe('the purchase listener is armed only AFTER initConnection', () => {
  test('the listener effect is gated on iapReady', () => {
    const gate = src.indexOf('if (!iapReady) return;');
    const listener = src.indexOf('purchaseUpdatedListener !== ');
    expect(gate).toBeGreaterThan(-1);
    expect(listener).toBeGreaterThan(-1);
    // The gate must be the first thing in that same effect.
    expect(gate).toBeLessThan(listener);
    expect(listener - gate).toBeLessThan(200);
  });

  test('iapReady is a dependency, so the effect re-runs once ready', () => {
    expect(src).toMatch(/\}, \[persistPro, iapReady\]\);/);
  });

  test('iapReady is never flipped before a connection has been attempted', () => {
    const firstInit = src.indexOf('initConnection');
    const firstFlip = src.indexOf('setIapReady(true)');
    expect(firstFlip).toBeGreaterThan(firstInit);
  });

  test('a failed connect still arms the listener (Android must not lose delivery)', () => {
    // The flip lives after the try/catch, not inside the success branch.
    const effect = src.slice(src.indexOf('Connect BEFORE subscribing'));
    const body = effect.slice(0, effect.indexOf('}, []);'));
    expect(body).toMatch(/catch\s*\{[^}]*\}/);
    expect(body.indexOf('setIapReady(true)')).toBeGreaterThan(body.indexOf('catch'));
  });
});

describe('every store entitlement query also acknowledges', () => {
  test('every site that reads purchases also acknowledges them', () => {
    // Deliberately a ratio, not a magic number: adding a new
    // getAvailablePurchases call without an ackAndroid beside it fails here.
    // That is not hypothetical — this test caught the trial-eligibility path,
    // which was missed on the first pass at this fix.
    const consumers = (src.match(/getAvailablePurchases\(\)/g) || []).length;
    const acks = (src.match(/\n\s*ackAndroid\(/g) || []).length;
    expect(consumers).toBeGreaterThanOrEqual(3);
    expect(acks).toBe(consumers);
  });

  test('acknowledgement is not skipped when the screen unmounted', () => {
    // An unacknowledged purchase is refunded whether or not the hook is alive,
    // so ackAndroid must precede the cancelled/mounted early return.
    const i = src.indexOf('ackAndroid(result);');
    const j = src.indexOf('if (cancelled || !mounted.current) return;', i - 400);
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });
});
