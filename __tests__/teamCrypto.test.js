/**
 * teamCrypto.test.js — ECDH + AES-GCM sealing for team packets.
 * Pure JS, no radio and no native module required.
 */
import {
  SEALED_MAGIC, IV_BYTES, TAG_BYTES, KEY_BYTES, CRYPTO_OVERHEAD_BYTES,
  setRandomBytesImpl, generateKeyPair, deriveSharedKey,
  seal, open, isSealed, generateSessionKey,
  buildPairingPayload, parsePairingPayload,
  bytesToBase64Url, base64UrlToBytes,
} from '../src/utils/teamCrypto';
import {
  serializeTeamPayload, parseTeamPayload, encodeSosPacket, encodeIdentPacket, encodeMessagePacket,
  MAX_TEAM_PAYLOAD_BYTES, MAX_PLAINTEXT_PAYLOAD_BYTES, CRYPTO_RESERVE_BYTES,
} from '../src/utils/teamPackets';
import { MAX_FREE_TEXT } from '../src/utils/teamAwareness';

// Deterministic RNG so tests never depend on the native module or on luck.
let counter = 0;
beforeEach(() => {
  counter = 0;
  setRandomBytesImpl((n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (i * 7 + counter * 31 + 1) & 0xff;
    counter += 1;
    return out;
  });
});

const KEY = new Uint8Array(KEY_BYTES).fill(9);
const enc = (s) => new TextEncoder().encode(s);

describe('constants', () => {
  it('overhead is magic + IV + tag', () => {
    expect(CRYPTO_OVERHEAD_BYTES).toBe(1 + IV_BYTES + TAG_BYTES);
    expect(CRYPTO_OVERHEAD_BYTES).toBe(29);
  });

  it('the packet layer reserves exactly what sealing actually costs', () => {
    // These live in separate modules to keep the layering clean. If they ever
    // drift, frames pass fitsLoRaFrame and then overflow the radio once sealed,
    // which only shows up in the field.
    expect(CRYPTO_RESERVE_BYTES).toBe(CRYPTO_OVERHEAD_BYTES);
    expect(MAX_PLAINTEXT_PAYLOAD_BYTES).toBe(MAX_TEAM_PAYLOAD_BYTES - CRYPTO_OVERHEAD_BYTES);
  });
});

describe('every packet type still fits the radio frame once sealed', () => {
  const KEY2 = new Uint8Array(KEY_BYTES).fill(5);
  const cases = [
    ['sos', () => encodeSosPacket({ lat: -45.12345, lon: -179.12345, seq: 65535 })],
    ['ident', () => encodeIdentPacket({ name: 'LONGCALLSIGN12A', role: 'medic' })],
    ['message(max free text)', () => encodeMessagePacket({ type: 'f', text: 'X'.repeat(MAX_FREE_TEXT), seq: 65535 })],
    ['message(canned)', () => encodeMessagePacket({ type: 'y', seq: 65535 })],
  ];
  it.each(cases)('%s', (_name, build) => {
    const pkt = build();
    expect(pkt).toBeTruthy();
    const sealed = seal(serializeTeamPayload(pkt), KEY2);
    expect(sealed.length).toBeLessThanOrEqual(MAX_TEAM_PAYLOAD_BYTES);
  });

  it('a max-length message survives a real seal/open round trip', () => {
    const pkt = encodeMessagePacket({ type: 'f', text: 'A'.repeat(MAX_FREE_TEXT), seq: 1 });
    const sealed = seal(serializeTeamPayload(pkt), KEY2);
    expect(sealed.length).toBeLessThanOrEqual(MAX_TEAM_PAYLOAD_BYTES);
    expect(parseTeamPayload(open(sealed, KEY2)).d).toBe('A'.repeat(MAX_FREE_TEXT));
  });
});

