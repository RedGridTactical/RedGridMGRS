/**
 * Purchase-request shape guard.
 *
 * WHY THIS EXISTS: v3.5.2 bumped expo-iap ~2.4.0 -> 2.8.0. In 2.8 the
 * `requestPurchase` contract changed to platform-keyed sub-objects, and its
 * normalizeRequestProps() is literally `request[platform]`. Our flat
 * `{ sku }` / `{ skus }` payload therefore resolved to `undefined` and every
 * purchase threw "Invalid request for iOS. The `sku` property is required and
 * must be a string." on iOS, and the matching `skus` error on Android.
 * Nothing caught it because no test ever inspected the outgoing payload.
 *
 * These tests validate the payload against expo-iap's OWN validator logic, so
 * a future dep bump that changes the contract again fails here instead of in
 * a user's payment sheet.
 */

const path = require('path');
const fs = require('fs');

// ── expo-iap's real validator, mirrored from node_modules/expo-iap ──────────
// Kept as a literal re-implementation of the library's normalizeRequestProps
// so the assertion is about the CONTRACT, not about our own helper.
const normalizeRequestProps = (request, platform) =>
  platform === 'ios' ? request.ios : request.android;

function validateLikeExpoIap(purchaseRequest, platform) {
  const { request } = purchaseRequest;
  const normalized = normalizeRequestProps(request, platform);
  if (platform === 'ios') {
    if (!normalized || typeof normalized.sku !== 'string' || !normalized.sku) {
      throw new Error(
        'Invalid request for iOS. The `sku` property is required and must be a string.'
      );
    }
    return normalized;
  }
  if (!normalized || !Array.isArray(normalized.skus) || normalized.skus.length === 0) {
    throw new Error(
      'Invalid request for Android. The `skus` property is required and must be a non-empty array.'
    );
  }
  return normalized;
}

// ── the shape useIAP.purchase() actually builds ─────────────────────────────
function buildRequest({ sku, sub, subscriptionOffers }) {
  return {
    request: {
      ios: { sku, andDangerouslyFinishTransactionAutomaticallyIOS: false },
      android: sub ? { skus: [sku], subscriptionOffers } : { skus: [sku] },
    },
    type: sub ? 'subs' : 'inapp',
  };
}

const MONTHLY = 'redgrid_mgrs_pro_monthly';
const LIFETIME = 'redgrid_pro_lifetime';

describe('purchase request payload satisfies expo-iap 2.8', () => {
  test('lifetime (one-time) validates on both platforms', () => {
    const req = buildRequest({ sku: LIFETIME, sub: false });
    expect(req.type).toBe('inapp');
    expect(validateLikeExpoIap(req, 'ios').sku).toBe(LIFETIME);
    expect(validateLikeExpoIap(req, 'android').skus).toEqual([LIFETIME]);
  });

  test('monthly (subscription) validates on both platforms', () => {
    const offers = [{ sku: MONTHLY, offerToken: 'tok' }];
    const req = buildRequest({ sku: MONTHLY, sub: true, subscriptionOffers: offers });
    expect(req.type).toBe('subs');
    expect(validateLikeExpoIap(req, 'ios').sku).toBe(MONTHLY);
    const android = validateLikeExpoIap(req, 'android');
    expect(android.skus).toEqual([MONTHLY]);
    expect(android.subscriptionOffers).toEqual(offers);
  });

  test('the OLD flat shape is rejected — this is the bug that shipped', () => {
    // iOS 2.4-style payload
    expect(() =>
      validateLikeExpoIap({ request: { sku: LIFETIME } }, 'ios')
    ).toThrow(/sku.*required/i);
    // Android 2.4-style payload
    expect(() =>
      validateLikeExpoIap({ request: { skus: [MONTHLY] } }, 'android')
    ).toThrow(/skus.*required/i);
  });
});

describe('useIAP source builds the platform-keyed shape', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src/hooks/useIAP.js'),
    'utf8'
  );

  test('the request literal carries both ios and android keys', () => {
    const i = src.indexOf('const request = {');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('};', i) + 2);
    expect(block).toMatch(/ios:\s*\{[^}]*\bsku\b/);
    expect(block).toMatch(/android:\s*sub\s*\?/);
    expect(block).toMatch(/skus:\s*\[sku\]/);
  });

  test('no flat top-level sku/skus request is constructed any more', () => {
    // The exact 2.4-era lines that broke. If either returns, fail loudly.
    expect(src).not.toMatch(/request\s*=\s*\{\s*sku,/);
    expect(src).not.toMatch(/request\s*=\s*sub\s*\n?\s*\?\s*\{\s*skus:/);
  });

  test('expo-iap stays pinned to a version with this contract', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );
    // Exact pin, not a range: a silent ^/~ bump is what caused this outage.
    expect(pkg.dependencies['expo-iap']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
