/**
 * barometer.js — offline weather trend and barometric altitude.
 *
 * Why this belongs in a survival app: a falling barometer is the oldest and
 * most reliable warning of deteriorating weather, and it needs no network, no
 * subscription and no forecast provider. The phone's own pressure sensor is
 * enough. This is the offline-legitimate version of "weather" — everything here
 * is local computation over local sensor readings.
 *
 * ⚠️ THE TRAP THIS MODULE EXISTS TO AVOID
 * Station pressure falls when the weather worsens AND when you climb. Roughly
 * 1 hPa per 8.3 m of ascent near sea level, so walking up a 300 m ridge looks
 * like a ~36 hPa collapse — far beyond any real storm signature. A naive
 * trend reading would scream "severe storm" at a hiker on a hill.
 * Every reading is therefore reduced to sea-level pressure using the altitude
 * recorded with it before any trend is computed. Readings without an altitude
 * are used as-is, and the caller is told the result is uncorrected.
 *
 * Units: hPa (== millibar) throughout, metres for altitude, Celsius for temp.
 */

/** International Standard Atmosphere reference values. */
export const ISA_SEA_LEVEL_HPA = 1013.25;
const ISA_LAPSE_RATE = 0.0065;      // K/m
const ISA_SEA_LEVEL_K = 288.15;     // K
const ISA_EXPONENT = 5.25588;

/**
 * Reduce a station-pressure reading to its sea-level equivalent.
 * Uses the barometric formula with the ISA lapse rate. Pass `tempC` when the
 * real air temperature is known — that is the meteorologically correct
 * reduction. When it is omitted the ISA temperature *for that altitude* is
 * used, which keeps this consistent with pressureAltitude(); assuming a flat
 * 15 C at altitude diverges badly (about 24 hPa at 3000 m).
 */
export function seaLevelPressure(stationHPa, altitudeM, tempC = null) {
  if (!isFiniteNumber(stationHPa) || stationHPa <= 0) return null;
  if (!isFiniteNumber(altitudeM)) return null;
  // When the caller does not know the air temperature, use the ISA profile for
  // that altitude rather than a flat 15 C. Assuming sea-level warmth at 3000 m
  // is simply wrong and skews the reduction by tens of hPa; it also made this
  // function disagree with pressureAltitude, which is ISA-anchored.
  const t = isFiniteNumber(tempC) ? tempC : isaTemperatureC(altitudeM);
  const tempK = t + 273.15;
  if (tempK <= 0) return null;
  // P0 = P * (1 + (L*h) / T)^(g*M / (R*L))  — standard hypsometric reduction.
  const factor = Math.pow(1 + (ISA_LAPSE_RATE * altitudeM) / tempK, ISA_EXPONENT);
  return stationHPa * factor;
}

/** ISA air temperature at a given altitude (troposphere). */
export function isaTemperatureC(altitudeM) {
  return 15 - ISA_LAPSE_RATE * altitudeM;
}

/**
 * Altitude implied by a pressure reading, given the current sea-level pressure.
 * Barometric altitude is far more stable than GPS altitude for *relative*
 * change (climb/descent), which is what matters for dead reckoning on a slope.
 * It is only as accurate as the `seaLevelHPa` you feed it — an out-of-date
 * reference biases the absolute value, though the differences stay usable.
 */
export function pressureAltitude(stationHPa, seaLevelHPa = ISA_SEA_LEVEL_HPA) {
  if (!isFiniteNumber(stationHPa) || stationHPa <= 0) return null;
  if (!isFiniteNumber(seaLevelHPa) || seaLevelHPa <= 0) return null;
  return (ISA_SEA_LEVEL_K / ISA_LAPSE_RATE) * (1 - Math.pow(stationHPa / seaLevelHPa, 1 / ISA_EXPONENT));
}

/**
 * WMO-style pressure tendency bands, expressed in hPa per hour.
 * The classic tables are per 3 hours; these are the same thresholds divided by
 * three so a shorter observation window can still be classified.
 */
export const TENDENCY = {
  RISING_RAPIDLY: 'rising_rapidly',
  RISING: 'rising',
  STEADY: 'steady',
  FALLING: 'falling',
  FALLING_RAPIDLY: 'falling_rapidly',
};

const RAPID_HPA_PER_HOUR = 2.0;   // ~6 hPa/3h — the classic "very rapid" band
const MOVING_HPA_PER_HOUR = 0.5;  // ~1.6 hPa/3h — below this is "steady"

/** Minimum span of observations before a trend means anything. */
export const MIN_TREND_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Classify a pressure trend from timestamped readings.
 *
 * @param readings [{ t: epochMs, hPa: number, altitudeM?: number, tempC?: number }]
 * @returns {
 *   tendency, hPaPerHour, spanMs, samples,
 *   altitudeCorrected: boolean,   // false => the trend may be contaminated by climb/descent
 *   reliable: boolean             // false => window too short or too few samples
 * } or null when there is nothing to say.
 *
 * Slope is a robust Theil-Sen median fit, so one noisy sample (a door slam, a
 * gust, a pocket) cannot masquerade as a weather front.
 */
