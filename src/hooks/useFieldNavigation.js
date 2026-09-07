import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyNavigation, loadNavigation, saveNavigation, transitionNavigation } from '../utils/fieldNavigation';

/** A local destination survives tab changes and restarts, without recording a GPS track. */
export function useFieldNavigation() {
  const [navigation, setNavigation] = useState(emptyNavigation);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const stateRef = useRef(navigation);
  const pendingActions = useRef([]);
  const loadedRef = useRef(false);
  const writeRevision = useRef(0);

  const persist = useCallback((next) => {
    const revision = ++writeRevision.current;
    saveNavigation(next).then(() => {
      if (revision === writeRevision.current) setSaveError(false);
    }).catch(() => {
      if (revision === writeRevision.current) setSaveError(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadNavigation().then(saved => {
      if (cancelled) return;
      // Apply deliberate actions made during loading to the stored state.
      const pending = pendingActions.current;
      const restored = pending.reduce(transitionNavigation, saved);
      stateRef.current = restored;
      setNavigation(restored);
      loadedRef.current = true;
      setLoaded(true);
      if (pending.length) persist(restored);
      pendingActions.current = [];
    }).catch(() => {
      if (cancelled) return;
      loadedRef.current = true;
      setLoaded(true);
      setSaveError(true);
      // Keep the previous stored value until the user deliberately changes state.
    });
    return () => { cancelled = true; };
  }, [persist]);

  const dispatch = useCallback(action => {
    const timed = { ...action, now: Date.now() };
    const next = transitionNavigation(stateRef.current, timed);
    if (!loadedRef.current) pendingActions.current.push(timed);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setNavigation(next);
    if (loadedRef.current) persist(next);
  }, [persist]);

  const setWaypoint = useCallback(waypoint => dispatch({ type: 'waypoint', waypoint }), [dispatch]);
  const startRoute = useCallback((list, mode = 'solo') => dispatch({ type: 'start', list, mode }), [dispatch]);
  const confirmPoint = useCallback((routeId, index) => dispatch({ type: 'confirm', routeId, index }), [dispatch]);
  const stopRoute = useCallback(routeId => dispatch({ type: 'stop', routeId }), [dispatch]);
  const clearHistory = useCallback(() => dispatch({ type: 'clearHistory' }), [dispatch]);

  return { ...navigation, loaded, saveError, setWaypoint, startRoute, confirmPoint, stopRoute, clearHistory };
}
