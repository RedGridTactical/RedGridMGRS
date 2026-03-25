/**
 * MapScreen — Full-screen tactical map with MGRS grid overlay.
 * Uses react-native-maps with OpenStreetMap tiles.
 *
 * Features:
 * - Dark/tactical tile server for low-vis environments
 * - User location as pulsing dot
 * - Saved waypoints as markers
 * - Long-press to add waypoint
 * - Bottom bar showing MGRS of map center
 * - MGRS grid overlay (100km + 1km lines)
 *
 * Privacy: no tracking, no analytics. Location is ephemeral.
 */
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Animated, Platform,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { toMGRS, formatMGRS } from '../utils/mgrs';
import { tapLight, tapMedium, notifySuccess } from '../utils/haptics';
import { loadWaypointLists, saveWaypointLists } from '../utils/storage';
import { MGRSGridOverlay } from '../components/MGRSGridOverlay';

let MapView = null;
let Marker = null;
let UrlTile = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps.MapView;
  Marker = Maps.Marker;
  UrlTile = Maps.UrlTile;
} catch {}

// Dark tactical tile server (CartoDB dark matter — free, no key required)
const DARK_TILE_URL = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Pulsing location dot animation
function PulsingDot({ color }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.pulsingContainer}>
      <Animated.View style={[styles.pulsingRing, { borderColor: color, opacity: 0.4, transform: [{ scale: pulse }] }]} />
      <View style={[styles.pulsingCenter, { backgroundColor: color }]} />
    </View>
  );
}

