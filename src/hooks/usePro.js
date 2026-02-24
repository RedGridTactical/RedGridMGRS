/**
 * usePro — React hook that wraps the full IAP purchase/restore lifecycle.
 *
 * Usage:
 *   const { pro, buying, restoring, buy, restore, error } = usePro();
 *
 * expo-iap must be installed:  npm install expo-iap
 * Add to app.json plugins:     "expo-iap"
 *
 * In Expo Go / dev builds, real payments are not processed.
 * Use an EAS internal distribution build for IAP testing.
 */
import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import { isPro, setPro, initPro, PRO_PRODUCT_ID } from '../utils/iap';

// Lazy-import expo-iap so the app still loads if the package isn't installed yet
let IAPModule = null;
try { IAPModule = require('expo-iap'); } catch {}

export function usePro() {
  const [pro,        setPro_]    = useState(false);
  const [buying,     setBuying]  = useState(false);
  const [restoring,  setRestoring] = useState(false);
  const [error,      setError]   = useState(null);
  const [price,      setPrice]   = useState('$4.99');

  // ── Init on mount ──
  useEffect(() => {
    initPro().then(p => setPro_(p));
  }, []);

  // ── Fetch product price from the store ──
  useEffect(() => {
    if (!IAPModule) return;
    IAPModule.getProducts([PRO_PRODUCT_ID])
      .then(products => {
        if (products?.[0]?.localizedPrice) {
          setPrice(products[0].localizedPrice);
        }
      })
      .catch(() => {});
  }, []);

  // ── Purchase ──
  const buy = useCallback(async () => {
    if (!IAPModule) {
      setError('IAP not available in this build.');
      return;
    }
    setBuying(true);
    setError(null);
    try {
      const purchase = await IAPModule.requestPurchase({ sku: PRO_PRODUCT_ID });
      if (purchase?.transactionReceipt) {
        await setPro(true, purchase.transactionReceipt);
        setPro_(true);
        // Finish the transaction (required on iOS)
        await IAPModule.finishTransaction({ purchase, isConsumable: false });
      }
    } catch (e) {
      if (e?.code !== 'E_USER_CANCELLED') {
        setError(e?.message || 'Purchase failed. Try again.');
      }
    } finally {
      setBuying(false);
    }
  }, []);

  // ── Restore ──
  const restore = useCallback(async () => {
    if (!IAPModule) {
      setError('IAP not available in this build.');
      return;
    }
    setRestoring(true);
    setError(null);
    try {
      const purchases = await IAPModule.getAvailablePurchases();
      const hasPro = purchases?.some(p => p.productId === PRO_PRODUCT_ID);
      if (hasPro) {
        await setPro(true, 'restored');
        setPro_(true);
        Alert.alert('Restored', 'RedGrid Pro has been restored.');
      } else {
        Alert.alert('Nothing to restore', 'No previous Pro purchase found on this account.');
      }
    } catch (e) {
      setError(e?.message || 'Restore failed. Try again.');
    } finally {
      setRestoring(false);
    }
  }, []);

  return { pro, buying, restoring, buy, restore, error, price };
}
