/**
 * teamPackets.test.js — LoRa wire codec for team traffic.
 * Frame-budget behaviour is the point: over-budget frames must never ship.
 */
import {
  PORTNUM_PRIVATE_APP, MAX_TEAM_PAYLOAD_BYTES, TEAM_PACKET,
  utf8ByteLength, fitsLoRaFrame,
  encodeSosPacket, encodeMessagePacket, encodeIdentPacket,
  decodeTeamPacket, serializeTeamPayload, parseTeamPayload,
} from '../src/utils/teamPackets';

describe('frame budget', () => {
  it('uses the private-app portnum so stock Meshtastic clients ignore us', () => {
    expect(PORTNUM_PRIVATE_APP).toBe(256);
  });

  it('measures UTF-8 length, not code units', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('日本語')).toBe(9);   // 3 bytes each
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength(null)).toBe(0);
  });

  it('rejects payloads past the budget', () => {
    expect(fitsLoRaFrame({ d: 'x'.repeat(10) })).toBe(true);
    expect(fitsLoRaFrame({ d: 'x'.repeat(MAX_TEAM_PAYLOAD_BYTES + 50) })).toBe(false);
  });
});

describe('SOS packets', () => {
  it('round-trips through the radio framing', () => {
    const p = encodeSosPacket({ lat: 34.12345678, lon: -118.87654321, seq: 4 });
    const bytes = serializeTeamPayload(p);
    const back = decodeTeamPacket(parseTeamPayload(bytes), 'node9');

    expect(back.kind).toBe(TEAM_PACKET.SOS);
    expect(back.nodeId).toBe('node9');
    expect(back.seq).toBe(4);
    expect(back.lat).toBeCloseTo(34.12346, 5);
    expect(back.cancel).toBe(false);
  });

  it('rounds coordinates to ~1 m to save bytes', () => {
    const p = encodeSosPacket({ lat: 34.123456789, lon: -118.987654321, seq: 1 });
    expect(String(p.a).split('.')[1].length).toBeLessThanOrEqual(5);
  });

  it('encodes a cancel', () => {
    const p = encodeSosPacket({ lat: 1, lon: 2, seq: 5, cancel: true });
    expect(decodeTeamPacket(p, 'n1').cancel).toBe(true);
  });

  it('refuses invalid coordinates', () => {
    expect(encodeSosPacket({ lat: NaN, lon: 2, seq: 1 })).toBeNull();
    expect(encodeSosPacket({ lat: 1, lon: undefined, seq: 1 })).toBeNull();
  });

  it('always fits a single frame', () => {
    expect(fitsLoRaFrame(encodeSosPacket({ lat: -89.99999, lon: -179.99999, seq: 999999 }))).toBe(true);
  });
});

describe('message packets', () => {
  it('round-trips a canned type', () => {
    const p = encodeMessagePacket({ type: 'r', seq: 2 });
    expect(decodeTeamPacket(p, 'n1')).toEqual({ kind: 'm', nodeId: 'n1', seq: 2, type: 'r' });
  });

  it('round-trips free text', () => {
    const p = encodeMessagePacket({ text: 'contact north ridge', seq: 3 });
    const back = decodeTeamPacket(p, 'n1');
    expect(back.type).toBe('f');
    expect(back.text).toBe('contact north ridge');
  });

  it('trims over-long free text down until it fits rather than dropping it', () => {
    const p = encodeMessagePacket({ text: 'y'.repeat(1000), seq: 1 });
    expect(p).not.toBeNull();
    expect(fitsLoRaFrame(p)).toBe(true);
    expect(p.d.length).toBeGreaterThan(0);
  });

  it('keeps multibyte text inside the BYTE budget, not the character budget', () => {
    const p = encodeMessagePacket({ text: '山'.repeat(300), seq: 1 });
    expect(p).not.toBeNull();
    expect(utf8ByteLength(JSON.stringify(p))).toBeLessThanOrEqual(MAX_TEAM_PAYLOAD_BYTES);
  });

  it('rejects empty text', () => {
    expect(encodeMessagePacket({ text: '   ', seq: 1 })).toBeNull();
  });
});

describe('ident packets', () => {
  it('round-trips callsign and role', () => {
    const p = encodeIdentPacket({ name: 'ALPHA-1', role: 'medic' });
    expect(decodeTeamPacket(p, 'n7')).toEqual({ kind: 'i', nodeId: 'n7', name: 'ALPHA-1', role: 'medic' });
  });

  it('caps the callsign', () => {
    const p = encodeIdentPacket({ name: 'A'.repeat(100), role: 'lead' });
    expect(p.c.length).toBeLessThanOrEqual(16);
  });

  it('rejects a blank callsign', () => {
    expect(encodeIdentPacket({ name: '  ', role: 'lead' })).toBeNull();
  });
});

describe('decode hardening', () => {
  it('takes nodeId from the mesh header, never the payload body', () => {
    // A peer claiming to be someone else inside the JSON must not win.
    const spoofed = { k: 's', n: 1, a: 1, o: 2, nodeId: 'victim' };
    expect(decodeTeamPacket(spoofed, 'real-sender').nodeId).toBe('real-sender');
  });

  it('returns null for anything that is not ours', () => {
    for (const junk of [null, undefined, 42, 'str', {}, { k: 'zzz' }, { n: 1 }]) {
      expect(decodeTeamPacket(junk, 'n1')).toBeNull();
    }
  });

  it('never throws on malformed bytes', () => {
    expect(parseTeamPayload(null)).toBeNull();
    expect(parseTeamPayload(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
    expect(parseTeamPayload(new Uint8Array([]))).toBeNull();
  });

  it('refuses to serialize an over-budget payload', () => {
    expect(serializeTeamPayload({ k: 'm', d: 'x'.repeat(5000) })).toBeNull();
    expect(serializeTeamPayload(null)).toBeNull();
  });
});
