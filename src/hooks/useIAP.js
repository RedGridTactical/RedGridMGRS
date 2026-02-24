/**
 * useIAP — In-App Purchase hook for RedGrid Pro.
 *
 * Wraps react-native-purchases (RevenueCat) for cross-platform IAP.
 * Falls back gracefully if not configured — free features always work.
 *
 * Pro features unlocked by a single one-time purchase: com.redgrid.redgridtactical.pro
 *   • Saved waypoint lists
 *   • Additional report templates (ICS 201, ANGUS, custom)
 *   • Display themes (NVG green, day white, blue-force)
 */
import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── PRODUCT ID ───────────────────────────────────────────────────────────────
// Must match exactly what you create in App Store Connect and Google Play Console
export const PRO_PRODUCT_ID = 'com.redgrid.redgridtactical.pro';

// ─── STORAGE KEY ─────────────────────────────────────────────────────────────
const PRO_KEY = 'rg_pro_unlocked';

// ─── REVENUECAT SDK ──────────────────────────────────────────────────────────
// RevenueCat handles all IAP complexity across iOS + Android.
// Install: npm install react-native-purchases
// Docs: https://docs.revenuecat.com/docs/react-native
let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch {
  // Not installed yet — IAP disabled, all features remain free during development
}

// Replace with your RevenueCat API keys (from revenuecat.com dashboard)
const RC_API_KEY_IOS     = 'appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const RC_API_KEY_ANDROID = 'goog_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export function useIAP() {
  const [isPro, setIsPro]           = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [product, setProduct]       = useState(null);

  // ── Init ──
  useEffect(() => {
    (async () => {
      // Check local cache first for instant response
      try {
        const cached = await AsyncStorage.getItem(PRO_KEY);
        if (cached === 'true') setIsPro(true);
      } catch {}

      if (!Purchases) {
        setIsLoading(false);
        return;
      }

      try {
        const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
        await Purchases.configure({ apiKey });

        // Check current entitlements
        const ci = await Purchases.getCustomerInfo();
        const proActive = !!ci.entitlements.active['pro'];
        setIsPro(proActive);
        await AsyncStorage.setItem(PRO_KEY, proActive ? 'true' : 'false');

        // Fetch product for price display
        const offerings = await Purchases.getOfferings();
        const pkg = offerings.current?.availablePackages?.find(
          p => p.product.identifier === PRO_PRODUCT_ID
        );
        if (pkg) setProduct(pkg.product);
      } catch (e) {
        console.warn('IAP init error:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Purchase ──
  const purchase = useCallback(async () => {
    if (!Purchases || isPurchasing) return;
    setIsPurchasing(true);
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages?.find(
        p => p.product.identifier === PRO_PRODUCT_ID
      );
      if (!pkg) {
        Alert.alert('Not Available', 'RedGrid Pro is not available in your region right now.');
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const proActive = !!customerInfo.entitlements.active['pro'];
      setIsPro(proActive);
      await AsyncStorage.setItem(PRO_KEY, proActive ? 'true' : 'false');
      if (proActive) {
        Alert.alert('RedGrid Pro', 'Pro features unlocked. Thank you for your support.');
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [isPurchasing]);

  // ── Restore ──
  const restore = useCallback(async () => {
    if (!Purchases) return;
    setIsPurchasing(true);
    try {
      const ci = await Purchases.restorePurchases();
      const proActive = !!ci.entitlements.active['pro'];
      setIsPro(proActive);
      await AsyncStorage.setItem(PRO_KEY, proActive ? 'true' : 'false');
      Alert.alert(
        proActive ? 'Restored' : 'Nothing to Restore',
        proActive ? 'RedGrid Pro has been restored.' : 'No previous Pro purchase found for this account.'
      );
    } catch {
      Alert.alert('Restore Failed', 'Could not restore purchases. Check your connection.');
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  return { isPro, isLoading, isPurchasing, product, purchase, restore };
}