describe('seal / open', () => {
  it('round-trips a payload', () => {
    const pt = enc('GRID 18SUJ2338308450');
    const sealed = seal(pt, KEY);
    expect(sealed).toBeInstanceOf(Uint8Array);
    expect(Array.from(open(sealed, KEY))).toEqual(Array.from(pt));
  });

  it('emits the magic byte so sealed frames are distinguishable from JSON', () => {
    const sealed = seal(enc('{"k":"s"}'), KEY);
    expect(sealed[0]).toBe(SEALED_MAGIC);
    expect(isSealed(sealed)).toBe(true);
    // A plaintext team payload is JSON and starts with '{' (0x7B), never 0xE7.
    const plain = serializeTeamPayload({ k: 's', n: 1 });
    expect(plain[0]).toBe(0x7b);
    expect(isSealed(plain)).toBe(false);
  });

  it('adds exactly the advertised overhead', () => {
    const pt = enc('x'.repeat(50));
    expect(seal(pt, KEY).length).toBe(pt.length + CRYPTO_OVERHEAD_BYTES);
  });

  it('uses a fresh IV per frame, so identical plaintext differs on the wire', () => {
    const pt = enc('same message');
    const a = seal(pt, KEY);
    const b = seal(pt, KEY);
    expect(Array.from(a)).not.toEqual(Array.from(b));       // nonce reuse would be catastrophic
    expect(Array.from(open(a, KEY))).toEqual(Array.from(pt));
    expect(Array.from(open(b, KEY))).toEqual(Array.from(pt));
  });

  it('rejects a wrong key', () => {
    const sealed = seal(enc('secret'), KEY);
    const wrong = new Uint8Array(KEY_BYTES).fill(8);
    expect(open(sealed, wrong)).toBeNull();
  });

  it('rejects a tampered ciphertext (GCM tag catches it)', () => {
    const sealed = seal(enc('authentic'), KEY);
    sealed[sealed.length - 1] ^= 0xff;            // flip a tag bit
    expect(open(sealed, KEY)).toBeNull();
  });

  it('rejects a tampered IV', () => {
    const sealed = seal(enc('authentic'), KEY);
    sealed[2] ^= 0xff;
    expect(open(sealed, KEY)).toBeNull();
  });

  it('never throws on hostile or truncated input', () => {
    expect(open(new Uint8Array([SEALED_MAGIC]), KEY)).toBeNull();
    expect(open(new Uint8Array(0), KEY)).toBeNull();
    expect(open(new Uint8Array([1, 2, 3, 4, 5]), KEY)).toBeNull();
    expect(open(null, KEY)).toBeNull();
    expect(open(seal(enc('x'), KEY), null)).toBeNull();
    // A plaintext JSON frame must be refused, not misparsed.
    expect(open(serializeTeamPayload({ k: 's' }), KEY)).toBeNull();
  });

  it('refuses a bad key length rather than silently truncating', () => {
    expect(seal(enc('x'), new Uint8Array(16))).toBeNull();
    expect(seal(enc('x'), new Uint8Array(0))).toBeNull();
  });
});

describe('ECDH key agreement', () => {
  it('both peers derive the same key', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const ka = deriveSharedKey(a.privateKey, b.publicKey, 'session-1');
    const kb = deriveSharedKey(b.privateKey, a.publicKey, 'session-1');
    expect(ka.length).toBe(KEY_BYTES);
    expect(Array.from(ka)).toEqual(Array.from(kb));
  });

  it('a third party deriving against the wrong peer gets a different key', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const c = generateKeyPair();
    const ab = deriveSharedKey(a.privateKey, b.publicKey, 's');
    const ac = deriveSharedKey(a.privateKey, c.publicKey, 's');
    expect(Array.from(ab)).not.toEqual(Array.from(ac));
  });

  it('different sessions between the same peers derive different keys', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const k1 = deriveSharedKey(a.privateKey, b.publicKey, 'session-1');
    const k2 = deriveSharedKey(a.privateKey, b.publicKey, 'session-2');
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });

  it('a derived key actually works for sealing', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const ka = deriveSharedKey(a.privateKey, b.publicKey, 'op');
    const kb = deriveSharedKey(b.privateKey, a.publicKey, 'op');
    const pt = serializeTeamPayload(encodeSosPacket({ lat: 34.05, lon: -118.24, seq: 3 }));
    const sealed = seal(pt, ka);
    const decoded = parseTeamPayload(open(sealed, kb));
    expect(decoded.k).toBe('s');
  });
});

describe('QR pairing', () => {
  it('round-trips a session key', () => {
    const key = generateSessionKey();
    const payload = buildPairingPayload({ sessionId: 'alpha-7', key });
    const parsed = parsePairingPayload(payload);
    expect(parsed.sessionId).toBe('alpha-7');
    expect(Array.from(parsed.key)).toEqual(Array.from(key));
  });

  it('a paired key decrypts real traffic', () => {
    const key = generateSessionKey();
    const parsed = parsePairingPayload(buildPairingPayload({ sessionId: 's1', key }));
    const pt = enc('rally point');
    expect(Array.from(open(seal(pt, key), parsed.key))).toEqual(Array.from(pt));
  });

  it('rejects junk, foreign schemes and corrupted keys', () => {
    expect(parsePairingPayload('')).toBeNull();
    expect(parsePairingPayload('https://evil.example/?s=a&k=b')).toBeNull();
    expect(parsePairingPayload('redgrid://team?s=a')).toBeNull();
    expect(parsePairingPayload('redgrid://team?s=a&k=tooshort')).toBeNull();
    expect(parsePairingPayload(null)).toBeNull();
  });

  it('handles session ids needing URL escaping', () => {
    const key = generateSessionKey();
    const id = 'alpha team/1 &2';
    expect(parsePairingPayload(buildPairingPayload({ sessionId: id, key })).sessionId).toBe(id);
  });
});

describe('base64url', () => {
  it('round-trips every byte value and all length remainders', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 31, 32, 33]) {
      const b = new Uint8Array(len);
      for (let i = 0; i < len; i++) b[i] = (i * 37) & 0xff;
      expect(Array.from(base64UrlToBytes(bytesToBase64Url(b)))).toEqual(Array.from(b));
    }
  });

  it('is URL-safe (no +, / or = in output)', () => {
    const b = new Uint8Array(64);
    for (let i = 0; i < 64; i++) b[i] = i * 4;
    expect(bytesToBase64Url(b)).not.toMatch(/[+/=]/);
  });

  it('rejects non-base64url input instead of returning garbage', () => {
    expect(base64UrlToBytes('!!!!').length).toBe(0);
  });
});
