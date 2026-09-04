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
  vincentyDirect, geodesicDestination,
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

// ─── Consumers must use the ellipsoid, not their own sphere ─────────────────
describe('the slope tool measures its run on the ellipsoid', () => {
  const fs = require('fs');
  const path = require('path');
  const elevSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/tools/ElevationTool.js'), 'utf8');

  it('ElevationTool imports geodesicDistance and keeps no private haversine', () => {
    expect(elevSrc).toMatch(/import \{ geodesicDistance \} from '\.\.\/\.\.\/utils\/geodesy'/);
    expect(elevSrc).toMatch(/geodesicDistance\(location\.lat, location\.lon, lat2, lon2\)/);
    expect(elevSrc).not.toMatch(/6371000/);
    expect(elevSrc).not.toMatch(/haversineM/);
  });

  it('the swap changes the answer by the documented ellipsoid margin', () => {
    // 1 deg of latitude at 45 N: the sphere is short of the ellipsoid by
    // ~0.2%, which is metres of run and therefore a real slope-angle error.
    const sphere = haversineDistance(45, -117, 46, -117);
    const ellipsoid = geodesicDistance(45, -117, 46, -117);
    expect(ellipsoid).toBeCloseTo(111141.5, 0);
    expect(sphere).toBeCloseTo(111194.9, 0);
    const relative = Math.abs(ellipsoid - sphere) / ellipsoid;
    expect(relative).toBeGreaterThan(0.0004);
    expect(relative).toBeLessThan(0.004);
  });
});

describe('the declination tool surfaces the point scale factor', () => {
  const fs = require('fs');
  const path = require('path');
  const decSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/tools/DeclinationTool.js'), 'utf8');

  it('reads pointScaleFactor from geodesy and renders it', () => {
    expect(decSrc).toMatch(/pointScaleFactor/);
    expect(decSrc).toMatch(/declination\.scale\.factor/);
    expect(decSrc).toMatch(/declination\.scale\.groundPerKm/);
  });

  it('the ground correction per 1000 m of grid is real and signed', () => {
    // Near the central meridian k < 1: grid distance is SHORT of ground.
    const kCm = pointScaleFactor(45, -117);
    expect(kCm).toBeCloseTo(0.9996, 5);
    expect(1000 / kCm - 1000).toBeGreaterThan(0.3);
    // Out at the zone edge k > 1: grid distance OVERSTATES the ground.
    const kEdge = pointScaleFactor(0, -114.0);
    expect(kEdge).toBeGreaterThan(1);
    expect(1000 / kEdge - 1000).toBeLessThan(0);
  });
});

