/**
 * barometer.test.js — offline pressure trend, storm risk, barometric altitude.
 * Pure computation; the caller owns the clock, so no fake timers are needed.
 */
import {
  ISA_SEA_LEVEL_HPA, TENDENCY, STORM_RISK, MIN_TREND_WINDOW_MS,
  seaLevelPressure, pressureAltitude, classifyTrend, stormRisk, addReading,
} from '../src/utils/barometer';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Build a reading series with a constant sea-level rate of change. */
function series({ startHPa, hPaPerHour, spanMs, step = 10 * MIN, altitudeM = 0 }) {
  const out = [];
  for (let t = 0; t <= spanMs; t += step) {
    const slp = startHPa + hPaPerHour * (t / HOUR);
    // Convert the intended sea-level value back to what a sensor at altitudeM reads.
    const station = altitudeM === 0 ? slp : slp / (seaLevelPressure(1, altitudeM) / 1);
    out.push({ t, hPa: station, altitudeM });
  }
  return out;
}

describe('sea-level reduction', () => {
  it('is a no-op at sea level', () => {
    expect(seaLevelPressure(1000, 0)).toBeCloseTo(1000, 6);
  });

  it('raises the reading for a station above sea level', () => {
    // ~1 hPa per 8.3 m near sea level, so 100 m is roughly +12 hPa.
    const slp = seaLevelPressure(1000, 100);
    expect(slp).toBeGreaterThan(1011);
    expect(slp).toBeLessThan(1013.5);
  });

  it('round-trips against pressureAltitude', () => {
    const station = 900;
    const alt = pressureAltitude(station, ISA_SEA_LEVEL_HPA);
    const back = seaLevelPressure(station, alt);
    expect(back).toBeCloseTo(ISA_SEA_LEVEL_HPA, 0);
  });

  it('rejects nonsense input instead of returning NaN', () => {
    expect(seaLevelPressure(0, 100)).toBeNull();
    expect(seaLevelPressure(-5, 100)).toBeNull();
    expect(seaLevelPressure(1000, null)).toBeNull();
    expect(seaLevelPressure('x', 0)).toBeNull();
    expect(pressureAltitude(0)).toBeNull();
    expect(pressureAltitude(1000, 0)).toBeNull();
  });
});

describe('pressureAltitude', () => {
  it('reads ~0 m at standard sea-level pressure', () => {
    expect(pressureAltitude(ISA_SEA_LEVEL_HPA)).toBeCloseTo(0, 3);
  });

  it('increases as pressure falls', () => {
    expect(pressureAltitude(900)).toBeGreaterThan(pressureAltitude(1000));
  });

  it('matches the standard atmosphere at a known point (~1500 m ≈ 845 hPa)', () => {
    expect(pressureAltitude(845)).toBeGreaterThan(1400);
    expect(pressureAltitude(845)).toBeLessThan(1600);
  });
});

describe('classifyTrend', () => {
  it('reports steady pressure', () => {
    const t = classifyTrend(series({ startHPa: 1013, hPaPerHour: 0, spanMs: 3 * HOUR }));
    expect(t.tendency).toBe(TENDENCY.STEADY);
    expect(Math.abs(t.hPaPerHour)).toBeLessThan(0.01);
    expect(t.reliable).toBe(true);
  });

  it('detects a rapid fall', () => {
    const t = classifyTrend(series({ startHPa: 1013, hPaPerHour: -3, spanMs: 2 * HOUR }));
    expect(t.tendency).toBe(TENDENCY.FALLING_RAPIDLY);
    expect(t.hPaPerHour).toBeCloseTo(-3, 1);
  });

  it('distinguishes a gentle fall from a rapid one', () => {
    expect(classifyTrend(series({ startHPa: 1013, hPaPerHour: -1, spanMs: 2 * HOUR })).tendency)
      .toBe(TENDENCY.FALLING);
  });

  it('detects rising pressure', () => {
    expect(classifyTrend(series({ startHPa: 1000, hPaPerHour: 1.2, spanMs: 2 * HOUR })).tendency)
      .toBe(TENDENCY.RISING);
    expect(classifyTrend(series({ startHPa: 1000, hPaPerHour: 3, spanMs: 2 * HOUR })).tendency)
      .toBe(TENDENCY.RISING_RAPIDLY);
  });

  it('marks a short window as unreliable', () => {
    const t = classifyTrend(series({ startHPa: 1013, hPaPerHour: -3, spanMs: 10 * MIN, step: 5 * MIN }));
    expect(t.spanMs).toBeLessThan(MIN_TREND_WINDOW_MS);
    expect(t.reliable).toBe(false);
  });

  it('is not fooled by a single outlier sample', () => {
    const pts = series({ startHPa: 1013, hPaPerHour: 0, spanMs: 3 * HOUR });
    pts[3].hPa -= 12; // a slammed door / pressure spike
    const t = classifyTrend(pts);
    // Theil-Sen's median absorbs it; least squares would have been dragged.
    expect(t.tendency).toBe(TENDENCY.STEADY);
  });

  it('returns null when there is nothing to say', () => {
    expect(classifyTrend([])).toBeNull();
    expect(classifyTrend(null)).toBeNull();
    expect(classifyTrend([{ t: 0, hPa: 1013 }])).toBeNull();
    expect(classifyTrend([{ t: 5, hPa: 1013 }, { t: 5, hPa: 1000 }])).toBeNull(); // zero span
  });

  it('ignores malformed samples rather than throwing', () => {
    const t = classifyTrend([
      { t: 0, hPa: 1013 }, null, { t: 1 * HOUR, hPa: NaN }, { t: 2 * HOUR, hPa: 1011 },
      { hPa: 1010 }, { t: 3 * HOUR, hPa: -4 },
    ]);
    expect(t).toBeTruthy();
    expect(t.samples).toBe(2);
  });
});

