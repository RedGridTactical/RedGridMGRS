/**
 * useIAP — Crash-safe IAP hook.
 * Returns: { isPro, isPurchasing, product, purchase, restore }
 *
 * Designed to never throw to the React root. All native module calls
 * are fully wrapped. If expo-iap is unavailable or StoreKit fails,
 * the app continues normally with isPro=false.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY         = 'rg_pro_unlocked';
const PRO_RECEIPT_KEY = 'rg_pro_receipt';
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';

// Safely require expo-iap — if it throws for any reason, IAPModule stays null
// and the app runs in free mode without crashing.
let IAPModule = null;
try {
  const mod = require('expo-iap');
  // Validate the module has the functions we need before trusting it
  if (mod && typeof mod.getProducts === 'function') {
    IAPModule = mod;
  }
} catch {
  // expo-iap not available — free mode only
}

export function useIAP() {
  const [isPro,        setIsPro]        = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);
  const [product,      setProduct]      = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── Load persisted Pro status ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(PRO_KEY);
        if (!cancelled && v === 'true') setIsPro(true);
      } catch {
        // AsyncStorage unavailable — stay free
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch product price from store (non-critical) ─────────────────────────
  useEffect(() => {
    if (!IAPModule) return;
    let cancelled = false;

    // Delay slightly to let the native bridge fully initialize
    const timer = setTimeout(async () => {
      try {
        const products = await IAPModule.getProducts([PRO_PRODUCT_ID]);
        if (!cancelled && products?.[0]) {
          setProduct(products[0]);
        }
      } catch {
        // Product fetch failed — ProGate will show fallback price $4.99
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // ── Persist Pro unlock ─────────────────────────────────────────────────────
  const persistPro = useCallback(async (receipt = '') => {
    if (mounted.current) setIsPro(true);
    try {
      await AsyncStorage.setItem(PRO_KEY, 'true');
      if (receipt) await AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt);
    } catch {
      // Storage failed — isPro is still true in memory for this session
    }
  }, []);

  // ── Purchase ───────────────────────────────────────────────────────────────
  const purchase = useCallback(async () => {
    if (!IAPModule) {
      Alert.alert(
        'Unavailable',
        'In-app purchases are not available in this build.'
      );
      return;
    }

    if (mounted.current) setIsPurchasing(true);
    try {
      const result = await IAPModule.requestPurchase({
        sku: PRO_PRODUCT_ID,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });

      if (result?.transactionReceipt || result?.transactionId) {
        await persistPro(result.transactionReceipt || result.transactionId);
        try {
          await IAPModule.finishTransaction({
            purchase: result,
            isConsumable: false,
          });
        } catch {
          // finishTransaction failed — purchase is still recorded locally
        }
      }
    } catch (e) {
      const cancelled =
        e?.code === 'E_USER_CANCELLED' ||
        e?.code === 'user_cancelled' ||
        e?.userInfo?.code === 2; // StoreKit user cancelled
      if (!cancelled) {
        Alert.alert('Purchase failed', e?.message || 'Please try again.');
      }
    } finally {
      if (mounted.current) setIsPurchasing(false);
    }
  }, [persistPro]);

  // ── Restore ────────────────────────────────────────────────────────────────
  const restore = useCallback(async () => {
    if (!IAPModule) {
      Alert.alert(
        'Unavailable',
        'In-app purchases are not available in this build.'
      );
      return;
    }

    if (mounted.current) setIsRestoring(true);
    try {
      const purchases = await IAPModule.getAvailablePurchases();
      const hasPro = purchases?.some?.(p =>
        p.productId === PRO_PRODUCT_ID || p.productId === 'redgrid_pro_lifetime'
      );
      if (hasPro) {
        await persistPro('restored');
        Alert.alert('Restored', 'RedGrid Pro has been restored.');
      } else {
        Alert.alert(
          'Nothing to restore',
          'No previous Pro purchase found on this account.'
        );
      }
    } catch (e) {
      Alert.alert('Restore failed', e?.message || 'Please try again.');
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
