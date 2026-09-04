/**
 * teamCrypto.js — end-to-end encryption for team packets.
 *
 * Design carried over from Red Grid Link, which used ECDH P-256 -> HKDF-SHA256
 * -> AES-256-GCM. Implemented here in pure JS via @noble so the app gains no
 * native crypto dependency and stays buildable with the existing pipeline.
 *
 * WIRE FORMAT
 *   [0xE7][12-byte IV][ciphertext || 16-byte GCM tag]
 *   The 0xE7 magic byte disambiguates a sealed frame from a plaintext team
 *   payload, which is JSON and therefore always starts with '{' (0x7B). That
 *   lets a receiver accept both during rollout without a version negotiation.
 *
 * THREAT MODEL / LIMITS — be honest about these:
 *   - Confidentiality + integrity of the payload between peers holding the key.
 *   - It does NOT hide metadata. Meshtastic still exposes sender node id, packet
 *     timing and size to anyone listening. Traffic analysis remains possible.
 *   - This module holds keys in memory only. The hook layer (useTeamKey) DOES
 *     persist the active team key to AsyncStorage so a team survives an app
 *     restart in the field; the cost is that a seized, unlocked device gives up
 *     the key and can decrypt captured traffic. Leaving the team wipes it.
 *   - Replay is NOT prevented here. Packets carry a sequence number (`n`) and
 *     the team layer is responsible for rejecting stale/duplicate sequences.
 *
 * RANDOMNESS
 *   The IV must never repeat under the same key — GCM fails catastrophically on
 *   nonce reuse. `randomBytes` is injectable so tests can be deterministic, and
 *   defaults to expo-crypto's CSPRNG on device.
 */
import { p256 } from '@noble/curves/nist.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** Frame marker. Plaintext team payloads are JSON, so they start with 0x7B. */
export const SEALED_MAGIC = 0xe7;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;

/** Fixed cost of sealing: magic + IV + GCM tag. Callers must budget for this. */
export const CRYPTO_OVERHEAD_BYTES = 1 + IV_BYTES + TAG_BYTES; // 29

/**
 * Domain separation for HKDF, so keys can never collide with another use.
 * Kept as bytes — @noble v2 validates every HKDF argument with `abytes` and
 * rejects a plain string.
 */
const HKDF_INFO = new TextEncoder().encode('redgrid/team/v1');

/**
 * CSPRNG. Injectable for tests. On device this resolves to expo-crypto, which
 * wraps the platform CSPRNG (SecRandomCopyBytes / SecureRandom).
 */
let randomBytesImpl = null;
export function setRandomBytesImpl(fn) { randomBytesImpl = fn; }

function randomBytes(n) {
  if (randomBytesImpl) return randomBytesImpl(n);
  // Lazy require so unit tests never need the native module present.
  // eslint-disable-next-line global-require
  const Crypto = require('expo-crypto');
  return Crypto.getRandomBytes(n);
}

