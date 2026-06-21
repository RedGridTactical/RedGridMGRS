import { buildDTG, buildRouteSummary, buildRouteCardText } from '../src/utils/routeCard';

const LIST = {
  name: 'MISSION ALPHA',
  waypoints: [
    { id: 'wp1', label: 'CCP 1', lat: 38.8895, lon: -77.0353, mgrs: '18S UJ 23478 06483' },
    { id: 'wp2', label: 'OBJ WRECK', lat: 38.8978, lon: -77.0419, mgrs: '18S UJ 22926 07417' },
    { id: 'wp3', label: 'PZ TOMAHAWK', lat: 38.8810, lon: -77.0280, mgrs: '18S UJ 24114 05530' },
  ],
};

describe('routeCard — DTG', () => {
  test('formats a Zulu date-time group DDHHMMZMONYY', () => {
    const d = new Date(Date.UTC(2026, 5, 21, 14, 30)); // 21 Jun 2026 14:30Z
    expect(buildDTG(d)).toBe('211430ZJUN26');
  });
  test('pads single-digit day/hour/minute', () => {
    const d = new Date(Date.UTC(2026, 0, 3, 4, 5)); // 03 Jan 2026 04:05Z
    expect(buildDTG(d)).toBe('030405ZJAN26');
  });
});

describe('routeCard — route summary', () => {
  test('builds N-1 legs from N waypoints with bearing/distance/mgrs', () => {
    const { legs, totalDistance } = buildRouteSummary(LIST);
    expect(legs).toHaveLength(2);
    expect(totalDistance).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.bearing).toBeGreaterThanOrEqual(0);
      expect(leg.bearing).toBeLessThan(360);
      expect(leg.distance).toBeGreaterThan(0);
      expect(typeof leg.mgrs).toBe('string');
      expect(leg.distanceFormatted).toBeTruthy();
    }
    // total equals sum of leg distances
    const sum = legs.reduce((s, l) => s + l.distance, 0);
    expect(Math.abs(totalDistance - sum)).toBeLessThan(0.01);
  });

  test('returns empty for lists with fewer than 2 waypoints', () => {
    expect(buildRouteSummary({ name: 'X', waypoints: [LIST.waypoints[0]] })).toEqual({ legs: [], totalDistance: 0 });
    expect(buildRouteSummary({ name: 'X', waypoints: [] })).toEqual({ legs: [], totalDistance: 0 });
    expect(buildRouteSummary(null)).toEqual({ legs: [], totalDistance: 0 });
  });
});

describe('routeCard — text export', () => {
  test('includes name, DTG, leg count, START, and footer', () => {
    const { legs, totalDistance } = buildRouteSummary(LIST);
    const text = buildRouteCardText(LIST, legs, totalDistance, '211430ZJUN26');
    expect(text).toContain('ROUTE CARD — MISSION ALPHA');
    expect(text).toContain('DTG 211430ZJUN26');
    expect(text).toContain('2 LEGS');
    expect(text).toContain('START  CCP 1');
    expect(text).toContain('OBJ WRECK');
    expect(text).toContain('PZ TOMAHAWK');
    expect(text).toContain('Red Grid MGRS · offline · no network');
    // each leg renders a 3-digit bearing + degree sign
    expect(text).toMatch(/\d{2}\s+OBJ WRECK\s+\d{3}°/);
  });

  test('singular LEG for a 2-waypoint route', () => {
    const two = { name: 'X', waypoints: LIST.waypoints.slice(0, 2) };
    const { legs, totalDistance } = buildRouteSummary(two);
    const text = buildRouteCardText(two, legs, totalDistance, '010000ZJAN26');
    expect(text).toContain('1 LEG ·');
  });
});