export function classifyTrend(readings) {
  const pts = normalizeReadings(readings);
  if (pts.length < 2) return null;

  const spanMs = pts[pts.length - 1].t - pts[0].t;
  if (spanMs <= 0) return null;

  const altitudeCorrected = pts.every((p) => p.corrected);
  const hPaPerHour = robustSlopePerHour(pts);
  if (hPaPerHour == null) return null;

  const magnitude = Math.abs(hPaPerHour);
  let tendency;
  if (magnitude < MOVING_HPA_PER_HOUR) tendency = TENDENCY.STEADY;
  else if (hPaPerHour <= -RAPID_HPA_PER_HOUR) tendency = TENDENCY.FALLING_RAPIDLY;
  else if (hPaPerHour < 0) tendency = TENDENCY.FALLING;
  else if (hPaPerHour >= RAPID_HPA_PER_HOUR) tendency = TENDENCY.RISING_RAPIDLY;
  else tendency = TENDENCY.RISING;

  return {
    tendency,
    hPaPerHour: round(hPaPerHour, 2),
    spanMs,
    samples: pts.length,
    altitudeCorrected,
    reliable: spanMs >= MIN_TREND_WINDOW_MS && pts.length >= 3,
  };
}

/** Storm risk bands. Deliberately coarse — this is an indicator, not a forecast. */
export const STORM_RISK = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  SEVERE: 'severe',
  UNKNOWN: 'unknown',
};

/**
 * Map a trend to a risk band.
 * Only *falling* pressure raises risk; rising pressure indicates improving
 * conditions. An unreliable or altitude-contaminated trend never returns better
 * than MODERATE, because the honest answer there is "we are not sure".
 */
export function stormRisk(trend) {
  if (!trend) return { level: STORM_RISK.UNKNOWN, confident: false };
  if (!trend.reliable) return { level: STORM_RISK.UNKNOWN, confident: false };

  const rate = trend.hPaPerHour;
  let level;
  if (rate <= -2.0) level = STORM_RISK.SEVERE;
  else if (rate <= -1.0) level = STORM_RISK.HIGH;
  else if (rate <= -0.5) level = STORM_RISK.MODERATE;
  else level = STORM_RISK.LOW;

  // An uncorrected trend cannot be trusted to distinguish weather from climbing,
  // so never present it as a confident severe/high call.
  if (!trend.altitudeCorrected && (level === STORM_RISK.SEVERE || level === STORM_RISK.HIGH)) {
    return { level: STORM_RISK.MODERATE, confident: false, reason: 'altitude_uncorrected' };
  }
  return { level, confident: true };
}

/**
 * Append a reading to a rolling window, dropping anything older than maxAgeMs.
 * Pure: returns a new array. Caller owns the clock, so this stays testable.
 */
export function addReading(buffer, reading, nowMs, maxAgeMs = 6 * 60 * 60 * 1000) {
  const list = Array.isArray(buffer) ? buffer : [];
  if (!reading || !isFiniteNumber(reading.hPa) || !isFiniteNumber(reading.t)) return list;
  const cutoff = nowMs - maxAgeMs;
  return [...list.filter((r) => r && r.t >= cutoff), reading]
    .sort((a, b) => a.t - b.t);
}

// ─── internals ───────────────────────────────────────────────────────────────

function normalizeReadings(readings) {
  if (!Array.isArray(readings)) return [];
  const out = [];
  for (const r of readings) {
    if (!r || !isFiniteNumber(r.hPa) || !isFiniteNumber(r.t) || r.hPa <= 0) continue;
    if (isFiniteNumber(r.altitudeM)) {
      const slp = seaLevelPressure(r.hPa, r.altitudeM, isFiniteNumber(r.tempC) ? r.tempC : 15);
      if (slp != null) { out.push({ t: r.t, hPa: slp, corrected: true }); continue; }
    }
    out.push({ t: r.t, hPa: r.hPa, corrected: false });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Theil-Sen slope in hPa per hour: the median of all pairwise slopes.
 *
 * Deliberately NOT least squares. A phone barometer spikes — a slammed car
 * door, a gust, a pocket, an aircraft cabin. Least squares is not robust: one
 * bad sample drags the fit and can invert the reported tendency. Theil-Sen
 * tolerates roughly 29% contaminated samples before it breaks down, which is
 * the right trade when the output tells someone whether a storm is coming.
 * O(n^2) is irrelevant at ~36 samples (6 h at 10 min spacing).
 */
function robustSlopePerHour(pts) {
  const n = pts.length;
  const slopes = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dtHours = (pts[j].t - pts[i].t) / 3600000;
      if (dtHours <= 0) continue;
      slopes.push((pts[j].hPa - pts[i].hPa) / dtHours);
    }
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const mid = slopes.length >> 1;
  return slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
}

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function round(v, dp) { const f = Math.pow(10, dp); return Math.round(v * f) / f; }
