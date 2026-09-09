import { useCallback } from 'react';
import { emptyNavigation, loadNavigation, saveNavigation, transitionNavigation, validPosition } from '../utils/fieldNavigation';
import { fieldDataError } from '../utils/durableStorage';
import { useDurableFieldState } from './useDurableFieldState';

/** Durable plan snapshots and manual confirmations, never a GPS movement track. */
export function useFieldNavigation() {
  const { value: navigation, mutate, ...status } = useDurableFieldState(emptyNavigation, loadNavigation, saveNavigation);
  const dispatch = useCallback(action => mutate(state => transitionNavigation(state, { ...action, now: Date.now() })), [mutate]);
  const setWaypoint = useCallback(waypoint => {
    if (waypoint != null && !validPosition(waypoint)) return Promise.reject(fieldDataError('INVALID_POINT', 'Invalid waypoint'));
    return dispatch({ type: 'waypoint', waypoint });
  }, [dispatch]);
  const startRoute = useCallback((list, mode = 'solo') => {
    if (!Array.isArray(list?.waypoints) || !list.waypoints.length || list.waypoints.length > 20 || !list.waypoints.every(validPosition)) {
      return Promise.reject(fieldDataError('INVALID_LIST', 'Route needs valid points'));
    }
    return dispatch({ type: 'start', list, mode });
  }, [dispatch]);
  const confirmPoint = useCallback((routeId, index) => dispatch({ type: 'confirm', routeId, index }), [dispatch]);
  const stopRoute = useCallback(routeId => dispatch({ type: 'stop', routeId }), [dispatch]);
  const clearHistory = useCallback(() => dispatch({ type: 'clearHistory' }), [dispatch]);
  const updateReviewNotes = useCallback((routeId, notes) => dispatch({ type: 'reviewNotes', routeId, notes }), [dispatch]);
  return { ...navigation, ...status, setWaypoint, startRoute, confirmPoint, stopRoute, clearHistory, updateReviewNotes };
}
