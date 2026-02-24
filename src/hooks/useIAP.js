/**
 * useIAP — IAP hook matching the App.js interface.
 * Returns: { isPro, isPurchasing, product, purchase, restore }
 *
 * Wraps expo-iap for cross-platform one-time purchase of redgrid_pro_lifetime.
 */
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY        = 'rg_pro_unlocked';
const PRO_RECEIPT_KEY = 'rg_pro_receipt';
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';

// Lazy-load expo-iap so the app still starts if not installed
let IAPModule = null;
try { IAPModule = require('expo-iap'); } catch {}

export function useIAP() {
  const [isPro,        setIsPro]        = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);
  const [product,      setProduct]      = useState(null);

  // ── Load persisted Pro status on mount ──
  useEffect(() => {
    AsyncStorage.getItem(PRO_KEY)
      .then(v => { if (v === 'true') setIsPro(true); })
      .catch(() => {});
  }, []);

  // ── Fetch product price from store ──
  useEffect(() => {
    if (!IAPModule) return;
    IAPModule.getProducts([PRO_PRODUCT_ID])
      .then(products => {
        if (products?.[0]) setProduct(products[0]);
      })
      .catch(() => {});
  }, []);

  // ── Persist Pro status ──
  const persistPro = useCallback(async (receipt = '') => {
    setIsPro(true);
    try {
      await AsyncStorage.setItem(PRO_KEY, 'true');
      if (receipt) await AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt);
    } catch {}
  }, []);

  // ── Purchase ──
  const purchase = useCallback(async () => {
    if (!IAPModule) {
      Alert.alert('Not available', 'In-app purchases are not available in this build.');
      return;
    }
    setIsPurchasing(true);
    try {
      const result = await IAPModule.requestPurchase({ sku: PRO_PRODUCT_ID });
      if (result?.transactionReceipt) {
        await persistPro(result.transactionReceipt);
        await IAPModule.finishTransaction({ purchase: result, isConsumable: false });
      }
    } catch (e) {
      if (e?.code !== 'E_USER_CANCELLED') {
        Alert.alert('Purchase failed', e?.message || 'Please try again.');
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [persistPro]);

  // ── Restore ──
  const restore = useCallback(async () => {
    if (!IAPModule) {
      Alert.alert('Not available', 'In-app purchases are not available in this build.');
      return;
    }
    setIsRestoring(true);
    try {
      const purchases = await IAPModule.getAvailablePurchases();
      const hasPro = purchases?.some(p => p.productId === PRO_PRODUCT_ID);
      if (hasPro) {
        await persistPro('restored');
        Alert.alert('Restored', 'RedGrid Pro has been restored.');
      } else {
        Alert.alert('Nothing to restore', 'No previous Pro purchase found on this account.');
      }
    } catch (e) {
      Alert.alert('Restore failed', e?.message || 'Please try again.');
    } finally {
      setIsRestoring(false);
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
