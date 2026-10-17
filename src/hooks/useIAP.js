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
import { AppState, Platform } from 'react-native';
import { Alert } from '../utils/fieldAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  detectFreeTrial, hasPriorSubscription, getAndroidTrialOfferToken, entitlingSku,
  needsAndroidAck, canConfirmNoEntitlement, isEntitlingPurchase, isRevokedIOS, iosTransactionIdentity,
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
// Local identity lets a verified refund affect only the matching entitlement.
// Existing purchases without this metadata remain protected when ambiguous.
const PRO_TRANSACTION_KEY = 'rg_pro_transaction_v1';
// Preserve a matching verified refund across an offline restart until a
// complete query can check for another paid entitlement. Never sent anywhere.
const PRO_PENDING_REVOCATION = 'rg_pro_pending_revocation_v1';
const FOREGROUND_RECHECK_MS = 60 * 1000;
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

const identityKey = identity => identity ? `${identity.productId}:${identity.transactionId}` : null;
const receiptFor = p => p.transactionReceipt || p.transactionId || p.purchaseToken || p.purchaseTokenAndroid || 'verified';

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
  const [trialEligible, setTrialEligible] = useState(false);    // current monthly introductory-offer eligibility
  // Gates the purchase-event listener until initConnection has run. See the
  // effect below — subscribing before connecting leaves the listener deaf.
  const [iapReady, setIapReady] = useState(false);
  const mounted = useRef(true);

  // Track in-flight + completed product detail fetches so we never call
  // requestPurchase before Play Billing has the ProductDetails cached.
  const fetchPromiseRef = useRef(null);
  const initConnectedRef = useRef(false);
  const initPromiseRef = useRef(null);
  // Always points at the current fetchProductDetails. The entitlement effect
  // below is declared before that callback exists, and must be able to warm
  // the native product cache before querying the store.
  const fetchProductDetailsRef = useRef(null);

  const entitlementRevision = useRef(0);
  const entitlementRecord = useRef({ unlocked: false, sku: null, identity: null });
  const hydration = useRef(null);
  const revokedTransactions = useRef(new Set());
  const refreshInFlight = useRef(null);
  const lastRefreshAt = useRef(null);
  const entitlementWrites = useRef(Promise.resolve());
  const writeEntitlement = useCallback(operation => {
    const next = entitlementWrites.current.then(operation, operation);
    entitlementWrites.current = next.catch(() => {});
    return next;
  }, []);

  // initConnection replaces the iOS ProductStore. Share the in-flight attempt
  // so startup cannot clear the catalog being loaded for restoration.
  const ensureConnection = useCallback(async () => {
    if (!IAPModule?.initConnection || initConnectedRef.current) return;
    if (!initPromiseRef.current) {
      let timer;
      initPromiseRef.current = Promise.race([
        Promise.resolve().then(() => IAPModule.initConnection()),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Init timeout')), 4000); }),
      ]).then(() => { initConnectedRef.current = true; })
        .finally(() => { clearTimeout(timer); initPromiseRef.current = null; });
    }
    await initPromiseRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const canGrant = useCallback((p, source = 'transaction') => {
    if (!isEntitlingPurchase(p, Platform.OS, ALL_PRODUCT_IDS, Date.now(), source)) return false;
    const key = !isAndroid && identityKey(iosTransactionIdentity(p, ALL_PRODUCT_IDS));
    return !key || !revokedTransactions.current.has(key);
  }, []);

  const strongestOwned = useCallback((purchases, source) => {
    const owned = (Array.isArray(purchases) ? purchases : []).filter(p => canGrant(p, source));
    const recordedKey = identityKey(entitlementRecord.current.identity);
    return owned.find(p => entitlingSku(p, ALL_PRODUCT_IDS) === PRO_PRODUCT_ID &&
      identityKey(iosTransactionIdentity(p, ALL_PRODUCT_IDS)) === recordedKey) ||
      owned.find(p => entitlingSku(p, ALL_PRODUCT_IDS) === PRO_PRODUCT_ID) || owned[0];
  }, [canGrant]);

  // Every grant uses the same eligibility/ordering rules, whether it arrives
  // from checkout, Restore, a delayed update, or background recovery.
  const persistPro = useCallback(async (receipt, productSku, purchase, expectedRevision, source = 'transaction') => {
    await hydration.current;
    if (!canGrant(purchase, source) || !mounted.current ||
        (expectedRevision != null && expectedRevision !== entitlementRevision.current)) return false;
    entitlementRevision.current += 1;
    const previous = entitlementRecord.current;
    const revokedPrevious = revokedTransactions.current.has(identityKey(previous.identity));
    const keepPermanent = previous.unlocked && !revokedPrevious &&
      (previous.sku === PRO_PRODUCT_ID || previous.sku === 'unknown');
    // A subscription or unrelated transaction cannot replace a permanent
    // claim. Legacy permanent claims without identity remain ambiguous.
    const keepPrevious = keepPermanent &&
      (productSku !== PRO_PRODUCT_ID || previous.sku === PRO_PRODUCT_ID);
    const sku = keepPrevious ? previous.sku : productSku;
    const identity = keepPrevious ? previous.identity :
      (previous.unlocked && previous.sku === 'unknown' ? null :
        (!isAndroid ? iosTransactionIdentity(purchase, ALL_PRODUCT_IDS) : null));
    // Publish the identity before waiting for disk: a refund arriving during
    // an earlier storage write must be able to match this pending grant.
    entitlementRecord.current = { unlocked: true, sku, identity };
    setIsPro(true);
    await writeEntitlement(async () => {
      if (!canGrant(purchase, source)) return;
      const ops = [
        AsyncStorage.setItem(PRO_KEY, 'true'),
        AsyncStorage.setItem(PRO_VALIDATED, 'true'),
        AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())),
        AsyncStorage.setItem(PRO_PRODUCT_KEY, sku),
      ];
      if (!keepPrevious || !previous.unlocked) ops.push(AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt || 'verified'));
      ops.push(identity ? AsyncStorage.setItem(PRO_TRANSACTION_KEY, JSON.stringify(identity)) : AsyncStorage.removeItem(PRO_TRANSACTION_KEY));
      ops.push(AsyncStorage.removeItem(PRO_PENDING_REVOCATION));
      await Promise.all(ops.map(op => op.catch(() => {})));
    });
    return canGrant(purchase, source);
  }, [canGrant, writeEntitlement]);

  const reverifyEntitlement = useCallback(async () => {
    await hydration.current;
    const revision = entitlementRevision.current;
    if (!IAPModule?.getAvailablePurchases) return;
    try {
      // The pinned native default is verified StoreKit currentEntitlements
      // (onlyIncludeActiveItems=true), which includes billing-grace access.
      // Its results are also filtered by this native product catalog.
      const cache = await fetchProductDetailsRef.current?.().catch(() => null);
      const cacheWarm = canConfirmNoEntitlement(Platform.OS, cache?.resolvedProductIds, ALL_PRODUCT_IDS);
      let purchasesTimer;
      const result = await Promise.race([
        IAPModule.getAvailablePurchases(),
        new Promise((_, reject) => { purchasesTimer = setTimeout(() => reject(new Error('timeout')), 5000); }),
      ]).finally(() => clearTimeout(purchasesTimer));
      ackAndroid(result);
      if (!mounted.current || revision !== entitlementRevision.current || !Array.isArray(result)) return;
      const best = strongestOwned(result, 'currentEntitlements');
      if (best) {
        await persistPro(receiptFor(best), entitlingSku(best, ALL_PRODUCT_IDS), best, revision, 'currentEntitlements');
        return;
      }
      if (!cacheWarm) return;
      const recorded = entitlementRecord.current;
      if (!recorded.unlocked) return;
      const explicitlyRevoked = revokedTransactions.current.has(identityKey(recorded.identity));
      // Empty/partial/offline results NEVER revoke Lifetime or old unknown
      // unlocks. Only a verified update for their exact recorded transaction
      // followed by a complete store check can establish revocation.
      if (!explicitlyRevoked && recorded.sku !== SUB_MONTHLY_ID && recorded.sku !== SUB_ANNUAL_ID) return;
      const verifiedAtRaw = await AsyncStorage.getItem(PRO_VERIFIED_AT).catch(() => null);
      await writeEntitlement(async () => {
        if (!mounted.current || revision !== entitlementRevision.current) return;
        const verifiedAt = Number(verifiedAtRaw) || 0;
        if (!explicitlyRevoked && !verifiedAt) {
          await AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {});
          return;
        }
        if (!explicitlyRevoked && Date.now() - verifiedAt <= SUB_REVERIFY_GRACE_MS) return;
        entitlementRevision.current += 1;
        entitlementRecord.current = { unlocked: false, sku: null, identity: null };
        setIsPro(false);
        for (const key of [PRO_KEY, PRO_RECEIPT_KEY, PRO_PRODUCT_KEY, PRO_VERIFIED_AT, PRO_TRANSACTION_KEY, PRO_PENDING_REVOCATION]) {
          await AsyncStorage.removeItem(key).catch(() => {});
        }
      });
    } catch {
      // Offline, failed or ambiguous queries preserve saved access.
    }
  }, [strongestOwned, persistPro, writeEntitlement]);

  const refreshEntitlement = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    lastRefreshAt.current = Date.now();
    const run = reverifyEntitlement().finally(() => {
      if (refreshInFlight.current === run) refreshInFlight.current = null;
    });
    refreshInFlight.current = run;
    return run;
  }, [reverifyEntitlement]);

  // Hydrate first for immediate offline access. Old keys remain valid; a
  // legacy flag without receipt/identity must not be erased by an empty store.
  // Even clean/free installs then recover owned entitlements automatically.
  useEffect(() => {
    let cancelled = false;
    const loadProStatus = async () => {
      const revision = entitlementRevision.current;
      try {
        const [proFlag, recordedProduct, identityJSON, pendingRevocationJSON] = await Promise.all([
          AsyncStorage.getItem(PRO_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_PRODUCT_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_TRANSACTION_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_PENDING_REVOCATION).catch(() => null),
        ]);
        if (cancelled || !mounted.current || revision !== entitlementRevision.current) return;
        const sku = ALL_PRODUCT_IDS.includes(recordedProduct) ? recordedProduct : 'unknown';
        let identity = null;
        try {
          const parsed = JSON.parse(identityJSON);
          if (parsed?.productId === sku && typeof parsed.transactionId === 'string' && parsed.transactionId) {
            identity = { productId: sku, transactionId: parsed.transactionId };
          }
        } catch {}
        try {
          const pending = JSON.parse(pendingRevocationJSON);
          if (identity && identityKey(pending) === identityKey(identity)) revokedTransactions.current.add(identityKey(identity));
        } catch {}
        const unlocked = proFlag === 'true';
        entitlementRecord.current = { unlocked, sku: unlocked ? sku : null, identity: unlocked ? identity : null };
        setIsPro(unlocked);
        await writeEntitlement(async () => {
          if (cancelled || revision !== entitlementRevision.current) return;
          await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
          if (unlocked && !recordedProduct) await AsyncStorage.setItem(PRO_PRODUCT_KEY, 'unknown').catch(() => {});
        });
      } catch {}
    };
    hydration.current = loadProStatus();
    hydration.current.then(() => { if (!cancelled && mounted.current) refreshEntitlement(); });
    return () => { cancelled = true; };
  }, [refreshEntitlement, writeEntitlement]);

  // Bounded, silent recovery for purchases completed while backgrounded.
  useEffect(() => {
    let state = AppState?.currentState;
    const subscription = AppState?.addEventListener?.('change', next => {
      const resumed = next === 'active' && state !== 'active';
      state = next;
      if (resumed && (lastRefreshAt.current == null || Date.now() - lastRefreshAt.current >= FOREGROUND_RECHECK_MS)) {
        refreshEntitlement();
      }
    });
    return () => subscription?.remove?.();
  }, [refreshEntitlement]);

  // ── Fetch product + subscription details (cache-aware, dedup'd) ───────────
  // Returns sale details plus resolvedProductIds so callers can decide
  // whether the SKU they're about to buy has details ready.
  const fetchProductDetails = useCallback(async () => {
    if (!IAPModule) return {};

    if (fetchPromiseRef.current) {
      try { return await fetchPromiseRef.current; }
      catch { /* fall through and retry below */ }
    }

    const run = (async () => {
      try {
        await ensureConnection();
        if (mounted.current) setIapReady(true);

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
        for (const p of (Array.isArray(inappList) ? inappList : [])) {
          if (p?.id === PRO_PRODUCT_ID) { map.lifetime = p; }
        }
        for (const p of (Array.isArray(subList) ? subList : [])) {
          if (p?.id === SUB_MONTHLY_ID) map.monthly = p;
        }

        if (mounted.current) {
          if (map.lifetime) setProduct(map.lifetime);
          if (map.lifetime || map.monthly) {
            setProducts((prev) => ({ ...prev, ...map }));
          }
        }
        // Annual stays off the sale map; resolve it only for entitlement checks.
        const resolvedProductIds = [inappList, subList]
          .flatMap(list => Array.isArray(list) ? list : [])
          .map(p => p?.id).filter(id => ALL_PRODUCT_IDS.includes(id));
        return { ...map, resolvedProductIds };
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
  }, [ensureConnection]);

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

  // ── Free-trial eligibility for the monthly subscription ──────────────────
  // Eligible = the monthly product advertises a free trial AND the user has no
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
        // trials were removed 2026-07-25; annual is fetched for existing access
        // only, so this stays false unless an offer is re-created on monthly.)
        const hasTrial = detectFreeTrial(products.monthly).hasTrial;
        if (!hasTrial) {
          if (!cancelled && mounted.current) setTrialEligible(false);
          return;
        }
        let purchases = [];
        try {
          await ensureConnection();
          if (mounted.current) setIapReady(true);
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
  }, [products.monthly, ensureConnection]);

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
      try {
        await ensureConnection();
      } catch {
        // Degrade gracefully; subscribe anyway.
      }
      if (!cancelled && mounted.current) setIapReady(true);
    })();
    return () => { cancelled = true; };
  }, [ensureConnection]);

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
          if (!isAndroid && isRevokedIOS(p)) {
            const key = identityKey(iosTransactionIdentity(p, ALL_PRODUCT_IDS));
            if (key) revokedTransactions.current.add(key);
            await hydration.current;
            // Invalidate queries begun before this verified StoreKit event.
            entitlementRevision.current += 1;
            await writeEntitlement(async () => {
              if (key && identityKey(entitlementRecord.current.identity) === key) {
                await AsyncStorage.setItem(PRO_PENDING_REVOCATION,
                  JSON.stringify(iosTransactionIdentity(p, ALL_PRODUCT_IDS))).catch(() => {});
              }
            });
            await reverifyEntitlement();
          } else if (canGrant(p)) {
            await persistPro(receiptFor(p), resolvedSku, p);
          } else {
            return; // pending, expired, superseded or already revoked
          }
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
  }, [persistPro, canGrant, reverifyEntitlement, writeEntitlement, iapReady]);

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
      );

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

      if (matched && canGrant(matched)) {
        const receiptToken =
          matched.transactionReceipt ||
          matched.transactionId ||
          matched.purchaseToken ||
          matched.purchaseTokenAndroid ||
          'verified';

        const granted = await persistPro(receiptToken, entitlingSku(matched, ALL_PRODUCT_IDS), matched);
        if (!granted) return;
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
  }, [persistPro, canGrant, selectedTier, products, fetchProductDetails, trialEligible]);

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
      await hydration.current;
      const revision = entitlementRevision.current;
      const cache = await fetchProductDetails().catch(() => null);

      const purchases = await Promise.race([
        IAPModule.getAvailablePurchases(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Restore timeout')), 30000)
        )
      ]);

      ackAndroid(purchases);

      const best = strongestOwned(purchases, 'currentEntitlements');
      if (best) {
        const granted = await persistPro('restored', entitlingSku(best, ALL_PRODUCT_IDS), best, revision, 'currentEntitlements');
        if (!granted) return;
        try {
          Alert.alert(i18n.t('iap.restoredTitle'), i18n.t('iap.restoredBody'));
        } catch {}
      } else if (!Array.isArray(purchases) || !canConfirmNoEntitlement(Platform.OS, cache?.resolvedProductIds, ALL_PRODUCT_IDS)) {
        try {
          Alert.alert(i18n.t('iap.restoreUnavailableTitle'), i18n.t('iap.restoreUnavailableBody'));
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
  }, [persistPro, strongestOwned, fetchProductDetails]);

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
    refreshProducts: fetchProductDetails,
  };
}
