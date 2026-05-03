/**
 * referral.js — Zero-network share-to-unlock Pro trial.
 *
 * Rules (product spec, enforced here + in UI):
 *   - Every device can RECEIVE one trial, exactly once, ever.
 *   - Every device can SHARE one trial (one link that successfully redeems), exactly once, ever.
 *   - These are two independent one-shot permissions.
 *   - Receiver gets a 30-day Pro grant when TRIAL_ENTITLEMENT_GRANTED is true.
 *     Sender gets no reward — sharing is altruistic.
 *   - Zero network: all token signing/validation happens locally via HMAC-SHA256.
 *
 * Storage keys:
 *   rg_trial_received_v1  — 'true' after device redeems an inbound trial
 *   rg_trial_shared_v1    — 'true' after device generates its one shareable trial
 *   rg_trial_expires_v1   — ISO timestamp of current trial expiry (may be in the past)
 *   rg_trial_nonce_v1     — random per-install device salt (for token uniqueness)
 *
 * Token format (base64url-encoded):
 *   payload  = JSON { v: 1, iat: <iso>, exp: <iso>, src: <8-char salt> }
 *   sig      = first 16 bytes of HMAC-SHA256(SHARED_SECRET, payload_json_bytes), base64url
 *   token    = "RG1." + base64url(payload) + "." + sig
 *
 * SECURITY MODEL — short version: this is a marketing mechanic, not a secure
 * entitlement. The shared secret is embedded in the client and extractable
 * by anyone who reverse-engineers the binary. The HMAC stops casual forgery
 * ("type a string and get Pro") but not a determined attacker. Three
 * harm-reduction levers:
 *
 *   1. TRIAL_ENTITLEMENT_GRANTED below — if false, redemption succeeds (so the
 *      link still opens the share-this experience and shows confirmation)
 *      but Pro is NOT granted. The flag is the kill switch we ship if abuse
 *      is observed in the wild — flip it off in a point release rather than
 *      taking down the marketing flow.
 *   2. TOKEN_MAX_AGE_DAYS — links expire after this window so leaked tokens
 *      don't circulate indefinitely.
 *   3. One-shot per device — RECEIVED and SHARED keys cap to one of each per
 *      AsyncStorage instance. Reinstalling resets, but that's a deliberate
 *      attack barrier (lost data) rather than a free farming path.
 *
 * ROADMAP — replace this with a real entitlement system once supported:
 *   - iOS: Apple StoreKit offer codes (presentCodeRedemptionSheet) for the
 *     Red Grid Pro Monthly subscription. Offers are managed in App Store
 *     Connect and validated server-side by Apple.
 *   - Android: Google Play promotional codes generated in Play Console.
 *   - Migration: stop calling redeemShareToken when the flag is off, and
 *     instead present the platform redemption sheet pre-filled with a code
 *     embedded in the share link.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

const KEYS = {
  RECEIVED: 'rg_trial_received_v1',
  SHARED:   'rg_trial_shared_v1',
  EXPIRES:  'rg_trial_expires_v1',
  NONCE:    'rg_trial_nonce_v1',
};

// Hardcoded shared secret. Rotated per app version when needed.
// Length > 32 bytes so HMAC has enough entropy.
const SHARED_SECRET = 'rg-mgrs-trial-v1-7f3e2c9d4a1b8e5f6c0d';

// Kill switch — when false, valid tokens are still recognized but no Pro
// grant is written. UI should treat redemption as "thanks for installing"
// (acquisition value) without granting the entitlement (security harm).
// Flip to false in a point release if abuse is observed in the wild.
export const TRIAL_ENTITLEMENT_GRANTED = true;

// Trial length in days. Only meaningful when TRIAL_ENTITLEMENT_GRANTED is true.
const TRIAL_DAYS = 30;

// Token freshness window — links older than this cannot be redeemed. Reduced
// from 90 to 14 days so a leaked link has a tighter blast radius. Existing
// tokens minted before this change are unaffected because exp is baked in
// at mint time.
const TOKEN_MAX_AGE_DAYS = 14;

// ──────────────────────────────────────────────────────────────────────────
// Base64URL (no padding) — tokens have to survive URL encoding.
// ──────────────────────────────────────────────────────────────────────────
function b64urlEncodeBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return (typeof btoa === 'function' ? btoa(bin) : globalThis.btoa(bin))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = (typeof atob === 'function' ? atob(padded) : globalThis.atob(padded));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlEncodeString(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  // Handle multi-byte UTF-8 safely
  const utf8 = new TextEncoder().encode(str);
  return b64urlEncodeBytes(utf8);
}

function b64urlDecodeString(str) {
  const bytes = b64urlDecodeBytes(str);
  return new TextDecoder().decode(bytes);
}

// ──────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 (pure JS) — avoids adding a crypto native module dep.
// Standard FIPS 198 implementation. Input: key bytes + message bytes.
// ──────────────────────────────────────────────────────────────────────────
function sha256(bytes) {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l = bytes.length;
  const withLen = l + 9;
  const padded = new Uint8Array(Math.ceil(withLen / 64) * 64);
  padded.set(bytes);
  padded[l] = 0x80;
  const bitLen = l * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen & 0xffffffff, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  const w = new Uint32Array(64);
  const ror = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i-15], 7) ^ ror(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = ror(w[i-2], 17) ^ ror(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]+a) >>> 0; H[1] = (H[1]+b) >>> 0; H[2] = (H[2]+c) >>> 0; H[3] = (H[3]+d) >>> 0;
    H[4] = (H[4]+e) >>> 0; H[5] = (H[5]+f) >>> 0; H[6] = (H[6]+g) >>> 0; H[7] = (H[7]+h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
  return out;
}

function hmacSha256(keyStr, msgBytes) {
  const blockSize = 64;
  const keyBytes = new TextEncoder().encode(keyStr);
  let key = keyBytes;
  if (key.length > blockSize) key = sha256(key);
  if (key.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(key);
    key = padded;
  }
  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = key[i] ^ 0x5c;
    iKeyPad[i] = key[i] ^ 0x36;
  }
  const inner = new Uint8Array(iKeyPad.length + msgBytes.length);
  inner.set(iKeyPad); inner.set(msgBytes, iKeyPad.length);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(oKeyPad.length + innerHash.length);
  outer.set(oKeyPad); outer.set(innerHash, oKeyPad.length);
  return sha256(outer);
}

// ──────────────────────────────────────────────────────────────────────────
// Device nonce — per-install random salt baked into every token from this
// device. Makes tokens from the same device unique enough for debugging.
// ──────────────────────────────────────────────────────────────────────────
async function getDeviceNonce() {
  try {
    let nonce = await AsyncStorage.getItem(KEYS.NONCE);
    if (nonce && nonce.length === 8) return nonce;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    nonce = '';
    for (let i = 0; i < 8; i++) nonce += chars[Math.floor(Math.random() * chars.length)];
    await AsyncStorage.setItem(KEYS.NONCE, nonce);
    return nonce;
  } catch {
    return 'anonymou';
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Token mint + verify
// ──────────────────────────────────────────────────────────────────────────
export async function mintShareToken() {
  const nonce = await getDeviceNonce();
  const now = new Date();
  const exp = new Date(now.getTime() + TOKEN_MAX_AGE_DAYS * 86400 * 1000);
  const payload = { v: 1, iat: now.toISOString(), exp: exp.toISOString(), src: nonce };
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64 = b64urlEncodeBytes(payloadBytes);
  const sigBytes = hmacSha256(SHARED_SECRET, payloadBytes);
  const sigB64 = b64urlEncodeBytes(sigBytes.slice(0, 16));
  return `RG1.${payloadB64}.${sigB64}`;
}

export function verifyShareToken(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith('RG1.')) {
      return { ok: false, reason: 'format' };
    }
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'format' };
    const [, payloadB64, sigB64] = parts;
    const payloadBytes = b64urlDecodeBytes(payloadB64);
    const expectedSigBytes = hmacSha256(SHARED_SECRET, payloadBytes).slice(0, 16);
    const expectedB64 = b64urlEncodeBytes(expectedSigBytes);
    // Constant-time compare not meaningful in JS; still check exact.
    if (expectedB64 !== sigB64) return { ok: false, reason: 'signature' };
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson);
    if (payload.v !== 1) return { ok: false, reason: 'version' };
    const now = Date.now();
    if (new Date(payload.exp).getTime() < now) return { ok: false, reason: 'expired' };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Receive side: user tapped someone's link or redeemed a code
// ──────────────────────────────────────────────────────────────────────────
export async function hasReceivedTrial() {
  try { return (await AsyncStorage.getItem(KEYS.RECEIVED)) === 'true'; } catch { return false; }
}

/**
 * Attempt to redeem an inbound share token.
 *
 * Returns:
 *   - { ok: true, expiresAt } when entitlement is granted (legacy mode).
 *   - { ok: true, granted: false, reason: 'disabled' } when the kill switch
 *     is off — token is valid but no Pro is given. UI should treat this as
 *     a successful install/acquisition signal without unlocking features.
 *   - { ok: false, reason } on rejection.
 */
