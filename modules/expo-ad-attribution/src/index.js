// Apple Search Ads attribution token client.
//
// Workflow on first launch:
//   1. getAttributionToken() — calls AAAttribution.attributionToken() (native).
//   2. exchangeToken(token)  — POSTs the token to Apple's adservices endpoint
//      to get the attribution payload {attribution, orgId, campaignId, ...}.
//   3. Persist payload in AsyncStorage so we can correlate paid installs to
//      subscription events later.
//
// Privacy model: the only network call is to Apple itself
// (https://api-adservices.apple.com), same provider as the App Store. No
// third-party tracking, no PII transmitted (token is opaque, device-scoped).
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Native = requireOptionalNativeModule('AdAttribution');
const STORAGE_KEY = 'rg_ad_attribution';
const ENDPOINT = 'https://api-adservices.apple.com/api/v1/';

export const ATTRIBUTION_AVAILABLE = !!Native;

export async function isAvailable() {
  if (!Native) return false;
  try { return await Native.isAvailable(); } catch { return false; }
}

/**
 * Fetch the on-device attribution token, exchange it with Apple's
 * adservices endpoint, and store the parsed attribution payload locally.
 *
 * Idempotent: if we already have a stored payload, return it without
 * re-calling Apple (the token is short-lived, so we only fetch once
 * shortly after install).
 *
 * Returns the attribution payload, or null if attribution is unavailable
 * (older iOS, Android, or non-attributed install).
 */
export async function fetchAndStoreAttribution() {
  if (!Native) return null;

  // Already fetched? Return cached.
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  let token;
  try {
    token = await Native.getAttributionToken();
  } catch (e) {
    // ATTRIBUTION_TOKEN_UNAVAILABLE on simulator or pre-14.3 device.
    return null;
  }
  if (!token) return null;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: token,
    });
    if (!res.ok) {
      // Apple returns 404 for non-attributed installs — that's normal,
      // most installs aren't from ads. Cache the negative result so we
      // don't keep re-asking.
      const negative = { attribution: false, fetchedAt: new Date().toISOString(), status: res.status };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(negative));
      return negative;
    }
    const payload = await res.json();
    const stored = { ...payload, fetchedAt: new Date().toISOString(), status: 200 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
  } catch (e) {
    // Network failure — don't cache, retry on next launch.
    return null;
  }
}

/** Read the cached attribution payload without making a network call. */
export async function getStoredAttribution() {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

/** Force a refresh — only useful for debugging. */
export async function clearStoredAttribution() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}
