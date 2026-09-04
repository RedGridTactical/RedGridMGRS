/**
 * geodesy.js — ellipsoidal distance/bearing and UTM grid geometry.
 *
 * WHY THIS EXISTS
 * The app converts coordinates on the WGS84 ellipsoid but measured distance and
 * bearing on a sphere, and it never computed grid convergence at all. Both are
 * real errors under a "1-metre precision, DAGR-class" claim:
 *
 *   - Spherical (haversine) distance is off by 0.22-0.36% against the
 *     ellipsoid: about 200 m over 92 km, ~7 m on a 6 km leg.
 *   - Grid convergence reaches 2.7 deg at 65 N near a UTM zone edge. Treating a
 *     true bearing as a grid bearing puts you 237 m off over 5 km, 475 m over
 *     10 km. On an MGRS app, that is the wrong number for the map in your hand.
 *
 * DOCTRINE (FM 3-25.26): the value a land navigator needs between compass and
 * grid map is the G-M ANGLE, not magnetic declination.
 *
 *     G-M angle  =  declination  -  grid convergence          (east positive)
 *
 * Sign convention used throughout: EAST POSITIVE for every angle.
 *   declination  = true north  -> magnetic north
 *   convergence  = true north  -> grid north
 *   gmAngle      = grid north  -> magnetic north
 */
import { WGS84_A, WGS84_F, getZoneNumber } from './mgrs';

const d2r = (d) => (d * Math.PI) / 180;
const r2d = (r) => (r * 180) / Math.PI;
const norm360 = (deg) => ((deg % 360) + 360) % 360;

/** UTM scale factor on the central meridian. */
export const UTM_K0 = 0.9996;

/** Radius used by the legacy spherical path, kept for the documented fallback. */
const SPHERE_R = 6371000;

// ─── Geodesic distance and azimuth (Vincenty inverse) ────────────────────────

/**
 * Vincenty inverse solution on the WGS84 ellipsoid.
 * Accurate to well under a millimetre for the distances this app deals with.
 *
 * Returns null when the iteration does not converge, which happens for
 * near-antipodal pairs. Callers fall back to the spherical formula there: an
 * antipodal distance is meaningless for land navigation, and returning a wrong
 * number silently would be worse than returning an approximate one loudly.
 */
export function vincentyInverse(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(isFiniteNum)) return null;

  const a = WGS84_A;
  const f = WGS84_F;
  const b = a * (1 - f);

  const L = d2r(lon2 - lon1);
  const U1 = Math.atan((1 - f) * Math.tan(d2r(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(d2r(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaPrev;
  let iterations = 0;
  let sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM, C;

  do {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    );
    // Coincident points: distance 0, bearing undefined.
    if (sinSigma === 0) return { distance: 0, initialBearing: 0, finalBearing: 0, converged: true, iterations };

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    // cos2Alpha is 0 on an equatorial line; cos2SigmaM is then undefined and 0
    // is the conventional substitution.
    cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) * f * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    iterations += 1;
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && iterations < 200);

  if (iterations >= 200) return null; // near-antipodal, did not converge

  const uSq = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B * sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  const distance = b * A * (sigma - deltaSigma);

  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const initialBearing = r2d(Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda));
  const finalBearing = r2d(Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda));

  return {
    distance,
    initialBearing: norm360(initialBearing),
    finalBearing: norm360(finalBearing),
    converged: true,
    iterations,
  };
}

// ─── Geodesic destination (Vincenty direct) ──────────────────────────────────

/**
 * Vincenty DIRECT solution on the WGS84 ellipsoid: given a start point, an
 * initial azimuth and a distance, where do you end up?
 *
 * The counterpart to vincentyInverse, and the same accuracy — sub-millimetre
 * over any distance this app deals with. Dead reckoning used a sphere, which
 * is the same 0.2-0.36% error the inverse path already documents, except it
 * lands as displaced POSITION rather than a wrong number: ~2 m off after 1 km
 * of DR, ~200 m after 100 km, and MGRS is printed to 1 m.
 *
 * Returns null on bad input or if the iteration does not converge (the same
 * contract as vincentyInverse), so callers can fall back deliberately.
 *
 * @returns {{lat:number, lon:number, finalBearing:number, converged:boolean, iterations:number}|null}
 */
