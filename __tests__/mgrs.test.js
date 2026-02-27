/**
 * Test suite for src/utils/mgrs.js
 * Tests coordinate conversion, formatting, bearing, and distance calculations
 */

const {
  toMGRS,
  formatMGRS,
  calculateBearing,
  calculateDistance,
  formatDistance,
} = require('../src/utils/mgrs');

describe('mgrs.js - MGRS Coordinate Conversion', () => {

  // ─── toMGRS ───────────────────────────────────────────────────────────
  describe('toMGRS(lat, lon, precision)', () => {

    test('Washington Monument (38.8895, -77.0353) should start with 18S', () => {
      const result = toMGRS(38.8895, -77.0353, 5);
      expect(result).toMatch(/^18S/);
    });

    test('Equator at Prime Meridian (0, 0) should be valid MGRS', () => {
      const result = toMGRS(0, 0, 5);
      expect(result).toMatch(/^\d{1,2}[A-Z][A-Z]{2}\d{10}$/);
      expect(result).not.toBe('OUT OF RANGE');
      expect(result).not.toBe('ERROR');
    });

    test('North Pole region (84, 0) should be valid', () => {
      const result = toMGRS(84, 0, 5);
      expect(result).toMatch(/^\d{1,2}[A-Z][A-Z]{2}\d{10}$/);
    });

    test('South Pole region (-80, 0) should be valid', () => {
      const result = toMGRS(-80, 0, 5);
      expect(result).toMatch(/^\d{1,2}[A-Z][A-Z]{2}\d{10}$/);
    });

    test('Latitude > 84 should return OUT OF RANGE', () => {
      const result = toMGRS(85, 0, 5);
      expect(result).toBe('OUT OF RANGE');
    });

    test('Latitude < -80 should return OUT OF RANGE', () => {
      const result = toMGRS(-81, 0, 5);
      expect(result).toBe('OUT OF RANGE');
    });

    test('Date line crossing (180 longitude) should be valid', () => {
      const result = toMGRS(40, 180, 5);
      expect(result).not.toBe('ERROR');
      expect(result).not.toBe('OUT OF RANGE');
    });

    test('Different precision levels should work', () => {
      const p1 = toMGRS(40, -74, 1);
      const p5 = toMGRS(40, -74, 5);
      expect(p1).toMatch(/^\d{1,2}[A-Z][A-Z]{2}\d{2}$/);
      expect(p5).toMatch(/^\d{1,2}[A-Z][A-Z]{2}\d{10}$/);
    });

    test('Null latitude should handle gracefully', () => {
      const result = toMGRS(null, -74, 5);
      expect(result).toBe('ERROR');
    });

    test('Null longitude should handle gracefully', () => {
      const result = toMGRS(40, null, 5);
      expect(result).toBe('ERROR');
    });

    test('Svalbard special zone (79, 15) should be valid', () => {
      const result = toMGRS(79, 15, 5);
      expect(result).not.toBe('ERROR');
      expect(result).not.toBe('OUT OF RANGE');
    });

    test('Norway special zone (60, 6) should be valid', () => {
      const result = toMGRS(60, 6, 5);
      expect(result).not.toBe('ERROR');
    });
  });

  // ─── formatMGRS ───────────────────────────────────────────────────────
  describe('formatMGRS(mgrsString)', () => {

    test('Valid MGRS string should format with spaces', () => {
      const raw = '18SUJ1234567890';
      const formatted = formatMGRS(raw);
      expect(formatted).toMatch(/\d{1,2}[A-Z] [A-Z]{2} \d{5} \d{5}/);
    });

    test('Short string should return as-is', () => {
      const result = formatMGRS('123');
      expect(result).toBe('123');
    });

    test('Empty string should return as-is', () => {
      const result = formatMGRS('');
      expect(result).toBe('');
    });

    test('Null should return null', () => {
      const result = formatMGRS(null);
      expect(result).toBe(null);
    });

    test('Invalid format should return as-is', () => {
      const invalid = 'NOT_MGRS';
      const result = formatMGRS(invalid);
      expect(result).toBe(invalid);
    });

    test('Formatting preserves zone and grid square', () => {
      const raw = '18SUJ5555555555';
      const formatted = formatMGRS(raw);
      expect(formatted).toContain('18');
      expect(formatted).toContain('UJ');
    });
  });

  // ─── calculateBearing ─────────────────────────────────────────────────
  describe('calculateBearing(lat1, lon1, lat2, lon2)', () => {

    test('Same point should return 0 or NaN', () => {
      const bearing = calculateBearing(40, -74, 40, -74);
      expect(bearing).toEqual(0);
    });

    test('Point due north should have bearing ~0°', () => {
      const bearing = calculateBearing(40, -74, 41, -74);
      expect(bearing).toBeLessThan(5);
    });

    test('Point due east should have bearing ~90°', () => {
      const bearing = calculateBearing(40, -74, 40, -73);
      expect(Math.abs(bearing - 90)).toBeLessThan(2);
    });

    test('Point due south should have bearing ~180°', () => {
      const bearing = calculateBearing(40, -74, 39, -74);
      expect(Math.abs(bearing - 180)).toBeLessThan(5);
    });

    test('Point due west should have bearing ~270°', () => {
      const bearing = calculateBearing(40, -74, 40, -75);
      expect(Math.abs(bearing - 270)).toBeLessThan(2);
    });

    test('Bearing should always be 0-360', () => {
      const bearing = calculateBearing(0, 0, 45, 45);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    });

    test('Bearing should be consistent with reciprocal', () => {
      const b1 = calculateBearing(40, -74, 41, -73);
      const b2 = calculateBearing(41, -73, 40, -74);
      const backBearing = (b2 + 180) % 360;
      expect(Math.abs(b1 - backBearing)).toBeLessThan(1);
    });
  });

  // ─── calculateDistance ────────────────────────────────────────────────
  describe('calculateDistance(lat1, lon1, lat2, lon2)', () => {

    test('Same point should return 0', () => {
      const distance = calculateDistance(40, -74, 40, -74);
      expect(distance).toEqual(0);
    });

    test('1 degree on equator should be ~111km', () => {
      const distance = calculateDistance(0, 0, 0, 1);
      expect(distance).toBeGreaterThan(110000);
      expect(distance).toBeLessThan(112000);
    });

    test('Distance should be symmetric', () => {
      const d1 = calculateDistance(40, -74, 41, -73);
      const d2 = calculateDistance(41, -73, 40, -74);
      expect(Math.abs(d1 - d2)).toBeLessThan(1);
    });

    test('Known distance: New York to Boston ~300km', () => {
      const distance = calculateDistance(40.7128, -74.0060, 42.3601, -71.0589);
      expect(distance).toBeGreaterThan(290000);
      expect(distance).toBeLessThan(320000);
    });

    test('Distance should return positive meters', () => {
      const distance = calculateDistance(0, 0, 10, 10);
      expect(distance).toBeGreaterThan(0);
    });

    test('Meridian distance 1 degree should be ~111km', () => {
      const distance = calculateDistance(0, 0, 1, 0);
      expect(distance).toBeGreaterThan(110000);
      expect(distance).toBeLessThan(112000);
    });
  });

  // ─── formatDistance ───────────────────────────────────────────────────
  describe('formatDistance(meters)', () => {

    test('999m should format as "999m"', () => {
      const result = formatDistance(999);
      expect(result).toBe('999m');
    });

    test('500m should format as "500m"', () => {
      const result = formatDistance(500);
      expect(result).toBe('500m');
    });

    test('1000m should format as "1.0km"', () => {
      const result = formatDistance(1000);
      expect(result).toBe('1.0km');
    });

    test('1500m should format as "1.5km"', () => {
      const result = formatDistance(1500);
      expect(result).toBe('1.5km');
    });

    test('5250m should format as "5.3km"', () => {
      const result = formatDistance(5250);
      expect(result).toBe('5.3km');
    });

    test('0m should format as "0m"', () => {
      const result = formatDistance(0);
      expect(result).toBe('0m');
    });

    test('Format should not include "undefined" or "NaN"', () => {
      const result = formatDistance(2500);
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('NaN');
    });
  });

});
