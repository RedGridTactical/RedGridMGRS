import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';

/**
 * useLocation — Real-time GPS hook (HARDENED).
 * Data is ephemeral: lives only in React state, never written to disk or network.
 *
 * CRITICAL HARDENING:
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
  const mounted = useRef(true);

  // Track cleanup to prevent state updates on unmounted component
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const requestAndWatch = useCallback(async () => {
    if (!mounted.current) return;

    try {
      if (!Location || !Location.requestForegroundPermissionsAsync) {
        if (mounted.current) {
          setError('Location module unavailable');
          setIsLoading(false);
        }
        return;
      }

      if (mounted.current) {
        setIsLoading(true);
        setError(null);
      }

      let permStatus;
      try {
        const result = await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Permission request timeout')), 10000)
          )
        ]);
        permStatus = result?.status;
      } catch (permErr) {
        if (mounted.current) {
          setPermissionStatus('denied');
          setError('Permission request failed. Grant location access in device settings.');
          setIsLoading(false);
        }
        return;
      }

      if (!mounted.current) return;

      setPermissionStatus(permStatus);

      if (permStatus !== 'granted') {
        if (mounted.current) {
          setError('Location permission denied. Grant location access in device settings.');
          setIsLoading(false);
        }
        return;
      }

      // Get an immediate fix with timeout
      let initial;
      try {
        initial = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Position timeout')), 15000)
          )
        ]);
      } catch (posErr) {
        if (mounted.current) {
          setError(`GPS Error: ${posErr?.message || 'Could not get position'}`);
          setIsLoading(false);
        }
        return;
      }

      if (!mounted.current) return;

      if (initial?.coords) {
        setLocation({
          lat: initial.coords.latitude,
          lon: initial.coords.longitude,
          accuracy: initial.coords.accuracy,
          heading: initial.coords.heading,
          altitude: initial.coords.altitude,
          speed: initial.coords.speed,
        });
      }

      if (mounted.current) {
        setIsLoading(false);
      }

      // Watch for updates — high accuracy, no background, no storage
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (pos) => {
            if (mounted.current && pos?.coords) {
              setLocation({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy),
                heading: pos.coords.heading,
                altitude: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
                speed: pos.coords.speed,
              });
            }
          }
        );

        return () => {
          try {
            if (subscription && typeof subscription.remove === 'function') {
              subscription.remove();
            }
          } catch {}
        };
      } catch (watchErr) {
        // Watch failed, but position was obtained — continue with static location
        if (mounted.current) {
          setError(`Watch Error: ${watchErr?.message || 'Could not watch position'}`);
        }
        return undefined;
      }
    } catch (err) {
      if (mounted.current) {
        setError(`GPS Error: ${err?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cleanup;
    let cancelled = false;

    const startWatch = async () => {
      try {
        const fn = await requestAndWatch();
        if (!cancelled && fn) {
          cleanup = fn;
        }
      } catch (e) {
        // Ensure no unhandled rejection
        if (!cancelled && mounted.current) {
          setError('Failed to initialize location');
          setIsLoading(false);
        }
      }
    };

    startWatch();

    return () => {
      cancelled = true;
      if (cleanup) {
        try {
          cleanup();
        } catch {}
      }
    };
  }, [requestAndWatch]);

  return { location, error, permissionStatus, isLoading, retry: requestAndWatch };
}