export function vincentyDirect(lat1, lon1, bearingDeg, distanceM) {
  if (![lat1, lon1, bearingDeg, distanceM].every(isFiniteNum)) return null;
  if (distanceM < 0) return null;

  const a = WGS84_A;
  const f = WGS84_F;
  const b = a * (1 - f);

  const alpha1 = d2r(bearingDeg);
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);

  const U1 = Math.atan((1 - f) * Math.tan(d2r(lat1)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const tanU1 = (1 - f) * Math.tan(d2r(lat1));

  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cos2Alpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = distanceM / (b * A);
  let sigmaPrev;
  let iterations = 0;
  let sinSigma, cosSigma, cos2SigmaM, deltaSigma;

  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    deltaSigma =
      B * sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaPrev = sigma;
    sigma = distanceM / (b * A) + deltaSigma;
    iterations += 1;
  } while (Math.abs(sigma - sigmaPrev) > 1e-12 && iterations < 200);

  if (iterations >= 200) return null; // did not converge

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp)
  );
  const lambda = Math.atan2(
    sinSigma * sinAlpha1,
    cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1
  );
  const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
  const L =
    lambda -
    (1 - C) * f * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

  const finalBearing = Math.atan2(sinAlpha, -tmp);

  return {
    lat: r2d(lat2),
    // Normalise into -180..180 rather than letting a long easterly run walk
    // off the end of the range.
    lon: ((r2d(d2r(lon1) + L) + 540) % 360) - 180,
    finalBearing: norm360(r2d(finalBearing)),
    converged: true,
    iterations,
  };
}

/** Great-circle destination on a sphere. The documented fallback, not the default. */
function sphericalDestination(lat1, lon1, bearingDeg, distanceM) {
  const delta = distanceM / SPHERE_R;
  const theta = d2r(bearingDeg);
  const phi1 = d2r(lat1);
  const lam1 = d2r(lon1);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: r2d(phi2), lon: ((r2d(lam2) + 540) % 360) - 180 };
}

/**
 * Ellipsoidal destination point, falling back to spherical if Vincenty fails.
 * The direct-problem mirror of geodesicDistance.
 *
 * @returns {{lat:number, lon:number}|null}
 */
export function geodesicDestination(lat1, lon1, bearingDeg, distanceM) {
  if (![lat1, lon1, bearingDeg, distanceM].every(isFiniteNum)) return null;
  if (distanceM < 0) return null;
  const r = vincentyDirect(lat1, lon1, bearingDeg, distanceM);
  if (r) return { lat: r.lat, lon: r.lon };
  return sphericalDestination(lat1, lon1, bearingDeg, distanceM);
}

/** Great-circle distance on a sphere. The documented fallback, not the default. */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const p1 = d2r(lat1), p2 = d2r(lat2);
  const dp = d2r(lat2 - lat1), dl = d2r(lon2 - lon1);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * SPHERE_R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Ellipsoidal distance in metres, falling back to spherical if Vincenty fails. */
export function geodesicDistance(lat1, lon1, lat2, lon2) {
  const r = vincentyInverse(lat1, lon1, lat2, lon2);
  if (r) return r.distance;
  return haversineDistance(lat1, lon1, lat2, lon2);
}

/** Ellipsoidal initial azimuth (TRUE north, east positive), degrees 0-360. */
export function geodesicBearing(lat1, lon1, lat2, lon2) {
  const r = vincentyInverse(lat1, lon1, lat2, lon2);
  if (r) return r.initialBearing;
  const y = Math.sin(d2r(lon2 - lon1)) * Math.cos(d2r(lat2));
  const x =
    Math.cos(d2r(lat1)) * Math.sin(d2r(lat2)) -
    Math.sin(d2r(lat1)) * Math.cos(d2r(lat2)) * Math.cos(d2r(lon2 - lon1));
  return norm360(r2d(Math.atan2(y, x)));
}

// ─── UTM grid geometry ───────────────────────────────────────────────────────

