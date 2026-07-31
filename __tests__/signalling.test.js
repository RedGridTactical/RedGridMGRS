/**
 * signalling.test.js — morse and distress signal timing.
 * Pure schedules; no hardware, no timers.
 */
import {
  DIT, DAH, INTRA_CHAR_GAP, INTER_CHAR_GAP, INTER_WORD_GAP, DEFAULT_DIT_MS,
  GROUND_TO_AIR_ON_MS, GROUND_TO_AIR_OFF_MS,
  toMorse, morseSchedule, sosSchedule, groundToAirSchedule,
  scheduleDurationMs, estimateDutyCycle,
} from '../src/utils/signalling';

const U = DEFAULT_DIT_MS;

describe('toMorse', () => {
  it('translates letters, digits and words', () => {
    expect(toMorse('SOS')).toBe('... --- ...');
    expect(toMorse('E')).toBe('.');
    expect(toMorse('HI THERE')).toBe('.... .. / - .... . .-. .');
    expect(toMorse('R2')).toBe('.-. ..---');
  });

  it('is case-insensitive and collapses whitespace', () => {
    expect(toMorse('sos')).toBe(toMorse('SOS'));
    expect(toMorse('  HI   THERE  ')).toBe(toMorse('HI THERE'));
  });

  it('drops unknown characters instead of inventing symbols', () => {
    expect(toMorse('S☠O')).toBe('... ---');
    expect(toMorse('☠☠☠')).toBe('');
  });

  it('handles empty and non-string input', () => {
    expect(toMorse('')).toBe('');
    expect(toMorse(null)).toBe('');
    expect(toMorse(42)).toBe('');
  });
});

describe('morseSchedule', () => {
  it('alternates on/off and always starts lit', () => {
    const s = morseSchedule('SOS');
    expect(s[0].on).toBe(true);
    for (let i = 1; i < s.length; i++) expect(s[i].on).toBe(!s[i - 1].on);
  });

  it('never ends on a gap, so the pattern loops cleanly', () => {
    for (const text of ['SOS', 'E', 'HI THERE', 'MAYDAY']) {
      const s = morseSchedule(text);
      expect(s[s.length - 1].on).toBe(true);
    }
  });

  it('uses correct symbol and gap lengths', () => {
    // 'A' is di-dah: dit, intra-gap, dah.
    expect(morseSchedule('A')).toEqual([
      { on: true, ms: DIT * U },
      { on: false, ms: INTRA_CHAR_GAP * U },
      { on: true, ms: DAH * U },
    ]);
  });

  it('separates characters by 3 units and words by 7', () => {
    const ee = morseSchedule('EE');           // dit, 3-gap, dit
    expect(ee[1]).toEqual({ on: false, ms: INTER_CHAR_GAP * U });
    const e_e = morseSchedule('E E');         // dit, 7-gap, dit
    expect(e_e[1]).toEqual({ on: false, ms: INTER_WORD_GAP * U });
  });

  it('scales with the dit length', () => {
    const fast = morseSchedule('E', 50);
    const slow = morseSchedule('E', 500);
    expect(fast[0].ms).toBe(50);
    expect(slow[0].ms).toBe(500);
  });

  it('clamps a nonsensical dit rather than emitting an unusable pattern', () => {
    expect(morseSchedule('E', 0)[0].ms).toBe(DEFAULT_DIT_MS);
    expect(morseSchedule('E', -10)[0].ms).toBe(DEFAULT_DIT_MS);
    expect(morseSchedule('E', NaN)[0].ms).toBe(DEFAULT_DIT_MS);
    expect(morseSchedule('E', 1)[0].ms).toBe(40);        // floor: below this it reads as flicker
    expect(morseSchedule('E', 99999)[0].ms).toBe(2000);  // ceiling
  });

  it('returns an empty schedule for nothing sendable', () => {
    expect(morseSchedule('')).toEqual([]);
    expect(morseSchedule('☠')).toEqual([]);
    expect(morseSchedule(null)).toEqual([]);
  });
});

describe('sosSchedule', () => {
  it('is nine flashes: three short, three long, three short', () => {
    const s = sosSchedule();
    const lit = s.filter((x) => x.on);
    expect(lit).toHaveLength(9);
    expect(lit.slice(0, 3).every((x) => x.ms === DIT * U)).toBe(true);
    expect(lit.slice(3, 6).every((x) => x.ms === DAH * U)).toBe(true);
    expect(lit.slice(6, 9).every((x) => x.ms === DIT * U)).toBe(true);
  });

  it('is sent unbroken — no inter-character gaps, unlike "S O S"', () => {
    const sos = sosSchedule();
    const gaps = sos.filter((x) => !x.on);
    expect(gaps.every((g) => g.ms === INTRA_CHAR_GAP * U)).toBe(true);
    // The spelled-out version has 3-unit gaps between the letters; the prosign
    // must be shorter overall.
    expect(scheduleDurationMs(sos)).toBeLessThan(scheduleDurationMs(morseSchedule('SOS')));
  });

  it('starts and ends lit so it loops cleanly', () => {
    const s = sosSchedule();
    expect(s[0].on).toBe(true);
    expect(s[s.length - 1].on).toBe(true);
  });
});

describe('ground-to-air distress signal', () => {
  it('is six flashes per minute, not morse', () => {
    const s = groundToAirSchedule();
    expect(s).toEqual([
      { on: true, ms: GROUND_TO_AIR_ON_MS },
      { on: false, ms: GROUND_TO_AIR_OFF_MS },
    ]);
    const perCycleMs = scheduleDurationMs(s);
    expect(60000 / perCycleMs).toBe(6);
  });

  it('is far cheaper on battery than continuous SOS', () => {
    expect(estimateDutyCycle(groundToAirSchedule())).toBeCloseTo(0.1, 3);
    expect(estimateDutyCycle(sosSchedule())).toBeGreaterThan(0.4);
  });
});

describe('scheduleDurationMs', () => {
  it('sums the schedule', () => {
    expect(scheduleDurationMs([{ on: true, ms: 100 }, { on: false, ms: 250 }])).toBe(350);
  });

  it('tolerates junk entries', () => {
    expect(scheduleDurationMs([{ on: true, ms: 100 }, null, { on: false, ms: NaN }])).toBe(100);
    expect(scheduleDurationMs(null)).toBe(0);
    expect(scheduleDurationMs([])).toBe(0);
  });
});

describe('estimateDutyCycle', () => {
  it('is the lit fraction of a loop', () => {
    expect(estimateDutyCycle([{ on: true, ms: 250 }, { on: false, ms: 750 }])).toBeCloseTo(0.25, 6);
  });

  it('counts the loop gap, so an all-on pattern is not reported as free', () => {
    const alwaysOn = [{ on: true, ms: 1000 }];
    expect(estimateDutyCycle(alwaysOn)).toBe(1);
    expect(estimateDutyCycle(alwaysOn, 3000)).toBeCloseTo(0.25, 6);
  });

  it('is 0 for an empty or invalid schedule rather than NaN', () => {
    expect(estimateDutyCycle([])).toBe(0);
    expect(estimateDutyCycle(null)).toBe(0);
    expect(Number.isNaN(estimateDutyCycle([{ on: true, ms: NaN }]))).toBe(false);
  });
});
