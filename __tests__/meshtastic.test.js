/**
 * Test suite for src/utils/meshtastic.js
 * Tests position encoding/decoding for Meshtastic mesh radio integration.
 */

const { encodePosition, decodePosition } = require('../src/utils/meshtastic');

describe('meshtastic.js - Position Encoding/Decoding', () => {

  // ─── encodePosition ─────────────────────────────────────────────────
  describe('encodePosition(lat, lon, alt)', () => {

    test('returns a Uint8Array of 24 bytes', () => {
      const result = encodePosition(38.8977, -77.0365, 15);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(24);
    });

    test('encodes known coordinates correctly', () => {
      const result = encodePosition(0, 0, 0);
      expect(result).toBeInstanceOf(Uint8Array);
      // lat=0, lon=0 => first 8 bytes should be zeros
      const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
      expect(view.getInt32(0, true)).toBe(0);
      expect(view.getInt32(4, true)).toBe(0);
      expect(view.getInt32(8, true)).toBe(0);
    });

    test('handles null altitude', () => {
      const result = encodePosition(40.7128, -74.006, null);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(24);
      const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
      expect(view.getInt32(8, true)).toBe(0); // null alt => 0
    });

    test('encodes negative coordinates', () => {
      const result = encodePosition(-33.8688, 151.2093, 58);
      const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
      expect(view.getInt32(0, true)).toBe(Math.round(-33.8688 * 1e7));
      expect(view.getInt32(4, true)).toBe(Math.round(151.2093 * 1e7));
      expect(view.getInt32(8, true)).toBe(5800); // 58m * 100 = 5800cm
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
      expect(decoded.altitude).toBeCloseTo(15, 1);
      expect(decoded.nodeId).toBe(0); // placeholder
      expect(typeof decoded.timestamp).toBe('number');
      expect(decoded.timestamp).toBeGreaterThan(0);
    });

    test('round-trips origin coordinates', () => {
      const encoded = encodePosition(0, 0, 0);
      const decoded = decodePosition(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBe(0);
      expect(decoded.lon).toBe(0);
      expect(decoded.altitude).toBe(0);
    });

    test('round-trips negative coordinates', () => {
      const encoded = encodePosition(-33.8688, 151.2093, 58);
      const decoded = decodePosition(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBeCloseTo(-33.8688, 4);
      expect(decoded.lon).toBeCloseTo(151.2093, 4);
      expect(decoded.altitude).toBeCloseTo(58, 1);
    });

    test('round-trips extreme coordinates', () => {
      // North pole
      const encoded1 = encodePosition(89.9999, 179.9999, 8848);
      const decoded1 = decodePosition(encoded1);
      expect(decoded1).not.toBeNull();
      expect(decoded1.lat).toBeCloseTo(89.9999, 3);
      expect(decoded1.lon).toBeCloseTo(179.9999, 3);
      expect(decoded1.altitude).toBeCloseTo(8848, 0);

      // South pole
      const encoded2 = encodePosition(-89.9999, -179.9999, 0);
      const decoded2 = decodePosition(encoded2);
      expect(decoded2).not.toBeNull();
      expect(decoded2.lat).toBeCloseTo(-89.9999, 3);
      expect(decoded2.lon).toBeCloseTo(-179.9999, 3);
    });

    test('returns null for too-short data', () => {
      expect(decodePosition(new Uint8Array(10))).toBeNull();
      expect(decodePosition(new Uint8Array(0))).toBeNull();
    });

    test('returns null for null/undefined input', () => {
      expect(decodePosition(null)).toBeNull();
      expect(decodePosition(undefined)).toBeNull();
    });

    test('returns null for invalid latitude range', () => {
      // Manually construct invalid data with lat > 90
      const buf = new ArrayBuffer(24);
      const view = new DataView(buf);
      view.setInt32(0, Math.round(100 * 1e7), true); // lat = 100 (invalid)
      view.setInt32(4, Math.round(50 * 1e7), true);
      view.setInt32(8, 0, true);
      view.setUint32(12, 0, true);
      view.setUint32(16, 0, true);
      view.setUint32(20, 0, true);
      expect(decodePosition(new Uint8Array(buf))).toBeNull();
    });

    test('accepts ArrayBuffer input', () => {
      const encoded = encodePosition(51.5074, -0.1278, 11);
      const decoded = decodePosition(encoded.buffer);
      expect(decoded).not.toBeNull();
      expect(decoded.lat).toBeCloseTo(51.5074, 4);
    });

    test('timestamp is recent (within last minute)', () => {
      const encoded = encodePosition(0, 0, 0);
      const decoded = decodePosition(encoded);
      const now = Date.now();
      expect(decoded.timestamp).toBeGreaterThan(now - 60000);
      expect(decoded.timestamp).toBeLessThanOrEqual(now + 1000);
    });
  });

  // ─── Precision ──────────────────────────────────────────────────────
  describe('encoding precision', () => {

    test('preserves sub-meter position accuracy', () => {
      // ~1e-7 degrees is ~0.01m — well within tactical accuracy
      const lat = 34.0522342;
      const lon = -118.2436849;
      const encoded = encodePosition(lat, lon, 71.5);
      const decoded = decodePosition(encoded);

      // Should be accurate to within ~0.01 meters (1e-7 degrees)
      expect(Math.abs(decoded.lat - lat)).toBeLessThan(1e-6);
      expect(Math.abs(decoded.lon - lon)).toBeLessThan(1e-6);
      // Altitude accurate to 1cm
      expect(Math.abs(decoded.altitude - 71.5)).toBeLessThan(0.01);
    });
  });
});
