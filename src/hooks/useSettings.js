/** Local display and interaction preferences with visible save failures. */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadSettings, saveDeclination, savePaceCount, saveCoordFormat,
  saveShakeToSpeak, saveTacticalSound, saveGridCrossing, saveGridScale,
  saveDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES,
  effectiveDisplayTheme, updateDisplayPreferences,
} from '../utils/storage';

export function useSettings() {
  const [declination, setDeclinationState] = useState(0);
  const [paceCount, setPaceCountState] = useState(62);
  const [displayPreferences, setDisplayPreferences] = useState(DEFAULT_DISPLAY_PREFERENCES);
  const displayRef = useRef(DEFAULT_DISPLAY_PREFERENCES);
  const [coordFormat, setCoordFormatState] = useState('mgrs');
  const [shakeToSpeak, setShakeToSpeakState] = useState(false);
  const [tacticalSound, setTacticalSoundState] = useState(false);
  const [gridCrossing, setGridCrossingState] = useState(true);
  const [gridScale, setGridScaleState] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pending = useRef(new Map());
  const changed = useRef(new Set());
  const mounted = useRef(true);
  const loadRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const revision = ++loadRevision.current;
    loadSettings().then(settings => {
      if (!mounted.current || revision !== loadRevision.current || !settings) return;
      const apply = (key, value, setter) => { if (!changed.current.has(key)) setter(value); };
      apply('declination', settings.declination ?? 0, setDeclinationState);
      apply('paceCount', settings.paceCount ?? 62, setPaceCountState);
      apply('display', settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES, next => {
        displayRef.current = next; setDisplayPreferences(next);
      });
      apply('coordFormat', settings.coordFormat ?? 'mgrs', setCoordFormatState);
      apply('shakeToSpeak', settings.shakeToSpeak ?? false, setShakeToSpeakState);
      apply('tacticalSound', settings.tacticalSound ?? false, setTacticalSoundState);
      apply('gridCrossing', settings.gridCrossing ?? true, setGridCrossingState);
      apply('gridScale', settings.gridScale ?? 1, setGridScaleState);
    }).catch(() => { if (mounted.current && revision === loadRevision.current) setSaveError(true); }).finally(() => {
      if (mounted.current && revision === loadRevision.current) setLoaded(true);
    });
    return () => { mounted.current = false; ++loadRevision.current; };
  }, []);

  const persist = useCallback(async (key, write, apply) => {
    changed.current.add(key);
    const operation = { write, apply, failed: false };
    pending.current.set(key, operation);
    try {
      await write();
      if (pending.current.get(key) === operation) {
        pending.current.delete(key);
        if (mounted.current) apply?.();
      }
      if (mounted.current) setSaveError([...pending.current.values()].some(item => item.failed));
      return true;
    } catch {
      if (pending.current.get(key) === operation) operation.failed = true;
      if (mounted.current) setSaveError([...pending.current.values()].some(item => item.failed));
      return false;
    }
  }, []);
  const retrySave = useCallback(async () => {
    for (const [key, operation] of [...pending.current]) {
      if (operation.failed && pending.current.get(key) === operation) await persist(key, operation.write, operation.apply);
    }
  }, [persist]);
  const setDeclination = useCallback(value => {
    const n = typeof value === 'string' && !value.trim() ? NaN : Number(value);
    if (!Number.isFinite(n) || n < -180 || n > 180) return Promise.resolve(false);
    return persist('declination', () => saveDeclination(n), () => setDeclinationState(n));
  }, [persist]);
  const setPaceCount = useCallback(value => {
    const n = typeof value === 'string' && !value.trim() ? NaN : Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 999) return Promise.resolve(false);
    return persist('paceCount', () => savePaceCount(n), () => setPaceCountState(n));
  }, [persist]);
  const changeDisplay = useCallback(change => {
    const next = updateDisplayPreferences(displayRef.current, change);
    if (next === displayRef.current) return Promise.resolve(true);
    displayRef.current = next;
    setDisplayPreferences(next);
    return persist('display', () => saveDisplayPreferences(next));
  }, [persist]);
  const setTheme = useCallback(theme => changeDisplay({ theme }), [changeDisplay]);
  const setTacticalMode = useCallback(tacticalMode => changeDisplay({ tacticalMode }), [changeDisplay]);
  const setCoordFormat = useCallback(value => {
    if (!['mgrs', 'dd', 'dms', 'utm'].includes(value)) return Promise.resolve(false);
    return persist('coordFormat', () => saveCoordFormat(value), () => setCoordFormatState(value));
  }, [persist]);
  const setShakeToSpeak = useCallback(value => persist('shakeToSpeak', () => saveShakeToSpeak(!!value), () => setShakeToSpeakState(!!value)), [persist]);
  const setTacticalSound = useCallback(value => persist('tacticalSound', () => saveTacticalSound(!!value), () => setTacticalSoundState(!!value)), [persist]);
  const setGridCrossing = useCallback(value => persist('gridCrossing', () => saveGridCrossing(!!value), () => setGridCrossingState(!!value)), [persist]);
  const setGridScale = useCallback(value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return Promise.resolve(false);
    const scale = Math.min(1.5, Math.max(0.7, Math.round(n * 10) / 10));
    return persist('gridScale', () => saveGridScale(scale), () => setGridScaleState(scale));
  }, [persist]);
  return {
    declination, setDeclination, paceCount, setPaceCount,
    theme: effectiveDisplayTheme(displayPreferences), setTheme,
    tacticalMode: displayPreferences.tacticalMode, setTacticalMode,
    coordFormat, setCoordFormat, shakeToSpeak, setShakeToSpeak,
    tacticalSound, setTacticalSound, gridCrossing, setGridCrossing,
    gridScale, setGridScale, loaded, saveError, retrySave,
  };
}
