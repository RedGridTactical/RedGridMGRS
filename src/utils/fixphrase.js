/**
 * FixPhrase — Convert lat/lon to memorable 4-word phrases and back.
 * Based on the open-source FixPhrase algorithm (BSD-3-Clause, Netsyms Technologies).
 * ~11m accuracy with 4 words. Word order does not matter for decoding.
 *
 * Zero network — wordlist bundled inline.
 */
const WORDLIST = require('./fixphrase_wordlist.json');

// Build reverse lookup once
const WORD_INDEX = {};
for (let i = 0; i < WORDLIST.length; i++) {
  WORD_INDEX[WORDLIST[i]] = i;
}

/**
 * Encode lat/lon to a 4-word FixPhrase.
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @returns {string} Hyphen-separated 4-word phrase
 */
function encode(lat, lon) {
  if (lat < -90 || lat > 90) throw new Error('Latitude out of range');
  if (lon < -180 || lon > 180) throw new Error('Longitude out of range');

  // Round to 4 decimal places, shift to positive, remove decimal
  const latInt = Math.round(lat * 10000) + 900000;
  const lonInt = Math.round(lon * 10000) + 1800000;

  const latStr = ('0000000' + latInt).slice(-7);
  const lonStr = ('0000000' + lonInt).slice(-7);

  // Split into groups with offsets so each word falls in a unique range
  const g0 = Number(latStr.substring(0, 4));           // 0–1800
  const g1 = Number(lonStr.substring(0, 4)) + 2000;    // 2000–5600
  const g2 = Number(latStr.substring(4, 6) + lonStr.substring(4, 5)) + 5610;  // 5610–6609
  const g3 = Number(latStr.substring(6, 7) + lonStr.substring(5, 7)) + 6610;  // 6610–7609

  return WORDLIST[g0] + '-' + WORDLIST[g1] + '-' + WORDLIST[g2] + '-' + WORDLIST[g3];
}

/**
 * Decode a FixPhrase back to lat/lon.
 * Words can be in any order (ranges are non-overlapping).
 * Accepts hyphen or space separated.
 * @param {string} phrase - 4-word phrase
 * @returns {{ lat: number, lon: number }}
 */
function decode(phrase) {
  const words = phrase.toLowerCase().replace(/-/g, ' ').trim().split(/\s+/);
  if (words.length < 2) throw new Error('Need at least 2 words');

  const indexes = [-1, -1, -1, -1];

  for (const word of words) {
    const idx = WORD_INDEX[word];
    if (idx === undefined) continue;

    if (idx >= 0 && idx < 2000) {
      indexes[0] = idx;
    } else if (idx >= 2000 && idx < 5610) {
      indexes[1] = idx - 2000;
    } else if (idx >= 5610 && idx < 6610) {
      indexes[2] = idx - 5610;
    } else if (idx >= 6610 && idx < 7610) {
      indexes[3] = idx - 6610;
    }
  }

  if (indexes[0] === -1 || indexes[1] === -1) {
    throw new Error('Cannot determine location from supplied words');
  }

  let divby = 10.0;
  let latStr = ('0000' + indexes[0]).slice(-4);
  let lonStr = ('0000' + indexes[1]).slice(-4);

  let latlon2dec;
  if (indexes[2] !== -1) {
    divby = 100.0;
    latlon2dec = ('000' + indexes[2]).slice(-3);
    latStr += latlon2dec.substring(0, 1);
    lonStr += latlon2dec.substring(2, 3);
  }

  if (indexes[2] !== -1 && indexes[3] !== -1) {
    divby = 10000.0;
    const latlon4dec = ('000' + indexes[3]).slice(-3);
    latStr += latlon2dec.substring(1, 2) + latlon4dec.substring(0, 1);
    lonStr += latlon4dec.substring(1, 3);
  }

  const lat = Math.round(((Number(latStr) / divby) - 90.0) * 10000) / 10000;
  const lon = Math.round(((Number(lonStr) / divby) - 180.0) * 10000) / 10000;

  return { lat, lon };
}

/**
 * Format lat/lon as a FixPhrase display string (for grid display).
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
function formatFixPhrase(lat, lon) {
  try {
    return encode(lat, lon);
  } catch {
    return 'ERROR';
  }
}

module.exports = { encode, decode, formatFixPhrase };
