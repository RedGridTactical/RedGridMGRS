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
    expect(text).toContain('Red Grid MGRS · straight-line route plan');
    // Each leg names true north, matching the actual inverse bearing.
    expect(text).toMatch(/\d{2}\s+OBJ WRECK\s+\d{3}°T/);
  });

  test('singular LEG for a 2-waypoint route', () => {
    const two = { name: 'X', waypoints: LIST.waypoints.slice(0, 2) };
    const { legs, totalDistance } = buildRouteSummary(two);
    const text = buildRouteCardText(two, legs, totalDistance, '010000ZJAN26');
    expect(text).toContain('1 LEG ·');
  });
});

describe('planning provenance and manual records', () => {
  const { buildRouteProvenance, formatRouteTime, pointProvenanceText } = require('../src/utils/routeCard');
  test('estimated duration requires an explicit saved pace, never the generation time', () => {
    expect(buildRouteProvenance(LIST).plannedMinutes).toBeNull();
    const plan = { ...LIST, paceMinPerKm: 12, plannedStartAt: Date.UTC(2026, 8, 10, 9) };
    const summary = buildRouteSummary(plan);
    expect(buildRouteProvenance(plan).plannedMinutes).toBeCloseTo(summary.totalDistance / 1000 * 12);
    const text = buildRouteCardText(plan, summary.legs, summary.totalDistance, '091500ZSEP26');
    expect(text).toContain('GENERATED DTG 091500ZSEP26');
    expect(text).toContain('PLANNED START (UTC): 2026-09-10 09:00 UTC');
    expect(text).toContain('bearings use true north');
  });
  test('completion text records deliberate times and preserved plan notes without implying a track', () => {
    const record = { ...LIST, status: 'completed', notes: 'Use signed trail', reviewNotes: 'Bridge closed',
      waypoints: LIST.waypoints.map((p, i) => ({ ...p, note: i === 1 ? 'Check bridge' : '' })),
      startedAt: 1800000000000, endedAt: 1800001200000, confirmed: [{ index: 0, confirmedAt: 1800000001000 }, { index: 1, confirmedAt: 1800000600000 }] };
    const summary = buildRouteSummary(record);
    const text = buildRouteCardText(record, summary.legs, summary.totalDistance, '010000ZJAN27');
    expect(text).toContain('MANUAL CONFIRMATION RECORD');
    expect(text).toContain('They do not prove arrival or record a travelled path');
    expect(text).toContain('Check bridge'); expect(text).toContain('REVIEW NOTES: Bridge closed');
    expect(buildRouteProvenance(record).confirmations.map(p => p.label)).toEqual(['CCP 1', 'OBJ WRECK']);
    expect(text).not.toMatch(/actual distance|travelled distance|average speed/i);
  });
  test('unknown historical sources remain unknown and imported accuracy is not presented as a current fix', () => {
    expect(pointProvenanceText({})).toBe('Source not recorded');
    expect(pointProvenanceText({ source: 'import', accuracyM: 3 })).not.toContain('±3m');
    expect(pointProvenanceText({ source: 'gps', accuracyM: 3 })).toContain('FIX ACCURACY: ±3m');
    expect(formatRouteTime(Infinity)).toBe('—'); expect(formatRouteTime(Number.MAX_VALUE)).toBe('—');
  });
});

test('saved and imported DR estimates name their origin and grid input instead of implying GPS', () => {
  const { pointProvenanceText } = require('../src/utils/routeCard');
  const provenance = { kind: 'dead-reckoning', origin: { mgrs: '18S UJ 26565 07581', pinnedAt: 1800000000000 }, gridBearing: 90, distanceMeters: 850 };
  for (const source of ['estimated', 'import']) {
    const text = pointProvenanceText({ source, provenance });
    expect(text).toContain('ESTIMATE · not a GPS fix'); expect(text).toContain('18S UJ 26565 07581'); expect(text).toContain('90°G / 850m');
  }
});
