/**
 * useIAP — Crash-safe IAP hook (HARDENED for iOS beta).
 * Returns: { isPro, isPurchasing, product, purchase, restore }
 *
 * CRITICAL HARDENING:
 *   - Module load is wrapped with additional validation checks
 *   - All native bridge calls have timeout protection
 *   - AsyncStorage operations have explicit error handling
 *   - Mounted ref ensures no state updates on unmounted components
 *   - All promise chains catch even uncaught rejections
 *   - StoreKit unavailability degrades gracefully to free mode
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY         = 'rg_pro_unlocked';
const PRO_RECEIPT_KEY = 'rg_pro_receipt';
const PRO_VALIDATED   = 'rg_pro_validated_v2';
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';

// Subscription product IDs (same tier, different billing)
const SUB_MONTHLY_ID = 'redgrid_mgrs_pro_monthly';
const SUB_ANNUAL_ID  = 'redgrid_mgrs_pro_annual';
const ALL_PRODUCT_IDS = [PRO_PRODUCT_ID, SUB_MONTHLY_ID, SUB_ANNUAL_ID];
const SUB_IDS = [SUB_MONTHLY_ID, SUB_ANNUAL_ID];

// Safely require expo-iap — handles unavailability on iOS beta
let IAPModule = null;
try {
  const mod = require('expo-iap');
  // Validate the module is actually usable before trusting it
  if (mod &&
      typeof mod.getProducts === 'function' &&
      typeof mod.requestPurchase === 'function' &&
      typeof mod.getAvailablePurchases === 'function') {
    IAPModule = mod;
  }
} catch (e) {
  // expo-iap not available or failed to load — free mode only
  IAPModule = null;
}

export function useIAP() {
  const [isPro,        setIsPro]        = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);
  const [product,      setProduct]      = useState(null);      // lifetime (legacy)
  const [products,     setProducts]     = useState({});         // { lifetime, monthly, annual }
  const [selectedTier, setSelectedTier] = useState('annual');   // default selection
  const mounted = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Load persisted Pro status + one-time stale-key migration ───────────────
  // On v2.1.4+, validates rg_pro_unlocked against StoreKit to clear stale
  // keys left by TestFlight/dev builds. Runs once per install.
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

        // Already validated in a previous launch — trust the stored flag
        if (validated === 'true') {
          if (!cancelled && mounted.current && proFlag === 'true') {
            setIsPro(true);
          }
          return;
        }

        // No Pro flag set — nothing to validate, mark migration done
        if (proFlag !== 'true') {
          await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
          return;
        }

        // Pro flag is set AND has a receipt — legitimate purchase, trust it
        if (receipt) {
          if (!cancelled && mounted.current) setIsPro(true);
          await AsyncStorage.setItem(PRO_VALIDATED, 'true').catch(() => {});
          return;
        }

        // Pro flag is set but NO receipt — could be stale dev/TestFlight data.
        // Verify against StoreKit before trusting.
        if (IAPModule && IAPModule.getAvailablePurchases) {
          try {
            if (IAPModule.initConnection) {
              await Promise.race([
                IAPModule.initConnection(),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))
              ]);
            }

            const purchases = await Promise.race([
              IAPModule.getAvailablePurchases(),
              new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
            ]);

            const hasPro = purchases?.some?.(p =>
              ALL_PRODUCT_IDS.includes(p?.id)
            );

            if (hasPro) {
              // Verified — legitimate purchase, keep Pro and stamp receipt
              if (!cancelled && mounted.current) setIsPro(true);
              await AsyncStorage.setItem(PRO_RECEIPT_KEY, 'verified').catch(() => {});
            } else {
              // No purchase found — stale key, clear it
              if (!cancelled && mounted.current) setIsPro(false);
              await AsyncStorage.removeItem(PRO_KEY).catch(() => {});
            }
          } catch {
            // StoreKit unavailable — err on the side of the user, keep Pro
            if (!cancelled && mounted.current) setIsPro(true);
          }
        } else {
          // IAP module unavailable — can't validate, keep Pro
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

  // ── Initialize store connection + fetch product price ──────────────────────
  useEffect(() => {
    if (!IAPModule) return;

    let cancelled = false;

    const initAndFetch = async () => {
      try {
        // expo-iap requires initConnection() before any store operations
        if (IAPModule.initConnection) {
          await Promise.race([
            IAPModule.initConnection(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Init timeout')), 3000)
            )
          ]);
        }

        if (cancelled || !mounted.current) return;

        if (!IAPModule.getProducts) return;

        const fetched = await Promise.race([
          IAPModule.getProducts(ALL_PRODUCT_IDS),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Product fetch timeout')), 5000)
          )
        ]);

        if (!cancelled && mounted.current && fetched?.length) {
          const map = {};
          for (const p of fetched) {
            if (p?.id === PRO_PRODUCT_ID) { map.lifetime = p; setProduct(p); }
            else if (p?.id === SUB_MONTHLY_ID) map.monthly = p;
            else if (p?.id === SUB_ANNUAL_ID) map.annual = p;
          }
          setProducts(map);
        }
      } catch (err) {
        // Product fetch failed — ProGate will show fallback price $9.99
        // Do not throw, just silently continue
      }
    };

    // Delay to let native bridge initialize, but use setTimeout safely
    const initialDelay = setTimeout(() => {
      if (!cancelled) {
        initAndFetch().catch(() => {
          // Ensure no unhandled rejection
        });
      }
    }, 500);

    return () => {
      cancelled = true;
      if (initialDelay) clearTimeout(initialDelay);
    };
  }, []);

  // ── Persist Pro unlock ─────────────────────────────────────────────────────
  const persistPro = useCallback(async (receipt = '') => {
    if (mounted.current) setIsPro(true);

    try {
      if (!AsyncStorage) {
        return;
      }

      const ops = [];
      ops.push(AsyncStorage.setItem(PRO_KEY, 'true').catch(() => {}));

      if (receipt) {
        ops.push(AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt).catch(() => {}));
      }

      await Promise.all(ops);
    } catch (err) {
      // Storage failed — isPro is still true in memory for this session
      // Do not throw
    }
  }, []);

  // ── Purchase (supports lifetime IAP + subscriptions) ──────────────────────
  const purchase = useCallback(async (tier) => {
    if (!IAPModule) {
      try {
        Alert.alert(
          'Unavailable',
          'In-app purchases are not available in this build.'
        );
      } catch {}
      return;
    }

    if (mounted.current) setIsPurchasing(true);

    const effectiveTier = tier || selectedTier;
    const isSub = effectiveTier === 'monthly' || effectiveTier === 'annual';
    let sku = PRO_PRODUCT_ID;
    if (effectiveTier === 'monthly') sku = SUB_MONTHLY_ID;
    else if (effectiveTier === 'annual') sku = SUB_ANNUAL_ID;

    try {
      if (!IAPModule || !IAPModule.requestPurchase) {
        if (mounted.current) setIsPurchasing(false);
        return;
      }

      const purchaseRequest = {
        request: {
          sku,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        },
      };
      if (isSub) purchaseRequest.type = 'subs';

      const result = await Promise.race([
        IAPModule.requestPurchase(purchaseRequest),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Purchase timeout')), 30000)
        )
      ]);

      if (result?.transactionReceipt || result?.transactionId) {
        await persistPro(result.transactionReceipt || result.transactionId);

        try {
          if (IAPModule && IAPModule.finishTransaction) {
            await IAPModule.finishTransaction({
              purchase: result,
              isConsumable: false,
            });
          }
        } catch (finishErr) {
          // finishTransaction failed — purchase is still recorded locally
        }
      }
    } catch (e) {
      const wasCancelled =
        e?.code === 'E_USER_CANCELLED' ||
        e?.code === 'user_cancelled' ||
        e?.userInfo?.code === 2 ||
        e?.message?.includes('timeout');

      if (!wasCancelled && e?.message !== 'Purchase timeout') {
        try {
          Alert.alert('Purchase failed', e?.message || 'Please try again.');
        } catch {}
      }
    } finally {
      if (mounted.current) setIsPurchasing(false);
    }
  }, [persistPro, selectedTier]);

  // ── Restore ────────────────────────────────────────────────────────────────
  const restore = useCallback(async () => {
    if (!IAPModule) {
      try {
        Alert.alert(
          'Unavailable',
          'In-app purchases are not available in this build.'
        );
      } catch {}
      return;
    }

    if (mounted.current) setIsRestoring(true);

    try {
      if (!IAPModule || !IAPModule.getAvailablePurchases) {
        if (mounted.current) setIsRestoring(false);
        return;
      }

      const purchases = await Promise.race([
        IAPModule.getAvailablePurchases(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Restore timeout')), 30000)
        )
      ]);

      // expo-iap uses 'id' not 'productId' — check lifetime + subs
      const hasPro = purchases?.some?.(p =>
        ALL_PRODUCT_IDS.includes(p?.id)
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
    purchase,
    restore,
  };
}
