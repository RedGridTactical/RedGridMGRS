/**
 * useSettings — Loads and persists user settings (HARDENED).
 * Stores the preferred palette independently from Tactical display.
 *
 * CRITICAL HARDENING:
 *   - loadSettings errors are caught and don't crash startup
 *   - State updates guarded with mounted check
 *   - All persist operations fire-and-forget with error swallowing
 *   - Callbacks validate input before persisting
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadSettings, saveDeclination, savePaceCount, saveCoordFormat,
  saveShakeToSpeak, saveGridCrossing, saveGridScale,
  saveDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES,
  effectiveDisplayTheme, updateDisplayPreferences,
} from '../utils/storage';

export function useSettings() {
  const [declination, setDeclinationState] = useState(0);
  const [paceCount, setPaceCountState]     = useState(62);
  const [displayPreferences, setDisplayPreferences] = useState(DEFAULT_DISPLAY_PREFERENCES);
  const displayRef = useRef(DEFAULT_DISPLAY_PREFERENCES);
  const displayChanged = useRef(false);
  const theme = effectiveDisplayTheme(displayPreferences);
  const tacticalMode = displayPreferences.tacticalMode;
  const [coordFormat, setCoordFormatState] = useState('mgrs');
  const [shakeToSpeak, setShakeToSpeakState] = useState(true);
  const [gridCrossing, setGridCrossingState] = useState(true);
  const [gridScale, setGridScaleState]     = useState(1.0);
  const [loaded, setLoaded]                = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initSettings = async () => {
      try {
        const settings = await loadSettings();
        if (!cancelled && mounted.current && settings) {
          setDeclinationState(settings.declination ?? 0);
          setPaceCountState(settings.paceCount ?? 62);
          if (!displayChanged.current) {
            const initialDisplay = settings.displayPreferences ?? DEFAULT_DISPLAY_PREFERENCES;
            displayRef.current = initialDisplay;
            setDisplayPreferences(initialDisplay);
          }
          setCoordFormatState(settings.coordFormat ?? 'mgrs');
          setShakeToSpeakState(settings.shakeToSpeak ?? true);
          setGridCrossingState(settings.gridCrossing ?? true);
          setGridScaleState(settings.gridScale ?? 1.0);
        }
      } catch (err) {
        // loadSettings already handles errors and returns defaults
        // Just ensure we set loaded even if it fails
      } finally {
        if (!cancelled && mounted.current) {
          setLoaded(true);
        }
      }
    };

    initSettings();

    return () => { cancelled = true; };
  }, []);

  const setDeclination = useCallback((val) => {
    try {
      const n = parseFloat(val) || 0;
      setDeclinationState(n);
      saveDeclination(n).catch(() => {});
    } catch (err) {}
  }, []);

  const setPaceCount = useCallback((val) => {
    try {
      const n = parseInt(val, 10) || 62;
      setPaceCountState(n);
      savePaceCount(n).catch(() => {});
    } catch (err) {}
  }, []);

  const changeDisplay = useCallback((change) => {
    const next = updateDisplayPreferences(displayRef.current, change);
    if (next === displayRef.current) return;
    displayChanged.current = true;
    displayRef.current = next;
    setDisplayPreferences(next);
    saveDisplayPreferences(next).catch(() => {});
  }, []);

  const setTheme = useCallback((themeId) => {
    changeDisplay({ theme: themeId });
  }, [changeDisplay]);

  const setTacticalMode = useCallback((enabled) => {
    changeDisplay({ tacticalMode: enabled });
  }, [changeDisplay]);

  const setCoordFormat = useCallback((val) => {
    try {
      const fmt = String(val ?? 'mgrs');
      setCoordFormatState(fmt);
      saveCoordFormat(fmt).catch(() => {});
    } catch (err) {}
  }, []);

  const setShakeToSpeak = useCallback((val) => {
    try {
      const bool = !!val;
      setShakeToSpeakState(bool);
      saveShakeToSpeak(bool).catch(() => {});
    } catch (err) {}
  }, []);

  const setGridCrossing = useCallback((val) => {
    try {
      const bool = !!val;
      setGridCrossingState(bool);
      saveGridCrossing(bool).catch(() => {});
    } catch (err) {}
  }, []);

  const setGridScale = useCallback((val) => {
    try {
      const n = parseFloat(val) || 1.0;
      const clamped = Math.min(1.5, Math.max(0.7, Math.round(n * 10) / 10));
      setGridScaleState(clamped);
      saveGridScale(clamped).catch(() => {});
    } catch (err) {}
  }, []);

  return {
    declination, setDeclination,
    paceCount, setPaceCount,
    theme, setTheme,
    tacticalMode, setTacticalMode,
    coordFormat, setCoordFormat,
    shakeToSpeak, setShakeToSpeak,
    gridCrossing, setGridCrossing,
    gridScale, setGridScale,
    loaded,
  };
}
