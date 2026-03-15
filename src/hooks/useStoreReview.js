/**
 * useStoreReview — Time-based and usage-based App Store review prompt (HARDENED).
 *
 * Triggers native SKStoreReviewController / Play In-App Review when ALL conditions met:
 *   - App opened 5+ times
 *   - 7+ days since first install
 *   - 120+ days since last review request
 *
 * Apple/Google control actual display frequency. We gate on our side to be respectful.
 *
 * AsyncStorage keys:
 *   rg_app_opens         — cumulative app open count (int)
 *   rg_install_date      — epoch ms of first launch (string)
 *   rg_last_review_request — epoch ms of last review prompt (string)
 *
 * CRITICAL HARDENING:
 *   - All AsyncStorage calls guarded and error-swallowed
 *   - Never throws, never blocks UI
 *   - Mounted check prevents state updates after unmount
 */
import { useCallback, useRef, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_STORE_ID = '6759629554';

const KEYS = {
  APP_OPENS:          'rg_app_opens',
  INSTALL_DATE:       'rg_install_date',
  LAST_REVIEW_REQUEST: 'rg_last_review_request',
};

const MIN_OPENS = 5;
const MIN_DAYS_INSTALLED = 7;
const COOLDOWN_DAYS = 120;

const DAY_MS = 86400000;

export function useStoreReview() {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const checkAndPromptReview = useCallback(async () => {
    try {
      if (!AsyncStorage || !AsyncStorage.getItem) return;

      const now = Date.now();

      // ── Record install date on first ever launch ──
      let installDate = await AsyncStorage.getItem(KEYS.INSTALL_DATE);
      if (!installDate) {
        await AsyncStorage.setItem(KEYS.INSTALL_DATE, String(now));
        installDate = String(now);
      }

      // ── Increment app open count ──
      const rawOpens = await AsyncStorage.getItem(KEYS.APP_OPENS);
      const opens = (parseInt(rawOpens, 10) || 0) + 1;
      await AsyncStorage.setItem(KEYS.APP_OPENS, String(opens));

      // ── Gate: minimum opens ──
      if (opens < MIN_OPENS) return;

      // ── Gate: minimum days since install ──
      const installedAt = parseInt(installDate, 10) || now;
      if (now - installedAt < MIN_DAYS_INSTALLED * DAY_MS) return;

      // ── Gate: cooldown since last request ──
      const rawLast = await AsyncStorage.getItem(KEYS.LAST_REVIEW_REQUEST);
      if (rawLast) {
        const lastRequest = parseInt(rawLast, 10) || 0;
        if (now - lastRequest < COOLDOWN_DAYS * DAY_MS) return;
      }

      // ── All gates passed — request review ──
      if (!mounted.current) return;

      let StoreReview = null;
      try { StoreReview = require('expo-store-review'); } catch { return; }
      if (!StoreReview?.isAvailableAsync) return;

      const available = await StoreReview.isAvailableAsync();
      if (!available) return;

      await StoreReview.requestReview();
      await AsyncStorage.setItem(KEYS.LAST_REVIEW_REQUEST, String(now));
    } catch {
      // Silent — never interrupt the user experience for review tracking
    }
  }, []);

  /**
   * Opens the App Store review page directly — for a manual "Rate This App" button.
   * Uses the itms-apps:// deep link on iOS, Play Store link on Android.
   */
  const openStoreReview = useCallback(async () => {
    try {
      const url = Platform.OS === 'ios'
        ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
        : `market://details?id=com.redgrid.redgridtactical`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch {
      // Silent — don't disrupt the user
    }
  }, []);

  return { checkAndPromptReview, openStoreReview };
}
