/**
 * iap.js — In-App Purchase layer for RedGrid Tactical Pro.
 *
 * Uses expo-iap (wraps Apple StoreKit + Google Play Billing).
 * Single product: 'redgrid_pro_lifetime' — one-time purchase, no subscription.
 *
 * Pro features unlocked:
 *   - Saved waypoint lists (up to 10 named lists, 20 waypoints each)
 *   - Additional report templates (ICS 201, CASEVAC, custom)
 *   - Alternate coordinate formats (UTM, decimal degrees, DMS)
 *   - Extra display themes (NVG green, day white, night blue)
 *
 * Restore purchases is always available — required by both app stores.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── PRODUCT ID ─────────────────────────────────────────────────────────────
// Must match EXACTLY what you create in App Store Connect + Google Play Console
export const PRO_PRODUCT_ID = 'redgrid_pro_lifetime';
const PRO_STORAGE_KEY       = 'rg_pro_unlocked';
const PRO_RECEIPT_KEY        = 'rg_pro_receipt';

// ─── MOCK MODE ───────────────────────────────────────────────────────────────
// Set true during development to bypass real payment flow.
// MUST be false in any production build.
const MOCK_MODE = __DEV__;

// ─── STATE ───────────────────────────────────────────────────────────────────
let _isPro = false;
let _listeners = [];

export function addProListener(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function notifyListeners() {
  _listeners.forEach(fn => fn(_isPro));
}

// ─── INIT ────────────────────────────────────────────────────────────────────
/**
 * Call once at app startup. Loads persisted Pro status from storage.
 * Returns true if the user already owns Pro.
 */
export async function initPro() {
  try {
    const stored = await AsyncStorage.getItem(PRO_STORAGE_KEY);
    _isPro = stored === 'true';
  } catch {
    _isPro = false;
  }
  notifyListeners();
  return _isPro;
}

export function isPro() {
  return MOCK_MODE ? false : _isPro; // In dev: always show paywall so you can test it
}

// ─── PURCHASE ────────────────────────────────────────────────────────────────
/**
 * Initiate the Pro purchase flow.
 * Returns { success, error }
 *
 * In production this calls expo-iap's requestPurchase().
 * The actual expo-iap wiring belongs in a native build — this module
 * provides the interface; the hook below manages the lifecycle.
 */
export async function purchasePro() {
  if (MOCK_MODE) {
    await setPro(true, 'mock_receipt');
    return { success: true };
  }
  // Real purchase is triggered by useProPurchase hook — see usePro.js
  return { success: false, error: 'Call purchasePro only via useProPurchase hook' };
}

/**
 * Mark the user as Pro after a validated purchase.
 * Called by the purchase hook after server/StoreKit validation.
 */
export async function setPro(value, receipt = '') {
  _isPro = value;
  try {
    await AsyncStorage.setItem(PRO_STORAGE_KEY, String(value));
    if (receipt) await AsyncStorage.setItem(PRO_RECEIPT_KEY, receipt);
  } catch {}
  notifyListeners();
}

// ─── RESTORE ─────────────────────────────────────────────────────────────────
/**
 * Restore previous purchases. Required by App Store guidelines.
 * In production: calls expo-iap getAvailablePurchases().
 * Returns { success, restored }
 */
export async function restorePro() {
  if (MOCK_MODE) {
    return { success: true, restored: false };
  }
  // Wired in usePro.js hook
  return { success: false, restored: false };
}
