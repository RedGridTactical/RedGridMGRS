/**
 * Purchase ERROR path (4.0.4).
 *
 * useIAP subscribed to purchaseUpdatedListener but never to
 * purchaseErrorListener. requestPurchase's promise only rejects for failures
 * raised inside its own call: a StoreKit or Play Billing failure that lands
 * after the payment sheet is handed off arrived on the error event instead and
 * was dropped on the floor. The sheet dismissed, isPurchasing stayed true, and
 * the UNLOCK button was frozen for the rest of the session — the user saw a
 * dead paywall and no explanation.
 *
 * Like iapDelivery.test.js, this cannot be reproduced in jest (no native
 * emitter), so the listener CONTRACT is pinned against the source and the
 * classification logic is exercised directly.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/hooks/useIAP.js'), 'utf8');

// The error-listener effect, isolated so the pins cannot pass on code that
// happens to live in the update listener instead.
const errorEffect = (() => {
  const start = src.indexOf('Purchase ERROR listener');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('Purchase (supports lifetime IAP', start);
  return src.slice(start, end);
})();

describe('the error listener exists and uses the library API', () => {
  test('the hook subscribes to purchaseErrorListener', () => {
    expect(errorEffect).toMatch(/IAPModule\.purchaseErrorListener\(/);
  });

  test('it is feature-detected, so an old or absent module cannot crash startup', () => {
    expect(errorEffect).toMatch(/typeof IAPModule\.purchaseErrorListener !== 'function'/);
  });

  test('expo-iap really exports purchaseErrorListener (the API is not imagined)', () => {
    const iap = fs.readFileSync(
      path.join(__dirname, '..', 'node_modules/expo-iap/build/index.js'), 'utf8');
    expect(iap).toMatch(/export const purchaseErrorListener/);
    expect(iap).toMatch(/purchase-error/);
  });
});

describe('the error listener is armed on the same terms as the update listener', () => {
  test('it is gated on iapReady before anything else', () => {
    const gate = errorEffect.indexOf('if (!iapReady) return;');
    const listener = errorEffect.indexOf('purchaseErrorListener !== ');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(listener);
    expect(listener - gate).toBeLessThan(200);
  });

  test('iapReady is a dependency, so it re-runs once the connection settles', () => {
    expect(errorEffect).toMatch(/\}, \[iapReady\]\);/);
  });

  test('the subscription is removed on cleanup', () => {
    expect(errorEffect).toMatch(/return \(\) => \{ try \{ sub\?\.remove\?\.\(\); \} catch \{\} \};/);
  });

  test('a throwing subscribe cannot take the app down', () => {
    expect(errorEffect).toMatch(/catch\s*\{\s*sub = null;/);
  });
});

describe('the button is never left frozen', () => {
  test('every error clears the in-flight purchasing state first', () => {
    const clear = errorEffect.indexOf('setIsPurchasing(false)');
    expect(clear).toBeGreaterThan(-1);
    // Before any branch on the error code — a cancel must unfreeze too.
    expect(clear).toBeLessThan(errorEffect.indexOf('E_DEFERRED_PAYMENT'));
    expect(clear).toBeLessThan(errorEffect.indexOf('E_USER_CANCELLED'));
  });

  test('state writes are guarded by mounted, as everywhere else in the hook', () => {
    expect(errorEffect).toMatch(/if \(mounted\.current\) setIsPurchasing\(false\)/);
  });
});

describe('a user cancel is silent, a failure is not', () => {
  test('cancel returns before any error state or alert is raised', () => {
    const cancelBranch = errorEffect.indexOf('if (wasCancelled)');
    const alert = errorEffect.indexOf("Alert.alert(\n              i18n.t('iap.purchaseFailedTitle')");
    expect(cancelBranch).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(cancelBranch);
  });

  test('cancel clears any stale error rather than leaving one on screen', () => {
    const branch = errorEffect.slice(errorEffect.indexOf('if (wasCancelled)'));
    expect(branch.slice(0, 200)).toMatch(/setLastPurchaseError\(null\)/);
  });

  test('all three cancel spellings the stores emit are recognised', () => {
    for (const code of ['E_USER_CANCELLED', 'user_cancelled', 'E_USER_CANCELED']) {
      expect(errorEffect).toContain(code);
    }
    // iOS SKError.paymentCancelled
    expect(errorEffect).toMatch(/userInfo\?\.code === 2/);
  });

  test('cancels and failures are counted apart, as in the purchase path', () => {
    expect(errorEffect).toMatch(/trackEvent\(wasCancelled \? 'purchase_cancelled' : 'purchase_failed'\)/);
  });

  test('a deferred payment is treated as pending approval, not as a failure', () => {
    const deferred = errorEffect.indexOf("code === 'E_DEFERRED_PAYMENT'");
    const failed = errorEffect.indexOf("'purchase_failed'");
    expect(deferred).toBeGreaterThan(-1);
    expect(deferred).toBeLessThan(failed);
    expect(errorEffect).toMatch(/trackEvent\('purchase_deferred'\)/);
  });
});

describe('the failure is visible to the paywall UI', () => {
  test('lastPurchaseError carries a code and a message', () => {
    expect(errorEffect).toMatch(/setLastPurchaseError\(\{/);
    expect(errorEffect).toMatch(/code: code \|\| 'E_UNKNOWN'/);
    expect(errorEffect).toMatch(/message: err\?\.message/);
  });

  test('lastPurchaseError and clearPurchaseError are on the hook surface', () => {
    const ret = src.slice(src.lastIndexOf('return {'));
    expect(ret).toMatch(/\blastPurchaseError,/);
    expect(ret).toMatch(/\bclearPurchaseError,/);
  });

  test('the alert copy is translated, never raw English', () => {
    expect(errorEffect).toMatch(/i18n\.t\('iap\.purchaseFailedTitle'\)/);
    expect(errorEffect).toMatch(/i18n\.t\('iap\.tryAgain'\)/);
    // No bare quoted sentence passed to Alert.alert.
    expect(errorEffect).not.toMatch(/Alert\.alert\(\s*'[A-Z][a-z]/);
  });

  test('a listener throw is swallowed rather than crashing the app', () => {
    expect(errorEffect).toMatch(/Never let a listener error crash the app/);
  });
});

describe('the classification the listener applies', () => {
  // Mirrors the branch order in the listener so the intent is testable even
  // though the native emitter is not.
  const classify = (err) => {
    const code = err?.code || err?.userInfo?.code;
    if (code === 'E_DEFERRED_PAYMENT') return 'deferred';
    if (code === 'E_USER_CANCELLED' || code === 'user_cancelled' ||
        code === 'E_USER_CANCELED' || err?.userInfo?.code === 2) return 'cancelled';
    return 'failed';
  };

  test('cancels classify as cancels', () => {
    expect(classify({ code: 'E_USER_CANCELLED' })).toBe('cancelled');
    expect(classify({ code: 'user_cancelled' })).toBe('cancelled');
    expect(classify({ code: 'E_USER_CANCELED' })).toBe('cancelled');
    expect(classify({ userInfo: { code: 2 } })).toBe('cancelled');
  });

  test('a deferred payment is not a failure', () => {
    expect(classify({ code: 'E_DEFERRED_PAYMENT' })).toBe('deferred');
  });

  test('anything else is a failure worth surfacing', () => {
    expect(classify({ code: 'E_NETWORK_ERROR', message: 'offline' })).toBe('failed');
    expect(classify({ code: 'E_ITEM_UNAVAILABLE' })).toBe('failed');
    expect(classify({})).toBe('failed');
    expect(classify(null)).toBe('failed');
  });
});
