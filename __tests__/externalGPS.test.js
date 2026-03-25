/**
 * Test suite for src/utils/externalGPS.js
 * Tests NMEA parsing, coordinate conversion, and BLE data parsing.
 */

const {
  parseGGA,
  parseRMC,
  nmeaToDecimal,
  parseLNSPosition,
  parseLNSQuality,
  base64ToBytes,
} = require('../src/utils/externalGPS');

describe('externalGPS.js - External GPS Utilities', () => {

  // ─── nmeaToDecimal ────────────────────────────────────────────────────
  describe('nmeaToDecimal(raw, dir)', () => {

    test('converts latitude N correctly', () => {
      // 4807.038 N => 48 + 7.038/60 = 48.1173
      const result = nmeaToDecimal('4807.038', 'N');
      expect(result).toBeCloseTo(48.1173, 4);
    });

    test('converts latitude S correctly (negative)', () => {
      const result = nmeaToDecimal('3349.500', 'S');
      expect(result).toBeCloseTo(-33.825, 4);
    });

    test('converts longitude E correctly', () => {
      // 01131.000 E => 11 + 31/60 = 11.5166...
      const result = nmeaToDecimal('01131.000', 'E');
      expect(result).toBeCloseTo(11.51667, 4);
    });

    test('converts longitude W correctly (negative)', () => {
      const result = nmeaToDecimal('12212.400', 'W');
      expect(result).toBeCloseTo(-122.20667, 4);
    });

    test('returns null for empty input', () => {
      expect(nmeaToDecimal('', 'N')).toBeNull();
      expect(nmeaToDecimal(null, 'N')).toBeNull();
      expect(nmeaToDecimal('4807.038', '')).toBeNull();
    });

    test('returns null for non-numeric input', () => {
      expect(nmeaToDecimal('abc', 'N')).toBeNull();
    });
  });

  // ─── parseGGA ─────────────────────────────────────────────────────────
  describe('parseGGA(sentence)', () => {

    test('parses valid GGA sentence', () => {
      const gga = '$GPGGA,123456.00,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47';
      const result = parseGGA(gga);
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(48.1173, 3);
      expect(result.lon).toBeCloseTo(11.51667, 3);
      expect(result.satellites).toBe(8);
      expect(result.altitude).toBe(545);
      expect(result.hdop).toBeCloseTo(0.9, 1);
      expect(result.accuracy).toBe(5); // 0.9 * 5 = 4.5, rounded to 5
    });

    test('rejects GGA with no fix (quality 0)', () => {
      const gga = '$GPGGA,123456.00,4807.038,N,01131.000,E,0,00,99.9,0.0,M,0.0,M,,*00';
      expect(parseGGA(gga)).toBeNull();
    });

    test('parses GLONASS GGA ($GNGGA)', () => {
      const gga = '$GNGGA,123456.00,3723.046,N,12159.074,W,1,12,0.7,30.0,M,-34.0,M,,*4E';
      const result = parseGGA(gga);
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(37.38410, 3);
      expect(result.lon).toBeCloseTo(-121.98457, 3);
      expect(result.satellites).toBe(12);
    });

    test('returns null for non-GGA sentence', () => {
      expect(parseGGA('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A')).toBeNull();
    });

    test('returns null for null/empty', () => {
      expect(parseGGA(null)).toBeNull();
      expect(parseGGA('')).toBeNull();
    });

    test('returns null for too-short sentence', () => {
      expect(parseGGA('$GPGGA,123456')).toBeNull();
    });
  });

  // ─── parseRMC ─────────────────────────────────────────────────────────
  describe('parseRMC(sentence)', () => {

    test('parses valid RMC sentence', () => {
      const rmc = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A';
      const result = parseRMC(rmc);
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(48.1173, 3);
      expect(result.lon).toBeCloseTo(11.51667, 3);
      expect(result.speed).toBeCloseTo(11.5236, 2); // 22.4 knots * 0.514444
      expect(result.heading).toBeCloseTo(84.4, 1);
    });

    test('rejects void RMC (status V)', () => {
      const rmc = '$GPRMC,123519,V,,,,,,,230394,,,N*53';
      expect(parseRMC(rmc)).toBeNull();
    });

    test('returns null for non-RMC sentence', () => {
      expect(parseRMC('$GPGGA,123456.00,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47')).toBeNull();
    });

    test('returns null for null/empty', () => {
      expect(parseRMC(null)).toBeNull();
      expect(parseRMC('')).toBeNull();
    });
  });

  // ─── base64ToBytes ────────────────────────────────────────────────────
  describe('base64ToBytes(b64)', () => {

    test('decodes simple base64', () => {
      // "Hello" in base64 = "SGVsbG8="
      const bytes = base64ToBytes('SGVsbG8=');
      const str = String.fromCharCode(...bytes);
      expect(str).toBe('Hello');
    });

    test('decodes empty string', () => {
      const bytes = base64ToBytes('');
      expect(bytes.length).toBe(0);
    });

    test('decodes binary data', () => {
      // [0x04, 0x00] in base64 = "BAA="
      const bytes = base64ToBytes('BAA=');
      expect(bytes[0]).toBe(4);
      expect(bytes[1]).toBe(0);
    });
  });

  // ─── parseLNSPosition ────────────────────────────────────────────────
  describe('parseLNSPosition(base64Data)', () => {

    test('returns null for null input', () => {
      expect(parseLNSPosition(null)).toBeNull();
    });

    test('returns null for empty/short data', () => {
      expect(parseLNSPosition('')).toBeNull();
      expect(parseLNSPosition('AA==')).toBeNull(); // 1 byte
    });

    test('parses location data with flags indicating location present', () => {
      // Flags: 0x0004 (location present) = [0x04, 0x00]
      // Lat: 48.1173 * 10000000 = 481173000 = 0x1CAAC8A8
      // Lon: 11.51667 * 10000000 = 115166700 = 0x06DD83EC
      // Build the bytes: flags(2) + lat(4) + lon(4) = 10 bytes
      const latVal = Math.round(48.1173 * 10000000);
      const lonVal = Math.round(11.51667 * 10000000);
      const bytes = new Uint8Array(10);
      bytes[0] = 0x04; bytes[1] = 0x00; // flags: location present
      bytes[2] = latVal & 0xFF;
      bytes[3] = (latVal >> 8) & 0xFF;
      bytes[4] = (latVal >> 16) & 0xFF;
      bytes[5] = (latVal >> 24) & 0xFF;
      bytes[6] = lonVal & 0xFF;
      bytes[7] = (lonVal >> 8) & 0xFF;
      bytes[8] = (lonVal >> 16) & 0xFF;
      bytes[9] = (lonVal >> 24) & 0xFF;

      // Convert to base64
      const b64 = bytesToBase64(bytes);
      const result = parseLNSPosition(b64);

      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(48.1173, 3);
      expect(result.lon).toBeCloseTo(11.51667, 3);
    });
  });

  // ─── parseLNSQuality ─────────────────────────────────────────────────
  describe('parseLNSQuality(base64Data)', () => {

    test('returns null for null input', () => {
      expect(parseLNSQuality(null)).toBeNull();
    });

    test('parses satellite count', () => {
      // Flags: 0x0001 (number of beacons in solution)
      // Satellites: 10
      const bytes = new Uint8Array(3);
      bytes[0] = 0x01; bytes[1] = 0x00; // flags
      bytes[2] = 10; // satellites
      const b64 = bytesToBase64(bytes);
      const result = parseLNSQuality(b64);
      expect(result).not.toBeNull();
      expect(result.satellites).toBe(10);
    });
  });
});

// Helper to convert Uint8Array to base64 for test construction
function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 0x0F) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 0x3F] : '=';
  }
  return result;
}