export async function redeemShareToken(token) {
  if (await hasReceivedTrial()) {
    return { ok: false, reason: 'already_received' };
  }
  const verify = verifyShareToken(token);
  if (!verify.ok) return verify;

  // Kill switch path — record the redemption so the user can't try again,
  // but do NOT grant the entitlement. See TRIAL_ENTITLEMENT_GRANTED for
  // rationale. UI should display a friendly "thanks for installing" rather
  // than a Pro-unlocked celebration.
  if (!TRIAL_ENTITLEMENT_GRANTED) {
    try { await AsyncStorage.setItem(KEYS.RECEIVED, 'true'); } catch {}
    return { ok: true, granted: false, reason: 'disabled' };
  }

  const trialExpires = new Date(Date.now() + TRIAL_DAYS * 86400 * 1000).toISOString();
  try {
    await AsyncStorage.setItem(KEYS.RECEIVED, 'true');
    await AsyncStorage.setItem(KEYS.EXPIRES, trialExpires);
  } catch {}
  return { ok: true, granted: true, expiresAt: trialExpires };
}

// ──────────────────────────────────────────────────────────────────────────
// Share side: user wants to mint a link for a friend
// ──────────────────────────────────────────────────────────────────────────
export async function hasSharedTrial() {
  try { return (await AsyncStorage.getItem(KEYS.SHARED)) === 'true'; } catch { return false; }
}

