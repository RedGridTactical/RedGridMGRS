/**
 * teamTransport.test.js — the crypto is actually on the wire.
 *
 * teamCrypto.js was complete and tested for several releases while nothing
 * imported it: every team packet went out in plaintext under a UI that said
 * "sealed end to end". Unit tests could not catch that, because each layer was
 * individually correct. These tests drive the real transport — the same
 * sendTeamPacket / FromRadio parse path the radio uses — and assert on the
 * bytes that leave the device.
 *
 * A fake BLE device stands in for the radio. Device A and device B are the same
 * module instance with the key swapped between them, which is what "B does not
 * have A's key" means in practice.
 */

// ─── Fake radio ──────────────────────────────────────────────────────────────
const mockWrites = [];        // base64 payloads written to TORADIO
let mockReadQueue = [];       // base64 frames the radio will hand back
let mockMonitorCb = null;     // the FromNum notification handler

const mockDevice = {
  id: 'dev-1',
  name: 'FakeMesh',
  discoverAllServicesAndCharacteristics: jest.fn(async () => {}),
  writeCharacteristicWithResponseForService: jest.fn(async (_s, _c, value) => { mockWrites.push(value); }),
  readCharacteristicForService: jest.fn(async () => {
    const value = mockReadQueue.shift();
    return value ? { value } : { value: null };
  }),
  monitorCharacteristicForService: jest.fn((_s, _c, cb) => {
    mockMonitorCb = cb;
    return { remove: () => {} };
  }),
  cancelConnection: jest.fn(async () => {}),
};

jest.mock('react-native-ble-plx', () => ({
  BleManager: function BleManager() {
    return {
      state: async () => 'PoweredOn',
      onStateChange: () => ({ remove: () => {} }),
      stopDeviceScan: () => {},
      startDeviceScan: () => {},
      connectToDevice: async () => mockDevice,
      onDeviceDisconnected: () => ({ remove: () => {} }),
      destroy: () => {},
    };
  },
}), { virtual: true });

// ─── Minimal protobuf reader, so the test reads the wire independently ───────
function readVarint(bytes, offset) {
  let result = 0, shift = 0, read = 0;
  while (offset + read < bytes.length) {
    const b = bytes[offset + read];
    result |= (b & 0x7f) << shift;
    read++;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, read };
}

function parseFields(bytes) {
  const out = [];
  let o = 0;
  while (o < bytes.length) {
    const tag = readVarint(bytes, o); o += tag.read;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 0) {
      const v = readVarint(bytes, o); o += v.read;
      out.push({ field, wire, value: v.value });
    } else if (wire === 2) {
      const len = readVarint(bytes, o); o += len.read;
      out.push({ field, wire, value: bytes.slice(o, o + len.value) });
      o += len.value;
    } else if (wire === 5) { o += 4; } else { break; }
  }
  return out;
}

function writeVarint(v) {
  const out = [];
  let n = v >>> 0;
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n & 0x7f);
  return out;
}

function lengthDelimited(field, bytes) {
  return [...writeVarint((field << 3) | 2), ...writeVarint(bytes.length), ...bytes];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toB64(bytes) {
  let r = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    r += B64[a >> 2];
    r += B64[((a & 3) << 4) | (b >> 4)];
    r += (i + 1 < bytes.length) ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    r += (i + 2 < bytes.length) ? B64[c & 63] : '=';
  }
  return r;
}

