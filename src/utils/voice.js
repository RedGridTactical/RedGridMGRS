/**
 * voice.js — NATO/ICAO phonetic voice readout for MGRS coordinates.
 * Uses expo-speech for text-to-speech with TTS-optimized phonetic spellings
 * matching military radiotelephony pronunciation standards.
 */

let Speech = null;
try {
  Speech = require('expo-speech');
} catch (e) {
  // expo-speech not available
}

/**
 * NATO phonetic alphabet — TTS-optimized spellings.
 * Most words are standard English and TTS handles them correctly.
 * Lima and Quebec use phonetic hints to force correct NATO pronunciation.
 */
const NATO_ALPHA = {
  A: 'Alfa',     B: 'Bravo',    C: 'Charlie',  D: 'Delta',
  E: 'Echo',     F: 'Foxtrot',  G: 'Golf',     H: 'Hotel',
  I: 'India',    J: 'Juliet',   K: 'Kilo',     L: 'Lee Mah',
  M: 'Mike',     N: 'November', O: 'Oscar',    P: 'Papa',
  Q: 'Keh Beck', R: 'Romeo',    S: 'Sierra',   T: 'Tango',
  U: 'Uniform',  V: 'Victor',   W: 'Whiskey',  X: 'Ecks Ray',
  Y: 'Yankee',   Z: 'Zulu',
};

/**
 * NATO/ICAO standard digit pronunciation for radio comms.
 * Modified from standard English to avoid ambiguity over noisy radio:
 *   3 → "tree" (no "th" to get lost in static)
 *   4 → "fower" (two syllables, distinct from "for")
 *   5 → "fife" (no "v" to disappear in noise)
 *   8 → "ait" (clearer than "eight" on radio)
 *   9 → "niner" (prevents confusion with "no"/"nein")
 */
const NATO_DIGIT = {
  '0': 'zero',   '1': 'wun',    '2': 'too',    '3': 'tree',
  '4': 'fower',  '5': 'fife',   '6': 'six',    '7': 'seven',
  '8': 'ait',    '9': 'niner',
};

/**
 * Convert MGRS string to NATO phonetic readout string.
 * Uses radio-standard pacing: "Grid... [GZD]... [Square]... [Easting]... [Northing]"
 *
 * Input:  "18S UJ 23456 78901"
 * Output: "Grid. wun ait Sierra. ... Uniform Juliet. ... too tree fower fife six. ... seven ait niner zero wun."
 */
export function mgrsToNATO(mgrs) {
  if (!mgrs || typeof mgrs !== 'string') return null;

  const parts = mgrs.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const gzd = parts[0];     // e.g. "18S"
  const sq = parts[1];      // e.g. "UJ"
  const numerics = parts.slice(2).join(' '); // e.g. "23456 78901"

  const segments = [];

  // "Grid" prefix — standard radio call opener
  segments.push('Grid');

  // Grid Zone Designator — digits + letter
  const gzdSpoken = gzd.split('').map(ch => {
    if (/[A-Z]/i.test(ch)) return NATO_ALPHA[ch.toUpperCase()] || ch;
    return NATO_DIGIT[ch] || ch;
  }).join(' ... ');
  segments.push(gzdSpoken);

  // 100km Square ID — two letters
  const sqSpoken = sq.split('').map(ch =>
    NATO_ALPHA[ch.toUpperCase()] || ch
  ).join(' ... ');
  segments.push(sqSpoken);

  // Numeric portion — easting then northing, digit by digit
  const numParts = numerics.split(/\s+/);
  numParts.forEach(part => {
    const digitSpoken = part.split('').map(ch =>
      NATO_DIGIT[ch] || ch
    ).join(' ... ');
    segments.push(digitSpoken);
  });

  // Join groups with long pauses (period + ellipsis creates ~0.8s gap in TTS)
  return segments.join('. ... ');
}

// Serialize native stop/start calls so a delayed stop can never cut off a newer
// readout. A generation invalidates queued speech when the app is backgrounded.
let generation = 0;
let queue = Promise.resolve();
let speaking = false;
const listeners = new Set();
function publish(value) {
  speaking = value;
  listeners.forEach(listener => listener(value));
}
export function onSpeechStateChange(listener) {
  listeners.add(listener);
  listener(speaking);
  return () => listeners.delete(listener);
}
export async function speakMGRS(mgrs) {
  const text = mgrsToNATO(mgrs);
  if (!Speech?.speak || !Speech?.stop || !text) return false;
  const request = ++generation;
  publish(true);
  const finish = () => { if (request === generation) publish(false); };
  queue = queue.catch(() => {}).then(async () => {
    await Speech.stop();
    if (request !== generation) return false;
    Speech.speak(text, {
      language: 'en-US', pitch: 0.92, rate: 0.72,
      onDone: finish, onStopped: finish, onError: finish,
    });
    return true;
  }).catch(() => { finish(); return false; });
  return queue;
}
export function stopSpeaking() {
  ++generation;
  publish(false);
  queue = queue.catch(() => {}).then(() => Speech?.stop?.()).catch(() => {});
  return queue;
}
export async function isSpeaking() { return speaking; }