describe('altitude contamination — the reason this module exists', () => {
  it('a climb with genuinely steady weather is NOT reported as a storm', () => {
    // Sea-level pressure is constant; the walker ascends 300 m over two hours.
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i * 10 * MIN;
      const altitudeM = (300 * i) / 12;
      pts.push({ t, hPa: 1013.25 / (seaLevelPressure(1, altitudeM)), altitudeM });
    }
    const corrected = classifyTrend(pts);
    expect(corrected.altitudeCorrected).toBe(true);
    expect(corrected.tendency).toBe(TENDENCY.STEADY);
    expect(stormRisk(corrected).level).toBe(STORM_RISK.LOW);

    // Same readings with the altitude stripped out: the raw fall looks violent.
    const raw = classifyTrend(pts.map(({ t, hPa }) => ({ t, hPa })));
    expect(raw.altitudeCorrected).toBe(false);
    expect(raw.tendency).toBe(TENDENCY.FALLING_RAPIDLY);
  });

  it('an uncorrected severe reading is downgraded and flagged, never presented confidently', () => {
    const raw = classifyTrend(
      series({ startHPa: 1013, hPaPerHour: -3, spanMs: 2 * HOUR }).map(({ t, hPa }) => ({ t, hPa }))
    );
    const risk = stormRisk(raw);
    expect(risk.level).toBe(STORM_RISK.MODERATE);
    expect(risk.confident).toBe(false);
    expect(risk.reason).toBe('altitude_uncorrected');
  });

  it('a corrected severe reading IS reported as severe', () => {
    const t = classifyTrend(series({ startHPa: 1013, hPaPerHour: -3, spanMs: 2 * HOUR, altitudeM: 500 }));
    expect(t.altitudeCorrected).toBe(true);
    const risk = stormRisk(t);
    expect(risk.level).toBe(STORM_RISK.SEVERE);
    expect(risk.confident).toBe(true);
  });
});

describe('stormRisk', () => {
  const corrected = (hPaPerHour) =>
    classifyTrend(series({ startHPa: 1013, hPaPerHour, spanMs: 2 * HOUR, altitudeM: 200 }));

  it('escalates as the fall steepens', () => {
    expect(stormRisk(corrected(0)).level).toBe(STORM_RISK.LOW);
    expect(stormRisk(corrected(-0.7)).level).toBe(STORM_RISK.MODERATE);
    expect(stormRisk(corrected(-1.4)).level).toBe(STORM_RISK.HIGH);
    expect(stormRisk(corrected(-2.5)).level).toBe(STORM_RISK.SEVERE);
  });

  it('treats rising pressure as low risk however fast it rises', () => {
    expect(stormRisk(corrected(3)).level).toBe(STORM_RISK.LOW);
  });

  it('is UNKNOWN rather than reassuring when data is thin', () => {
    expect(stormRisk(null).level).toBe(STORM_RISK.UNKNOWN);
    const short = classifyTrend(series({ startHPa: 1013, hPaPerHour: -3, spanMs: 10 * MIN, step: 5 * MIN }));
    expect(stormRisk(short).level).toBe(STORM_RISK.UNKNOWN);
    expect(stormRisk(short).confident).toBe(false);
  });
});

describe('addReading', () => {
  it('appends and evicts anything past the window', () => {
    const now = 10 * HOUR;
    const buf = [
      { t: now - 7 * HOUR, hPa: 1000 },  // older than the 6h default
      { t: now - 1 * HOUR, hPa: 1005 },
    ];
    const next = addReading(buf, { t: now, hPa: 1006 }, now);
    expect(next).toHaveLength(2);
    expect(next[0].hPa).toBe(1005);
    expect(next[1].hPa).toBe(1006);
  });

  it('keeps the series in time order even if a sample arrives late', () => {
    const now = 3 * HOUR;
    const out = addReading([{ t: 2 * HOUR, hPa: 1001 }], { t: 1 * HOUR, hPa: 1000 }, now);
    expect(out.map((r) => r.t)).toEqual([1 * HOUR, 2 * HOUR]);
  });

  it('ignores malformed readings and tolerates a missing buffer', () => {
    expect(addReading(null, { t: 1, hPa: 1000 }, 1)).toHaveLength(1);
    expect(addReading([], null, 1)).toHaveLength(0);
    expect(addReading([], { t: 1 }, 1)).toHaveLength(0);
    expect(addReading([], { hPa: 1000 }, 1)).toHaveLength(0);
  });
});
