const {
  resection, relativeWaypointBearing, formatBearing, applyDeclination,
  removeDeclination, backAzimuth, compassToGridHeading,
} = require('../src/utils/tactical');
const { parseMGRSToLatLon } = require('../src/utils/mgrs');
const { buildRouteCardText } = require('../src/utils/routeCard');

// Fixed WGS84 direct fixtures generated outside the app with GeographicLib2.1
// Python Geodesic.WGS84.Direct(observerLat, observerLon, bearing, distance).
// https://geographiclib.sourceforge.io/html/python/interface.html
// Runtime tests do not install or depend on GeographicLib or network access.
const knownObservers = [
  { observer: [38.9, -77], points: [[38.909007900507525, -77], [38.89999871965389, -76.98270857665827]], bearings: [0, 90] },
  { observer: [-33.86, 151.21], points: [[-33.70379744460447, 151.31786985313198], [-33.9275359665049, 151.35049251755305]], bearings: [30, 120] },
  { observer: [0, 0], points: [[0.006394857885749925, 0.006352048316643775], [0.012789715690771974, -0.012704096790484174]], bearings: [45, 315] },
  { observer: [70, 179.9], points: [[70.61781829342002, -179.02045532244827], [69.58516796336352, -178.09829236286453]], bearings: [30, 120] },
  { observer: [51.5, -0.1], points: [[51.55392031433273, -0.10150975521197406], [51.51243127986564, 0.013487192185316063]], bearings: [359, 80] },
  { observer: [82, 10], points: [[81.37219511476421, 7.611955293039069], [82.53465351172026, 6.454148490684883]], bearings: [210, 320] },
];

function solve({ points: [a, b], bearings: [ba, bb] }) {
  return resection(a[0], a[1], ba, b[0], b[1], bb);
}

describe('resection observer-to-landmark contract', () => {
  test.each(knownObservers)('recovers independent observer $observer', fixture => {
    const result = solve(fixture);
    expect(result).not.toBeNull();
    // 1e-7 latitude degree is about1cm; these controls have exact coordinates,
    // unlike an MGRS input quantized to a one-metre cell.
    expect(result.lat).toBeCloseTo(fixture.observer[0], 7);
    expect(result.lon).toBeCloseTo(fixture.observer[1], 7);
    expect(result.mgrsFormatted).toMatch(/\d+[A-Z] /);
  });

  test.each([
    [['18SUJ2708408436', '18SUJ2784806803'], [30, 120]],
    [['18SUJ2658708581', '18SUJ2806507548'], [0, 90]],
    [['18SUJ2728808272', '18SUJ2552808664'], [45, 315]],
  ])('recovers the native review fixture after MGRS quantization %j', (grids, bearings) => {
    const points = grids.map(grid => { const p = parseMGRSToLatLon(grid); return [p.lat, p.lon]; });
    const result = solve({ points, bearings });
    expect(result).not.toBeNull();
    const northM = (result.lat - 38.9) * 111200;
    const eastM = (result.lon + 77) * 111200 * Math.cos(38.9 * Math.PI / 180);
    expect(Math.hypot(northM, eastM)).toBeLessThan(1.5);
    expect(result.mgrs.startsWith('18S')).toBe(true);
  });

  test('magnetic input is explicitly corrected to true before solving', () => {
    const fixture = knownObservers[0];
    const magnetic = [350, 80];
    const result = solve({ ...fixture, bearings: magnetic.map(b => applyDeclination(b, 10)) });
    expect(result.lat).toBeCloseTo(38.9, 7);
    expect(result.lon).toBeCloseTo(-77, 7);
    expect(applyDeclination(90, null)).toBeNull();
  });

  test('reversed outward rays do not select the antipode', () => {
    const fixture = knownObservers[0];
    expect(solve({ ...fixture, bearings: [180, 270] })).toBeNull();
  });
  test.each([[0, 0], [0, 1], [0, 180], [0, 179]])('rejects weak bearing separation %j', (a, b) => {
    expect(resection(38.91, -77, a, 38.9, -76.98, b)).toBeNull();
  });
  test('rejects coincident landmarks and geometry outside local range', () => {
    expect(resection(38.9, -77, 0, 38.9, -77, 90)).toBeNull();
    expect(resection(40, -77, 0, 38.9, -74, 90)).toBeNull();
  });
  test.each([NaN, Infinity, null, undefined, '90', -1, 361])('rejects invalid bearing %p', b => {
    expect(resection(38.91, -77, b, 38.9, -76.98, 90)).toBeNull();
  });
  test.each([[85, 0], [-81, 0], [0, 181], [0, -181], [NaN, 0], [0, null]])('rejects invalid/unrepresentable coordinate %j', (lat, lon) => {
    expect(resection(lat, lon, 0, 38.9, -76.98, 90)).toBeNull();
  });
});

describe('north-reference contract', () => {
  test('relative arrow subtracts true heading and wraps across north', () => {
    expect(relativeWaypointBearing(10, 350, 'true')).toBe(20);
    expect(relativeWaypointBearing(350, 10, 'true')).toBe(340);
    expect(relativeWaypointBearing(0, 0, 'true')).toBe(0);
  });
  test.each(['magnetic', 'grid', null, undefined, 'unknown'])('never subtracts a %p heading from a true target', reference => {
    expect(relativeWaypointBearing(90, 45, reference)).toBeNull();
  });
  test.each([null, undefined, NaN, Infinity, -1, 361])('no north-up fallback for invalid heading %p', heading => {
    expect(relativeWaypointBearing(90, heading, 'true')).toBeNull();
    expect(compassToGridHeading(heading, 'true', 45, -70)).toBeNull();
  });
  test('a magnetic reciprocal corrected only by declination is TRUE, not GRID', () => {
    const reciprocal = backAzimuth(90);
    expect(formatBearing(reciprocal, 'magnetic')).toBe('270°M');
    expect(formatBearing(applyDeclination(reciprocal, 10), 'true')).toBe('280°T');
    expect(removeDeclination(280, 10)).toBe(270);
    expect(compassToGridHeading(280, 'true', 85, 0)).toBeNull();
    expect(compassToGridHeading(280, 'true', -81, 0)).toBeNull();
  });
  test('display always names reference, including rounded north and unknown values', () => {
    expect(formatBearing(359.9, 'true')).toBe('0°T');
    expect(formatBearing(90, 'grid', true)).toBe('090°G');
    expect(formatBearing(90, 'magnetic')).toBe('90°M');
    expect(formatBearing(90, null)).toBe('—');
    expect(formatBearing(null, 'true')).toBe('—');
  });
  test('route text export carries the same true reference as navigation', () => {
    const text = buildRouteCardText({ name: 'Route', waypoints: [{ label: 'A', mgrs: '18S UJ' }] },
      [{ bearing: 359.9, distanceFormatted: '100m', mgrs: '18S UJ', to: { name: 'B' } }], 100, '091200ZSEP26');
    expect(text).toContain('000°T / 100m');
    expect(text).not.toContain('360°');
  });
});
