/**
 * useBarometer — rolling pressure history, trend and storm risk.
 *
 * Reads the phone's own pressure sensor. No network, nothing stored off-device:
 * the history lives in memory for the life of the screen and is discarded.
 *
 * Sampling: the sensor will happily fire several times a second, which is
 * useless for a trend measured in hours and expensive in battery. Readings are
 * therefore throttled to one stored sample per SAMPLE_INTERVAL_MS, and the
 * buffer is capped by age rather than count.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { addReading, classifyTrend, stormRisk, pressureAltitude, seaLevelPressure } from '../utils/barometer';

/** One stored sample per minute is ample for an hours-long trend. */
export const SAMPLE_INTERVAL_MS = 60 * 1000;
/** Six hours of history: long enough for a real trend, small enough to hold. */
export const HISTORY_WINDOW_MS = 6 * 60 * 60 * 1000;

export function useBarometer(location) {
  const [available, setAvailable] = useState(null); // null = still checking
  const [pressure, setPressure] = useState(null);   // hPa, live
  const [readings, setReadings] = useState([]);
  const lastStoredRef = useRef(0);
  const mounted = useRef(true);
  // Altitude is read through a ref so a changing fix never re-subscribes the
  // sensor; the listener always sees the latest value.
  const altitudeRef = useRef(null);
  altitudeRef.current = location && Number.isFinite(location.altitude) ? location.altitude : null;

  useEffect(() => {
    mounted.current = true;
    let subscription = null;
    let cancelled = false;

    (async () => {
      let Barometer;
      try {
        // Required lazily so a device or test environment without the sensor
        // module cannot break the whole screen at import time.
        ({ Barometer } = require('expo-sensors'));
      } catch {
        if (!cancelled && mounted.current) setAvailable(false);
        return;
      }

      let ok = false;
      try {
        ok = await Barometer.isAvailableAsync();
      } catch {
        ok = false;
      }
      if (cancelled || !mounted.current) return;
      setAvailable(ok);
      if (!ok) return;

      try {
        Barometer.setUpdateInterval(2000);
        subscription = Barometer.addListener((sample) => {
          if (!mounted.current) return;
          const hPa = sample && Number.isFinite(sample.pressure) ? sample.pressure : null;
          if (hPa == null || hPa <= 0) return;
          setPressure(hPa);

          const now = Date.now();
          if (now - lastStoredRef.current < SAMPLE_INTERVAL_MS) return;
          lastStoredRef.current = now;
          const entry = { t: now, hPa };
          if (altitudeRef.current != null) entry.altitudeM = altitudeRef.current;
          setReadings((prev) => addReading(prev, entry, now, HISTORY_WINDOW_MS));
        });
      } catch {
        if (!cancelled && mounted.current) setAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
      try { subscription && subscription.remove(); } catch {}
    };
  }, []);

  const trend = useMemo(() => classifyTrend(readings), [readings]);
  const risk = useMemo(() => stormRisk(trend), [trend]);

  /** Sea-level equivalent of the live reading, when we know our altitude. */
  const seaLevel = useMemo(() => {
    if (pressure == null || altitudeRef.current == null) return null;
    return seaLevelPressure(pressure, altitudeRef.current);
  }, [pressure, readings]);

  /** Barometric altitude, referenced to the standard atmosphere. */
  const baroAltitude = useMemo(
    () => (pressure == null ? null : pressureAltitude(pressure)),
    [pressure]
  );

  const reset = useCallback(() => {
    setReadings([]);
    lastStoredRef.current = 0;
  }, []);

  return { available, pressure, seaLevel, baroAltitude, readings, trend, risk, reset };
}
