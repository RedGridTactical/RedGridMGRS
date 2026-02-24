import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';

/**
 * useLocation — Real-time GPS hook.
 * Data is ephemeral: lives only in React state, never written to disk or network.
 */
export function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const requestAndWatch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== 'granted') {
        setError('Location permission denied. Grant location access in device settings.');
        setIsLoading(false);
        return;
      }

      // Get an immediate fix
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setLocation({
        lat: initial.coords.latitude,
        lon: initial.coords.longitude,
        accuracy: initial.coords.accuracy,
        heading: initial.coords.heading,
        altitude: initial.coords.altitude,
        speed: initial.coords.speed,
      });
      setIsLoading(false);

      // Watch for updates — high accuracy, no background, no storage
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            heading: pos.coords.heading,
            altitude: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
            speed: pos.coords.speed,
          });
        }
      );

      return () => subscription.remove();
    } catch (err) {
      setError(`GPS Error: ${err.message}`);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cleanup;
    requestAndWatch().then((fn) => {
      cleanup = fn;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [requestAndWatch]);

  return { location, error, permissionStatus, isLoading, retry: requestAndWatch };
}
