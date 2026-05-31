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

  // ── Load persisted Pro status + one-time stale-key migration ───────────────
  useEffect(() => {
    let cancelled = false;

    const loadProStatus = async () => {
      try {
        if (!AsyncStorage) return;

        const [proFlag, receipt, validated] = await Promise.all([
          AsyncStorage.getItem(PRO_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_RECEIPT_KEY).catch(() => null),
          AsyncStorage.getItem(PRO_VALIDATED).catch(() => null),
        ]);

        if (validated === 'true') {
          if (!cancelled && mounted.current && proFlag === 'true') {
            setIsPro(true);
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
          return;
        }

        if (IAPModule && IAPModule.getAvailablePurchases) {
          try {
            if (IAPModule.initConnection) {
              let initTimer;
              await Promise.race([
                IAPModule.initConnection(),
                new Promise((_, r) => { initTimer = setTimeout(() => r(new Error('timeout')), 3000); })
              ]).finally(() => { if (initTimer) clearTimeout(initTimer); });
              initConnectedRef.current = true;
            }

            let purchasesTimer;
            const purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((_, r) => { purchasesTimer = setTimeout(() => r(new Error('timeout')), 5000); })
            ]).finally(() => { if (purchasesTimer) clearTimeout(purchasesTimer); });

            const hasPro = purchases?.some?.(p =>
              ALL_PRODUCT_IDS.includes(p?.id) || ALL_PRODUCT_IDS.includes(p?.productId)
            );

            if (hasPro) {
              if (!cancelled && mounted.current) setIsPro(true);
              await AsyncStorage.setItem(PRO_RECEIPT_KEY, 'verified').catch(() => {});
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
        if (IAPModule.getAvailablePurchases) {
          try {
            if (IAPModule.initConnection && !initConnectedRef.current) {
              await IAPModule.initConnection().catch(() => {});
              initConnectedRef.current = true;
            }
            purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
            ]) || [];
          } catch { purchases = []; }
        }
        if (!cancelled && mounted.current) setTrialEligible(!hasPriorSubscription(purchases));
      } catch {
        if (!cancelled && mounted.current) setTrialEligible(false);
      }
    })();
    return () => { cancelled = true; };
  }, [products.annual]);

  // ── Persist Pro unlock ─────────────────────────────────────────────────────
  const persistPro = useCallback(async (receipt = '') => {
    if (mounted.current) setIsPro(true);

    try {
      if (!AsyncStorage) return;

      const ops = [];
      ops.push(AsyncStorage.setItem(PRO_KEY, 'true').catch(() => {}));
      if (receipt) {
        ops.push(AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt).catch(() => {}));
      }
      await Promise.all(ops);
    } catch {
      // Storage failed — isPro is still true in memory for this session
    }
  }, []);

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

      const result = await Promise.race([
        IAPModule.requestPurchase(purchaseRequest),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Purchase timeout')), 30000)
        )
      ]);

      // Android returns an array of purchases; iOS returns a single object.
      const purchases = Array.isArray(result) ? result : (result ? [result] : []);
      const matched = purchases.find((p) =>
        p && (p.id === sku || p.productId === sku ||
              ALL_PRODUCT_IDS.includes(p.id) || ALL_PRODUCT_IDS.includes(p.productId))
      ) || purchases[0];

      if (matched && (matched.transactionReceipt || matched.transactionId ||
                      matched.purchaseToken || matched.purchaseTokenAndroid)) {
        const receiptToken =
          matched.transactionReceipt ||
          matched.transactionId ||
          matched.purchaseToken ||
          matched.purchaseTokenAndroid ||
          'verified';

        await persistPro(receiptToken);

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
            wasTimeout ? 'Purchase timed out' : 'Purchase failed',
            wasTimeout ? 'The store did not respond. Please try again.' : (e?.message || 'Please try again.')
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
      const hasPro = purchases?.some?.(p =>
        ALL_PRODUCT_IDS.includes(p?.id) || ALL_PRODUCT_IDS.includes(p?.productId)
      );

      if (hasPro) {
        await persistPro('restored');
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
