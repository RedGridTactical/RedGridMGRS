/**
 * useIAP — Crash-safe IAP hook (HARDENED for iOS beta + Android Play Billing).
 * Returns: { isPro, isPurchasing, product, products, selectedTier, setSelectedTier,
 *            trialEligible, purchase, restore, lastPurchaseError, clearPurchaseError }
 *
 * Android-specific notes:
 *   - expo-iap's getProducts() only caches `inapp` SKUs in Play Billing's
 *     ProductDetails cache. Subscriptions must be fetched via getSubscriptions()
 *     before requestPurchase, otherwise Play Billing throws:
 *       IllegalArgumentException: Details of the products must be provided.
 *   - requestPurchase payload shape differs by platform:
 *       iOS:     { request: { sku, andDangerouslyFinishTransactionAutomaticallyIOS } }
 *       Android: { request: { skus: [sku], subscriptionOffers? } }
 *   - Subscriptions on Android additionally require the offerToken from the
 *     base plan in subscriptionOfferDetails[].
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  detectFreeTrial, hasPriorSubscription, getAndroidTrialOfferToken, entitlingSku,
  needsAndroidAck,
  PRO_PRODUCT_ID, SUB_MONTHLY_ID, SUB_ANNUAL_ID, tierToSku, isSubTier,
} from '../utils/iapOffers';

// Re-exported for existing consumers of this module's public surface.
export { PRO_PRODUCT_ID };
import i18n from '../i18n';
// On-device counters only (AsyncStorage, zero network). These exist so a
// checkout outage is VISIBLE next time: the 2.8 request-shape break failed
// 100% of purchases for a month and left no trace anywhere, because a failed
// purchase only ever raised an Alert. attempt climbing while success stays
// flat is the signal that was missing.
import { trackEvent } from '../utils/analytics';

const PRO_KEY         = 'rg_pro_unlocked';
const PRO_RECEIPT_KEY = 'rg_pro_receipt';
const PRO_VALIDATED   = 'rg_pro_validated_v2';
// Which SKU unlocked Pro ('unknown' for legacy installs that predate this key).
const PRO_PRODUCT_KEY = 'rg_pro_product_v1';
// Epoch-ms of the last time the store POSITIVELY confirmed the entitlement.
const PRO_VERIFIED_AT = 'rg_pro_verified_at_v1';
// A subscription unlock survives this long past its last positive store
// confirmation before a confirmed-absent entitlement re-locks Pro. Generous
// on purpose: this is a field app — never punish a user for being off-grid,
// and never let one transient empty store response revoke a paying customer.
const SUB_REVERIFY_GRACE_MS = 21 * 24 * 60 * 60 * 1000;
const INAPP_IDS = [PRO_PRODUCT_ID];
// What the paywall offers FOR SALE. Annual was retired 2026-08-01.
const SUB_IDS = [SUB_MONTHLY_ID];
// What we must RESOLVE from the store. This is NOT the sale list.
//
// On iOS, expo-iap filters StoreKit entitlements through a native product
// cache (ExpoIapModule.swift: `if productStore.getProduct(productID:) != nil`),
// and getProducts/getSubscriptions are that cache's only writers. A SKU we
// never fetch is therefore INVISIBLE to getAvailablePurchases forever — so an
// active annual subscriber reads as "no entitlement", RESTORE says nothing to
// restore, and reverify eventually revokes Pro. Fetching a SKU does not put it
// on sale; the paywall reads SUB_IDS.
const SUB_FETCH_IDS = [SUB_MONTHLY_ID, SUB_ANNUAL_ID];
// What grants/validates ENTITLEMENT. Derived from the sale list so a future
// SKU added to SUB_IDS automatically entitles — plus the retired annual, which
// existing subscribers keep renewing and must always be recognised.
const ALL_PRODUCT_IDS = [...INAPP_IDS, ...SUB_IDS, SUB_ANNUAL_ID];

const isAndroid = Platform.OS === 'android';

// Android PENDING (purchaseState 2) means the payment has NOT completed, e.g.
// cash or delayed-card flows. The purchase path already refuses to unlock on
// it; the restore/entitlement paths must refuse too, or abandoning a payment
// grants Pro permanently.
const isPendingAndroid = (p) =>
  isAndroid && p?.purchaseStateAndroid != null && Number(p.purchaseStateAndroid) === 2;

// Safely require expo-iap — handles unavailability on iOS beta
let IAPModule = null;
try {
  const mod = require('expo-iap');
  if (mod &&
      typeof mod.getProducts === 'function' &&
      typeof mod.requestPurchase === 'function' &&
      typeof mod.getAvailablePurchases === 'function') {
    IAPModule = mod;
  }
} catch (e) {
  IAPModule = null;
}

// Pick the first usable offerToken from a fetched Android subscription product.
// Returns null if no offer details are present (e.g. iOS shape or empty array).
const getAndroidOfferToken = (subProduct) => {
  const details = subProduct?.subscriptionOfferDetails;
  if (!Array.isArray(details) || details.length === 0) return null;
  // Prefer base plan with no offerId (the recurring base plan) when present.
  const base = details.find((d) => d && !d.offerId && typeof d.offerToken === 'string');
  if (base?.offerToken) return base.offerToken;
  const first = details.find((d) => d && typeof d.offerToken === 'string');
  return first?.offerToken || null;
};

// ── Android acknowledgement retry ───────────────────────────────────────────
// finishTransaction IS the acknowledgement on Android, and Play auto-refunds
// anything left unacknowledged for 72 h. It was only ever called downstream of
// a live requestPurchase, so a purchase that settled while the app was closed
// reached us through getAvailablePurchases alone: Pro unlocked, never
// acknowledged, silently refunded three days later. Retry for every owned
// purchase the store still reports as unacknowledged. Module-level so the
// mount effects can call it without declaration-order games; never throws.
async function ackAndroid(purchases) {
  if (!isAndroid || !IAPModule?.finishTransaction) return;
  const list = Array.isArray(purchases) ? purchases : [];
  for (const p of list) {
    if (!needsAndroidAck(p, ALL_PRODUCT_IDS)) continue;
    try {
      await IAPModule.finishTransaction({ purchase: p, isConsumable: false });
    } catch {
      // Acknowledgement is idempotent; the next launch retries.
    }
  }
}

export function useIAP() {
  const [isPro,        setIsPro]        = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);
  // Last purchase failure surfaced by the error listener, for the paywall UI.
  // null whenever the last outcome was a success, a cancel, or a deferral.
  const [lastPurchaseError, setLastPurchaseError] = useState(null);
  const [product,      setProduct]      = useState(null);      // lifetime (legacy)
  const [products,     setProducts]     = useState({});         // { lifetime, monthly }
  // Default selection = lifetime (2026-08-15). Cohort data: month-3 retention
  // is 11.11% on monthly vs 100% on annual, so a monthly subscriber is worth
  // ~2-3 months x $3.99 (~$10 LTV) against $49.99 banked once for lifetime.
  // Pre-selecting monthly pointed every buyer at the worst-LTV tier. Must stay
  // a SELLABLE tier — never 'annual', which is retired from the paywall.
  const [selectedTier, setSelectedTier] = useState('lifetime');
  const [trialEligible, setTrialEligible] = useState(false);    // annual free-trial intro offer eligibility
  // Gates the purchase-event listener until initConnection has run. See the
  // effect below — subscribing before connecting leaves the listener deaf.
  const [iapReady, setIapReady] = useState(false);
  const mounted = useRef(true);

  // Track in-flight + completed product detail fetches so we never call
  // requestPurchase before Play Billing has the ProductDetails cached.
  const fetchPromiseRef = useRef(null);
  const initConnectedRef = useRef(false);
  // Always points at the current fetchProductDetails. The entitlement effect
  // below is declared before that callback exists, and must be able to warm
  // the native product cache before querying the store.
  const fetchProductDetailsRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  // ── Load persisted Pro status, then re-verify subscription entitlements ────
  // Fast path: trust the local flag immediately (instant Pro UI, works
  // offline). Then, for SUBSCRIPTION unlocks only, re-check the store in the
  // background so a cancelled/expired sub eventually re-locks. A positive
  // store check refreshes PRO_VERIFIED_AT; only when the store POSITIVELY
  // reports no entitlement for longer than the grace window is Pro revoked.
  // Lifetime and legacy/'unknown' unlocks are never auto-revoked.
  useEffect(() => {
    let cancelled = false;

    const reverifyEntitlement = async (recordedProduct) => {
      if (!IAPModule?.getAvailablePurchases) return;
      try {
        // MUST warm the native product cache before querying entitlements: on
        // iOS an unfetched SKU is invisible to getAvailablePurchases, so
        // querying first makes every subscriber look unentitled. fetchProduct-
        // Details also does initConnection and is deduped, so it replaces
        // ensureConnection here rather than adding a second connect.
        const cache = await fetchProductDetailsRef.current?.().catch(() => null);
        const cacheWarm = !!(cache && (cache.lifetime || cache.monthly));
        let purchasesTimer;
        const result = await Promise.race([
          IAPModule.getAvailablePurchases(),
          new Promise((_, r) => { purchasesTimer = setTimeout(() => r(new Error('timeout')), 5000); }),
        ]).finally(() => { if (purchasesTimer) clearTimeout(purchasesTimer); });

        if (!Array.isArray(result)) return; // ambiguous response — keep Pro
        // Acknowledge before any early return below, and regardless of mount
        // state: an unacknowledged purchase is refunded whether or not this
        // screen is still alive.
        ackAndroid(result);
        if (cancelled || !mounted.current) return;

        const owned = result.filter(
          (p) => !isPendingAndroid(p) && entitlingSku(p, ALL_PRODUCT_IDS)
        );

        if (owned.length > 0) {
          // Entitlement confirmed — refresh the verification clock and refine
          // the recorded product (prefer lifetime: the strongest claim).
          const lifetimeOwned = owned.find(
            (p) => entitlingSku(p, ALL_PRODUCT_IDS) === PRO_PRODUCT_ID
          );
          const best = lifetimeOwned || owned[0];
          const bestSku =
            entitlingSku(best, ALL_PRODUCT_IDS) || recordedProduct || 'unknown';
          await AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {});
          await AsyncStorage.setItem(PRO_PRODUCT_KEY, String(bestSku)).catch(() => {});
          return;
        }

        // An empty result from a COLD cache is not evidence of no entitlement,
        // it is evidence we never asked properly. Only a warm cache can make
        // "no entitlement" trustworthy enough to revoke on.
        if (!cacheWarm) return;

        // Store positively reports no active entitlement.
        if (recordedProduct !== SUB_MONTHLY_ID && recordedProduct !== SUB_ANNUAL_ID) {
          return; // lifetime / legacy 'unknown' — never auto-revoke
        }

        const verifiedAtRaw = await AsyncStorage.getItem(PRO_VERIFIED_AT).catch(() => null);
        const verifiedAt = Number(verifiedAtRaw) || 0;
        if (!verifiedAt) {
          // First negative observation with no clock — start the grace clock
          // instead of revoking, protecting against a transient empty result.
          await AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {});
          return;
        }
        if (Date.now() - verifiedAt > SUB_REVERIFY_GRACE_MS) {
          // Lapsed beyond the grace window — re-lock. A false negative is
          // recoverable instantly via RESTORE on the paywall.
          if (mounted.current && !cancelled) setIsPro(false);
          await AsyncStorage.removeItem(PRO_KEY).catch(() => {});
          await AsyncStorage.removeItem(PRO_RECEIPT_KEY).catch(() => {});
          await AsyncStorage.removeItem(PRO_PRODUCT_KEY).catch(() => {});
          await AsyncStorage.removeItem(PRO_VERIFIED_AT).catch(() => {});
        }
      } catch {
        // Store unreachable (offline / outage) — keep Pro. Field-first app:
        // never punish a user for being off-grid.
      }
    };

    const loadProStatus = async () => {
      try {
        if (!AsyncStorage) return;

        const [proFlag, receipt, validated, recordedProduct] = await Promise.all([
          AsyncStorage.getItem(PRO_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_RECEIPT_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_VALIDATED).catch(() => null),
          AsyncStorage.getItem(PRO_PRODUCT_KEY).catch(() => null),
        ]);

        if (validated === 'true') {
          if (proFlag === 'true') {
            if (!cancelled && mounted.current) setIsPro(true);
            // Background re-verification keeps subscription unlocks honest.
            if (IAPModule) reverifyEntitlement(recordedProduct);
          }
          return;
        }

        if (proFlag !== 'true') {
          await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
          return;
        }

        if (receipt) {
          if (!cancelled && mounted.current) setIsPro(true);
          await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
          if (!recordedProduct) await AsyncStorage.setItem(PRO_PRODUCT_KEY, 'unknown').catch(() => {});
          return;
        }

        if (IAPModule && IAPModule.getAvailablePurchases) {
          try {
            // Warm the native product cache first — see reverifyEntitlement.
            await fetchProductDetailsRef.current?.().catch(() => {});

            let purchasesTimer;
            const purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((_, r) => { purchasesTimer = setTimeout(() => r(new Error('timeout')), 5000); })
            ]).finally(() => { if (purchasesTimer) clearTimeout(purchasesTimer); });

            ackAndroid(purchases);

            const ownedPro = (Array.isArray(purchases) ? purchases : []).filter(
              (p) => !isPendingAndroid(p) && entitlingSku(p, ALL_PRODUCT_IDS)
            );

            if (ownedPro.length > 0) {
              if (!cancelled && mounted.current) setIsPro(true);
              const lifetimeOwned = ownedPro.find(
                (p) => entitlingSku(p, ALL_PRODUCT_IDS) === PRO_PRODUCT_ID
              );
              const best = lifetimeOwned || ownedPro[0];
              await AsyncStorage.setItem(PRO_RECEIPT_KEY, 'verified').catch(() => {});
              await AsyncStorage.setItem(PRO_PRODUCT_KEY, String(entitlingSku(best, ALL_PRODUCT_IDS) || 'unknown')).catch(() => {});
              await AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {});
            } else {
              if (!cancelled && mounted.current) setIsPro(false);
              await AsyncStorage.removeItem(PRO_KEY).catch(() => {});
            }
          } catch {
            if (!cancelled && mounted.current) setIsPro(true);
          }
        } else {
          if (!cancelled && mounted.current) setIsPro(true);
        }

        await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
      } catch {
        // Total failure — stay free, don't crash
      }
    };

    loadProStatus();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch product + subscription details (cache-aware, dedup'd) ───────────
  // Returns a snapshot { lifetime, monthly } so callers can decide
  // whether the SKU they're about to buy has details ready.
  const fetchProductDetails = useCallback(async () => {
    if (!IAPModule) return {};

    if (fetchPromiseRef.current) {
      try { return await fetchPromiseRef.current; }
      catch { /* fall through and retry below */ }
    }

    const run = (async () => {
      try {
        if (IAPModule.initConnection && !initConnectedRef.current) {
          let initTimer;
          await Promise.race([
            IAPModule.initConnection(),
            new Promise((_, reject) => {
              initTimer = setTimeout(() => reject(new Error('Init timeout')), 4000);
            })
          ]).finally(() => { if (initTimer) clearTimeout(initTimer); });
          initConnectedRef.current = true;
          if (mounted.current) setIapReady(true);
        }

        const tasks = [];
        if (IAPModule.getProducts) {
          tasks.push(
            Promise.race([
              IAPModule.getProducts(INAPP_IDS),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('inapp fetch timeout')), 6000)
              )
            ]).catch(() => [])
          );
        } else {
          tasks.push(Promise.resolve([]));
        }

        if (IAPModule.getSubscriptions) {
          tasks.push(
            Promise.race([
              IAPModule.getSubscriptions(SUB_FETCH_IDS),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('subs fetch timeout')), 6000)
              )
            ]).catch(() => [])
          );
        } else {
          // Older expo-iap fallback: try getProducts for subs (iOS-friendly path).
          tasks.push(
            Promise.race([
              IAPModule.getProducts(SUB_FETCH_IDS),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('subs fetch timeout')), 6000)
              )
            ]).catch(() => [])
          );
        }

        const [inappList, subList] = await Promise.all(tasks);

        const map = {};
        for (const p of (inappList || [])) {
          if (p?.id === PRO_PRODUCT_ID) { map.lifetime = p; }
        }
        for (const p of (subList || [])) {
          if (p?.id === SUB_MONTHLY_ID) map.monthly = p;
        }

        if (mounted.current) {
          if (map.lifetime) setProduct(map.lifetime);
          if (map.lifetime || map.monthly) {
            setProducts((prev) => ({ ...prev, ...map }));
          }
        }
        return map;
      } catch {
        return {};
      }
    })();

    fetchPromiseRef.current = run;
    try {
      return await run;
    } finally {
      // Allow retries on next call by clearing the cached promise once it settles.
      fetchPromiseRef.current = null;
    }
  }, []);

  // Publish for the entitlement effect, which is declared above this callback.
  fetchProductDetailsRef.current = fetchProductDetails;

  // Kick off the initial fetch with a small delay so the native bridge settles.
  useEffect(() => {
    if (!IAPModule) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) fetchProductDetails().catch(() => {});
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [fetchProductDetails]);

  // ── Free-trial (introductory offer) eligibility for the annual sub ─────────
  // Eligible = the annual product advertises a free trial AND the user has no
  // prior subscription purchase in the group (intro offers are per-group).
  // Drives the ProGate "Start free trial" CTA; falls back to the standard
  // paywall when the offer is unavailable or the user is ineligible. Read-only —
  // no purchase side effects.
  useEffect(() => {
    if (!IAPModule) return;
    let cancelled = false;
    (async () => {
      try {
        // Trial follows store config: eligible only if the monthly sub
        // currently advertises a free-trial intro offer. (Self-serve store
        // trials were removed 2026-07-25; annual is retired and never fetched,
        // so this stays false unless an offer is re-created on monthly.)
        const hasTrial = detectFreeTrial(products.monthly).hasTrial;
        if (!hasTrial) {
          if (!cancelled && mounted.current) setTrialEligible(false);
          return;
        }
        let purchases = [];
        try {
          if (IAPModule.initConnection && !initConnectedRef.current) {
            await IAPModule.initConnection().catch(() => {});
            initConnectedRef.current = true;
            if (mounted.current) setIapReady(true);
          }
          // Eligibility must consider EXPIRED subscriptions too —
          // getAvailablePurchases returns only ACTIVE items, which would show
          // a lapsed subscriber "no charge today" and then bill them the full
          // $29.99 at the sheet. getPurchaseHistory includes inactive items.
          if (IAPModule.getPurchaseHistory) {
            purchases = await Promise.race([
              IAPModule.getPurchaseHistory({ onlyIncludeActiveItems: false }),
              new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
            ]) || [];
          } else if (IAPModule.getAvailablePurchases) {
            purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
            ]) || [];
          }
        } catch { purchases = []; }
        // Eligibility is not why we're here, but any unacknowledged purchase we
        // happen to see is one more chance to beat Play's 72 h refund clock.
        ackAndroid(purchases);
        if (!cancelled && mounted.current) setTrialEligible(!hasPriorSubscription(purchases));
      } catch {
        if (!cancelled && mounted.current) setTrialEligible(false);
      }
    })();
    return () => { cancelled = true; };
  }, [products.monthly]);

  // ── Persist Pro unlock ─────────────────────────────────────────────────────
  // Records WHICH product unlocked Pro (drives subscription re-verification)
  // and stamps the verification clock.
  const persistPro = useCallback(async (receipt = '', productSku = '') => {
    if (mounted.current) setIsPro(true);

    try {
      if (!AsyncStorage) return;

      const ops = [];
      ops.push(AsyncStorage.setItem(PRO_KEY, 'true').catch(() => {}));
      ops.push(AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {}));
      ops.push(AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {}));
      if (productSku) {
        ops.push(AsyncStorage.setItem(PRO_PRODUCT_KEY, String(productSku)).catch(() => {}));
      }
      if (receipt) {
        ops.push(AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt).catch(() => {}));
      }
      await Promise.all(ops);
    } catch {
      // Storage failed — isPro is still true in memory for this session
    }
  }, []);

  // ── Connect BEFORE subscribing to purchase events ─────────────────────────
  // initConnection tears down StoreKit's Transaction.updates observer
  // (cleanupExistingState) and only OnStartObserving re-arms it — which fires
  // solely on the 0->1 JS listener transition. Registering the listener at
  // mount, ~500 ms before the connection lands, therefore created the observer
  // and then killed it for the entire process lifetime. In-app buys still
  // worked because requestPurchase emits its own event, which is precisely why
  // this read as healthy in testing while Ask-to-Buy approvals, offer-code
  // redemptions, and cross-device or crash-interrupted purchases were dropped.
  //
  // Flip this AFTER the connect attempt settles, success or failure: ordering
  // is what matters, and on Android delivery does not depend on this connect
  // having succeeded, so a failed attempt must not cost us the listener.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (IAPModule && typeof IAPModule.initConnection === 'function' && !initConnectedRef.current) {
        let initTimer;
        try {
          await Promise.race([
            IAPModule.initConnection(),
            new Promise((_, r) => { initTimer = setTimeout(() => r(new Error('timeout')), 3000); }),
          ]);
          initConnectedRef.current = true;
        } catch {
          // Degrade gracefully; subscribe anyway.
        } finally {
          if (initTimer) clearTimeout(initTimer);
        }
      }
      if (!cancelled && mounted.current) setIapReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Purchase event listener ────────────────────────────────────────────────
  // requestPurchase's promise can miss deliveries: payment sheets that outlive
  // the timeout, Ask-to-Buy approvals, promo-code redemptions, and purchases
  // interrupted by a crash all arrive via this event instead (StoreKit also
  // re-emits unfinished transactions on launch). Persist + finish here so a
  // paying user is never left locked out.
  useEffect(() => {
    // Must not subscribe before initConnection has run — see above.
    if (!iapReady) return;
    if (!IAPModule || typeof IAPModule.purchaseUpdatedListener !== 'function') return;
    let sub = null;
    try {
      sub = IAPModule.purchaseUpdatedListener(async (p) => {
        try {
          if (!p) return;
          const resolvedSku = entitlingSku(p, ALL_PRODUCT_IDS);
          if (!resolvedSku) return;
          // Android PENDING (purchaseState 2): payment not completed yet
          // (cash/slow methods). Don't unlock — Play re-delivers the event
          // once payment actually completes.
          if (isAndroid && p.purchaseStateAndroid != null && Number(p.purchaseStateAndroid) === 2) return;
          const receiptToken = p.transactionReceipt || p.transactionId ||
            p.purchaseToken || p.purchaseTokenAndroid || 'verified';
          await persistPro(receiptToken, resolvedSku);
          try {
            if (IAPModule.finishTransaction) {
              await IAPModule.finishTransaction({ purchase: p, isConsumable: false });
            }
          } catch {
            // finishTransaction failed — purchase is still recorded locally;
            // StoreKit will re-deliver and we'll finish it next time.
          }
        } catch {
          // Never let a listener error crash the app.
        }
      });
    } catch {
      sub = null;
    }
    return () => { try { sub?.remove?.(); } catch {} };
  }, [persistPro, iapReady]);

  // ── Purchase ERROR listener ────────────────────────────────────────────────
  // The mirror of the update listener. requestPurchase's promise only rejects
  // for failures that happen inside its own call; a StoreKit / Play Billing
  // failure raised after the payment sheet is handed off arrives here instead.
  // Without this the sheet dismisses, isPurchasing stays true, and the UNLOCK
  // button is frozen for the rest of the session — a silently lost sale.
  //
  // Same iapReady gating as above: subscribing before initConnection settles
  // is what broke the update observer, and the same ordering applies here.
  useEffect(() => {
    if (!iapReady) return;
    if (!IAPModule || typeof IAPModule.purchaseErrorListener !== 'function') return;
    let sub = null;
    try {
      sub = IAPModule.purchaseErrorListener((err) => {
        try {
          // Never leave the button frozen, whatever the outcome.
          if (mounted.current) setIsPurchasing(false);

          const code = err?.code || err?.userInfo?.code;

          // A deferred payment is a pending approval, not a failure.
          if (code === 'E_DEFERRED_PAYMENT') {
            trackEvent('purchase_deferred');
            if (mounted.current) setLastPurchaseError(null);
            try {
              Alert.alert(i18n.t('iap.paymentPendingTitle'), i18n.t('iap.paymentPendingBody'));
            } catch {}
            return;
          }

          const wasCancelled =
            code === 'E_USER_CANCELLED' ||
            code === 'user_cancelled' ||
            code === 'E_USER_CANCELED' ||
            err?.userInfo?.code === 2;

          trackEvent(wasCancelled ? 'purchase_cancelled' : 'purchase_failed');

          // A cancel is a normal outcome: clear state, show nothing.
          if (wasCancelled) {
            if (mounted.current) setLastPurchaseError(null);
            return;
          }

          if (mounted.current) {
            setLastPurchaseError({
              code: code || 'E_UNKNOWN',
              message: err?.message || i18n.t('iap.tryAgain'),
            });
          }
          try {
            Alert.alert(
              i18n.t('iap.purchaseFailedTitle'),
              err?.message || i18n.t('iap.tryAgain')
            );
          } catch {}
        } catch {
          // Never let a listener error crash the app.
        }
      });
    } catch {
      sub = null;
    }
    return () => { try { sub?.remove?.(); } catch {} };
  }, [iapReady]);

  // ── Purchase (supports lifetime IAP + subscriptions) ──────────────────────
  const purchase = useCallback(async (tier) => {
    if (!IAPModule) {
      try {
        Alert.alert(i18n.t('iap.unavailableTitle'), i18n.t('iap.unavailableBody'));
      } catch {}
      return;
    }

    if (mounted.current) setIsPurchasing(true);

    // Normalize BEFORE anything is keyed off the tier: 'annual' is retired, so
    // a stale value (persisted state, deep link) buys monthly instead of
    // dead-ending on a product lookup that can no longer resolve.
    const requestedTier = tier || selectedTier;
    const effectiveTier = requestedTier === 'annual' ? 'monthly' : requestedTier;
    const sub = isSubTier(effectiveTier);
    const sku = tierToSku(effectiveTier);

    try {
      if (!IAPModule.requestPurchase) {
        if (mounted.current) setIsPurchasing(false);
        return;
      }

      // Ensure product details are cached in the native billing client before
      // calling requestPurchase. On Android, missing details → IllegalArgumentException.
      let detailsMap = { ...products };
      let entry = detailsMap[effectiveTier];

      if (!entry) {
        detailsMap = await fetchProductDetails();
        entry = detailsMap[effectiveTier];
      }

      if (!entry) {
        try {
          Alert.alert(
            i18n.t('iap.storeUnavailableTitle'),
            i18n.t('iap.storeUnavailableBody')
          );
        } catch {}
        return;
      }

      // Android subs require an offerToken. For an eligible annual purchase use
      // the free-trial offer's token so Play actually applies the 7-day trial;
      // otherwise use the bare base-plan token. (Play also validates eligibility
      // server-side, so an ineligible trial-token purchase fails gracefully.)
      let subscriptionOffers;
      if (isAndroid && sub) {
        // Apply the free-trial offer token only when buying monthly (the only
        // sub on sale) while it carries a trial and the user is eligible.
        const useTrialOffer =
          effectiveTier === 'monthly' && trialEligible && detectFreeTrial(products.monthly).hasTrial;
        const offerToken =
          (useTrialOffer && getAndroidTrialOfferToken(entry)) ||
          getAndroidOfferToken(entry);
        if (!offerToken) {
          try {
            Alert.alert(
              i18n.t('iap.subUnavailableTitle'),
              i18n.t('iap.subUnavailableBody')
            );
          } catch {}
          return;
        }
        subscriptionOffers = [{ sku, offerToken }];
      }

      // Build the request payload.
      //
      // expo-iap >= 2.8 REQUIRES platform-keyed sub-objects: its
      // normalizeRequestProps() is literally `request[platform]`, so a flat
      // `{ sku }` / `{ skus }` resolves to undefined and requestPurchase throws
      // "Invalid request for iOS. The `sku` property is required...". The flat
      // shape worked on 2.4.x and silently broke when 3.5.2 bumped the dep.
      // Both keys are always sent; the library picks the one for the platform.
      const request = {
        ios: { sku, andDangerouslyFinishTransactionAutomaticallyIOS: false },
        android: sub ? { skus: [sku], subscriptionOffers } : { skus: [sku] },
      };

      const purchaseRequest = { request, type: sub ? 'subs' : 'inapp' };

      // Fire-and-forget: trackEvent swallows its own errors and never rejects,
      // so it cannot break checkout. Not awaited, to keep the sheet instant.
      trackEvent('purchase_attempt');

      // 120s: password / 2FA / payment-method sheets routinely exceed 30s, and
      // a timeout that fires while the sheet is still up drops the eventual
      // purchase on the floor. The purchaseUpdatedListener is the safety net
      // for anything that completes after this window.
      const result = await Promise.race([
        IAPModule.requestPurchase(purchaseRequest),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Purchase timeout')), 120000)
        )
      ]);

      // Android returns an array of purchases; iOS returns a single object.
      const purchases = Array.isArray(result) ? result : (result ? [result] : []);
      const matched = purchases.find(
        (p) => entitlingSku(p, [sku]) || entitlingSku(p, ALL_PRODUCT_IDS)
      ) || purchases[0];

      // Android PENDING purchase (purchaseState 2): payment hasn't completed —
      // do NOT unlock. The purchaseUpdatedListener delivers the completed
      // purchase (possibly on a later launch) and unlocks then.
      if (matched && isAndroid &&
          matched.purchaseStateAndroid != null && Number(matched.purchaseStateAndroid) === 2) {
        try {
          Alert.alert(
            i18n.t('iap.paymentPendingTitle'),
            i18n.t('iap.paymentPendingBody')
          );
        } catch {}
        return;
      }

      if (matched && (matched.transactionReceipt || matched.transactionId ||
                      matched.purchaseToken || matched.purchaseTokenAndroid)) {
        const receiptToken =
          matched.transactionReceipt ||
          matched.transactionId ||
          matched.purchaseToken ||
          matched.purchaseTokenAndroid ||
          'verified';

        await persistPro(receiptToken, sku);
        trackEvent('purchase_success');

        try {
          if (IAPModule.finishTransaction) {
            await IAPModule.finishTransaction({
              purchase: matched,
              isConsumable: false,
            });
          }
        } catch {
          // finishTransaction failed — purchase is still recorded locally
        }
      }
    } catch (e) {
      // iOS Ask to Buy / Screen Time: StoreKit defers rather than declines, and
      // expo-iap surfaces that as a THROWN E_DEFERRED_PAYMENT, not as a purchase
      // with a pending state (the pending branch above is Android-only). Without
      // this the parent-approval flow reads as "Purchase failed" and, worse,
      // increments the purchase_failed canary that exists to detect outages.
      if (e?.code === 'E_DEFERRED_PAYMENT') {
        trackEvent('purchase_deferred');
        try {
          Alert.alert(i18n.t('iap.paymentPendingTitle'), i18n.t('iap.paymentPendingBody'));
        } catch {}
        return;
      }

      const wasCancelled =
        e?.code === 'E_USER_CANCELLED' ||
        e?.code === 'user_cancelled' ||
        e?.code === 'E_USER_CANCELED' ||
        e?.userInfo?.code === 2;

      const wasTimeout = e?.message === 'Purchase timeout';

      // A cancel is a normal outcome, a failure is not. Counting them apart is
      // what turns "purchases feel low" into "purchases are broken".
      trackEvent(wasCancelled ? 'purchase_cancelled' : 'purchase_failed');

      if (!wasCancelled) {
        try {
          Alert.alert(
            wasTimeout ? i18n.t('iap.stillWaitingTitle') : i18n.t('iap.purchaseFailedTitle'),
            wasTimeout
              ? i18n.t('iap.stillWaitingBody')
              : (e?.message || i18n.t('iap.tryAgain'))
          );
        } catch {}
      }
    } finally {
      if (mounted.current) setIsPurchasing(false);
    }
  }, [persistPro, selectedTier, products, fetchProductDetails, trialEligible]);

  // Lets the paywall dismiss the error banner without re-running a purchase.
  const clearPurchaseError = useCallback(() => {
    if (mounted.current) setLastPurchaseError(null);
  }, []);

  // ── Restore ────────────────────────────────────────────────────────────────
  const restore = useCallback(async () => {
    if (!IAPModule) {
      try {
        Alert.alert(i18n.t('iap.unavailableTitle'), i18n.t('iap.unavailableBody'));
      } catch {}
      return;
    }

    if (mounted.current) setIsRestoring(true);

    try {
      if (!IAPModule.getAvailablePurchases) {
        if (mounted.current) setIsRestoring(false);
        return;
      }

      // Warm the native product cache before asking. On iOS a SKU that was
      // never fetched is invisible to getAvailablePurchases, which is exactly
      // how RESTORE came to report "nothing to restore" to a paying annual
      // subscriber.
      await fetchProductDetails().catch(() => {});

      const purchases = await Promise.race([
        IAPModule.getAvailablePurchases(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Restore timeout')), 30000)
        )
      ]);

      ackAndroid(purchases);

      const ownedPro = (Array.isArray(purchases) ? purchases : []).filter(
        (p) => !isPendingAndroid(p) && entitlingSku(p, ALL_PRODUCT_IDS)
      );

      if (ownedPro.length > 0) {
        // Record what restored (prefer lifetime — the strongest claim) so
        // subscription re-verification knows what it's enforcing.
        const lifetimeOwned = ownedPro.find(
          (p) => entitlingSku(p, ALL_PRODUCT_IDS) === PRO_PRODUCT_ID
        );
        const best = lifetimeOwned || ownedPro[0];
        await persistPro('restored', entitlingSku(best, ALL_PRODUCT_IDS) || 'unknown');
        try {
          Alert.alert(i18n.t('iap.restoredTitle'), i18n.t('iap.restoredBody'));
        } catch {}
      } else {
        try {
          Alert.alert(
            i18n.t('iap.nothingToRestoreTitle'),
            i18n.t('iap.nothingToRestoreBody')
          );
        } catch {}
      }
    } catch (e) {
      try {
        Alert.alert(i18n.t('iap.restoreFailedTitle'), e?.message || i18n.t('iap.tryAgain'));
      } catch {}
    } finally {
      if (mounted.current) setIsRestoring(false);
    }
  }, [persistPro, fetchProductDetails]);

  return {
    isPro,
    isPurchasing: isPurchasing || isRestoring,
    product,
    products,
    selectedTier,
    setSelectedTier,
    trialEligible,
    purchase,
    restore,
    lastPurchaseError,
    clearPurchaseError,
  };
}
