import { useEffect, useRef, useState, useCallback } from 'react';
import { createRouteCoverageController, routeFingerprint } from '../utils/routeCoverage';

/**
 * Route map coverage for one route. A result is dropped as stale when the
 * route coordinates or the imported map change; leaving the screen cancels a
 * running check.
 *
 * @param {Array<object>} waypoints
 * @param {{ active?: boolean }} [options] set false while the owning surface is hidden
 */
export function useRouteCoverage(waypoints, { active = true } = {}) {
  const [snapshot, setSnapshot] = useState({ status: 'idle', result: null, progress: null });
  const controller = useRef(null);
  if (!controller.current) controller.current = createRouteCoverageController({ onChange: setSnapshot });
  const points = useRef(waypoints);
  points.current = waypoints;
  const fingerprint = routeFingerprint(waypoints);

  useEffect(() => {
    if (active) controller.current.sync(points.current);
    else controller.current.cancel();
  }, [fingerprint, active]);
  useEffect(() => () => controller.current.dispose(), []);

  const check = useCallback(() => controller.current.start(points.current), []);
  const cancel = useCallback(() => controller.current.cancel(), []);
  return { ...snapshot, check, cancel };
}
