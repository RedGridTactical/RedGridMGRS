/**
 * useSettings — Loads and persists user settings (declination, pace count).
 */
import { useState, useEffect, useCallback } from 'react';
import { loadSettings, saveDeclination, savePaceCount } from '../utils/storage';

export function useSettings() {
  const [declination, setDeclinationState] = useState(0);
  const [paceCount, setPaceCountState] = useState(62);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then(({ declination, paceCount }) => {
      setDeclinationState(declination);
      setPaceCountState(paceCount);
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

  return { declination, setDeclination, paceCount, setPaceCount, loaded };
}
