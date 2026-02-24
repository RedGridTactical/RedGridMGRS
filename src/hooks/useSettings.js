/**
 * useSettings — Loads and persists user settings.
 * Adds theme support on top of declination + pace count.
 */
import { useState, useEffect, useCallback } from 'react';
import { loadSettings, saveDeclination, savePaceCount, saveTheme } from '../utils/storage';

export function useSettings() {
  const [declination, setDeclinationState] = useState(0);
  const [paceCount, setPaceCountState]     = useState(62);
  const [theme, setThemeState]             = useState('red');
  const [loaded, setLoaded]                = useState(false);

  useEffect(() => {
    loadSettings().then(({ declination, paceCount, theme }) => {
      setDeclinationState(declination);
      setPaceCountState(paceCount);
      setThemeState(theme);
      setLoaded(true);
    });
  }, []);

  const setDeclination = useCallback((val) => {
    const n = parseFloat(val) || 0;
    setDeclinationState(n);
    saveDeclination(n);
  }, []);

  const setPaceCount = useCallback((val) => {
    const n = parseInt(val, 10) || 62;
    setPaceCountState(n);
    savePaceCount(n);
  }, []);

  const setTheme = useCallback((val) => {
    setThemeState(val);
    saveTheme(val);
  }, []);

  return { declination, setDeclination, paceCount, setPaceCount, theme, setTheme, loaded };
}