function fromB64(b64) {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor(s.length * 3 / 4));
  let p = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
    const c = B64.indexOf(s[i + 2]), d = B64.indexOf(s[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.slice(0, p);
}

/** Pull { portnum, payload } out of the last ToRadio the app wrote. */
function lastSentData() {
  const raw = fromB64(mockWrites[mockWrites.length - 1]);
  const toRadio = parseFields(raw);
  const packet = toRadio.find(f => f.field === 2 && f.wire === 2);
  if (!packet) return null;
  const mesh = parseFields(packet.value);
  const data = mesh.find(f => f.field === 3 && f.wire === 2);
  if (!data) return null;
  const fields = parseFields(data.value);
  const portnum = fields.find(f => f.field === 1 && f.wire === 0)?.value ?? 0;
  const payload = fields.find(f => f.field === 2 && f.wire === 2)?.value ?? null;
  return { portnum, payload };
}

/** Re-wrap a sent payload as if it arrived from `fromNode`, and deliver it. */
async function deliverAsFromRadio({ portnum, payload }, fromNode) {
  const data = [...writeVarint((1 << 3) | 0), ...writeVarint(portnum), ...lengthDelimited(2, [...payload])];
  const mesh = [...writeVarint((1 << 3) | 0), ...writeVarint(fromNode), ...lengthDelimited(3, data)];
  const fromRadio = new Uint8Array(lengthDelimited(7, mesh));
  mockReadQueue.push(toB64(fromRadio));
  await mockMonitorCb(null, {});
}

// ─── Suite ───────────────────────────────────────────────────────────────────
describe('team packets over the real transport', () => {
  let mesh, crypto, packets;

  const KEY_A = new Uint8Array(32).fill(0x11);
  const KEY_WRONG = new Uint8Array(32).fill(0x22);

  beforeEach(async () => {
    jest.resetModules();
    mockWrites.length = 0;
    mockReadQueue = [];
    mockMonitorCb = null;

    mesh = require('../src/utils/meshtastic');
    crypto = require('../src/utils/teamCrypto');
    packets = require('../src/utils/teamPackets');

    // Deterministic IVs — a real nonce is random, but a repeatable one makes
    // the byte assertions below stable.
    let n = 0;
    crypto.setRandomBytesImpl((len) => {
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i++) out[i] = (i + n) & 0xff;
      n++;
      return out;
    });

    await mesh.connectToDevice('dev-1');
    mockWrites.length = 0; // drop the startConfig handshake write
  });

  afterEach(async () => {
    await mesh.disconnect();
  });

  it('sends plaintext when no team key is set (mixed-fleet compatibility)', async () => {
    const pkt = packets.encodeSosPacket({ lat: 34.05, lon: -118.24, seq: 1 });
    expect(await mesh.sendTeamPacket(pkt)).toBe(true);

    const sent = lastSentData();
    expect(sent.portnum).toBe(packets.PORTNUM_PRIVATE_APP);
    expect(crypto.isSealed(sent.payload)).toBe(false);
    expect(sent.payload[0]).toBe(0x7b); // '{' — plain JSON on the air
  });

  it('seals every frame once a team key is installed', async () => {
    crypto.setActiveTeamKey(KEY_A, 'S1');
    const pkt = packets.encodeMessagePacket({ text: 'CONTACT NORTH RIDGE', seq: 2 });
    expect(await mesh.sendTeamPacket(pkt)).toBe(true);

    const sent = lastSentData();
    expect(crypto.isSealed(sent.payload)).toBe(true);
    expect(sent.payload[0]).toBe(crypto.SEALED_MAGIC);
    // The plaintext must not be recoverable from the frame.
    expect(new TextDecoder().decode(sent.payload)).not.toContain('CONTACT');
    expect(sent.payload.length).toBeLessThanOrEqual(packets.MAX_TEAM_PAYLOAD_BYTES);
  });

  it('A -> B round-trips a sealed packet when both hold the key', async () => {
    const received = [];
    const unsub = mesh.onTeamPacketReceived(p => received.push(p));

    crypto.setActiveTeamKey(KEY_A, 'S1');   // device A
    const pkt = packets.encodeSosPacket({ lat: 34.05223, lon: -118.24368, seq: 5 });
    await mesh.sendTeamPacket(pkt);
    const wire = lastSentData();
    expect(crypto.isSealed(wire.payload)).toBe(true);

    // device B — same key
    await deliverAsFromRadio(wire, 42);

    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe(packets.TEAM_PACKET.SOS);
    expect(received[0].nodeId).toBe(42);
    expect(received[0].encrypted).toBe(true);
    expect(received[0].lat).toBeCloseTo(34.05223, 5);
    unsub();
  });

  it('B without the key drops the sealed packet and counts it', async () => {
    const received = [];
    const unsub = mesh.onTeamPacketReceived(p => received.push(p));

    crypto.setActiveTeamKey(KEY_A, 'S1');
    await mesh.sendTeamPacket(packets.encodeSosPacket({ lat: 1, lon: 2, seq: 1 }));
    const wire = lastSentData();

    // B has no key at all.
    crypto.clearActiveTeamKey();
    mesh.resetSealedCounters();
    await deliverAsFromRadio(wire, 42);
    expect(received).toHaveLength(0);
    expect(mesh.getSealedUndecryptableCount()).toBe(1);

    // B has the WRONG key — indistinguishable from noise, same outcome.
    crypto.setActiveTeamKey(KEY_WRONG, 'S2');
    await deliverAsFromRadio(wire, 42);
    expect(received).toHaveLength(0);
    expect(mesh.getSealedUndecryptableCount()).toBe(2);
    unsub();
  });

  it('an unkeyed sender is still heard, and is tagged as unencrypted', async () => {
    const received = [];
    const unsub = mesh.onTeamPacketReceived(p => received.push(p));

    // A sends in the clear.
    await mesh.sendTeamPacket(packets.encodeIdentPacket({ name: 'ALPHA-1', role: 'medic' }));
    const wire = lastSentData();

    // B is keyed, but a plaintext frame is not sealed, so it is not dropped.
    crypto.setActiveTeamKey(KEY_A, 'S1');
    await deliverAsFromRadio(wire, 7);

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('ALPHA-1');
    expect(received[0].encrypted).toBe(false);
    unsub();
  });

  it('never emits a frame over the LoRa budget, sealed or not', async () => {
    const long = 'CONTACT '.repeat(80);
    for (const keyed of [false, true]) {
      mockWrites.length = 0;
      if (keyed) crypto.setActiveTeamKey(KEY_A, 'S1'); else crypto.clearActiveTeamKey();
      const pkt = packets.encodeMessagePacket({ text: long, seq: 9 });
      expect(await mesh.sendTeamPacket(pkt)).toBe(true);
      const sent = lastSentData();
      expect(sent.payload.length).toBeLessThanOrEqual(packets.MAX_TEAM_PAYLOAD_BYTES);
      if (keyed) {
        expect(sent.payload.length)
          .toBe(packets.serializeTeamPayload(pkt).length + packets.CRYPTO_RESERVE_BYTES);
      }
    }
  });

  it('refuses a payload that cannot fit even before sealing', async () => {
    // Hand-built payload that skips the encoders' shrink-to-fit loop.
    const oversize = { k: 'm', n: 1, t: 'f', d: 'X'.repeat(packets.MAX_PLAINTEXT_PAYLOAD_BYTES) };
    crypto.setActiveTeamKey(KEY_A, 'S1');
    mockWrites.length = 0;
    expect(await mesh.sendTeamPacket(oversize)).toBe(false);
    expect(mockWrites).toHaveLength(0);
  });
});