/**
 * Central meridian of the UTM zone containing this position, in degrees.
 * Uses the app's own zone finder so the Norway and Svalbard irregular zones —
 * which shift the central meridian — stay consistent with the MGRS output.
 */
export function centralMeridian(lat, lon) {
  const zone = getZoneNumber(lat, lon);
  return (zone - 1) * 6 - 180 + 3;
}

/**
 * Grid convergence: the angle from TRUE north to GRID north, east positive.
 *
 * Series expansion for the transverse Mercator, good to well under an
 * arcsecond inside a 6-degree zone. The leading term is dLon*sin(lat); the rest
 * matters only near the zone edge at high latitude.
 */
export function gridConvergence(lat, lon) {
  if (!isFiniteNum(lat) || !isFiniteNum(lon)) return null;
  const cm = centralMeridian(lat, lon);
  // Normalise the difference across the antimeridian.
  let dLonDeg = lon - cm;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;

  const phi = d2r(lat);
  const dl = d2r(dLonDeg);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  const eta2 = (e2 / (1 - e2)) * cosPhi * cosPhi;

  const t1 = dl * sinPhi;
  const t2 = (dl ** 3 / 3) * sinPhi * cosPhi * cosPhi * (1 + 3 * eta2 + 2 * eta2 * eta2);
  const t3 = (dl ** 5 / 15) * sinPhi * cosPhi ** 4 * (2 - tanPhi * tanPhi);

  return r2d(t1 + t2 + t3);
}

/**
 * Point scale factor: grid distance / true ground distance.
 * 0.9996 on the central meridian, rising past 1.0 toward the zone edge. A grid
 * distance scaled off a map is not the distance you will walk. The effect
 * depends on latitude as well as offset, because it scales with cos(lat):
 * about 0.98 m/km at a zone edge on the equator, but only ~0.08 m/km 2.5 deg
 * out at 45 N.
 */
export function pointScaleFactor(lat, lon) {
  if (!isFiniteNum(lat) || !isFiniteNum(lon)) return null;
  const cm = centralMeridian(lat, lon);
  let dLonDeg = lon - cm;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;

  const phi = d2r(lat);
  const dl = d2r(dLonDeg);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F;
  const eta2 = (e2 / (1 - e2)) * cosPhi * cosPhi;
  const A = dl * cosPhi;

  return UTM_K0 * (1 + ((1 + eta2) * A * A) / 2 + ((5 - 4 * tanPhi * tanPhi) * A ** 4) / 24);
}

// ─── Direction conversions (FM 3-25.26) ──────────────────────────────────────

/**
 * G-M angle: from GRID north to MAGNETIC north, east positive.
 * This — not declination alone — is what converts between a compass and an
 * MGRS/UTM map.
 */
export function gmAngle(lat, lon, declinationDeg) {
  const conv = gridConvergence(lat, lon);
  if (conv == null || !isFiniteNum(declinationDeg)) return null;
  return declinationDeg - conv;
}

/** Magnetic bearing -> grid bearing. */
export function magneticToGrid(magneticBearing, lat, lon, declinationDeg) {
  const gm = gmAngle(lat, lon, declinationDeg);
  if (gm == null || !isFiniteNum(magneticBearing)) return null;
  return norm360(magneticBearing + gm);
}

/** Grid bearing -> magnetic bearing. */
export function gridToMagnetic(gridBearing, lat, lon, declinationDeg) {
  const gm = gmAngle(lat, lon, declinationDeg);
  if (gm == null || !isFiniteNum(gridBearing)) return null;
  return norm360(gridBearing - gm);
}

/** True bearing -> grid bearing. */
export function trueToGrid(trueBearing, lat, lon) {
  const conv = gridConvergence(lat, lon);
  if (conv == null || !isFiniteNum(trueBearing)) return null;
  return norm360(trueBearing - conv);
}

/** Grid bearing -> true bearing. */
export function gridToTrue(gridBearing, lat, lon) {
  const conv = gridConvergence(lat, lon);
  if (conv == null || !isFiniteNum(gridBearing)) return null;
  return norm360(gridBearing + conv);
}

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
