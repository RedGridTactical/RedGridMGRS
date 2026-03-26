/**
 * Test suite for free-tier precision gating.
 * Free users see 4-digit MGRS (1km precision); Pro users see 10-digit (1m).
 * Internal location data is never truncated — only the display string.
 */

const { toMGRS, formatMGRS, getDisplayPrecision } = require('../src/utils/mgrs');

describe('Precision gating — getDisplayPrecision', () => {

  test('Pro user gets precision 5 (10-digit, 1m)', () => {
    expect(getDisplayPrecision(true)).toBe(5);
  });

  test('Free user gets precision 2 (4-digit, 1km)', () => {
    expect(getDisplayPrecision(false)).toBe(2);
  });

  test('Undefined/null isPro treated as free', () => {
    expect(getDisplayPrecision(undefined)).toBe(2);
    expect(getDisplayPrecision(null)).toBe(2);
    expect(getDisplayPrecision(0)).toBe(2);
  });
});

describe('Precision gating — MGRS output length', () => {
  // Washington Monument: 18S UJ 23480 06889 at full precision
  const lat = 38.8895;
  const lon = -77.0353;

  test('Pro precision (5) produces 10-digit numeric portion', () => {
    const raw = toMGRS(lat, lon, 5);
    const match = raw.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[4].length).toBe(10); // 5 easting + 5 northing
  });

  test('Free precision (2) produces 4-digit numeric portion', () => {
    const raw = toMGRS(lat, lon, 2);
    const match = raw.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[4].length).toBe(4); // 2 easting + 2 northing
  });

  test('Free grid is a prefix of Pro grid (truncation, not rounding)', () => {
    const proRaw = toMGRS(lat, lon, 5);
    const freeRaw = toMGRS(lat, lon, 2);
    // Both share zone, band, and grid square
    const proParts = proRaw.match(/^(\d{1,2}[A-Z][A-Z]{2})(\d{5})(\d{5})$/);
    const freeParts = freeRaw.match(/^(\d{1,2}[A-Z][A-Z]{2})(\d{2})(\d{2})$/);
    expect(proParts).not.toBeNull();
    expect(freeParts).not.toBeNull();
    // GZD + grid square identical
    expect(freeParts[1]).toBe(proParts[1]);
    // Free easting is first 2 chars of Pro easting
    expect(proParts[2].startsWith(freeParts[2])).toBe(true);
    // Free northing is first 2 chars of Pro northing
    expect(proParts[3].startsWith(freeParts[3])).toBe(true);
  });
});

describe('Precision gating — formatted display', () => {
  const lat = 38.8895;
  const lon = -77.0353;

  test('Free formatted grid shows 2-digit easting and northing', () => {
    const formatted = formatMGRS(toMGRS(lat, lon, 2));
    // Format: "18S UJ 23 06"
    const parts = formatted.split(' ');
    expect(parts.length).toBe(4); // GZD, SQ, E, N
    expect(parts[2].length).toBe(2); // easting digits
    expect(parts[3].length).toBe(2); // northing digits
  });

  test('Pro formatted grid shows 5-digit easting and northing', () => {
    const formatted = formatMGRS(toMGRS(lat, lon, 5));
    // Format: "18S UJ 23480 06889"
    const parts = formatted.split(' ');
    expect(parts.length).toBe(4);
    expect(parts[2].length).toBe(5);
    expect(parts[3].length).toBe(5);
  });
});

describe('Precision gating — edge cases', () => {

  test('Precision 1 produces 2-digit numeric (valid but unused)', () => {
    const raw = toMGRS(0, 0, 1);
    const match = raw.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[4].length).toBe(2);
  });

  test('Precision 3 produces 6-digit numeric', () => {
    const raw = toMGRS(0, 0, 3);
    const match = raw.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
    expect(match).not.toBeNull();
    expect(match[4].length).toBe(6);
  });

  test('Out-of-range coordinates still return error string', () => {
    expect(toMGRS(85, 0, 2)).toBe('OUT OF RANGE');
    expect(toMGRS(-81, 0, 2)).toBe('OUT OF RANGE');
  });

  test('Null coordinates return ERROR', () => {
    expect(toMGRS(null, null, 2)).toBe('ERROR');
  });
});
