/**
 * useStoreReview — Time-based, usage-based, and positive-moment review prompts (HARDENED).
 *
 * Three entry points:
 *   1. checkAndPromptReview({ isPro })      — fires at app launch; gated by opens/days/cooldown.
 *                                             Pro users bypass the open/install-date gates
 *                                             (they've already demonstrated intent).
 *   2. promptReviewOnPositiveMoment({ isPro, trigger })
 *                                           — call from in-app positive moments
 *                                             (saved waypoint + name, route completed,
 *                                             report sent, etc.). Fires the Apple SKStore
 *                                             prompt if available; falls back to opening
 *                                             the write-review URL for a text review.
 *   3. openStoreReview()                    — manual "★ Rate App" button on the grid screen.
 *                                             Always opens the write-review URL directly so
 *                                             the user sees the text-review sheet (the fastest
 *                                             path to getting actual text reviews, not just
 *                                             1-5 star ratings).
 *
 * Tuning (April 2026):
 *   - Gates lowered from 5 opens / 7 days → 3 opens / 2 days.
 *     v3.3.2 only has 2 ratings / 0 text reviews after 5 days live. The prior gates were
 *     holding the prompt back past the point where most users churn.
 *   - Pro users short-circuit opens/days gates (they've converted, they like the product).
 *   - Cooldown stays at 120 days to respect Apple's 3x/year rate limit.
 *   - Positive-moment prompt deliberately uses the write-review URL on iOS because Apple's
 *     SKStoreReviewController only asks for a rating, not text, which is why 2 ratings
 *     landed but 0 text reviews did.
 *
 * AsyncStorage keys:
 *   rg_app_opens               — cumulative app open count (int)
 *   rg_install_date            — epoch ms of first launch (string)
 *   rg_last_review_request     — epoch ms of last native review prompt (string)
 *   rg_positive_moment_count   — cumulative count of tracked positive moments (int)
 *   rg_last_positive_prompt    — epoch ms of last positive-moment prompt (string)
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
  APP_OPENS:             'rg_app_opens',
  INSTALL_DATE:          'rg_install_date',
  LAST_REVIEW_REQUEST:   'rg_last_review_request',
  POSITIVE_MOMENTS:      'rg_positive_moment_count',
  LAST_POSITIVE_PROMPT:  'rg_last_positive_prompt',
};

const MIN_OPENS = 3;
const MIN_DAYS_INSTALLED = 2;
const COOLDOWN_DAYS = 120;

// Positive-moment prompt: after the Nth positive action, once every 90 days.
const MIN_POSITIVE_MOMENTS = 3;
const POSITIVE_COOLDOWN_DAYS = 90;

const DAY_MS = 86400000;

function writeReviewUrl() {
  return Platform.OS === 'ios'
    ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
    : `market://details?id=com.redgrid.redgridtactical`;
}

async function tryOpenWriteReview() {
  try {
    const url = writeReviewUrl();
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  } catch {
    // Silent — never disrupt the user
  }
}

export function useStoreReview() {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /**
   * Launch-time review prompt.
   * Pass { isPro: true } to short-circuit the open/install-date gates for paying users.
   */
  const checkAndPromptReview = useCallback(async (opts = {}) => {
    try {
      if (!AsyncStorage || !AsyncStorage.getItem) return;

      const isPro = !!opts.isPro;
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

      // ── Gates — Pro users bypass open/install-date checks ──
      if (!isPro) {
        if (opens < MIN_OPENS) return;

        const installedAt = parseInt(installDate, 10) || now;
        if (now - installedAt < MIN_DAYS_INSTALLED * DAY_MS) return;
      }

      // ── Cooldown since last request — always enforced ──
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
   * Call from positive in-app moments: saved waypoint with name, completed route,
   * exported GPX, sent SALUTE/MEDEVAC report, unlocked Pro, etc.
   *
   * Gated separately from the launch-time prompt so a positive moment can fire
   * a text-review ask even if the Apple 120-day rating cooldown is still active.
   *
   * Opens the write-review URL (not SKStoreReviewController) so the user lands
   * directly on the text-review sheet — fastest path to an actual text review.
   */
  const promptReviewOnPositiveMoment = useCallback(async (opts = {}) => {
    try {
      if (!AsyncStorage || !AsyncStorage.getItem) return;

      const now = Date.now();

      // ── Increment positive-moment counter ──
      const raw = await AsyncStorage.getItem(KEYS.POSITIVE_MOMENTS);
      const count = (parseInt(raw, 10) || 0) + 1;
      await AsyncStorage.setItem(KEYS.POSITIVE_MOMENTS, String(count));

      // ── Gate: minimum positive moments ──
      if (count < MIN_POSITIVE_MOMENTS) return;

      // ── Gate: positive-prompt cooldown ──
      const rawLast = await AsyncStorage.getItem(KEYS.LAST_POSITIVE_PROMPT);
      if (rawLast) {
        const lastPrompt = parseInt(rawLast, 10) || 0;
        if (now - lastPrompt < POSITIVE_COOLDOWN_DAYS * DAY_MS) return;
      }

      if (!mounted.current) return;

      // Record before opening so an in-flight retry doesn't double-prompt.
      await AsyncStorage.setItem(KEYS.LAST_POSITIVE_PROMPT, String(now));

      // Open the write-review sheet directly (text review, not star rating).
      await tryOpenWriteReview();
    } catch {
      // Silent — don't disrupt the user
    }
  }, []);

  /**
   * Manual "Rate This App" button — opens the App Store review page directly.
   */
  const openStoreReview = useCallback(async () => {
    await tryOpenWriteReview();
  }, []);

  return { checkAndPromptReview, promptReviewOnPositiveMoment, openStoreReview };
}
