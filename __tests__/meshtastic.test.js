/**
 * Test suite for src/utils/meshtastic.js
 * Tests Meshtastic protobuf position encoding/decoding.
 */

const { encodePosition, decodePosition } = require('../src/utils/meshtastic');

describe('meshtastic.js - Position Encoding/Decoding', () => {

  // ─── encodePosition ─────────────────────────────────────────────────
  describe('encodePosition(lat, lon, alt)', () => {

    test('returns a Uint8Array', () => {
      const result = encodePosition(38.8977, -77.0365, 15);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    test('encodes known coordinates to non-empty protobuf bytes', () => {
      const result = encodePosition(40.7128, -74.006, 10);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(4); // protobuf with real values
    });

    test('handles null altitude', () => {
      const result = encodePosition(40.7128, -74.006, null);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    test('encodes negative coordinates', () => {
      const result = encodePosition(-33.8688, 151.2093, 58);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── decodePosition ─────────────────────────────────────────────────
  describe('decodePosition(data)', () => {

    test('decodes an encoded position back correctly', () => {
      const encoded = encodePosition(38.8977, -77.0365, 15);
      const decoded = decodePosition(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBeCloseTo(38.8977, 4);
      expect(decoded.lon).toBeCloseTo(-77.0365, 4);
      expect(decoded.altitude).toBe(15); // integer meters in Meshtastic
      expect(typeof decoded.timestamp).toBe('number');
      expect(decoded.timestamp).toBeGreaterThan(0);
    });

    test('round-trips negative coordinates', () => {
      const encoded = encodePosition(-33.8688, 151.2093, 58);
      const decoded = decodePosition(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBeCloseTo(-33.8688, 4);
      expect(decoded.lon).toBeCloseTo(151.2093, 4);
      expect(decoded.altitude).toBe(58);
    });

    test('round-trips extreme coordinates', () => {
      // Near north pole
      const encoded1 = encodePosition(89.9999, 179.9999, 8848);
      const decoded1 = decodePosition(encoded1);
      expect(decoded1).not.toBeNull();
      expect(decoded1.lat).toBeCloseTo(89.9999, 3);
      expect(decoded1.lon).toBeCloseTo(179.9999, 3);
      expect(decoded1.altitude).toBe(8848);

      // Near south pole
      const encoded2 = encodePosition(-89.9999, -179.9999, 0);
      const decoded2 = decodePosition(encoded2);
      expect(decoded2).not.toBeNull();
      expect(decoded2.lat).toBeCloseTo(-89.9999, 3);
      expect(decoded2.lon).toBeCloseTo(-179.9999, 3);
    });

    test('returns null for too-short data', () => {
      expect(decodePosition(new Uint8Array(1))).toBeNull();
      expect(decodePosition(new Uint8Array(0))).toBeNull();
    });

    test('returns null for null/undefined input', () => {
      expect(decodePosition(null)).toBeNull();
      expect(decodePosition(undefined)).toBeNull();
    });

    test('accepts ArrayBuffer input', () => {
      const encoded = encodePosition(51.5074, -0.1278, 11);
      const decoded = decodePosition(encoded.buffer);
      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBeCloseTo(51.5074, 4);
    });

    test('timestamp is recent (within last minute)', () => {
      const encoded = encodePosition(38.8977, -77.0365, 15);
      const decoded = decodePosition(encoded);
      const now = Date.now();
      // Meshtastic timestamp is in seconds, decoded.timestamp is milliseconds
      expect(decoded.timestamp).toBeGreaterThan(now - 60000);
      expect(decoded.timestamp).toBeLessThanOrEqual(now + 1000);
    });
  });

  // ─── Precision ──────────────────────────────────────────────────────
  describe('encoding precision', () => {

    test('preserves sub-meter position accuracy', () => {
      const lat = 34.0522342;
      const lon = -118.2436849;
      const encoded = encodePosition(lat, lon, 72);
      const decoded = decodePosition(encoded);

      // ~1e-7 degrees is ~0.01m — well within tactical accuracy
      expect(Math.abs(decoded.lat - lat)).toBeLessThan(1e-6);
      expect(Math.abs(decoded.lon - lon)).toBeLessThan(1e-6);
      // Altitude is integer meters in Meshtastic protobuf
      expect(decoded.altitude).toBe(72);
    });
  });
});
