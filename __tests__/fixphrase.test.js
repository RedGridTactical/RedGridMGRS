/**
 * Test suite for src/utils/fixphrase.js
 * Tests encode/decode round-trips, edge cases, and order independence.
 */

const { encode, decode, formatFixPhrase } = require('../src/utils/fixphrase');

describe('fixphrase.js - FixPhrase Encoding/Decoding', () => {

  // ─── Round-trip tests ─────────────────────────────────────────────────
  describe('encode/decode round-trips', () => {

    const testCases = [
      { name: 'Washington Monument',   lat: 38.8895,   lon: -77.0353 },
      { name: 'Eiffel Tower',          lat: 48.8584,   lon: 2.2945 },
      { name: 'Sydney Opera House',    lat: -33.8568,  lon: 151.2153 },
      { name: 'North Pole area',       lat: 89.9999,   lon: 0.0001 },
      { name: 'South Pole area',       lat: -89.9999,  lon: -179.9999 },
      { name: 'Origin (0, 0)',         lat: 0.0,       lon: 0.0 },
      { name: 'Tokyo Tower',           lat: 35.6586,   lon: 139.7454 },
    ];

    testCases.forEach(({ name, lat, lon }) => {
      test(`${name} (${lat}, ${lon}) round-trips within 0.0001 deg`, () => {
        const phrase = encode(lat, lon);
        expect(typeof phrase).toBe('string');

        const words = phrase.split('-');
        expect(words.length).toBe(4);

        const result = decode(phrase);
        expect(Math.abs(result.lat - lat)).toBeLessThanOrEqual(0.0001);
        expect(Math.abs(result.lon - lon)).toBeLessThanOrEqual(0.0001);
      });
    });
  });

  // ─── Word order independence ──────────────────────────────────────────
  describe('word order independence', () => {

    test('shuffled words decode to same location', () => {
      const phrase = encode(40.7128, -74.0060);
      const words = phrase.split('-');

      // Reverse order
      const reversed = words.slice().reverse().join('-');
      const original = decode(phrase);
      const fromReversed = decode(reversed);

      expect(fromReversed.lat).toBe(original.lat);
      expect(fromReversed.lon).toBe(original.lon);
    });

    test('space-separated words also work', () => {
      const phrase = encode(51.5074, -0.1278);
      const spaced = phrase.replace(/-/g, ' ');
      const result = decode(spaced);
      expect(Math.abs(result.lat - 51.5074)).toBeLessThanOrEqual(0.0001);
      expect(Math.abs(result.lon - (-0.1278))).toBeLessThanOrEqual(0.0001);
    });
  });

  // ─── Validation ───────────────────────────────────────────────────────
  describe('validation', () => {

    test('throws on latitude > 90', () => {
      expect(() => encode(91, 0)).toThrow();
    });

    test('throws on longitude < -180', () => {
      expect(() => encode(0, -181)).toThrow();
    });

    test('throws on insufficient words', () => {
      expect(() => decode('hello')).toThrow();
    });
  });

  // ─── formatFixPhrase ──────────────────────────────────────────────────
  describe('formatFixPhrase', () => {

    test('returns a hyphen-separated string', () => {
      const result = formatFixPhrase(34.0522, -118.2437);
      expect(result).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/);
    });

    test('returns ERROR for invalid input', () => {
      expect(formatFixPhrase(999, 999)).toBe('ERROR');
    });
  });
});