/** Generate an ephemeral P-256 key pair for one session. */
export function generateKeyPair() {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Derive the shared 32-byte session key from our private key and a peer's
 * public key. HKDF is applied to the raw ECDH output — the x-coordinate is not
 * uniformly distributed and must never be used directly as a key.
 *
 * `salt` should be session-scoped (e.g. the session id from the QR code) so two
 * different sessions between the same peers derive different keys.
 */
export function deriveSharedKey(privateKey, peerPublicKey, salt) {
  const shared = p256.getSharedSecret(privateKey, peerPublicKey); // 33 bytes, compressed
  const ikm = shared.slice(1); // drop the parity byte, keep the 32-byte x-coord
  const saltBytes = normalizeSalt(salt);
  return hkdf(sha256, ikm, saltBytes, HKDF_INFO, KEY_BYTES);
}

function normalizeSalt(salt) {
  if (!salt) return new Uint8Array(0);
  if (salt instanceof Uint8Array) return salt;
  return new TextEncoder().encode(String(salt));
}

/**
 * Seal a payload. Returns [magic][iv][ct||tag], or null on bad input.
 * `iv` is injectable ONLY for test vectors; production must let it default so
 * every frame gets a fresh random nonce.
 */
export function seal(plaintext, key, iv = null) {
  try {
    if (!(plaintext instanceof Uint8Array) || !isValidKey(key)) return null;
    const nonce = iv || randomBytes(IV_BYTES);
    if (!(nonce instanceof Uint8Array) || nonce.length !== IV_BYTES) return null;
    const ct = gcm(key, nonce).encrypt(plaintext);
    const out = new Uint8Array(1 + IV_BYTES + ct.length);
    out[0] = SEALED_MAGIC;
    out.set(nonce, 1);
    out.set(ct, 1 + IV_BYTES);
    return out;
  } catch {
    return null;
  }
}

/**
 * Open a sealed frame. Returns the plaintext bytes, or null if the frame is
 * malformed, not ours, or fails authentication. Never throws — a hostile or
 * corrupted frame on a shared radio channel must not crash the app.
 */
export function open(sealed, key) {
  try {
    if (!(sealed instanceof Uint8Array) || !isValidKey(key)) return null;
    if (sealed.length < 1 + IV_BYTES + TAG_BYTES) return null;
    if (sealed[0] !== SEALED_MAGIC) return null;
    const nonce = sealed.slice(1, 1 + IV_BYTES);
    const ct = sealed.slice(1 + IV_BYTES);
    return gcm(key, nonce).decrypt(ct); // throws if the tag does not verify
  } catch {
    return null;
  }
}

/** Is this frame sealed (vs a plaintext JSON team payload)? */
export function isSealed(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 0 && bytes[0] === SEALED_MAGIC;
}

function isValidKey(key) {
  return key instanceof Uint8Array && key.length === KEY_BYTES;
}

// ─── QR pairing ──────────────────────────────────────────────────────────────
// The session key travels out-of-band via a QR code the team lead displays.
// That makes key exchange authenticated by physical proximity rather than
// trust-on-first-use, which is what lets us say "encrypted" without an asterisk.

const QR_PREFIX = 'redgrid://team?';

/** Build the QR string a team lead displays. */
export function buildPairingPayload({ sessionId, key }) {
  if (!sessionId || !isValidKey(key)) return null;
  return `${QR_PREFIX}s=${encodeURIComponent(String(sessionId))}&k=${bytesToBase64Url(key)}`;
}

/** Parse a scanned QR string. Returns { sessionId, key } or null. */
export function parsePairingPayload(text) {
  try {
    if (typeof text !== 'string') return null;
    // A hand-typed code arrives grouped and possibly wrapped across lines.
    // Whitespace is never significant in the payload, so strip it all first.
    const clean = text.replace(/\s+/g, '');
    if (!clean.startsWith(QR_PREFIX)) return null;
    // Hand-rolled query parse: React Native's URLSearchParams.get() throws
    // "not implemented" on device, so the WHATWG API cannot be used here.
    const params = {};
    for (const pair of clean.slice(QR_PREFIX.length).split('&')) {
      const eq = pair.indexOf('=');
      if (eq > 0) params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    }
    const sessionId = params.s;
    const keyRaw = params.k;
    if (!sessionId || !keyRaw) return null;
    const key = base64UrlToBytes(keyRaw);
    if (!isValidKey(key)) return null;
    return { sessionId, key };
  } catch {
    return null;
  }
}

/** Fresh random session key, for a lead starting a new team session. */
export function generateSessionKey() {
  return randomBytes(KEY_BYTES);
}

// ─── Active team key registry ────────────────────────────────────────────────
// The transport (meshtastic.js) needs the key on both the send and receive
// path, and two independent React trees (App's useTeamAwareness and the MESH
// screen's own useTeamKey) need to agree on it. Rather than thread it through
// props from the app root, the key lives here as module state with a change
// notification, and the hooks are thin views over it. Persistence is the
// hooks' job — this module never touches AsyncStorage.
//
// The key material stays in memory as bytes; only the hook layer serializes it.

let activeKey = null;        // Uint8Array | null
let activeSessionId = null;  // string | null
let keyListeners = [];

/** Install the team key. Pass a bad key and the registry is left untouched. */
export function setActiveTeamKey(key, sessionId = null) {
  if (!isValidKey(key)) return false;
  activeKey = key;
  activeSessionId = sessionId ? String(sessionId) : null;
  notifyKeyChange();
  return true;
}

/** Drop the team key. Subsequent sends go out in the clear again. */
export function clearActiveTeamKey() {
  activeKey = null;
  activeSessionId = null;
  notifyKeyChange();
}

/** Current key as { key, sessionId }, or null when the team is unkeyed. */
export function getActiveTeamKey() {
  if (!activeKey) return null;
  return { key: activeKey, sessionId: activeSessionId };
}

export function hasActiveTeamKey() {
  return activeKey !== null;
}

/** Subscribe to key changes. Returns an unsubscribe function. */
export function onTeamKeyChange(callback) {
  if (typeof callback !== 'function') return () => {};
  keyListeners.push(callback);
  return () => { keyListeners = keyListeners.filter(fn => fn !== callback); };
}

function notifyKeyChange() {
  const snapshot = getActiveTeamKey();
  keyListeners.forEach(fn => { try { fn(snapshot); } catch {} });
}

/**
 * Short human-comparable fingerprint of a key: SHA-256, first 4 bytes, hex,
 * grouped as two pairs. Two operators read it aloud to confirm they are on the
 * same key without either of them exposing the key itself.
 */
export function keyFingerprint(key) {
  if (!isValidKey(key)) return null;
  try {
    const digest = sha256(key);
    let hex = '';
    for (let i = 0; i < 4; i++) hex += digest[i].toString(16).padStart(2, '0').toUpperCase();
    return `${hex.slice(0, 4)} ${hex.slice(4)}`;
  } catch {
    return null;
  }
}

/**
 * Render a pairing payload as a grouped code that a person can read off one
 * screen and type into another without losing their place. Purely cosmetic —
 * parsePairingPayload strips the whitespace back out.
 */
export function formatPairingCode(payload, group = 6) {
  if (typeof payload !== 'string' || !payload) return '';
  const i = payload.indexOf('?');
  if (i === -1) return payload;
  const head = payload.slice(0, i + 1);
  const body = payload.slice(i + 1);
  const chunks = [];
  for (let p = 0; p < body.length; p += group) chunks.push(body.slice(p, p + group));
  return head + chunks.join(' ');
}

// ─── base64url (no padding) — small, dependency-free ─────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 0x3f];
  }
  return out;
}

export function base64UrlToBytes(str) {
  const clean = String(str).trim();
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v === -1) return new Uint8Array(0); // reject anything non-base64url
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}