describe('pairing payload survives the join flow', () => {
  const crypto = require('../src/utils/teamCrypto');

  it('round-trips a created key through a displayed, grouped, retyped code', () => {
    crypto.setRandomBytesImpl((n) => new Uint8Array(n).map((_, i) => (i * 5 + 3) & 0xff));
    const key = crypto.generateSessionKey();
    const payload = crypto.buildPairingPayload({ sessionId: 'TEAM7', key });

    // What the joining operator actually reads off the screen.
    const displayed = crypto.formatPairingCode(payload);
    expect(displayed).toContain(' ');

    // ...and types back in, complete with a stray line break.
    const parsed = crypto.parsePairingPayload(`${displayed}\n`);
    expect(parsed).not.toBeNull();
    expect(parsed.sessionId).toBe('TEAM7');
    expect(Array.from(parsed.key)).toEqual(Array.from(key));

    // The key installs and produces a matching fingerprint on both devices.
    expect(crypto.setActiveTeamKey(parsed.key, parsed.sessionId)).toBe(true);
    expect(crypto.keyFingerprint(parsed.key)).toBe(crypto.keyFingerprint(key));
    expect(crypto.hasActiveTeamKey()).toBe(true);

    crypto.clearActiveTeamKey();
    expect(crypto.hasActiveTeamKey()).toBe(false);
  });

  it('rejects a mistyped or truncated code without installing anything', () => {
    for (const bad of ['', 'nonsense', 'redgrid://team?s=A', 'redgrid://team?s=A&k=short']) {
      expect(crypto.parsePairingPayload(bad)).toBeNull();
    }
    expect(crypto.hasActiveTeamKey()).toBe(false);
  });

  it('notifies subscribers when the key changes', () => {
    const seen = [];
    const unsub = crypto.onTeamKeyChange(s => seen.push(s));
    crypto.setActiveTeamKey(new Uint8Array(32).fill(3), 'S9');
    crypto.clearActiveTeamKey();
    unsub();
    crypto.setActiveTeamKey(new Uint8Array(32).fill(4), 'S10');
    crypto.clearActiveTeamKey();
    expect(seen).toHaveLength(2);
    expect(seen[0].sessionId).toBe('S9');
    expect(seen[1]).toBeNull();
  });
});
