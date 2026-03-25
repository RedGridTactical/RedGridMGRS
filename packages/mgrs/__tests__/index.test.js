/**
 * Tests for @redgrid/mgrs
 */

const {
  toMGRS,
  parseMGRS,
  formatMGRS,
  toUTM,
  bearing,
  distance,
  deadReckoning,
  formatDD,
  formatDMS,
} = require('../index');

const { encode, decode, formatFixPhrase } = require('../fixphrase');

// ─── toMGRS ──────────────────────────────────────────────────────────────────

describe('toMGRS', () => {
  test('White House (38.8895, -77.0353) → 18SUJ2347806483', () => {
    const mgrs = toMGRS(38.8895, -77.0353);
    expect(mgrs).toMatch(/^18S/);
    expect(mgrs).toBe('18SUJ2347806483');
  });

  test('Eiffel Tower (48.8584, 2.2945) → 31UDQ4830241725', () => {
    const mgrs = toMGRS(48.8584, 2.2945);
    expect(mgrs).toMatch(/^31U/);
  });

  test('Sydney Opera House (-33.8568, 151.2153) → 56HLH3404251588', () => {
    const mgrs = toMGRS(-33.8568, 151.2153);
    expect(mgrs).toMatch(/^56H/);
  });

  test('precision 3 (100m) returns 6 numeric digits', () => {
    const mgrs = toMGRS(38.8895, -77.0353, 3);
    const match = mgrs.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[4].length).toBe(6);
  });

  test('precision 1 (10km) returns 2 numeric digits', () => {
    const mgrs = toMGRS(38.8895, -77.0353, 1);
    const match = mgrs.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match[4].length).toBe(2);
  });

  test('returns ERROR for null input', () => {
    expect(toMGRS(null, null)).toBe('ERROR');
  });

  test('returns OUT OF RANGE for polar regions', () => {
    expect(toMGRS(85, 0)).toBe('OUT OF RANGE');
    expect(toMGRS(-81, 0)).toBe('OUT OF RANGE');
  });

  test('equator/prime meridian (0, 0)', () => {
    const mgrs = toMGRS(0, 0);
    expect(mgrs).toMatch(/^31N/);
  });

  test('Norway special zone (59, 5.5) → zone 32', () => {
    const mgrs = toMGRS(59, 5.5);
    expect(mgrs).toMatch(/^32V/);
  });
});

// ─── parseMGRS ───────────────────────────────────────────────────────────────

describe('parseMGRS', () => {
  test('round-trip: White House', () => {
    const mgrs = toMGRS(38.8895, -77.0353);
    const result = parseMGRS(mgrs);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(38.8895, 3);
    expect(result.lon).toBeCloseTo(-77.0353, 3);
  });

  test('round-trip: southern hemisphere', () => {
    const mgrs = toMGRS(-33.8568, 151.2153);
    const result = parseMGRS(mgrs);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(-33.8568, 3);
    expect(result.lon).toBeCloseTo(151.2153, 3);
  });

  test('accepts spaces in input', () => {
    const result = parseMGRS('18S UJ 23478 06483');
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(38.8895, 3);
  });

  test('lower precision (4-digit)', () => {
    const result = parseMGRS('18SUJ23470648');
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(38.889, 2);
  });

  test('returns null for invalid input', () => {
    expect(parseMGRS('INVALID')).toBeNull();
    expect(parseMGRS('')).toBeNull();
    expect(parseMGRS('99ZZZ1234567890')).toBeNull();
  });

  test('round-trip: equator', () => {
    const mgrs = toMGRS(0.0001, 0.0001);
    const result = parseMGRS(mgrs);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(0, 2);
    expect(result.lon).toBeCloseTo(0, 2);
  });
});

// ─── formatMGRS ──────────────────────────────────────────────────────────────

describe('formatMGRS', () => {
  test('formats with spaces', () => {
    expect(formatMGRS('18SUJ2347806483')).toBe('18S UJ 23478 06483');
  });

  test('handles short/invalid input gracefully', () => {
    expect(formatMGRS('')).toBe('');
    expect(formatMGRS(null)).toBe(null);
    expect(formatMGRS('ERR')).toBe('ERR');
  });

  test('formats lower precision', () => {
    expect(formatMGRS('18SUJ2306')).toBe('18S UJ 23 06');
  });
});

// ─── toUTM ───────────────────────────────────────────────────────────────────

describe('toUTM', () => {
  test('White House returns zone 18', () => {
    const utm = toUTM(38.8895, -77.0353);
    expect(utm.zone).toBe(18);
    expect(utm.band).toBe('S');
    expect(utm.easting).toBeGreaterThan(0);
    expect(utm.northing).toBeGreaterThan(0);
  });

  test('southern hemisphere has northing > 0', () => {
    const utm = toUTM(-33.8568, 151.2153);
    expect(utm.northing).toBeGreaterThan(0);
  });
});