/**
 * Mint the device's one-and-only shareable link.
 * Returns { ok: true, url } or { ok: false, reason: 'already_shared' }.
 * Marks the device as having shared — call only when the user is actually
 * about to hit the share sheet.
 */
export async function mintShareLink() {
  if (await hasSharedTrial()) {
    return { ok: false, reason: 'already_shared' };
  }
  const token = await mintShareToken();
  try { await AsyncStorage.setItem(KEYS.SHARED, 'true'); } catch {}
  // iOS universal link fallback: https://redgridtactical.com/trial#<token>
  // Deep link (preferred if app installed): redgrid://share/<token>
  const url = `https://redgridtactical.com/trial#${token}`;
  return { ok: true, url, token };
}

// ──────────────────────────────────────────────────────────────────────────
// Trial status for UI
// ──────────────────────────────────────────────────────────────────────────
export async function getTrialStatus() {
  try {
    const [receivedStr, expiresStr] = await Promise.all([
      AsyncStorage.getItem(KEYS.RECEIVED),
      AsyncStorage.getItem(KEYS.EXPIRES),
    ]);
    const received = receivedStr === 'true';
    if (!received || !expiresStr) return { active: false, received, expiresAt: null, daysLeft: 0 };
    const expiresMs = new Date(expiresStr).getTime();
    const msLeft = expiresMs - Date.now();
    const active = msLeft > 0;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
    return { active, received, expiresAt: expiresStr, daysLeft };
  } catch {
    return { active: false, received: false, expiresAt: null, daysLeft: 0 };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Extract token from a deep link / universal link URL
// ──────────────────────────────────────────────────────────────────────────
export function extractTokenFromUrl(url) {
  if (typeof url !== 'string') return null;
  // redgrid://share/<token>
  const deepMatch = url.match(/^redgrid:\/\/share\/([A-Za-z0-9._-]+)$/);
  if (deepMatch) return deepMatch[1];
  // https://redgridtactical.com/trial#<token>
  const hashIdx = url.indexOf('#');
  if (hashIdx >= 0 && /^https?:\/\/[^/]*redgridtactical\.com\/trial/.test(url)) {
    return url.slice(hashIdx + 1);
  }
  return null;
}
