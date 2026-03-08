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
  parseMGRSToLatLon,
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

  // ─── Ground-truth MGRS validation (column letter sets across zones) ──
  describe('toMGRS ground-truth: column letter set per zone', () => {

    // Column letters cycle every 3 zones: A-H, J-R, S-Z
    // These tests verify the correct 100km grid square for known locations
    // Reference: NGA MGRS grid — validated against geotrans/NGA tools

    test('Zone 10 (San Francisco, 37.7749 -122.4194) → column from A-H set', () => {
      const mgrs = toMGRS(37.7749, -122.4194, 5);
      expect(mgrs).toMatch(/^10S/);
      // Zone 10: (10-1)%3=0 → A-H. Column letter must be in A-H
      const colLetter = mgrs[3];
      expect('ABCDEFGH').toContain(colLetter);
    });

    test('Zone 11 (Las Vegas, 36.1699 -115.1398) → column from J-R set', () => {
      const mgrs = toMGRS(36.1699, -115.1398, 5);
      expect(mgrs).toMatch(/^11S/);
      const colLetter = mgrs[3];
      expect('JKLMNPQR').toContain(colLetter);
    });

    test('Zone 12 (Salt Lake City, 40.7608 -111.8910) → column from S-Z set', () => {
      const mgrs = toMGRS(40.7608, -111.8910, 5);
      expect(mgrs).toMatch(/^12T/);
      const colLetter = mgrs[3];
      expect('STUVWXYZ').toContain(colLetter);
    });

    test('Zone 13 (Denver, 39.7392 -104.9903) → column from A-H set', () => {
      const mgrs = toMGRS(39.7392, -104.9903, 5);
      expect(mgrs).toMatch(/^13S/);
      const colLetter = mgrs[3];
      expect('ABCDEFGH').toContain(colLetter);
    });

    test('Zone 14 (Fort Hood TX, 31.1344 -97.7765) → column from J-R set', () => {
      const mgrs = toMGRS(31.1344, -97.7765, 5);
      expect(mgrs).toMatch(/^14R/);
      const colLetter = mgrs[3];
      expect('JKLMNPQR').toContain(colLetter);
    });

    test('Zone 15 (Minneapolis, 44.9778 -93.2650) → column from S-Z set', () => {
      const mgrs = toMGRS(44.9778, -93.2650, 5);
      expect(mgrs).toMatch(/^15T/);
      const colLetter = mgrs[3];
      expect('STUVWXYZ').toContain(colLetter);
    });

    test('Zone 16 (Nashville, 36.1627 -86.7816) → column from A-H set', () => {
      const mgrs = toMGRS(36.1627, -86.7816, 5);
      expect(mgrs).toMatch(/^16S/);
      const colLetter = mgrs[3];
      expect('ABCDEFGH').toContain(colLetter);
    });

    test('Zone 17 (Fort Liberty NC, 35.1397 -79.0078) → column from J-R set', () => {
      const mgrs = toMGRS(35.1397, -79.0078, 5);
      expect(mgrs).toMatch(/^17S/);
      const colLetter = mgrs[3];
      expect('JKLMNPQR').toContain(colLetter);
    });

    test('Zone 18 (Washington DC, 38.8895 -77.0353) → column from S-Z set', () => {
      const mgrs = toMGRS(38.8895, -77.0353, 5);
      expect(mgrs).toMatch(/^18S/);
      const colLetter = mgrs[3];
      expect('STUVWXYZ').toContain(colLetter);
    });

    test('Zone 19 (Boston, 42.3601 -71.0589) → column from A-H set', () => {
      const mgrs = toMGRS(42.3601, -71.0589, 5);
      expect(mgrs).toMatch(/^19T/);
      const colLetter = mgrs[3];
      expect('ABCDEFGH').toContain(colLetter);
    });
  });

  // ─── parseMGRSToLatLon ─────────────────────────────────────────────
  describe('parseMGRSToLatLon(mgrsString)', () => {

    test('Valid 10-digit MGRS should parse to lat/lon', () => {
      const result = parseMGRSToLatLon('18SUJ2348005997');
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(38.89, 1);
      expect(result.lon).toBeCloseTo(-77.04, 1);
    });

    test('Valid 8-digit MGRS should parse', () => {
      const result = parseMGRSToLatLon('18SUJ23480599');
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(38.89, 0);
    });

    test('Valid 6-digit MGRS should parse', () => {
      const result = parseMGRSToLatLon('18SUJ234059');
      expect(result).not.toBeNull();
    });

    test('Valid 4-digit MGRS should parse', () => {
      const result = parseMGRSToLatLon('18SUJ2305');
      expect(result).not.toBeNull();
    });

    test('MGRS with spaces should parse (strips whitespace)', () => {
      const result = parseMGRSToLatLon('18S UJ 23480 05997');
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(38.89, 1);
    });

    test('Odd digit count should return null (invalid split)', () => {
      const result = parseMGRSToLatLon('18SUJ12345');
      expect(result).toBeNull();
    });

    test('Invalid MGRS string should return null', () => {
      expect(parseMGRSToLatLon('NOTMGRS')).toBeNull();
      expect(parseMGRSToLatLon('')).toBeNull();
      expect(parseMGRSToLatLon('123')).toBeNull();
    });

    test('Zone 17 MGRS should parse (column from J-R set)', () => {
      // Fort Liberty NC area — column letter must be from J-R
      const mgrs = toMGRS(35.1397, -79.0078, 5);
      const parsed = parseMGRSToLatLon(mgrs);
      expect(parsed).not.toBeNull();
      expect(parsed.lat).toBeCloseTo(35.14, 1);
      expect(parsed.lon).toBeCloseTo(-79.01, 1);
    });

    test('Zone 14 MGRS should parse (column from J-R set)', () => {
      const mgrs = toMGRS(31.1344, -97.7765, 5);
      const parsed = parseMGRSToLatLon(mgrs);
      expect(parsed).not.toBeNull();
      expect(parsed.lat).toBeCloseTo(31.13, 1);
    });

    test('Zone 16 MGRS should parse (column from A-H set)', () => {
      const mgrs = toMGRS(36.1627, -86.7816, 5);
      const parsed = parseMGRSToLatLon(mgrs);
      expect(parsed).not.toBeNull();
      expect(parsed.lat).toBeCloseTo(36.16, 1);
    });

    test('Round-trip all US zones: toMGRS → parseMGRSToLatLon ≈ original', () => {
      // Test zones 10-19 covering CONUS
      const testPoints = [
        { lat: 37.77, lon: -122.42, zone: 10 }, // San Francisco
        { lat: 36.17, lon: -115.14, zone: 11 }, // Las Vegas
        { lat: 40.76, lon: -111.89, zone: 12 }, // Salt Lake City
        { lat: 39.74, lon: -104.99, zone: 13 }, // Denver
        { lat: 31.13, lon: -97.78, zone: 14 },  // Fort Hood
        { lat: 44.98, lon: -93.27, zone: 15 },  // Minneapolis
        { lat: 36.16, lon: -86.78, zone: 16 },  // Nashville
        { lat: 35.14, lon: -79.01, zone: 17 },  // Fort Liberty
        { lat: 38.89, lon: -77.04, zone: 18 },  // Washington DC
        { lat: 42.36, lon: -71.06, zone: 19 },  // Boston
      ];
      for (const pt of testPoints) {
        const mgrs = toMGRS(pt.lat, pt.lon, 5);
        const parsed = parseMGRSToLatLon(mgrs);
        expect(parsed).not.toBeNull();
        expect(parsed.lat).toBeCloseTo(pt.lat, 1);
        expect(parsed.lon).toBeCloseTo(pt.lon, 1);
      }
    });
  });

});