export function MapScreen({ location, isPro, onShowProGate }) {
  const colors = useColors();
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [centerMGRS, setCenterMGRS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);

  // Load waypoints from all lists for display on map
  useEffect(() => {
    loadWaypointLists()
      .then((lists) => {
        const allWps = [];
        if (Array.isArray(lists)) {
          for (const list of lists) {
            if (Array.isArray(list?.waypoints)) {
              for (const wp of list.waypoints) {
                if (wp?.lat != null && wp?.lon != null) {
                  allWps.push({
                    ...wp,
                    listName: list.name || 'Unnamed',
                  });
                }
              }
            }
          }
        }
        setWaypoints(allWps);
      })
      .catch(() => {});
  }, []);

  // Initial region — center on user location or default to CONUS center
  const initialRegion = useMemo(() => ({
    latitude: location?.lat ?? 38.8895,
    longitude: location?.lon ?? -77.0353,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }), [location?.lat, location?.lon]);

  // Update center MGRS on region change
  const onRegionChange = useCallback((region) => {
    setMapRegion(region);
    try {
      const mgrs = toMGRS(region.latitude, region.longitude, 5);
      setCenterMGRS(formatMGRS(mgrs));
    } catch {
      setCenterMGRS(null);
    }
  }, []);

  // Long-press to create waypoint
  const onLongPress = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    tapMedium();
    const mgrs = formatMGRS(toMGRS(latitude, longitude, 5));

    Alert.alert(
      t('map.addWaypoint'),
      `${mgrs}`,
      [
        { text: t('waypoints.cancel'), style: 'cancel' },
        {
          text: t('waypoints.add'),
          onPress: async () => {
            try {
              const lists = await loadWaypointLists();
              if (!lists || lists.length === 0) {
                // Create a default "MAP" list if none exist
                const newList = {
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  name: 'MAP',
                  waypoints: [{
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    lat: latitude,
                    lon: longitude,
                    label: mgrs,
                  }],
                };
                await saveWaypointLists([newList]);
              } else {
                // Add to the first list
                const updated = [...lists];
                if (!Array.isArray(updated[0].waypoints)) updated[0].waypoints = [];
                updated[0].waypoints.push({
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  lat: latitude,
                  lon: longitude,
                  label: mgrs,
                });
                await saveWaypointLists(updated);
              }
              notifySuccess();
              // Reload waypoints
              const refreshed = await loadWaypointLists();
              const allWps = [];
              if (Array.isArray(refreshed)) {
                for (const list of refreshed) {
                  if (Array.isArray(list?.waypoints)) {
                    for (const wp of list.waypoints) {
                      if (wp?.lat != null && wp?.lon != null) {
                        allWps.push({ ...wp, listName: list.name || 'Unnamed' });
                      }
                    }
                  }
                }
              }
              setWaypoints(allWps);
            } catch {}
          },
        },
      ]
    );
  }, [t]);

  // Center on user location
  const centerOnUser = useCallback(() => {
    if (!location || !mapRef.current) return;
    tapLight();
    mapRef.current.animateToRegion({
      latitude: location.lat,
      longitude: location.lon,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  }, [location]);

  // Determine tile URL — use dark tiles by default for tactical look
  const isDark = colors.bg === '#000000' || colors.bg === '#0A0A0A' || colors.bg === '#000';
  const tileUrl = isDark ? DARK_TILE_URL : OSM_TILE_URL;

  if (!MapView) {
    // Graceful fallback if react-native-maps unavailable
    return (
      <View style={[styles.fallback, { backgroundColor: colors.bg }]}>
        <Text style={[styles.fallbackText, { color: colors.text3 }]}>
          Map module unavailable. Rebuild the app to enable.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChange}
        onLongPress={onLongPress}
        mapType="none"
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Tile overlay */}
        <UrlTile
          urlTemplate={tileUrl}
          maximumZ={19}
          flipY={false}
          tileSize={256}
        />

        {/* MGRS grid overlay */}
        <MGRSGridOverlay region={mapRegion || initialRegion} />

        {/* User location marker */}
        {location && (
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
            <PulsingDot color={colors.accent} />
          </Marker>
        )}

        {/* Waypoint markers */}
        {waypoints.map((wp) => (
          <Marker
            key={wp.id}
            coordinate={{ latitude: wp.lat, longitude: wp.lon }}
            title={wp.label || 'Waypoint'}
            description={formatMGRS(toMGRS(wp.lat, wp.lon, 5))}
            onPress={() => setSelectedMarker(wp)}
            pinColor={colors.accent}
          />
        ))}
      </MapView>

      {/* Center reticle */}
      <View style={styles.reticle} pointerEvents="none">
        <View style={[styles.reticleH, { backgroundColor: colors.accent + '66' }]} />
        <View style={[styles.reticleV, { backgroundColor: colors.accent + '66' }]} />
      </View>

      {/* Center on user button */}
      {location && (
        <TouchableOpacity
          style={[styles.locateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={centerOnUser}
          accessibilityRole="button"
          accessibilityLabel="Center on current location"
        >
          <Text style={[styles.locateIcon, { color: colors.accent }]}>◎</Text>
        </TouchableOpacity>
      )}

      {/* Bottom bar — center MGRS */}
      <View style={[styles.bottomBar, { backgroundColor: colors.bg, borderTopColor: colors.border2 }]}>
        <Text style={[styles.bottomLabel, { color: colors.text3 }]}>{t('map.center')}</Text>
        <Text style={[styles.bottomMGRS, { color: colors.text }]} numberOfLines={1}>
          {centerMGRS || '\u2014'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  fallbackText: { fontSize: 12, letterSpacing: 2, textAlign: 'center' },

  // Pulsing location dot
  pulsingContainer: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pulsingRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  pulsingCenter: { width: 10, height: 10, borderRadius: 5 },

  // Center reticle
  reticle: { position: 'absolute', top: '50%', left: '50%', width: 20, height: 20, marginLeft: -10, marginTop: -10 },
  reticleH: { position: 'absolute', top: 9, left: 0, right: 0, height: 1 },
  reticleV: { position: 'absolute', left: 9, top: 0, bottom: 0, width: 1 },

  // Locate button
  locateBtn: {
    position: 'absolute', bottom: 70, right: 16,
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  locateIcon: { fontSize: 20, fontWeight: '700' },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bottomLabel: { fontSize: 9, letterSpacing: 3, fontWeight: '700' },
  bottomMGRS: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, fontWeight: '700', flex: 1 },
});
