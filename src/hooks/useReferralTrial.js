import { useState, useRef, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { getTrialStatus, trialStatusAt } from '../utils/referral';

const DAY_MS = 86400000;

// Trial access has a known local deadline. It must expire while open and on
// foreground even if reading storage is slow or temporarily unavailable.
export function useReferralTrial() {
  const [status, setStatus] = useState(() => trialStatusAt(null));
  const record = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(false);
  const request = useRef(0);

  const publish = useCallback(() => {
    clearTimeout(timer.current);
    if (!mounted.current) return trialStatusAt(record.current);
    const next = trialStatusAt(record.current);
    setStatus(next);
    if (next.active) {
      const remaining = Date.parse(next.expiresAt) - Date.now();
      const untilDayChanges = remaining - (next.daysLeft - 1) * DAY_MS;
      timer.current = setTimeout(publish, Math.max(1, Math.min(remaining, untilDayChanges)));
    }
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    // Enforce the cached deadline before awaiting the native storage bridge.
    publish();
    const loaded = await getTrialStatus();
    if (!mounted.current || id !== request.current) return trialStatusAt(record.current);
    if (loaded.available) record.current = loaded;
    return publish();
  }, [publish]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      request.current += 1;
      clearTimeout(timer.current);
      sub?.remove?.();
    };
  }, [refresh]);

  return { ...status, refresh };
}
