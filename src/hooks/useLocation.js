import { useState, useEffect, useCallback, useRef } from 'react';

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
  const prevCoords = useRef(null);
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
    posSubRef.current = null;
    headingSubRef.current = null;
  }, []);

  // Only update state if position changed by more than ~0.1m to prevent cascade re-renders
  const COORD_THRESHOLD = 0.000001;
  const updateLocationIfChanged = useCallback((newLoc) => {
    const prev = prevCoords.current;
    if (
      prev &&
      Math.abs(newLoc.lat - prev.lat) < COORD_THRESHOLD &&
      Math.abs(newLoc.lon - prev.lon) < COORD_THRESHOLD
    ) {
      return; // Position unchanged, skip re-render
    }
    prevCoords.current = { lat: newLoc.lat, lon: newLoc.lon };
    setLocation(newLoc);
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
        return;
      } finally {
        clearTimeout(positionTimeout);
      }

      if (!isCurrent()) return;

      if (initial?.coords) {
        updateLocationIfChanged({
          lat: initial.coords.latitude,
          lon: initial.coords.longitude,
          accuracy: Math.round(initial.coords.accuracy),
          heading: initial.coords.heading,
          altitude: initial.coords.altitude != null ? Math.round(initial.coords.altitude) : null,
          speed: initial.coords.speed,
        });
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
            distanceInterval: 1,
          },
          (pos) => {
            if (isCurrent() && pos?.coords) {
              updateLocationIfChanged({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy),
                heading: pos.coords.heading,
                altitude: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : null,
                speed: pos.coords.speed,
              });
            }
          }
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
            if (isCurrent()) {
              const hasTrueHeading = Number.isFinite(data?.trueHeading) && data.trueHeading >= 0;
              const h = hasTrueHeading ? data.trueHeading : data?.magHeading;
              if (Number.isFinite(h) && h >= 0) {
                setCompassHeading(h);
                setCompassReference(hasTrueHeading ? 'true' : 'magnetic');
              } else {
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
  }, [updateLocationIfChanged, clearSubs]);

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
