/**
 * useInitialViewport — the viewport the native map was actually created with.
 *
 * react-native-maps reads `initialRegion` only when the map mounts. If the
 * region fed to the labels, the tile-coverage check and the MGRS overlay keeps
 * following a later GPS fix while the native map stays where it started, the
 * CENTER footer describes a place the map is not showing. So the initial
 * viewport is captured exactly once per mount: a restored session viewport
 * wins, then a fix available at mount, else the default. A later fix never
 * moves it; only a real region event (pan, zoom, animateToRegion →
 * onRegionChangeComplete) or an explicit recenter changes what is displayed.
 */
import { useEffect, useRef, useState } from 'react';
import { restoreRegion } from '../utils/mapSession';

export const DEFAULT_MAP_REGION = Object.freeze({ latitude: 38.8895, longitude: -77.0353, latitudeDelta: 0.05, longitudeDelta: 0.05 });

/** Pure: the viewport a new map mount should start from. */
export function initialViewportFor({ session, location, fallback = DEFAULT_MAP_REGION }) {
  const remembered = restoreRegion(session, null);
  if (remembered) return remembered;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    return { latitude: location.lat, longitude: location.lon, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  return fallback;
}

export function useInitialViewport(session, location) {
  const captured = useRef(null);
  if (!captured.current) captured.current = initialViewportFor({ session, location });
  return captured.current;
}

/**
 * The displayed viewport for one map mount. `mapRegion` is seeded from the
 * once-captured initial viewport (not null), so an untouched map publishes
 * where it actually is into the session: after an unmount (tab change, fold
 * to compact) and a remount, the map starts where the user last saw it even
 * if no native region event ever fired and a fix arrived meanwhile.
 */
export function useMapViewport(session, location, onSessionChange) {
  const initialRegion = useInitialViewport(session, location);
  const [mapRegion, setMapRegion] = useState(initialRegion);
  useEffect(() => { onSessionChange?.({ region: mapRegion }); }, [mapRegion, onSessionChange]);
  return { initialRegion, mapRegion, setMapRegion };
}
