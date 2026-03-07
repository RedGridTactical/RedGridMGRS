/**
 * useSettings — Loads and persists user settings (HARDENED).
 * Adds theme support on top of declination + pace count.
 *
 * CRITICAL HARDENING:
 *   - loadSettings errors are caught and don't crash startup
 *   - State updates guarded with mounted check
 *   - All persist operations fire-and-forget with error swallowing
 *   - Callbacks validate input before persisting
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { loadSettings, saveDeclination, savePaceCount, saveTheme, saveCoordFormat } from '../utils/storage';

export function useSettings() {
  const [declination, setDeclinationState] = useState(0);
  const [paceCount, setPaceCountState]     = useState(62);
  const [theme, setThemeState]             = useState('red');
  const [coordFormat, setCoordFormatState] = useState('mgrs');
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
          setThemeState(settings.theme ?? 'red');
          setCoordFormatState(settings.coordFormat ?? 'mgrs');
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
      // Fire and forget — don't block on storage
      saveDeclination(n).catch(() => {});
    } catch (err) {
      // Input validation failed, just use default
    }
  }, []);

  const setPaceCount = useCallback((val) => {
    try {
      const n = parseInt(val, 10) || 62;
      setPaceCountState(n);
      // Fire and forget — don't block on storage
      savePaceCount(n).catch(() => {});
    } catch (err) {
      // Input validation failed, just use default
    }
  }, []);

  const setTheme = useCallback((val) => {
    try {
      const themeStr = String(val ?? 'red');
      setThemeState(themeStr);
      // Fire and forget — don't block on storage
      saveTheme(themeStr).catch(() => {});
    } catch (err) {
      // Input validation failed, just use default
    }
  }, []);

  const setCoordFormat = useCallback((val) => {
    try {
      const fmt = String(val ?? 'mgrs');
      setCoordFormatState(fmt);
      saveCoordFormat(fmt).catch(() => {});
    } catch (err) {
      // Input validation failed, just use default
    }
  }, []);

  return { declination, setDeclination, paceCount, setPaceCount, theme, setTheme, coordFormat, setCoordFormat, loaded };
}
