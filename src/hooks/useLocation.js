import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { normalizePositionFix, HEADING_MAX_AGE_MS } from '../utils/position';

// Defensive lazy-load expo-location to prevent SIGABRT if native module unavailable
let Location = null;
try {
  Location = require('expo-location');
} catch (e) {
  // expo-location not available — location features will degrade gracefully
}

/**
 * useLocation — Real-time GPS hook (HARDENED).
 * Data is ephemeral: lives only in React state, never written to disk or network.
 *
 * CRITICAL HARDENING:
 *   - expo-location loaded defensively (lazy require with try/catch)
 *   - All Location API calls wrapped in try/catch with mounted check
 *   - Permission requests have explicit error handling
 *   - getCurrentPositionAsync guarded with timeout
 *   - watchPositionAsync subscription errors are caught
 *   - No unhandled promise rejections
 *   - Graceful degradation if Location module unavailable
 */
export function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [compassHeading, setCompassHeading] = useState(null);
  const [compassReference, setCompassReference] = useState(null);
  const mounted = useRef(true);
  const latestFix = useRef(null);
  const headingTimeout = useRef(null);
  const foreground = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  // Live watcher subscriptions — held in refs so a RETRY press replaces the
  // existing watchers instead of stacking a new pair on every call.
  const posSubRef = useRef(null);
  const headingSubRef = useRef(null);
  const requestInFlight = useRef(false);
  const requestGeneration = useRef(0);
  const permissionRequest = useRef(null);

  const clearSubs = useCallback(() => {
    try { posSubRef.current?.remove?.(); } catch {}
    try { headingSubRef.current?.remove?.(); } catch {}
    clearTimeout(headingTimeout.current);
    posSubRef.current = null;
    headingSubRef.current = null;
  }, []);

  // Coordinate equality is not observation equality: accuracy, altitude,
  // speed and timestamp must still update when the receiver is stationary.
  const acceptPosition = useCallback((raw) => {
    const fix = normalizePositionFix(raw);
    if (!fix || (latestFix.current && fix.timestamp < latestFix.current.timestamp)) return false;
    latestFix.current = fix;
    setLocation(fix);
    setError(null);
    setIsLoading(false);
    return true;
  }, []);

  const requestAndWatch = useCallback(async () => {
    if (!mounted.current || requestInFlight.current) return;
    requestInFlight.current = true;
    const generation = ++requestGeneration.current;
    const isCurrent = () => mounted.current && requestGeneration.current === generation;

    // Remove any watchers from a previous call (mount or earlier RETRY) so
    // subscriptions never stack.
    clearSubs();
    setCompassReference(null);
    setCompassHeading(null);

    try {
      if (!Location || !Location.requestForegroundPermissionsAsync) {
        if (isCurrent()) {
          setError('Location module unavailable');
          setIsLoading(false);
        }
        return;
      }

      if (isCurrent()) {
        setIsLoading(true);
        setError(null);
      }

      let permStatus;
      try {
        // The OS permission prompt is a user decision, not a GPS operation.
        // Keep waiting while they read it; retry and effect replays share the
        // same pending prompt instead of creating a second native request.
        if (!permissionRequest.current) {
          const pending = Promise.resolve().then(() => Location.requestForegroundPermissionsAsync());
          permissionRequest.current = pending;
          pending.finally(() => {
            if (permissionRequest.current === pending) permissionRequest.current = null;
          }).catch(() => {});
        }
        const result = await permissionRequest.current;
        permStatus = result?.status;
      } catch (permErr) {
        if (isCurrent()) {
          setPermissionStatus('denied');
          setError('Permission request failed. Grant location access in device settings.');
          setIsLoading(false);
        }
        return;
      }

      if (!isCurrent()) return;

      setPermissionStatus(permStatus);

      if (permStatus !== 'granted') {
        if (isCurrent()) {
          setError('Location permission denied. Grant location access in device settings.');
          setIsLoading(false);
        }
        return;
      }

      // Get an immediate fix with timeout
      let initial;
      let positionTimeout;
      try {
        initial = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
            // GPS must work without opting into Android network location.
            mayShowUserSettingsDialog: false,
          }),
          new Promise((_, reject) => {
            positionTimeout = setTimeout(() => reject(new Error('Position timeout')), 15000);
          })
        ]);
      } catch (posErr) {
        if (isCurrent()) {
          setError(`GPS Error: ${posErr?.message || 'Could not get position'}`);
          setIsLoading(false);
        }
        // Keep installing the watcher: a slow first fix must recover on its own.
      } finally {
        clearTimeout(positionTimeout);
      }

      if (!isCurrent()) return;

      if (initial?.coords && !acceptPosition(initial)) {
        setError('GPS Error: Invalid position observation');
      }

      if (isCurrent()) {
        setIsLoading(false);
      }

      // Watch for updates — high accuracy, no background, no storage
      try {
        const positionSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            mayShowUserSettingsDialog: false,
            timeInterval: 1000,
            distanceInterval: 0,
          },
          (pos) => {
            if (isCurrent() && pos?.coords) {
              acceptPosition(pos);
            }
          },
          message => { if (isCurrent()) { setError(`Watch Error: ${message}`); setIsLoading(false); } }
        );
        if (!isCurrent()) {
          try { positionSubscription?.remove?.(); } catch {}
          return;
        }
        posSubRef.current = positionSubscription;
      } catch (watchErr) {
        if (isCurrent()) {
          setError(`Watch Error: ${watchErr?.message || 'Could not watch position'}`);
        }
      }

      if (!isCurrent()) return;
      // Compass heading from magnetometer — updates as phone rotates, even when stationary
      try {
        if (Location.watchHeadingAsync) {
          const headingSubscription = await Location.watchHeadingAsync((data) => {
            if (isCurrent() && foreground.current) {
              clearTimeout(headingTimeout.current);
              const hasTrueHeading = Number.isFinite(data?.trueHeading) && data.trueHeading >= 0 && data.trueHeading < 360;
              const h = hasTrueHeading ? data.trueHeading : data?.magHeading;
              if (Number.isFinite(data?.accuracy) && data.accuracy > 0 && Number.isFinite(h) && h >= 0 && h < 360) {
                setCompassHeading(h);
                setCompassReference(hasTrueHeading ? 'true' : 'magnetic');
                headingTimeout.current = setTimeout(() => {
                  if (isCurrent()) { setCompassHeading(null); setCompassReference(null); }
                }, HEADING_MAX_AGE_MS);
              } else {
                setCompassHeading(null);
                setCompassReference(null);
              }
            }
          });
          if (!isCurrent()) {
            try { headingSubscription?.remove?.(); } catch {}
            return;
          }
          headingSubRef.current = headingSubscription;
        }
      } catch {
        // Magnetometer unavailable — compassHeading stays null, arrow falls back to absolute bearing
      }

    } catch (err) {
      if (isCurrent()) {
        setError(`GPS Error: ${err?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    } finally {
      if (requestGeneration.current === generation) requestInFlight.current = false;
    }
  }, [acceptPosition, clearSubs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (!foreground.current) {
        clearTimeout(headingTimeout.current);
        setCompassHeading(null);
        setCompassReference(null);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    mounted.current = true;
    requestAndWatch();

    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      requestInFlight.current = false;
      clearSubs();
    };
  }, [requestAndWatch, clearSubs]);

  return { location, error, permissionStatus, isLoading, retry: requestAndWatch, compassHeading, compassReference };
}
