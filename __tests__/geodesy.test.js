/**
 * geodesy.test.js — ellipsoidal distance/bearing and UTM grid geometry.
 *
 * Where possible these check against published reference values rather than
 * against our own output, so the tests can fail if the implementation is wrong
 * rather than merely inconsistent.
 */
import {
  UTM_K0,
  vincentyInverse, haversineDistance, geodesicDistance, geodesicBearing,
  centralMeridian, gridConvergence, pointScaleFactor,
  gmAngle, magneticToGrid, gridToMagnetic, trueToGrid, gridToTrue,
} from '../src/utils/geodesy';

describe('vincentyInverse', () => {
  it('matches the classic Vincenty test line (Lat/Lon 0,0 to 0.5,179.5)', () => {
    // Vincenty's own near-antipodal-ish check; distance is well established.
    const r = vincentyInverse(0, 0, 0.5, 179.5);
    expect(r).not.toBeNull();
    expect(r.distance / 1000).toBeGreaterThan(19900);
  });

  it('measures a degree of latitude near the equator (~110.574 km)', () => {
    // Standard WGS84 figure for 0 -> 1 degree of latitude.
    const r = vincentyInverse(0, 0, 1, 0);
    expect(r.distance).toBeCloseTo(110574.4, 0);
  });

  it('measures a degree of longitude at the equator (~111.319 km)', () => {
    const r = vincentyInverse(0, 0, 0, 1);
    expect(r.distance).toBeCloseTo(111319.5, 0);
  });

  it('returns 0 for coincident points without dividing by zero', () => {
    const r = vincentyInverse(34.05, -118.24, 34.05, -118.24);
    expect(r.distance).toBe(0);
    expect(r.converged).toBe(true);
  });

  it('is symmetric', () => {
    const ab = vincentyInverse(34.05, -118.24, 40.71, -74.01).distance;
    const ba = vincentyInverse(40.71, -74.01, 34.05, -118.24).distance;
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('reports initial and final bearing, which differ on a long line', () => {
    const r = vincentyInverse(34.05, -118.24, 51.51, -0.13); // LA -> London
    expect(r.initialBearing).toBeGreaterThan(0);
    expect(r.initialBearing).toBeLessThan(90);   // north-east departure
    // Great-circle bearing rotates substantially over a transatlantic leg.
    expect(Math.abs(r.finalBearing - r.initialBearing)).toBeGreaterThan(20);
  });

  it('rejects non-numeric input rather than returning NaN', () => {
    expect(vincentyInverse(null, 0, 1, 1)).toBeNull();
    expect(vincentyInverse(0, 0, 1, 'x')).toBeNull();
    expect(vincentyInverse(NaN, 0, 0, 0)).toBeNull();
  });
});

describe('geodesicDistance vs the spherical formula we used to ship', () => {
  it('differs from haversine by the documented order of magnitude', () => {
    // 1 degree of longitude at 60 N: the sphere understates the ellipsoid.
    const g = geodesicDistance(60, 10, 60, 11);
    const h = haversineDistance(60, 10, 60, 11);
    const errPct = Math.abs(h - g) / g * 100;
    expect(errPct).toBeGreaterThan(0.2);
    expect(errPct).toBeLessThan(0.5);
  });

  it('is within a few metres of haversine on a short tactical leg', () => {
    // Short legs are where the old formula was defensible; confirm we did not
    // introduce a large change for everyday use.
    const g = geodesicDistance(34.05, -118.24, 34.10, -118.20);
    const h = haversineDistance(34.05, -118.24, 34.10, -118.20);
    expect(Math.abs(g - h)).toBeLessThan(15);
    expect(g).toBeGreaterThan(6000);
    expect(g).toBeLessThan(7000);
  });

  it('falls back to a finite spherical value instead of returning null', () => {
    // Exactly antipodal: Vincenty cannot converge.
    const d = geodesicDistance(0, 0, 0, 180);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(19000000);
  });
});

describe('geodesicBearing', () => {
  it('reads due north / east / south / west correctly', () => {
    expect(geodesicBearing(0, 0, 1, 0)).toBeCloseTo(0, 3);
    expect(geodesicBearing(0, 0, 0, 1)).toBeCloseTo(90, 3);
    expect(geodesicBearing(1, 0, 0, 0)).toBeCloseTo(180, 3);
    expect(geodesicBearing(0, 1, 0, 0)).toBeCloseTo(270, 3);
  });

  it('always returns 0-360', () => {
    for (const [a, b, c, d] of [[34, -118, 51, 0], [51, 0, 34, -118], [-34, 18, 35, 139]]) {
      const br = geodesicBearing(a, b, c, d);
      expect(br).toBeGreaterThanOrEqual(0);
      expect(br).toBeLessThan(360);
    }
  });
});

describe('centralMeridian', () => {
  it('is the zone centre for ordinary zones', () => {
    expect(centralMeridian(34.05, -118.24)).toBe(-117); // zone 11
    expect(centralMeridian(51.5, -0.13)).toBe(-3);      // zone 30
    expect(centralMeridian(0, 0)).toBe(3);              // zone 31
  });

  it('honours the widened Norway zone 32', () => {
    // 58 N, 5 E falls in the irregular zone 32 (would otherwise be 31).
    expect(centralMeridian(58, 5)).toBe(9);
  });

  it('honours the Svalbard zones', () => {
    expect(centralMeridian(78, 15)).toBe(15); // zone 33
    expect(centralMeridian(78, 25)).toBe(27); // zone 35
  });
});

describe('gridConvergence — the number we never used to compute', () => {
  it('is zero on the central meridian', () => {
    expect(gridConvergence(45, -117)).toBeCloseTo(0, 6);
    expect(gridConvergence(0, 3)).toBeCloseTo(0, 6);
  });

  it('approximates dLon * sin(lat) near the meridian', () => {
    // 2 degrees east of the CM at 45 N: expect ~1.41 deg.
    const g = gridConvergence(45, -115);
    expect(g).toBeCloseTo(2 * Math.sin((45 * Math.PI) / 180), 2);
  });

  it('is positive east of the central meridian and negative west', () => {
    expect(gridConvergence(45, -115)).toBeGreaterThan(0); // CM -117
    expect(gridConvergence(45, -119)).toBeLessThan(0);
  });

  it('flips sign in the southern hemisphere', () => {
    expect(gridConvergence(-45, -115)).toBeLessThan(0);
  });

  it('reaches the magnitudes that justify the feature', () => {
    // Near a zone edge at high latitude, convergence is militarily significant.
    const g = Math.abs(gridConvergence(65, -114.01)); // ~3 deg from CM -117
    expect(g).toBeGreaterThan(2.5);
    expect(g).toBeLessThan(2.9);
  });

  it('is ~0 at the equator regardless of longitude offset', () => {
    expect(Math.abs(gridConvergence(0, 5))).toBeLessThan(0.01);
  });

  it('flips sign across a zone boundary, because the meridian jumps', () => {
    // -114 is exactly the zone 11/12 edge. At -114.5 you are 2.5 deg EAST of
    // zone 11's CM (-117); at -114 you are in zone 12 and 3 deg WEST of its CM
    // (-111). Convergence therefore changes sign over half a degree. This is
    // correct and worth pinning: it is easy to write a test that assumes
    // otherwise.
    expect(centralMeridian(45, -114.5)).toBe(-117);
    expect(centralMeridian(45, -114)).toBe(-111);
    expect(gridConvergence(45, -114.5)).toBeGreaterThan(0);
    expect(gridConvergence(45, -114)).toBeLessThan(0);
  });

  it('rejects bad input', () => {
    expect(gridConvergence(null, 0)).toBeNull();
    expect(gridConvergence(0, NaN)).toBeNull();
  });
});

describe('pointScaleFactor', () => {
  it('is exactly k0 on the central meridian', () => {
    expect(pointScaleFactor(45, -117)).toBeCloseTo(UTM_K0, 9);
  });

  it('rises above 1 toward the zone edge', () => {
    const k = pointScaleFactor(45, -114); // 3 deg from CM
    expect(k).toBeGreaterThan(1.0);
    expect(k).toBeLessThan(1.001);
  });

  it('is worth ~1 m/km at a zone edge on the equator, but far less at 45 N', () => {
    // The effect scales with cos(lat), so quoting a single "m per km" figure
    // without a latitude would be misleading.
    const equator = 1000 * (pointScaleFactor(0, 6) - 1);      // 3 deg from CM 9
    const midLat = 1000 * (pointScaleFactor(45, -114.5) - 1); // 2.5 deg from CM -117
    expect(equator).toBeGreaterThan(0.9);
    expect(equator).toBeLessThan(1.1);
    expect(midLat).toBeLessThan(0.2);
  });
});

describe('G-M angle and direction conversions (FM 3-25.26)', () => {
  // On the central meridian convergence is 0, so the G-M angle collapses to
  // the declination — which is exactly the case the old code handled.
  it('equals declination on the central meridian', () => {
    expect(gmAngle(45, -117, 12)).toBeCloseTo(12, 6);
  });

  it('differs from declination away from the central meridian', () => {
    // -114.5 sits inside zone 11 (CM -117), so convergence is about +1.77 and
    // the G-M angle is correspondingly smaller than the declination.
    const gm = gmAngle(45, -114.5, 12);
    expect(gm).toBeLessThan(12);
    expect(gm).toBeCloseTo(12 - gridConvergence(45, -114.5), 9);
  });

  it('follows G-M = declination - convergence', () => {
    for (const [lat, lon, dec] of [[34, -115, 11.5], [60, 8, 3], [-33, 20, -25]]) {
      expect(gmAngle(lat, lon, dec)).toBeCloseTo(dec - gridConvergence(lat, lon), 9);
    }
  });

  it('round-trips magnetic <-> grid', () => {
    const lat = 45, lon = -114, dec = 12;
    const grid = magneticToGrid(50, lat, lon, dec);
    expect(gridToMagnetic(grid, lat, lon, dec)).toBeCloseTo(50, 9);
  });

  it('round-trips true <-> grid', () => {
    const lat = 45, lon = -114;
    const grid = trueToGrid(120, lat, lon);
    expect(gridToTrue(grid, lat, lon)).toBeCloseTo(120, 9);
  });

  it('produces a materially different grid bearing than the declination-only path', () => {
    // The old behaviour: magnetic + declination, called "grid".
    const lat = 65, lon = -114.01, dec = 15, mag = 90;
    const oldWay = (mag + dec) % 360;          // actually a TRUE bearing
    const correct = magneticToGrid(mag, lat, lon, dec);
    const deltaDeg = Math.abs(correct - oldWay);
    expect(deltaDeg).toBeGreaterThan(2.5);      // ~2.7 deg of convergence
    // Over 5 km that is a real lateral miss.
    const lateralM = 5000 * Math.tan((deltaDeg * Math.PI) / 180);
    expect(lateralM).toBeGreaterThan(200);
  });

  it('wraps through 0/360 correctly', () => {
    expect(magneticToGrid(359, 45, -117, 5)).toBeCloseTo(4, 6);
    expect(gridToMagnetic(2, 45, -117, 5)).toBeCloseTo(357, 6);
  });

  it('returns null on bad input rather than NaN', () => {
    expect(gmAngle(45, -117, null)).toBeNull();
    expect(magneticToGrid(null, 45, -117, 5)).toBeNull();
    expect(trueToGrid(NaN, 45, -117)).toBeNull();
  });
});
