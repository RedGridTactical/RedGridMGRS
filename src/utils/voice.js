/**
 * voice.js — NATO phonetic voice readout for MGRS coordinates.
 * Uses expo-speech for text-to-speech.
 */

let Speech = null;
try {
  Speech = require('expo-speech');
} catch (e) {
  // expo-speech not available
}

const NATO_ALPHA = {
  A: 'Alpha',   B: 'Bravo',    C: 'Charlie',  D: 'Delta',
  E: 'Echo',    F: 'Foxtrot',  G: 'Golf',     H: 'Hotel',
  I: 'India',   J: 'Juliet',   K: 'Kilo',     L: 'Lima',
  M: 'Mike',    N: 'November', O: 'Oscar',    P: 'Papa',
  Q: 'Quebec',  R: 'Romeo',    S: 'Sierra',   T: 'Tango',
  U: 'Uniform', V: 'Victor',   W: 'Whiskey',  X: 'X-ray',
  Y: 'Yankee',  Z: 'Zulu',
};

const NATO_DIGIT = {
  '0': 'zero',  '1': 'one',   '2': 'two',   '3': 'three',
  '4': 'four',  '5': 'five',  '6': 'six',   '7': 'seven',
  '8': 'eight', '9': 'niner',
};

/**
 * Convert MGRS string to NATO phonetic readout.
 * Input: "18S UJ 23456 78901"
 * Output: "one eight Sierra. Uniform Juliet. two three four five six. seven eight niner zero one."
 */
export function mgrsToNATO(mgrs) {
  if (!mgrs || typeof mgrs !== 'string') return null;

  const parts = mgrs.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const gzd = parts[0];     // e.g. "18S"
  const sq = parts[1];      // e.g. "UJ"
  const numerics = parts.slice(2).join(' '); // e.g. "23456 78901"

  const segments = [];

  // Grid Zone Designator
  const gzdSpoken = gzd.split('').map(ch => {
    if (/[A-Z]/i.test(ch)) return NATO_ALPHA[ch.toUpperCase()] || ch;
    return NATO_DIGIT[ch] || ch;
  }).join(', ');
  segments.push(gzdSpoken);

  // 100km Square ID
  const sqSpoken = sq.split('').map(ch =>
    NATO_ALPHA[ch.toUpperCase()] || ch
  ).join(', ');
  segments.push(sqSpoken);

  // Numeric portion — read digit by digit
  const numParts = numerics.split(/\s+/);
  numParts.forEach(part => {
    const digitSpoken = part.split('').map(ch =>
      NATO_DIGIT[ch] || ch
    ).join(', ');
    segments.push(digitSpoken);
  });

  return segments.join('. ');
}

/**
 * Speak MGRS coordinate using NATO phonetics.
 * Returns true if speech started, false otherwise.
 */
export function speakMGRS(mgrs) {
  if (!Speech) return false;

  const text = mgrsToNATO(mgrs);
  if (!text) return false;

  try {
    // Stop any current speech first
    Speech.stop();

    Speech.speak(text, {
      language: 'en-US',
      pitch: 0.95,
      rate: 0.85,
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop any ongoing speech */
export function stopSpeaking() {
  try {
    Speech?.stop?.();
  } catch {}
}

/** Check if speech is currently active */
export async function isSpeaking() {
  try {
    return await Speech?.isSpeakingAsync?.() ?? false;
  } catch {
    return false;
  }
}
