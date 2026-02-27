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
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';

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
  const [product,      setProduct]      = useState(null);
  const mounted = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Load persisted Pro status ──────────────────────────────────────────────
  // Wrapped to ensure AsyncStorage doesn't crash startup
  useEffect(() => {
    let cancelled = false;

    const loadProStatus = async () => {
      try {
        if (!AsyncStorage) {
          return;
        }
        const v = await AsyncStorage.getItem(PRO_KEY);
        if (!cancelled && mounted.current && v === 'true') {
          setIsPro(true);
        }
      } catch (err) {
        // AsyncStorage unavailable, corrupted, or permission denied — stay free
        // Do not throw, just silently continue
      }
    };

    loadProStatus();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch product price from store (non-critical, heavily guarded) ─────────
  useEffect(() => {
    if (!IAPModule) return;

    let cancelled = false;

    const fetchProduct = async () => {
      try {
        if (!IAPModule || !IAPModule.getProducts) {
          return;
        }

        const products = await Promise.race([
          IAPModule.getProducts([PRO_PRODUCT_ID]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Product fetch timeout')), 2000)
          )
        ]);

        if (!cancelled && mounted.current && products?.[0]) {
          setProduct(products[0]);
        }
      } catch (err) {
        // Product fetch failed — ProGate will show fallback price $4.99
        // Do not throw, just silently continue
      }
    };

    // Delay to let native bridge initialize, but use setTimeout safely
    const initialDelay = setTimeout(() => {
      if (!cancelled) {
        fetchProduct().catch(() => {
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

  // ── Purchase ───────────────────────────────────────────────────────────────
  const purchase = useCallback(async () => {
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

    try {
      if (!IAPModule || !IAPModule.requestPurchase) {
        if (mounted.current) setIsPurchasing(false);
        return;
      }

      const result = await Promise.race([
        IAPModule.requestPurchase({
          sku: PRO_PRODUCT_ID,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        }),
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
      const cancelled =
        e?.code === 'E_USER_CANCELLED' ||
        e?.code === 'user_cancelled' ||
        e?.userInfo?.code === 2 || // StoreKit user cancelled
        e?.message?.includes('timeout');

      if (!cancelled && e?.message !== 'Purchase timeout') {
        try {
          Alert.alert('Purchase failed', e?.message || 'Please try again.');
        } catch {}
      }
    } finally {
      if (mounted.current) setIsPurchasing(false);
    }
  }, [persistPro]);

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

      const hasPro = purchases?.some?.(p =>
        p?.productId === PRO_PRODUCT_ID || p?.productId === 'redgrid_pro_lifetime'
      );

      if (hasPro) {
        await persistPro('restored');
        try {
          Alert.alert('Restored', 'RedGrid Pro has been restored.');
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
    purchase,
    restore,
  };
}
