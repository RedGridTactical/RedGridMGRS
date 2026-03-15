/**
 * useShakeToSpeak — Shake device to trigger NATO voice readout of current grid.
 *
 * Uses expo-sensors Accelerometer to detect shake gestures.
 * Pro-only feature. Configurable via settings toggle.
 *
 * Detection: monitors acceleration magnitude. A shake registers when
 * magnitude exceeds threshold 3 times within 1 second.
 *
 * HARDENING:
 *   - expo-sensors loaded defensively
 *   - Cooldown prevents rapid-fire triggers
 *   - Mounted check on all state updates
 *   - Subscription cleaned up on unmount
 */
import { useEffect, useRef, useCallback } from 'react';
import { tapMedium } from '../utils/haptics';
import { speakMGRS } from '../utils/voice';

let Accelerometer = null;
try {
  const sensors = require('expo-sensors');
  Accelerometer = sensors.Accelerometer;
} catch {}

const SHAKE_THRESHOLD = 2.5;    // g-force magnitude to count as a shake hit
const SHAKE_COUNT_NEEDED = 3;   // hits needed within the time window
const SHAKE_WINDOW_MS = 800;    // time window for counting hits
const COOLDOWN_MS = 3000;       // min time between shake triggers

export function useShakeToSpeak(mgrsFormatted, enabled) {
  const shakeTimestamps = useRef([]);
  const lastTrigger = useRef(0);
  const mounted = useRef(true);
  const mgrsRef = useRef(mgrsFormatted);

  // Keep mgrs ref current without re-subscribing accelerometer
  useEffect(() => { mgrsRef.current = mgrsFormatted; }, [mgrsFormatted]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!Accelerometer || !enabled) return;

    let subscription = null;

    try {
      Accelerometer.setUpdateInterval(100);

      subscription = Accelerometer.addListener(({ x, y, z }) => {
        if (!mounted.current) return;

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        if (magnitude < SHAKE_THRESHOLD) return;

        const now = Date.now();

        // Cooldown check
        if (now - lastTrigger.current < COOLDOWN_MS) return;

        // Add timestamp and prune old ones
        shakeTimestamps.current.push(now);
        shakeTimestamps.current = shakeTimestamps.current.filter(
          t => now - t < SHAKE_WINDOW_MS
        );

        if (shakeTimestamps.current.length >= SHAKE_COUNT_NEEDED) {
          // Shake detected
          shakeTimestamps.current = [];
          lastTrigger.current = now;
          tapMedium();
          if (mgrsRef.current) {
            speakMGRS(mgrsRef.current);
          }
        }
      });
    } catch {
      // Accelerometer unavailable — silent degradation
    }

    return () => {
      try { subscription?.remove?.(); } catch {}
    };
  }, [enabled]);
}