// ─── bearing ─────────────────────────────────────────────────────────────────

describe('bearing', () => {
  test('due north bearing is ~0/360', () => {
    const b = bearing(38, -77, 39, -77);
    expect(b).toBeCloseTo(0, 0);
  });

  test('due east bearing is ~90', () => {
    const b = bearing(0, 0, 0, 1);
    expect(b).toBeCloseTo(90, 0);
  });

  test('due south bearing is ~180', () => {
    const b = bearing(39, -77, 38, -77);
    expect(b).toBeCloseTo(180, 0);
  });

  test('due west bearing is ~270', () => {
    const b = bearing(0, 1, 0, 0);
    expect(b).toBeCloseTo(270, 0);
  });
});

// ─── distance ────────────────────────────────────────────────────────────────

describe('distance', () => {
  test('same point is 0', () => {
    expect(distance(38, -77, 38, -77)).toBe(0);
  });

  test('1 degree latitude ~111km', () => {
    const d = distance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  test('NYC to London ~5570km', () => {
    const d = distance(40.7128, -74.006, 51.5074, -0.1278);
    expect(d / 1000).toBeGreaterThan(5500);
    expect(d / 1000).toBeLessThan(5600);
  });
});

// ─── deadReckoning ───────────────────────────────────────────────────────────

describe('deadReckoning', () => {
  test('1000m due north increases latitude', () => {
    const result = deadReckoning(38.8895, -77.0353, 0, 1000);
    expect(result).not.toBeNull();
    expect(result.lat).toBeGreaterThan(38.8895);
    expect(result.lon).toBeCloseTo(-77.0353, 3);
  });

  test('0m distance returns same position', () => {
    const result = deadReckoning(38.8895, -77.0353, 90, 0);
    expect(result.lat).toBeCloseTo(38.8895, 4);
    expect(result.lon).toBeCloseTo(-77.0353, 4);
  });

  test('returns null for negative distance', () => {
    expect(deadReckoning(38, -77, 0, -100)).toBeNull();
  });

  test('returns null for NaN distance', () => {
    expect(deadReckoning(38, -77, 0, NaN)).toBeNull();
  });
});

// ─── formatDD ────────────────────────────────────────────────────────────────

describe('formatDD', () => {
  test('formats with 6 decimal places', () => {
    const result = formatDD(38.8895, -77.0353);
    expect(result).toContain('38.889500');
    expect(result).toContain('-77.035300');
    expect(result).toContain('\u00B0');
  });
});

// ─── formatDMS ───────────────────────────────────────────────────────────────

describe('formatDMS', () => {
  test('formats correctly', () => {
    const result = formatDMS(38.8895, -77.0353);
    expect(result).toContain('N');
    expect(result).toContain('W');
    expect(result).toContain('38');
    expect(result).toContain('77');
  });

  test('southern/eastern hemisphere', () => {
    const result = formatDMS(-33.8568, 151.2153);
    expect(result).toContain('S');
    expect(result).toContain('E');
  });
});

// ─── FixPhrase ───────────────────────────────────────────────────────────────

describe('fixphrase', () => {
  test('encode returns 4 hyphen-separated words', () => {
    const phrase = encode(38.8895, -77.0353);
    const words = phrase.split('-');
    expect(words.length).toBe(4);
    words.forEach(w => expect(w.length).toBeGreaterThan(0));
  });

  test('round-trip encode/decode', () => {
    const phrase = encode(38.8895, -77.0353);
    const result = decode(phrase);
    expect(result.lat).toBeCloseTo(38.8895, 3);
    expect(result.lon).toBeCloseTo(-77.0353, 3);
  });

  test('decode is order-independent', () => {
    const phrase = encode(48.8584, 2.2945);
    const words = phrase.split('-');
    const shuffled = [words[2], words[0], words[3], words[1]].join(' ');
    const result = decode(shuffled);
    expect(result.lat).toBeCloseTo(48.8584, 3);
    expect(result.lon).toBeCloseTo(2.2945, 3);
  });

  test('encode throws for out-of-range lat', () => {
    expect(() => encode(91, 0)).toThrow();
    expect(() => encode(-91, 0)).toThrow();
  });

  test('encode throws for out-of-range lon', () => {
    expect(() => encode(0, 181)).toThrow();
    expect(() => encode(0, -181)).toThrow();
  });

  test('formatFixPhrase returns string or ERROR', () => {
    expect(typeof formatFixPhrase(38.8895, -77.0353)).toBe('string');
    expect(formatFixPhrase(91, 0)).toBe('ERROR');
  });

  test('negative coordinates round-trip', () => {
    const phrase = encode(-33.8568, 151.2153);
    const result = decode(phrase);
    expect(result.lat).toBeCloseTo(-33.8568, 3);
    expect(result.lon).toBeCloseTo(151.2153, 3);
  });
});
