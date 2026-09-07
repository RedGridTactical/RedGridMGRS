import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Brightness from 'expo-brightness';
import * as NavigationBar from 'expo-navigation-bar';
import { createBrightnessSession, DEFAULT_NIGHT_LEVEL, NIGHT_LEVELS, nightLevel } from '../utils/displayBrightness';

const KEY = 'rg_night_brightness_v1';

export function useTacticalBrightness(enabled) {
  const [level, setLevel] = useState(DEFAULT_NIGHT_LEVEL);
  const [loaded, setLoaded] = useState(false);
  const [lifecycle, setLifecycle] = useState({ active: AppState.currentState === 'active', revision: 0 });
  const active = lifecycle.active;
  const [completedRequest, setCompletedRequest] = useState(null);
  // A previous mode's completion must never expose the first frame of a new
  // Tactical request before its native brightness operation has finished.
  const requestKey = `${enabled}:${active}:${loaded}:${level}:${lifecycle.revision}`;
  const [error, setError] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const session = useRef(null);
  const writes = useRef(Promise.resolve());
  if (!session.current) session.current = createBrightnessSession(Brightness, Platform.OS, NavigationBar);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY).then(raw => {
      if (live && raw !== null) setLevel(nightLevel(Number(raw)));
    }).catch(() => {}).finally(() => { if (live) setLoaded(true); });
    const listener = AppState.addEventListener('change', state => {
      setCompletedRequest(null);
      setLifecycle(previous => ({ active: state === 'active', revision: previous.revision + 1 }));
    });
    return () => {
      live = false;
      listener.remove();
      session.current.restore().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let live = true;
    setCompletedRequest(null);
    if (!enabled) setBlackout(false);
    const operation = enabled && active && loaded
      ? session.current.apply(level)
      : session.current.restore();
    operation.then(() => {
      if (live) { setCompletedRequest(requestKey); setError(false); }
    }).catch(() => {
      if (live) { setError(true); setCompletedRequest(requestKey); }
    });
    return () => { live = false; };
  }, [enabled, active, loaded, level, lifecycle.revision]);

  const changeLevel = useCallback(delta => {
    setLevel(previous => {
      const next = NIGHT_LEVELS[Math.max(0, Math.min(NIGHT_LEVELS.length - 1, NIGHT_LEVELS.indexOf(previous) + delta))];
      writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, String(next))).catch(() => {});
      return next;
    });
  }, []);

  return { level, changeLevel, ready: loaded && completedRequest === requestKey, error, active, blackout, setBlackout, restore: session.current.restore };
}