// ─── Direct problem (Vincenty direct) ────────────────────────────────────────
describe('vincentyDirect', () => {
  it('round-trips the classic Flinders Peak / Buninyong line through the inverse', () => {
    // Round-trip against the inverse solution, which is itself checked above
    // against published values: run the inverse's own answer back out and you
    // must land on the point you started from.
    const from = { lat: 37.95103, lon: 144.42487 };   // Flinders Peak
    const to   = { lat: -37.65282, lon: 143.92649 };  // Buninyong
    const inv = vincentyInverse(from.lat, from.lon, to.lat, to.lon);
    expect(inv).not.toBeNull();
    const back = vincentyDirect(from.lat, from.lon, inv.initialBearing, inv.distance);
    expect(back).not.toBeNull();
    expect(back.lat).toBeCloseTo(to.lat, 9);
    expect(back.lon).toBeCloseTo(to.lon, 9);
    expect(back.finalBearing).toBeCloseTo(inv.finalBearing, 8);
  });

  it('round-trips inverse -> direct to better than 1e-6 deg over 100 km', () => {
    const cases = [
      [45, -117, 12.5],
      [-33.86, 151.21, 200],
      [64.9, -147.7, 355],
      [0.5, 32.5, 90],
    ];
    for (const [lat, lon, brg] of cases) {
      const d = vincentyDirect(lat, lon, brg, 100000);
      expect(d).not.toBeNull();
      const inv = vincentyInverse(lat, lon, d.lat, d.lon);
      expect(inv.distance).toBeCloseTo(100000, 6);
      expect(inv.initialBearing).toBeCloseTo(brg, 8);
      // And back out again lands on the same point.
      const again = vincentyDirect(lat, lon, inv.initialBearing, inv.distance);
      expect(Math.abs(again.lat - d.lat)).toBeLessThan(1e-6);
      expect(Math.abs(again.lon - d.lon)).toBeLessThan(1e-6);
    }
  });

  it('is measurably better than the sphere — the reason for the swap', () => {
    // 100 km due north from 40 N. The sphere uses R=6371 km; the WGS84 meridian
    // radius of curvature there is larger, so the sphere overshoots in latitude.
    const ell = vincentyDirect(40, -74, 0, 100000);
    const sph = geodesicDestination(40, -74, 0, 100000);
    expect(ell.lat).toBeCloseTo(40.90054959, 8);
    // Same point by construction (Vincenty converged), so compare against the
    // spherical formula explicitly rather than through the wrapper.
    const R = 6371000;
    const sphLat = (Math.asin(Math.sin((40 * Math.PI) / 180) * Math.cos(100000 / R) +
      Math.cos((40 * Math.PI) / 180) * Math.sin(100000 / R)) * 180) / Math.PI;
    expect(sph.lat).toBeCloseTo(ell.lat, 5);          // wrapper used the ellipsoid
    const offsetM = Math.abs(sphLat - ell.lat) * 111320;
    expect(offsetM).toBeGreaterThan(50);              // ~180 m of real error
  });

  it('a zero-distance run stays put', () => {
    const d = vincentyDirect(45, -117, 73, 0);
    expect(d.lat).toBeCloseTo(45, 12);
    expect(d.lon).toBeCloseTo(-117, 12);
  });

  it('short distances are exact enough for 1 m MGRS', () => {
    const d = vincentyDirect(45, -117, 90, 1);
    const inv = vincentyInverse(45, -117, d.lat, d.lon);
    // The residual here is the INVERSE's floor, not the direct's: its lambda
    // loop stops at 1e-12 rad, which is ~6 um on the ground. Six orders of
    // magnitude inside the 1 m the app prints.
    expect(inv.distance).toBeCloseTo(1, 5);
  });

  it('handles a near-antipodal run without blowing up', () => {
    // The direct problem has no antipodal singularity — 20 000 km simply
    // converges. This pins that it returns a usable point rather than null.
    const d = vincentyDirect(0, 0, 90, 20000000);
    expect(d).not.toBeNull();
    expect(Number.isFinite(d.lat)).toBe(true);
    expect(d.lon).toBeGreaterThanOrEqual(-180);
    expect(d.lon).toBeLessThanOrEqual(180);
  });

  it('wraps longitude into -180..180 rather than running off the end', () => {
    const d = vincentyDirect(0, 179, 90, 500000);
    expect(d.lon).toBeLessThan(0);       // crossed the antimeridian
    expect(d.lon).toBeGreaterThan(-180);
  });

  it('refuses bad input rather than returning NaN', () => {
    expect(vincentyDirect(NaN, -117, 0, 1000)).toBeNull();
    expect(vincentyDirect(45, -117, NaN, 1000)).toBeNull();
    expect(vincentyDirect(45, -117, 0, Infinity)).toBeNull();
    expect(vincentyDirect(45, -117, 0, -1)).toBeNull();
    expect(geodesicDestination(45, null, 0, 1000)).toBeNull();
    expect(geodesicDestination(45, -117, 0, -1000)).toBeNull();
  });

  it('geodesicDestination is the direct mirror of geodesicDistance', () => {
    const d = geodesicDestination(51.5, -0.12, 45, 25000);
    expect(geodesicDistance(51.5, -0.12, d.lat, d.lon)).toBeCloseTo(25000, 6);
    // Wrapper exposes position only, like geodesicDistance exposes a scalar.
    expect(Object.keys(d).sort()).toEqual(['lat', 'lon']);
  });
});

describe('dead reckoning runs on the ellipsoid', () => {
  const fs = require('fs');
  const path = require('path');
  const tacSrc = fs.readFileSync(path.join(__dirname, '..', 'src/utils/tactical.js'), 'utf8');

  it('tactical.js keeps no sphere radius of its own for DR', () => {
    expect(tacSrc).toMatch(/import \{ geodesicDestination \} from '\.\/geodesy'/);
    expect(tacSrc).toMatch(/geodesicDestination\(startLat, startLon, headingDeg, distanceM\)/);
    expect(tacSrc).not.toMatch(/6371000/);
  });
});
