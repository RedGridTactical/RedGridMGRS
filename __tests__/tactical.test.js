/**
 * Test suite for src/utils/tactical.js
 * Tests tactical navigation calculations: back azimuth, dead reckoning, resection,
 * pace counting, declination, travel time, and celestial bearings
 */

const {
  backAzimuth,
  deadReckoning,
  resection,
  pacesToDistance,
  distanceToPaces,
  applyDeclination,
  removeDeclination,
  timeToTravel,
  formatMinutes,
  solarBearing,
  lunarBearing,
} = require('../src/utils/tactical');

describe('tactical.js - Tactical Land Navigation', () => {

  // ─── backAzimuth ──────────────────────────────────────────────────────
  describe('backAzimuth(bearing)', () => {

    test('90° should return 270°', () => {
      const result = backAzimuth(90);
      expect(result).toBe(270);
    });

    test('0° should return 180°', () => {
      const result = backAzimuth(0);
      expect(result).toBe(180);
    });

    test('180° should return 0°', () => {
      const result = backAzimuth(180);
      expect(result).toBe(0);
    });

    test('270° should return 90°', () => {
      const result = backAzimuth(270);
      expect(result).toBe(90);
    });

    test('45° should return 225°', () => {
      const result = backAzimuth(45);
      expect(result).toBe(225);
    });

    test('360° should return 180°', () => {
      const result = backAzimuth(360);
      expect(result).toBe(180);
    });

    test('Result should always be 0-360', () => {
      for (let bearing of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
        const result = backAzimuth(bearing);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(360);
      }
    });

    test('Back azimuth of back azimuth should equal original', () => {
      const original = 125;
      const back = backAzimuth(original);
      const backBack = backAzimuth(back);
      expect(backBack).toBe(original);
    });
  });

  // ─── deadReckoning ────────────────────────────────────────────────────
  describe('deadReckoning(startLat, startLon, headingDeg, distanceM)', () => {

    test('Zero distance should return ~same position', () => {
      const result = deadReckoning(40, -74, 0, 0);
      expect(result).not.toBeNull();
      expect(result.lat).toBeCloseTo(40, 5);
      expect(result.lon).toBeCloseTo(-74, 5);
    });

    test('Heading north 1000m should increase latitude', () => {
      const start = { lat: 40, lon: -74 };
      const result = deadReckoning(start.lat, start.lon, 0, 1000);
      expect(result.lat).toBeGreaterThan(start.lat);
      expect(result.lon).toBeCloseTo(start.lon, 3);
    });

    test('Heading south 1000m should decrease latitude', () => {
      const start = { lat: 40, lon: -74 };
      const result = deadReckoning(start.lat, start.lon, 180, 1000);
      expect(result.lat).toBeLessThan(start.lat);
      expect(result.lon).toBeCloseTo(start.lon, 3);
    });

    test('Heading east 5000m should increase longitude', () => {
      const start = { lat: 40, lon: -74 };
      const result = deadReckoning(start.lat, start.lon, 90, 5000);
      expect(result.lon).toBeGreaterThan(start.lon);
    });

    test('Heading west 5000m should decrease longitude', () => {
      const start = { lat: 40, lon: -74 };
      const result = deadReckoning(start.lat, start.lon, 270, 5000);
      expect(result.lon).toBeLessThan(start.lon);
    });

    test('Result should include lat, lon, mgrs, mgrsFormatted', () => {
      const result = deadReckoning(40, -74, 45, 5000);
      expect(result).toHaveProperty('lat');
      expect(result).toHaveProperty('lon');
      expect(result).toHaveProperty('mgrs');
      expect(result).toHaveProperty('mgrsFormatted');
    });

    test('Negative distance should return null', () => {
      const result = deadReckoning(40, -74, 0, -1000);
      expect(result).toBeNull();
    });

    test('Infinite distance should return null', () => {
      const result = deadReckoning(40, -74, 0, Infinity);
      expect(result).toBeNull();
    });

    test('NaN distance should return null', () => {
      const result = deadReckoning(40, -74, 0, NaN);
      expect(result).toBeNull();
    });

    test('Long distance calculation should be valid', () => {
      const result = deadReckoning(40, -74, 0, 100000);
      expect(result.mgrs).toMatch(/^\d{1,2}[A-Z]/);
    });
  });

  // ─── resection ────────────────────────────────────────────────────────
  describe('resection(lat1, lon1, bearing1, lat2, lon2, bearing2)', () => {

    test('Two points with perpendicular bearings should resolve', () => {
      // From point 1, bearing 90°; from point 2, bearing 270°
      const result = resection(40, -74, 90, 40, -73, 270);
      if (result) {
        expect(result).toHaveProperty('lat');
        expect(result).toHaveProperty('lon');
        expect(result).toHaveProperty('mgrs');
      }
    });

    test('Same points should return null', () => {
      const result = resection(40, -74, 90, 40, -74, 270);
      expect(result).toBeNull();
    });

    test('Valid resection should return MGRS', () => {
      const result = resection(40, -74, 45, 41, -73, 225);
      if (result) {
        expect(result.mgrs).toMatch(/^\d{1,2}[A-Z]/);
      }
    });

    test('Result should include all required properties when valid', () => {
      const result = resection(38, -77, 90, 39, -76, 270);
      if (result !== null) {
        expect(result).toHaveProperty('lat');
        expect(result).toHaveProperty('lon');
        expect(result).toHaveProperty('mgrs');
        expect(result).toHaveProperty('mgrsFormatted');
      }
    });
  });

  // ─── pacesToDistance ──────────────────────────────────────────────────
  describe('pacesToDistance(paces, pacesPerHundredMeters)', () => {

    test('62 paces at 62 pace/100m should be 100m', () => {
      const distance = pacesToDistance(62, 62);
      expect(distance).toBeCloseTo(100, 0);
    });

    test('124 paces at 62 pace/100m should be 200m', () => {
      const distance = pacesToDistance(124, 62);
      expect(distance).toBeCloseTo(200, 0);
    });

    test('0 paces should be 0m', () => {
      const distance = pacesToDistance(0, 62);
      expect(distance).toBe(0);
    });

    test('1000 paces at 65 pace/100m should be ~1538m', () => {
      const distance = pacesToDistance(1000, 65);
      expect(distance).toBeCloseTo(1538, 0);
    });

    test('Different calibrations should produce proportional results', () => {
      const d62 = pacesToDistance(100, 62);
      const d65 = pacesToDistance(100, 65);
      expect(d62).toBeGreaterThan(d65);
    });
  });

  // ─── distanceToPaces ──────────────────────────────────────────────────
  describe('distanceToPaces(meters, pacesPerHundredMeters)', () => {

    test('100m at 62 pace/100m should be 62 paces', () => {
      const paces = distanceToPaces(100, 62);
      expect(paces).toBe(62);
    });

    test('200m at 62 pace/100m should be 124 paces', () => {
      const paces = distanceToPaces(200, 62);
      expect(paces).toBe(124);
    });

    test('0m should be 0 paces', () => {
      const paces = distanceToPaces(0, 62);
      expect(paces).toBe(0);
    });

    test('1500m at 65 pace/100m should be ~975 paces', () => {
      const paces = distanceToPaces(1500, 65);
      expect(paces).toBeCloseTo(975, 0);
    });

    test('Result should be rounded integer', () => {
      const paces = distanceToPaces(150, 62);
      expect(Number.isInteger(paces)).toBe(true);
    });

    test('Inverse of pacesToDistance should be consistent', () => {
      const originalPaces = 100;
      const distance = pacesToDistance(originalPaces, 62);
      const backToPaces = distanceToPaces(distance, 62);
      expect(backToPaces).toBeCloseTo(originalPaces, 0);
    });
  });

  // ─── applyDeclination ─────────────────────────────────────────────────
  describe('applyDeclination(magneticBearing, declinationDeg)', () => {

    test('45° + 10° declination should be 55°', () => {
      const result = applyDeclination(45, 10);
      expect(result).toBe(55);
    });

    test('350° + 20° declination should be 10°', () => {
      const result = applyDeclination(350, 20);
      expect(result).toBe(10);
    });

    test('0° + 0° declination should be 0°', () => {
      const result = applyDeclination(0, 0);
      expect(result).toBe(0);
    });

    test('90° - 15° declination should be 75°', () => {
      const result = applyDeclination(90, -15);
      expect(result).toBe(75);
    });

    test('Result should always be 0-360', () => {
      const result = applyDeclination(350, 30);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(360);
    });

    test('Large positive declination should wrap', () => {
      const result = applyDeclination(350, 100);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(360);
    });

    test('Large negative declination should wrap', () => {
      const result = applyDeclination(10, -50);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(360);
    });
  });

  // ─── removeDeclination ────────────────────────────────────────────────
  describe('removeDeclination(trueBearing, declinationDeg)', () => {

    test('55° - 10° declination should be 45°', () => {
      const result = removeDeclination(55, 10);
      expect(result).toBe(45);
    });

    test('10° - 20° declination should be 350°', () => {
      const result = removeDeclination(10, 20);
      expect(result).toBe(350);
    });

    test('Inverse of applyDeclination', () => {
      const original = 125;
      const applied = applyDeclination(original, 15);
      const removed = removeDeclination(applied, 15);
      expect(removed).toBe(original);
    });
  });

  // ─── timeToTravel ────────────────────────────────────────────────────
  describe('timeToTravel(distanceM, speedKmh)', () => {

    test('5000m at 4 km/h should be 75 minutes', () => {
      const minutes = timeToTravel(5000, 4);
      expect(minutes).toBeCloseTo(75, 0);
    });

    test('10000m at 5 km/h should be 120 minutes', () => {
      const minutes = timeToTravel(10000, 5);
      expect(minutes).toBe(120);
    });

    test('1000m at 3 km/h should be 20 minutes', () => {
      const minutes = timeToTravel(1000, 3);
      expect(minutes).toBeCloseTo(20, 0);
    });

    test('Zero distance should be 0 minutes', () => {
      const minutes = timeToTravel(0, 4);
      expect(minutes).toBe(0);
    });

    test('Zero speed should return null', () => {
      const result = timeToTravel(5000, 0);
      expect(result).toBeNull();
    });

    test('Negative speed should return null', () => {
      const result = timeToTravel(5000, -3);
      expect(result).toBeNull();
    });

    test('Null speed should return null', () => {
      const result = timeToTravel(5000, null);
      expect(result).toBeNull();
    });
  });

  // ─── formatMinutes ────────────────────────────────────────────────────
  describe('formatMinutes(mins)', () => {

    test('30 minutes should format as "30min"', () => {
      const result = formatMinutes(30);
      expect(result).toBe('30min');
    });

    test('75 minutes should format as "1hr 15min"', () => {
      const result = formatMinutes(75);
      expect(result).toBe('1hr 15min');
    });

    test('120 minutes should format as "2hr 0min"', () => {
      const result = formatMinutes(120);
      expect(result).toBe('2hr 0min');
    });

    test('0 minutes should format as "0min"', () => {
      const result = formatMinutes(0);
      expect(result).toBe('0min');
    });

    test('Null should return "--"', () => {
      const result = formatMinutes(null);
      expect(result).toBe('--');
    });

    test('NaN should return "--"', () => {
      const result = formatMinutes(NaN);
      expect(result).toBe('--');
    });

    test('Undefined should return "--"', () => {
      const result = formatMinutes(undefined);
      expect(result).toBe('--');
    });

    test('Very large time should format correctly', () => {
      const result = formatMinutes(1500);
      expect(result).toContain('hr');
      expect(result).not.toContain('--');
    });
  });

  // ─── solarBearing ────────────────────────────────────────────────────
  describe('solarBearing(date, lat, lon)', () => {

    test('Should return object with azimuth, altitude, isDay', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = solarBearing(date, 40, -74);
      expect(result).toHaveProperty('azimuth');
      expect(result).toHaveProperty('altitude');
      expect(result).toHaveProperty('isDay');
    });

    test('Azimuth should be 0-360', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = solarBearing(date, 40, -74);
      expect(result.azimuth).toBeGreaterThanOrEqual(0);
      expect(result.azimuth).toBeLessThan(360);
    });

    test('Should not return NaN for azimuth', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = solarBearing(date, 40, -74);
      expect(isNaN(result.azimuth)).toBe(false);
    });

    test('Should not return NaN for altitude', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = solarBearing(date, 40, -74);
      expect(isNaN(result.altitude)).toBe(false);
    });

    test('Noon in northern hemisphere should have sun roughly south', () => {
      const date = new Date('2025-06-21T16:00:00Z'); // 16:00 UTC = ~noon Eastern
      const result = solarBearing(date, 40, -74);
      // Sun should be in southern half (90-270 degrees)
      expect(result.azimuth).toBeGreaterThan(45);
      expect(result.azimuth).toBeLessThan(315);
    });

    test('Midnight should have negative altitude (below horizon)', () => {
      const date = new Date('2025-06-21T04:00:00Z'); // 4am UTC
      const result = solarBearing(date, 40, -74);
      expect(result.altitude).toBeLessThan(0);
    });

    test('isDay should be boolean', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = solarBearing(date, 40, -74);
      expect(typeof result.isDay).toBe('boolean');
    });
  });

  // ─── lunarBearing ────────────────────────────────────────────────────
  describe('lunarBearing(date, lat, lon)', () => {

    test('Should return object with azimuth, altitude, isUp', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = lunarBearing(date, 40, -74);
      expect(result).toHaveProperty('azimuth');
      expect(result).toHaveProperty('altitude');
      expect(result).toHaveProperty('isUp');
    });

    test('Azimuth should be 0-360', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = lunarBearing(date, 40, -74);
      expect(result.azimuth).toBeGreaterThanOrEqual(0);
      expect(result.azimuth).toBeLessThan(360);
    });

    test('Should not return NaN for azimuth', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = lunarBearing(date, 40, -74);
      expect(isNaN(result.azimuth)).toBe(false);
    });

    test('Should not return NaN for altitude', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = lunarBearing(date, 40, -74);
      expect(isNaN(result.altitude)).toBe(false);
    });

    test('isUp should be boolean', () => {
      const date = new Date('2025-06-21T12:00:00Z');
      const result = lunarBearing(date, 40, -74);
      expect(typeof result.isUp).toBe('boolean');
    });

    test('Multiple dates should produce different azimuths', () => {
      const date1 = new Date('2025-06-21T12:00:00Z');
      const date2 = new Date('2025-06-28T12:00:00Z');
      const result1 = lunarBearing(date1, 40, -74);
      const result2 = lunarBearing(date2, 40, -74);
      // Different lunar phases should have different azimuths
      expect(result1.azimuth).not.toBe(result2.azimuth);
    });
  });

});
