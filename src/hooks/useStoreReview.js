/**
 * useStoreReview — restrained store review requests.
 *
 *   recordLaunch()            — called once per app launch; only records local
 *                               usage (first-install date, open count). Never prompts.
 *   requestReviewIfEligible() — the ONE automatic path. Native in-app review
 *                               (expo-store-review) on both platforms, no external
 *                               URL fallback, one shared >= 120-day cooldown that
 *                               honours both legacy timestamps, equal usage gates
 *                               for Free and Pro, serialized in flight, and a
 *                               context re-check after every await. NOT CALLED by the
 *                               app yet: it may only be wired to an idle post-task site
 *                               once that site is proven to run after the dismissing
 *                               modal has fully gone, with no active navigation and no
 *                               other modal, on both platforms. It returns what it
 *                               did; the native request is an attempt, never proof
 *                               that a prompt was shown or that a review was submitted.
 *   openStoreReview()         — the manual "★ Rate This App" action: opens the store
 *                               write-review page. The caller keeps the Tactical
 *                               system-display guard.
 *
 * Fails closed: a malformed stored timestamp, a storage failure or a missing
 * native API means no automatic request.
 *
 * AsyncStorage keys (unchanged names so existing installs keep their history):
 *   rg_app_opens, rg_install_date, rg_last_review_request, rg_last_positive_prompt
 */
import { useCallback, useRef, useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_STORE_ID = '6759629554';

export const REVIEW_KEYS = Object.freeze({
  APP_OPENS: 'rg_app_opens',
  INSTALL_DATE: 'rg_install_date',
  LAST_REVIEW_REQUEST: 'rg_last_review_request',
  LAST_POSITIVE_PROMPT: 'rg_last_positive_prompt', // legacy; still honoured for the cooldown
});

export const REVIEW_GATES = Object.freeze({ minOpens: 3, minDaysInstalled: 2, cooldownDays: 120 });
const DAY_MS = 86400000;

function writeReviewUrl() {
  return Platform.OS === 'ios'
    ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
    : 'market://details?id=com.redgrid.redgridtactical';
}

/** Strict epoch-ms parse: anything that is not a finite non-negative integer string is malformed. */
export function parseTimestamp(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{1,16}$/.test(raw)) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

/**
 * Pure gate decision. `stored` holds raw AsyncStorage strings (or null).
 * Returns 'eligible' or the reason that blocks the request.
 */
export function evaluateReviewGates(stored, now) {
  const opens = parseTimestamp(stored.opens);
  const installedAt = parseTimestamp(stored.installDate);
  const lastRequest = parseTimestamp(stored.lastRequest);
  const lastPositive = parseTimestamp(stored.lastPositive);
  if ([opens, installedAt, lastRequest, lastPositive].some(Number.isNaN)) return 'malformed';
  if (opens == null || opens < REVIEW_GATES.minOpens) return 'opens';
  if (installedAt == null || now - installedAt < REVIEW_GATES.minDaysInstalled * DAY_MS) return 'install-age';
  const last = Math.max(lastRequest ?? 0, lastPositive ?? 0);
  if (last > 0 && now - last < REVIEW_GATES.cooldownDays * DAY_MS) return 'cooldown';
  return 'eligible';
}

async function loadStoreReview() {
  try { return require('expo-store-review'); } catch { return null; }
}

export function useStoreReview() {
  const mounted = useRef(true);
  const launchRecorded = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Record local usage once per launch. Never prompts. */
  const recordLaunch = useCallback(async () => {
    if (launchRecorded.current) return false;
    launchRecorded.current = true;
    try {
      if (!AsyncStorage?.getItem || !AsyncStorage?.setItem) return false;
      const now = Date.now();
      const installDate = parseTimestamp(await AsyncStorage.getItem(REVIEW_KEYS.INSTALL_DATE));
      if (installDate == null || Number.isNaN(installDate)) await AsyncStorage.setItem(REVIEW_KEYS.INSTALL_DATE, String(now));
      const rawOpens = parseTimestamp(await AsyncStorage.getItem(REVIEW_KEYS.APP_OPENS));
      const opens = (Number.isFinite(rawOpens) ? rawOpens : 0) + 1;
      await AsyncStorage.setItem(REVIEW_KEYS.APP_OPENS, String(opens));
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * @param {object} [opts]
   * @param {() => boolean} [opts.isContextStable] re-evaluated after every await; return false to cancel
   *        (Tactical display on, a different screen, a modal, etc.).
   * @returns {Promise<string>} 'attempted' | 'busy' | 'gated:<reason>' | 'unavailable' | 'context' | 'background' | 'storage' | 'unmounted'
   */
  const requestReviewIfEligible = useCallback(async (opts = {}) => {
    if (inFlight.current) return 'busy';
    inFlight.current = true;
    const stable = () => {
      if (!mounted.current) return 'unmounted';
      if (AppState.currentState !== 'active') return 'background';
      if (typeof opts.isContextStable === 'function' && !opts.isContextStable()) return 'context';
      return null;
    };
    try {
      if (!AsyncStorage?.getItem || !AsyncStorage?.setItem) return 'storage';
      let blocked = stable(); if (blocked) return blocked;
      const now = Date.now();
      let stored;
      try {
        const [opens, installDate, lastRequest, lastPositive] = await Promise.all([
          AsyncStorage.getItem(REVIEW_KEYS.APP_OPENS), AsyncStorage.getItem(REVIEW_KEYS.INSTALL_DATE),
          AsyncStorage.getItem(REVIEW_KEYS.LAST_REVIEW_REQUEST), AsyncStorage.getItem(REVIEW_KEYS.LAST_POSITIVE_PROMPT),
        ]);
        stored = { opens, installDate, lastRequest, lastPositive };
      } catch { return 'storage'; }
      const gate = evaluateReviewGates(stored, now);
      if (gate !== 'eligible') return `gated:${gate}`;
      blocked = stable(); if (blocked) return blocked;

      const StoreReview = await loadStoreReview();
      if (!StoreReview?.isAvailableAsync || !StoreReview?.requestReview) return 'unavailable';
      let available = false;
      try { available = await StoreReview.isAvailableAsync(); } catch { available = false; }
      if (!available) return 'unavailable';
      blocked = stable(); if (blocked) return blocked;

      // Record the attempt before asking so a crash or a second call cannot double-ask.
      try { await AsyncStorage.setItem(REVIEW_KEYS.LAST_REVIEW_REQUEST, String(now)); } catch { return 'storage'; }
      blocked = stable(); if (blocked) return blocked;
      try { await StoreReview.requestReview(); } catch { /* the platform decides; nothing to recover */ }
      return 'attempted';
    } catch {
      return 'storage';
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Manual "Rate This App": opens the store's write-review page. */
  const openStoreReview = useCallback(async () => {
    try {
      const url = writeReviewUrl();
      if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return true; }
    } catch {
      // Silent: never disrupt the user
    }
    return false;
  }, []);

  return { recordLaunch, requestReviewIfEligible, openStoreReview };
}
