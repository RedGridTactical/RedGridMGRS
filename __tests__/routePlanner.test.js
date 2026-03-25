/**
 * Test suite for src/utils/routePlanner.js
 * Tests route planning: calculateRoute, optimizeRoute, getRouteLegs, estimateTime
 */

const {
  calculateRoute,
  optimizeRoute,
  getRouteLegs,
  estimateTime,
  formatTime,
} = require('../src/utils/routePlanner');

describe('routePlanner.js - Route Planning', () => {

  // Test waypoints: Pentagon, White House, Lincoln Memorial
  const pentagon = { lat: 38.8711, lon: -77.0558, name: 'PENTAGON' };
  const whiteHouse = { lat: 38.8977, lon: -77.0365, name: 'WHITE HOUSE' };
  const lincoln = { lat: 38.8893, lon: -77.0502, name: 'LINCOLN' };

  // ─── calculateRoute ────────────────────────────────────────────────
  describe('calculateRoute(waypoints)', () => {

    test('returns empty for fewer than 2 waypoints', () => {
      expect(calculateRoute([])).toEqual({ legs: [], totalDistance: 0 });
      expect(calculateRoute([pentagon])).toEqual({ legs: [], totalDistance: 0 });
      expect(calculateRoute(null)).toEqual({ legs: [], totalDistance: 0 });
    });

    test('calculates route with 2 waypoints', () => {
      const result = calculateRoute([pentagon, whiteHouse]);
      expect(result.legs).toHaveLength(1);
      expect(result.totalDistance).toBeGreaterThan(0);
      // Pentagon to White House is ~3.3km
      expect(result.totalDistance).toBeGreaterThan(2500);
      expect(result.totalDistance).toBeLessThan(5000);
    });

    test('calculates route with 3 waypoints', () => {
      const result = calculateRoute([pentagon, whiteHouse, lincoln]);
      expect(result.legs).toHaveLength(2);
      expect(result.totalDistance).toBeGreaterThan(0);
      // Total should be sum of individual legs
      const legSum = result.legs.reduce((s, l) => s + l.distance, 0);
      expect(Math.abs(result.totalDistance - legSum)).toBeLessThan(1);
    });

    test('legs have correct structure', () => {
      const result = calculateRoute([pentagon, whiteHouse]);
      const leg = result.legs[0];
      expect(leg).toHaveProperty('from');
      expect(leg).toHaveProperty('to');
      expect(leg).toHaveProperty('bearing');
      expect(leg).toHaveProperty('distance');
      expect(leg).toHaveProperty('mgrs');
      expect(leg).toHaveProperty('distanceFormatted');
      expect(leg.from.name).toBe('PENTAGON');
      expect(leg.to.name).toBe('WHITE HOUSE');
      expect(leg.bearing).toBeGreaterThanOrEqual(0);
      expect(leg.bearing).toBeLessThan(360);
    });
  });

  // ─── getRouteLegs ──────────────────────────────────────────────────
  describe('getRouteLegs(waypoints)', () => {

    test('returns empty array for insufficient waypoints', () => {
      expect(getRouteLegs([])).toEqual([]);
      expect(getRouteLegs([pentagon])).toEqual([]);
      expect(getRouteLegs(null)).toEqual([]);
    });

    test('returns correct number of legs', () => {
      expect(getRouteLegs([pentagon, whiteHouse])).toHaveLength(1);
      expect(getRouteLegs([pentagon, whiteHouse, lincoln])).toHaveLength(2);
    });

    test('bearing is northward from Pentagon to White House', () => {
      const legs = getRouteLegs([pentagon, whiteHouse]);
      // White House is roughly NNE of Pentagon
      expect(legs[0].bearing).toBeGreaterThan(0);
      expect(legs[0].bearing).toBeLessThan(90);
    });

    test('distance is in meters (reasonable range)', () => {
      const legs = getRouteLegs([pentagon, whiteHouse]);
      expect(legs[0].distance).toBeGreaterThan(2000);
      expect(legs[0].distance).toBeLessThan(5000);
    });

    test('MGRS string is populated', () => {
      const legs = getRouteLegs([pentagon, whiteHouse]);
      expect(legs[0].mgrs).toBeTruthy();
      expect(legs[0].mgrs.length).toBeGreaterThan(5);
    });
  });

  // ─── optimizeRoute ─────────────────────────────────────────────────
  describe('optimizeRoute(waypoints, startPoint)', () => {

    test('returns empty array for null/empty input', () => {
      expect(optimizeRoute(null, pentagon)).toEqual([]);
      expect(optimizeRoute([], pentagon)).toEqual([]);
    });

    test('returns single waypoint unchanged', () => {
      const result = optimizeRoute([whiteHouse], pentagon);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(whiteHouse);
    });

    test('returns same waypoints in optimized order', () => {
      // Start from Pentagon. Lincoln is closer to Pentagon than White House.
      const result = optimizeRoute([whiteHouse, lincoln], pentagon);
      expect(result).toHaveLength(2);
      // Both waypoints should be present
      const names = result.map(w => w.name);
      expect(names).toContain('WHITE HOUSE');
      expect(names).toContain('LINCOLN');
    });

    test('nearest-neighbor picks closest first', () => {
      // Create waypoints where nearest-neighbor order is clear
      const far = { lat: 40.0, lon: -77.0, name: 'FAR' };
      const near = { lat: 38.88, lon: -77.05, name: 'NEAR' };
      const start = { lat: 38.87, lon: -77.06 };
      const result = optimizeRoute([far, near], start);
      expect(result[0].name).toBe('NEAR');
      expect(result[1].name).toBe('FAR');
    });

    test('returns copy without startPoint', () => {
      const wps = [pentagon, whiteHouse];
      const result = optimizeRoute(wps, null);
      expect(result).toHaveLength(2);
    });
  });

  // ─── estimateTime ──────────────────────────────────────────────────
  describe('estimateTime(distanceM, paceMinPerKm)', () => {

    test('returns 0 for zero or negative distance', () => {
      expect(estimateTime(0, 12)).toBe(0);
      expect(estimateTime(-100, 12)).toBe(0);
    });

    test('returns 0 for zero or negative pace', () => {
      expect(estimateTime(1000, 0)).toBe(0);
      expect(estimateTime(1000, -5)).toBe(0);
    });

    test('1km at 12 min/km = 12 minutes', () => {
      expect(estimateTime(1000, 12)).toBe(12);
    });

    test('5km at 15 min/km = 75 minutes', () => {
      expect(estimateTime(5000, 15)).toBe(75);
    });

    test('500m at 10 min/km = 5 minutes', () => {
      expect(estimateTime(500, 10)).toBe(5);
    });

    test('handles null inputs gracefully', () => {
      expect(estimateTime(null, 12)).toBe(0);
      expect(estimateTime(1000, null)).toBe(0);
    });
  });

  // ─── formatTime ────────────────────────────────────────────────────
  describe('formatTime(minutes)', () => {

    test('formats zero as 0min', () => {
      expect(formatTime(0)).toBe('0min');
    });

    test('formats minutes only', () => {
      expect(formatTime(45)).toBe('45min');
    });

    test('formats hours and minutes', () => {
      expect(formatTime(90)).toBe('1hr 30min');
    });

    test('formats exact hours', () => {
      expect(formatTime(120)).toBe('2hr 0min');
    });

    test('handles null/negative', () => {
      expect(formatTime(null)).toBe('0min');
      expect(formatTime(-5)).toBe('0min');
    });
  });
});
