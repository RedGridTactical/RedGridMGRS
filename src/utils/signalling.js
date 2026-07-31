/**
 * signalling.js — visual and audible distress signalling.
 *
 * Pure timing computation. It produces on/off schedules that a UI layer drives
 * with the screen, the torch, or a tone; nothing here touches hardware, so the
 * patterns are testable without a device.
 *
 * Two distinct things live here, and conflating them is a real safety error:
 *   - MORSE, for sending readable text (including SOS).
 *   - The INTERNATIONAL GROUND-TO-AIR distress rate, which is NOT morse. Search
 *     and rescue expect a steady 6 flashes per minute for distress; a rescue
 *     aircraft looking for that will not be reading morse.
 *
 * Battery is a survival resource. `estimateDutyCycle` lets a caller show the
 * user what a pattern actually costs before they leave it running all night.
 */

/** Morse timing is defined in "units"; every duration is a multiple of one dit. */
export const DIT = 1;
export const DAH = 3;
export const INTRA_CHAR_GAP = 1;  // between symbols inside one character
export const INTER_CHAR_GAP = 3;  // between characters in a word
export const INTER_WORD_GAP = 7;  // between words

/**
 * Default dit length. 60 ms is brisk for radio but far too fast to read as
 * light at distance; 200 ms is legible to the naked eye and still unmistakably
 * deliberate rather than a stray reflection.
 */
export const DEFAULT_DIT_MS = 200;

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '-': '-....-',
  '=': '-...-', ':': '---...', "'": '.----.', '@': '.--.-.',
};

/** Translate text to morse symbols. Unknown characters are dropped, not guessed. */
export function toMorse(text) {
  if (typeof text !== 'string') return '';
  return String(text)
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split('').map((ch) => MORSE[ch]).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
}

/**
 * Build an on/off schedule from text.
 * @returns [{ on: boolean, ms: number }] — alternating, always starting with `on`.
 * Trailing gaps are trimmed so a caller can loop the pattern cleanly.
 */
export function morseSchedule(text, ditMs = DEFAULT_DIT_MS) {
  const unit = sanitizeDit(ditMs);
  const words = String(text ?? '').toUpperCase().split(/\s+/).filter(Boolean);
  const out = [];

  words.forEach((word, wi) => {
    const chars = word.split('').filter((ch) => MORSE[ch]);
    chars.forEach((ch, ci) => {
      const symbols = MORSE[ch];
      for (let si = 0; si < symbols.length; si++) {
        out.push({ on: true, ms: (symbols[si] === '-' ? DAH : DIT) * unit });
        if (si < symbols.length - 1) out.push({ on: false, ms: INTRA_CHAR_GAP * unit });
      }
      if (ci < chars.length - 1) out.push({ on: false, ms: INTER_CHAR_GAP * unit });
    });
    if (wi < words.length - 1 && out.length) out.push({ on: false, ms: INTER_WORD_GAP * unit });
  });

  while (out.length && !out[out.length - 1].on) out.pop();
  return out;
}

/** The canonical distress call. SOS is one prosign — no gaps between letters. */
export function sosSchedule(ditMs = DEFAULT_DIT_MS) {
  const unit = sanitizeDit(ditMs);
  const out = [];
  const pattern = '...---...'; // deliberately not "S O S": it is sent unbroken
  for (let i = 0; i < pattern.length; i++) {
    out.push({ on: true, ms: (pattern[i] === '-' ? DAH : DIT) * unit });
    if (i < pattern.length - 1) out.push({ on: false, ms: INTRA_CHAR_GAP * unit });
  }
  return out;
}

/**
 * International ground-to-air distress signal: six flashes per minute, one
 * second on, nine seconds off. This is NOT morse and must not be replaced by
 * it — aircrew are trained to look for the rate, and the long dark interval is
 * what makes it visible against terrain and cheap on battery.
 */
export const GROUND_TO_AIR_ON_MS = 1000;
export const GROUND_TO_AIR_OFF_MS = 9000;

export function groundToAirSchedule() {
  return [
    { on: true, ms: GROUND_TO_AIR_ON_MS },
    { on: false, ms: GROUND_TO_AIR_OFF_MS },
  ];
}

/** Total duration of one pass through a schedule. */
export function scheduleDurationMs(schedule) {
  if (!Array.isArray(schedule)) return 0;
  return schedule.reduce((sum, s) => sum + (s && Number.isFinite(s.ms) ? s.ms : 0), 0);
}

/**
 * Fraction of a looped pattern spent emitting light. Drives the battery
 * estimate a user sees before committing to an overnight signal — the
 * ground-to-air pattern is 10% duty, SOS is far higher, and that difference
 * decides whether the phone is still alive at dawn.
 *
 * Loops include the gap that separates repeats, since that is what actually
 * runs; without it a schedule ending in light would read as 100% duty.
 */
export function estimateDutyCycle(schedule, loopGapMs = 0) {
  const total = scheduleDurationMs(schedule) + Math.max(0, loopGapMs || 0);
  if (total <= 0) return 0;
  const on = (Array.isArray(schedule) ? schedule : [])
    .filter((s) => s && s.on)
    .reduce((sum, s) => sum + (Number.isFinite(s.ms) ? s.ms : 0), 0);
  return on / total;
}

function sanitizeDit(ditMs) {
  const v = Number(ditMs);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_DIT_MS;
  // Below ~40 ms a screen or torch cannot switch cleanly and the pattern reads
  // as a flicker; above 2 s it stops being recognisable as a signal.
  return Math.min(2000, Math.max(40, Math.round(v)));
}
