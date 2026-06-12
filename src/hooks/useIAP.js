/**
 * useIAP — Crash-safe IAP hook (HARDENED for iOS beta + Android Play Billing).
 * Returns: { isPro, isPurchasing, product, products, selectedTier, setSelectedTier, purchase, restore }
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
import { detectFreeTrial, hasPriorSubscription, getAndroidTrialOfferToken } from '../utils/iapOffers';

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
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';

// Subscription product IDs (same tier, different billing)
const SUB_MONTHLY_ID = 'redgrid_mgrs_pro_monthly';
const SUB_ANNUAL_ID  = 'redgrid_mgrs_pro_annual';
const INAPP_IDS = [PRO_PRODUCT_ID];
const SUB_IDS = [SUB_MONTHLY_ID, SUB_ANNUAL_ID];
const ALL_PRODUCT_IDS = [...INAPP_IDS, ...SUB_IDS];

const isAndroid = Platform.OS === 'android';

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

const tierToSku = (tier) => {
  if (tier === 'monthly') return SUB_MONTHLY_ID;
  if (tier === 'annual') return SUB_ANNUAL_ID;
  return PRO_PRODUCT_ID;
};

const isSubTier = (tier) => tier === 'monthly' || tier === 'annual';

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

export function useIAP() {
  const [isPro,        setIsPro]        = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);
  const [product,      setProduct]      = useState(null);      // lifetime (legacy)
  const [products,     setProducts]     = useState({});         // { lifetime, monthly, annual }
  const [selectedTier, setSelectedTier] = useState('annual');   // default selection
  const [trialEligible, setTrialEligible] = useState(false);    // annual free-trial intro offer eligibility
  const mounted = useRef(true);

  // Track in-flight + completed product detail fetches so we never call
  // requestPurchase before Play Billing has the ProductDetails cached.
  const fetchPromiseRef = useRef(null);
  const initConnectedRef = useRef(false);

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

    const ensureConnection = async () => {
      if (IAPModule?.initConnection && !initConnectedRef.current) {
        let initTimer;
        try {
          await Promise.race([
            IAPModule.initConnection(),
            new Promise((_, r) => { initTimer = setTimeout(() => r(new Error('timeout')), 3000); }),
          ]);
          initConnectedRef.current = true;
        } catch {
          // Stay disconnected — callers degrade gracefully.
        } finally {
          if (initTimer) clearTimeout(initTimer);
        }
      }
    };

    const reverifyEntitlement = async (recordedProduct) => {
      if (!IAPModule?.getAvailablePurchases) return;
      try {
        await ensureConnection();
        let purchasesTimer;
        const result = await Promise.race([
          IAPModule.getAvailablePurchases(),
          new Promise((_, r) => { purchasesTimer = setTimeout(() => r(new Error('timeout')), 5000); }),
        ]).finally(() => { if (purchasesTimer) clearTimeout(purchasesTimer); });

        if (cancelled || !mounted.current) return;
        if (!Array.isArray(result)) return; // ambiguous response — keep Pro

        const owned = result.filter((p) =>
          p && (ALL_PRODUCT_IDS.includes(p.id) || ALL_PRODUCT_IDS.includes(p.productId))
        );

        if (owned.length > 0) {
          // Entitlement confirmed — refresh the verification clock and refine
          // the recorded product (prefer lifetime: the strongest claim).
          const lifetimeOwned = owned.find((p) => p.id === PRO_PRODUCT_ID || p.productId === PRO_PRODUCT_ID);
          const best = lifetimeOwned || owned[0];
          const bestSku = best.id || best.productId || recordedProduct || 'unknown';
          await AsyncStorage.setItem(PRO_VERIFIED_AT, String(Date.now())).catch(() => {});
          await AsyncStorage.setItem(PRO_PRODUCT_KEY, String(bestSku)).catch(() => {});
          return;
        }

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
            await ensureConnection();

            let purchasesTimer;
            const purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((_, r) => { purchasesTimer = setTimeout(() => r(new Error('timeout')), 5000); })
            ]).finally(() => { if (purchasesTimer) clearTimeout(purchasesTimer); });

            const ownedPro = (Array.isArray(purchases) ? purchases : []).filter(p =>
              p && (ALL_PRODUCT_IDS.includes(p.id) || ALL_PRODUCT_IDS.includes(p.productId))
            );

            if (ownedPro.length > 0) {
              if (!cancelled && mounted.current) setIsPro(true);
              const lifetimeOwned = ownedPro.find((p) => p.id === PRO_PRODUCT_ID || p.productId === PRO_PRODUCT_ID);
              const best = lifetimeOwned || ownedPro[0];
              await AsyncStorage.setItem(PRO_RECEIPT_KEY, 'verified').catch(() => {});
              await AsyncStorage.setItem(PRO_PRODUCT_KEY, String(best.id || best.productId || 'unknown')).catch(() => {});
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
  // Returns a snapshot { lifetime, monthly, annual } so callers can decide
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
              IAPModule.getSubscriptions(SUB_IDS),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('subs fetch timeout')), 6000)
              )
            ]).catch(() => [])
          );
        } else {
          // Older expo-iap fallback: try getProducts for subs (iOS-friendly path).
          tasks.push(
            Promise.race([
              IAPModule.getProducts(SUB_IDS),
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
          else if (p?.id === SUB_ANNUAL_ID) map.annual = p;
        }

        if (mounted.current) {
          if (map.lifetime) setProduct(map.lifetime);
          if (map.lifetime || map.monthly || map.annual) {
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
        if (!detectFreeTrial(products.annual).hasTrial) {
          if (!cancelled && mounted.current) setTrialEligible(false);
          return;
        }
        let purchases = [];
        try {
          if (IAPModule.initConnection && !initConnectedRef.current) {
            await IAPModule.initConnection().catch(() => {});
            initConnectedRef.current = true;
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
        if (!cancelled && mounted.current) setTrialEligible(!hasPriorSubscription(purchases));
      } catch {
        if (!cancelled && mounted.current) setTrialEligible(false);
      }
    })();
    return () => { cancelled = true; };
  }, [products.annual]);

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

  // ── Purchase event listener ────────────────────────────────────────────────
  // requestPurchase's promise can miss deliveries: payment sheets that outlive
  // the timeout, Ask-to-Buy approvals, promo-code redemptions, and purchases
  // interrupted by a crash all arrive via this event instead (StoreKit also
  // re-emits unfinished transactions on launch). Persist + finish here so a
  // paying user is never left locked out.
  useEffect(() => {
    if (!IAPModule || typeof IAPModule.purchaseUpdatedListener !== 'function') return;
    let sub = null;
    try {
      sub = IAPModule.purchaseUpdatedListener(async (p) => {
        try {
          if (!p) return;
          const sku = p.id || p.productId;
          const ids = Array.isArray(p.ids) ? p.ids : [];
          const resolvedSku = (ALL_PRODUCT_IDS.includes(sku) && sku) ||
            ids.find((x) => ALL_PRODUCT_IDS.includes(x));
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
  }, [persistPro]);

  // ── Purchase (supports lifetime IAP + subscriptions) ──────────────────────
  const purchase = useCallback(async (tier) => {
    if (!IAPModule) {
      try {
        Alert.alert('Unavailable', 'In-app purchases are not available in this build.');
      } catch {}
      return;
    }

    if (mounted.current) setIsPurchasing(true);

    const effectiveTier = tier || selectedTier;
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
            'Store unavailable',
            'Could not load product details from the store. Please check your network and try again.'
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
        const offerToken =
          (effectiveTier === 'annual' && trialEligible && getAndroidTrialOfferToken(entry)) ||
          getAndroidOfferToken(entry);
        if (!offerToken) {
          try {
            Alert.alert(
              'Subscription unavailable',
              'No active subscription offer was found for this product. Please try again later.'
            );
          } catch {}
          return;
        }
        subscriptionOffers = [{ sku, offerToken }];
      }

      // Build platform-specific request payload.
      let request;
      if (isAndroid) {
        request = sub
          ? { skus: [sku], subscriptionOffers }
          : { skus: [sku] };
      } else {
        request = { sku, andDangerouslyFinishTransactionAutomaticallyIOS: false };
      }

      const purchaseRequest = { request, type: sub ? 'subs' : 'inapp' };

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
      const matched = purchases.find((p) =>
        p && (p.id === sku || p.productId === sku ||
              ALL_PRODUCT_IDS.includes(p.id) || ALL_PRODUCT_IDS.includes(p.productId))
      ) || purchases[0];

      // Android PENDING purchase (purchaseState 2): payment hasn't completed —
      // do NOT unlock. The purchaseUpdatedListener delivers the completed
      // purchase (possibly on a later launch) and unlocks then.
      if (matched && isAndroid &&
          matched.purchaseStateAndroid != null && Number(matched.purchaseStateAndroid) === 2) {
        try {
          Alert.alert(
            'Payment pending',
            'Your payment is still processing. Pro will unlock automatically as soon as it completes.'
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
      const wasCancelled =
        e?.code === 'E_USER_CANCELLED' ||
        e?.code === 'user_cancelled' ||
        e?.code === 'E_USER_CANCELED' ||
        e?.userInfo?.code === 2;

      const wasTimeout = e?.message === 'Purchase timeout';

      if (!wasCancelled) {
        try {
          Alert.alert(
            wasTimeout ? 'Still waiting on the store' : 'Purchase failed',
            wasTimeout
              ? 'The store is taking longer than expected. If you completed the purchase, Pro will unlock automatically — or tap RESTORE in a moment.'
              : (e?.message || 'Please try again.')
          );
        } catch {}
      }
    } finally {
      if (mounted.current) setIsPurchasing(false);
    }
  }, [persistPro, selectedTier, products, fetchProductDetails, trialEligible]);

  // ── Restore ────────────────────────────────────────────────────────────────
  const restore = useCallback(async () => {
    if (!IAPModule) {
      try {
        Alert.alert('Unavailable', 'In-app purchases are not available in this build.');
      } catch {}
      return;
    }

    if (mounted.current) setIsRestoring(true);

    try {
      if (!IAPModule.getAvailablePurchases) {
        if (mounted.current) setIsRestoring(false);
        return;
      }

      const purchases = await Promise.race([
        IAPModule.getAvailablePurchases(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Restore timeout')), 30000)
        )
      ]);

      // expo-iap may expose `id` (iOS) or `productId` (Android) on the purchase.
      const ownedPro = (Array.isArray(purchases) ? purchases : []).filter(p =>
        p && (ALL_PRODUCT_IDS.includes(p.id) || ALL_PRODUCT_IDS.includes(p.productId))
      );

      if (ownedPro.length > 0) {
        // Record what restored (prefer lifetime — the strongest claim) so
        // subscription re-verification knows what it's enforcing.
        const lifetimeOwned = ownedPro.find(p => p.id === PRO_PRODUCT_ID || p.productId === PRO_PRODUCT_ID);
        const best = lifetimeOwned || ownedPro[0];
        await persistPro('restored', best.id || best.productId || 'unknown');
        try {
          Alert.alert('Restored', 'Red Grid Pro has been restored.');
        } catch {}
      } else {
        try {
          Alert.alert(
            'Nothing to restore',
            'No previous Pro purchase found on this account.'
          );
        } catch {}
      }
    } catch (e) {
      try {
        Alert.alert('Restore failed', e?.message || 'Please try again.');
      } catch {}
    } finally {
      if (mounted.current) setIsRestoring(false);
    }
  }, [persistPro]);

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
  };
}
