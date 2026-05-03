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
  Modal, TextInput, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { toMGRS, formatMGRS, calculateBearing, calculateDistance, formatDistance } from '../utils/mgrs';
import { tapLight, tapMedium, notifySuccess, notifyError } from '../utils/haptics';
import { loadWaypointLists, saveWaypointLists } from '../utils/storage';
import { MGRSGridOverlay } from '../components/MGRSGridOverlay';
import { downloadTilesForRegion, checkTilesForRegion, clearTileCache, getLocalTilePathTemplate, getTilesForRegion } from '../utils/tileManager';

let MapView = null;
let Marker = null;
let UrlTile = null;
let LocalTile = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps.MapView;
  Marker = Maps.Marker;
  UrlTile = Maps.UrlTile;
  LocalTile = Maps.LocalTile;
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

// Time-since helper for mesh markers
function timeSince(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// Tile sources — Standard (OSM), Dark (CartoDB), Topo (OpenTopoMap)
const TOPO_TILE_URL = 'https://tile.opentopomap.org/{z}/{x}/{y}.png';
const MAP_STYLES = ['standard', 'dark', 'topo'];
const MAP_STYLE_KEY = 'rg_map_style';
const FIRST_VISIT_PROMPT_KEY = 'rg_map_first_visit_prompted_v1';

export function MapScreen({ location, isPro, onShowProGate, onSetWaypoint, meshPositions = [] }) {
  const colors = useColors();
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [centerMGRS, setCenterMGRS] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [cachedCount, setCachedCount] = useState(0);
  const [offlineMode, setOfflineMode] = useState(false);
  const downloadingRef = useRef(false);
  const cacheCheckTimer = useRef(null);
  const isDark = colors.bg === '#000000' || colors.bg === '#0A0A0A' || colors.bg === '#000';
  const localTilePath = getLocalTilePathTemplate();

  // Map style: standard, dark, topo
  const [mapStyle, setMapStyle] = useState(isDark ? 'dark' : 'standard');

  // Load persisted map style preference
  useEffect(() => {
    AsyncStorage.getItem(MAP_STYLE_KEY).then(v => { if (v && MAP_STYLES.includes(v)) setMapStyle(v); }).catch(() => {});
  }, []);

  // First-visit offline tile prompt: show once ever on first map visit.
  // Pro users get a download modal, free users get a Pro upgrade banner.
  const [firstVisitModalVisible, setFirstVisitModalVisible] = useState(false);
  const [firstVisitBannerVisible, setFirstVisitBannerVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(FIRST_VISIT_PROMPT_KEY);
        if (cancelled) return;
        if (seen === 'true') return;
        // Wait until we have a location fix — otherwise prompt is useless
        if (!location?.lat) return;
        // Delay so the map gets a chance to draw first
        setTimeout(() => {
          if (cancelled) return;
          if (isPro) {
            setFirstVisitModalVisible(true);
          } else {
            setFirstVisitBannerVisible(true);
          }
        }, 1500);
        await AsyncStorage.setItem(FIRST_VISIT_PROMPT_KEY, 'true').catch(() => {});
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [location?.lat, isPro]);

  // Waypoint creation menu state
  const [wpMenuVisible, setWpMenuVisible] = useState(false);
  const [pendingWaypoint, setPendingWaypoint] = useState(null); // { lat, lon, mgrs }
  const [wpLabel, setWpLabel] = useState('');
  const [wpLists, setWpLists] = useState([]);
  const [wpSelectedList, setWpSelectedList] = useState(null);

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

  // Check cached tile count when region changes (debounced 800ms)
  useEffect(() => {
    const region = mapRegion || initialRegion;
    if (!region) return;
    let cancelled = false;
    if (cacheCheckTimer.current) clearTimeout(cacheCheckTimer.current);
    cacheCheckTimer.current = setTimeout(() => {
      checkTilesForRegion(region, [10, 12, 14, 16]).then((result) => {
        if (!cancelled) setCachedCount(result.cached);
      }).catch(() => {});
    }, 800);
    return () => { cancelled = true; clearTimeout(cacheCheckTimer.current); };
  }, [mapRegion, initialRegion]);

  // Refresh cached tile count for current region
  const refreshCacheCount = useCallback(async (region) => {
    try {
      const result = await checkTilesForRegion(region, [10, 12, 14, 16]);
      setCachedCount(result.cached);
    } catch {}
  }, []);

  // Download tiles for current view
  const handleDownloadTiles = useCallback(() => {
    if (downloadingRef.current) return;
    if (!isPro) { onShowProGate(); return; }
    const region = mapRegion || initialRegion;
    if (!region) return;

    // Estimate tile count before confirming
    let totalTiles = 0;
    for (const z of [10, 12, 14, 16]) {
      totalTiles += getTilesForRegion(region, z).length;
    }

    const MAX_TILES = 5000;
    if (totalTiles > MAX_TILES) {
      Alert.alert(
        t('map.downloadTiles'),
        `Too many tiles (${totalTiles}). Zoom in to a smaller area.`
      );
      return;
    }

    Alert.alert(
      t('map.downloadTiles'),
      `Download ${totalTiles} tiles for this area? (zoom 10-16)`,
      [
        { text: t('waypoints.cancel'), style: 'cancel' },
        {
          text: t('map.downloadTiles'),
          onPress: async () => {
            downloadingRef.current = true;
            setDownloading(true);
            setDlProgress(0);
            try {
              const result = await downloadTilesForRegion(
                region,
                [10, 12, 14, 16],
                (done, total) => setDlProgress(total > 0 ? done / total : 0),
                { style: mapStyle }
              );
              notifySuccess();
              await refreshCacheCount(region);
              Alert.alert(
                t('map.downloadComplete'),
                `${result.downloaded} new, ${result.skipped} cached, ${result.failed} failed`
              );
            } catch {
              notifyError();
              Alert.alert(t('map.downloadFailed'));
            } finally {
              downloadingRef.current = false;
              setDownloading(false);
            }
          },
        },
      ]
    );
  }, [isPro, onShowProGate, mapRegion, initialRegion, t, refreshCacheCount, mapStyle]);

  // Clear tile cache
  const handleClearCache = useCallback(() => {
    Alert.alert(
      t('map.clearCache'),
      t('map.confirmClear'),
      [
        { text: t('waypoints.cancel'), style: 'cancel' },
        {
          text: t('map.clearCache'),
          style: 'destructive',
          onPress: async () => {
            await clearTileCache();
            setCachedCount(0);
            setOfflineMode(false);
            tapLight();
          },
        },
      ]
    );
  }, [t]);

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

  // Render the bottom MGRS bar immediately on mount — without this, it stays
  // blank (em-dash) until the user pans.
  useEffect(() => {
    try {
      const r = mapRegion || initialRegion;
      if (r) setCenterMGRS(formatMGRS(toMGRS(r.latitude, r.longitude, 5)));
    } catch {}
  }, [initialRegion, mapRegion]);

  // Long-press to open waypoint creation menu
  const onLongPress = useCallback(async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    tapMedium();
    const mgrs = formatMGRS(toMGRS(latitude, longitude, 5));
    setPendingWaypoint({ lat: latitude, lon: longitude, mgrs });
    setWpLabel(mgrs);
    // Load available lists for the picker
    try {
      const lists = await loadWaypointLists();
      setWpLists(Array.isArray(lists) ? lists : []);
      setWpSelectedList(lists && lists.length > 0 ? lists[0].id : null);
    } catch { setWpLists([]); setWpSelectedList(null); }
    setWpMenuVisible(true);
  }, []);

  // Save waypoint from the menu
  const saveWaypointFromMenu = useCallback(async () => {
    if (!pendingWaypoint) return;
    try {
      const lists = await loadWaypointLists();
      const wp = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        lat: pendingWaypoint.lat,
        lon: pendingWaypoint.lon,
        label: wpLabel || pendingWaypoint.mgrs,
      };
      if (!lists || lists.length === 0) {
        await saveWaypointLists([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: 'MAP', waypoints: [wp] }]);
      } else {
        const updated = [...lists];
        const targetIdx = wpSelectedList ? updated.findIndex(l => l.id === wpSelectedList) : 0;
        const idx = targetIdx >= 0 ? targetIdx : 0;
        if (!Array.isArray(updated[idx].waypoints)) updated[idx].waypoints = [];
        updated[idx].waypoints.push(wp);
        await saveWaypointLists(updated);
      }
      notifySuccess();
      // Reload map waypoints
      const refreshed = await loadWaypointLists();
      const allWps = [];
      if (Array.isArray(refreshed)) {
        for (const list of refreshed) {
          if (Array.isArray(list?.waypoints)) {
            for (const w of list.waypoints) {
              if (w?.lat != null && w?.lon != null) allWps.push({ ...w, listName: list.name || 'Unnamed' });
            }
          }
        }
      }
      setWaypoints(allWps);
    } catch {}
    setWpMenuVisible(false);
    setPendingWaypoint(null);
  }, [pendingWaypoint, wpLabel, wpSelectedList]);

  // Navigate to waypoint (set as active in GRID tab)
  const navigateToWaypoint = useCallback(() => {
    if (!pendingWaypoint || !onSetWaypoint) return;
    onSetWaypoint({ lat: pendingWaypoint.lat, lon: pendingWaypoint.lon, label: wpLabel || pendingWaypoint.mgrs });
    notifySuccess();
    setWpMenuVisible(false);
    setPendingWaypoint(null);
  }, [pendingWaypoint, wpLabel, onSetWaypoint]);

  // ── Delete a placed waypoint by id (works for both free + Pro users) ──
  // Finds the wp across all lists, removes it, persists, and refreshes the
  // map's local waypoint state. Without this, free users had no way to
  // remove waypoints they plotted on the map (the LISTS tab is Pro-gated).
  const deleteWaypointById = useCallback(async (wpId) => {
    if (!wpId) return;
    try {
      const lists = await loadWaypointLists();
      if (!Array.isArray(lists)) return;
      const updated = lists.map(l => ({
        ...l,
        waypoints: Array.isArray(l.waypoints) ? l.waypoints.filter(w => w.id !== wpId) : [],
      }));
      await saveWaypointLists(updated);
      // Refresh local waypoint state from the new lists
      const allWps = [];
      for (const list of updated) {
        if (Array.isArray(list?.waypoints)) {
          for (const w of list.waypoints) {
            if (w?.lat != null && w?.lon != null) allWps.push({ ...w, listName: list.name || 'Unnamed' });
          }
        }
      }
      setWaypoints(allWps);
      setSelectedMarker(null);
      notifySuccess();
    } catch {
      notifyError();
    }
  }, []);

  // Confirm before destructive delete
  const confirmDeleteSelectedMarker = useCallback(() => {
    if (!selectedMarker) return;
    Alert.alert(
      'Delete waypoint?',
      `Remove ${selectedMarker.label || 'this waypoint'} from the map.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteWaypointById(selectedMarker.id) },
      ],
    );
  }, [selectedMarker, deleteWaypointById]);

  // "Navigate" from the selected-marker card — sets it as the active waypoint
  // on the GRID tab and dismisses the card.
  const navigateToSelectedMarker = useCallback(() => {
    if (!selectedMarker || !onSetWaypoint) return;
    onSetWaypoint({
      lat: selectedMarker.lat,
      lon: selectedMarker.lon,
      label: selectedMarker.label || formatMGRS(toMGRS(selectedMarker.lat, selectedMarker.lon, 5)),
    });
    notifySuccess();
    setSelectedMarker(null);
  }, [selectedMarker, onSetWaypoint]);

  // Cycle map style
  const cycleMapStyle = useCallback(() => {
    tapLight();
    setMapStyle(prev => {
      const next = MAP_STYLES[(MAP_STYLES.indexOf(prev) + 1) % MAP_STYLES.length];
      AsyncStorage.setItem(MAP_STYLE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

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

  // Toggle offline mode
  const toggleOffline = useCallback(() => {
    if (!cachedCount || !localTilePath) return;
    tapLight();
    setOfflineMode(prev => !prev);
  }, [cachedCount, localTilePath]);

  // Tile source — online uses remote URL, offline uses LocalTile with cached files
  const remoteTileUrl = mapStyle === 'dark' ? DARK_TILE_URL : mapStyle === 'topo' ? TOPO_TILE_URL : OSM_TILE_URL;
  const mapStyleLabel = mapStyle === 'dark' ? 'DRK' : mapStyle === 'topo' ? 'TOPO' : 'STD';

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
        {/* Tile overlay — LocalTile for offline, UrlTile for online */}
        {offlineMode && localTilePath ? (
          <LocalTile
            pathTemplate={localTilePath}
            tileSize={256}
          />
        ) : (
          <UrlTile
            urlTemplate={remoteTileUrl}
            maximumZ={19}
            flipY={false}
            tileSize={256}
          />
        )}

        {/* MGRS grid overlay */}
        <MGRSGridOverlay region={mapRegion || initialRegion} />

        {/* User location marker */}
        {location && (
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
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

        {/* Mesh node markers */}
        {meshPositions.filter(p => p.lat && p.lon).map((node, idx) => {
          const nodeLabel = node.nodeId ? `#${node.nodeId.toString(16).toUpperCase()}` : `Node ${idx + 1}`;
          const mgrs = formatMGRS(toMGRS(node.lat, node.lon, 5));
          let desc = mgrs;
          if (location) {
            try {
              const brg = Math.round(calculateBearing(location.lat, location.lon, node.lat, node.lon));
              const dst = formatDistance(calculateDistance(location.lat, location.lon, node.lat, node.lon));
              desc = `${mgrs}\nBRG ${brg}° DST ${dst}`;
            } catch {}
          }
          if (node.timestamp) desc += `\n${timeSince(node.timestamp)}`;
          return (
            <Marker
              key={`mesh-${node.nodeId || idx}`}
              coordinate={{ latitude: node.lat, longitude: node.lon }}
              title={`MESH ${nodeLabel}`}
              description={desc}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.meshMarker}>
                <View style={[styles.meshMarkerDot, { backgroundColor: colors.text2, borderColor: colors.accent }]} />
                <Text style={[styles.meshMarkerLabel, { color: colors.text }]}>{nodeLabel}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Center reticle */}
      <View style={styles.reticle} pointerEvents="none">
        <View style={[styles.reticleH, { backgroundColor: colors.accent + '66' }]} />
        <View style={[styles.reticleV, { backgroundColor: colors.accent + '66' }]} />
      </View>

      {/* Selected-marker info card — appears when a waypoint marker is tapped.
          Available to ALL users (not Pro-gated) so free users can delete map
          waypoints they plotted. Anchored at the top so it never overlaps the
          bottom MGRS bar or the right-side map control buttons. */}
      {selectedMarker && (
        <View style={[styles.markerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.markerCardHeader}>
            <Text
              style={[styles.markerCardLabel, { color: colors.text }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {selectedMarker.label || 'WAYPOINT'}
            </Text>
            <TouchableOpacity
              style={styles.markerCardClose}
              onPress={() => { tapLight(); setSelectedMarker(null); }}
              accessibilityRole="button"
              accessibilityLabel="Close waypoint card"
            >
              <Text style={[styles.markerCardCloseText, { color: colors.text3 }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.markerCardMgrs, { color: colors.text2 }]} numberOfLines={1}>
            {formatMGRS(toMGRS(selectedMarker.lat, selectedMarker.lon, 5))}
          </Text>
          {location && (
            <Text style={[styles.markerCardBrg, { color: colors.text3 }]} numberOfLines={1}>
              BRG {Math.round(calculateBearing(location.lat, location.lon, selectedMarker.lat, selectedMarker.lon))}°
              {'  '}DST {formatDistance(calculateDistance(location.lat, location.lon, selectedMarker.lat, selectedMarker.lon))}
            </Text>
          )}
          <View style={styles.markerCardBtnRow}>
            <TouchableOpacity
              style={[styles.markerCardBtn, { borderColor: colors.text2 }]}
              onPress={navigateToSelectedMarker}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${selectedMarker.label || 'waypoint'}`}
            >
              <Text style={[styles.markerCardBtnText, { color: colors.text2 }]}>NAV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.markerCardBtn, { borderColor: colors.border }]}
              onPress={confirmDeleteSelectedMarker}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${selectedMarker.label || 'waypoint'}`}
            >
              <Text style={[styles.markerCardBtnText, { color: colors.border }]}>DELETE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Download progress overlay */}
      {downloading && (
        <View style={[styles.progressOverlay, { backgroundColor: colors.bg + 'CC' }]}>
          <Text style={[styles.progressText, { color: colors.accent }]}>
            {t('map.downloading')} {Math.round(dlProgress * 100)}%
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: colors.border2 }]}>
            <View style={[styles.progressBarFill, { backgroundColor: colors.accent, width: `${Math.round(dlProgress * 100)}%` }]} />
          </View>
        </View>
      )}

      {/* Right-side buttons */}
      <View style={styles.rightButtons}>
        {/* Offline mode toggle — only show when tiles are cached */}
        {cachedCount > 0 && (
          <TouchableOpacity
            style={[styles.mapBtn, {
              backgroundColor: offlineMode ? colors.accent : colors.card,
              borderColor: offlineMode ? colors.accent : colors.border,
            }]}
            onPress={toggleOffline}
            accessibilityRole="switch"
            accessibilityLabel="Toggle offline map mode"
            accessibilityState={{ checked: offlineMode }}
          >
            <Text style={[styles.mapBtnIcon, { color: offlineMode ? colors.bg : colors.accent }]}>
              {offlineMode ? '⚡' : '☁'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Download tiles button */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleDownloadTiles}
          onLongPress={handleClearCache}
          disabled={downloading}
          accessibilityRole="button"
          accessibilityLabel="Download map tiles for offline use"
          accessibilityHint="Long press to clear cached tiles"
        >
          <Text style={[styles.mapBtnIcon, { color: colors.accent, opacity: downloading ? 0.4 : 1 }]}>⬇</Text>
        </TouchableOpacity>

        {/* Map style toggle */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={cycleMapStyle}
          accessibilityRole="button"
          accessibilityLabel={`Map style: ${mapStyleLabel}. Tap to cycle.`}
        >
          <Text style={[styles.mapBtnLabel, { color: colors.accent }]}>{mapStyleLabel}</Text>
        </TouchableOpacity>

        {/* Center on user button */}
        {location && (
          <TouchableOpacity
            style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={centerOnUser}
            accessibilityRole="button"
            accessibilityLabel="Center on current location"
          >
            <Text style={[styles.mapBtnIcon, { color: colors.accent }]}>◎</Text>
          </TouchableOpacity>
        )}

        {/* Zoom in */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            tapLight();
            const r = mapRegion || initialRegion;
            if (mapRef.current && r) {
              mapRef.current.animateToRegion({
                ...r,
                latitudeDelta: r.latitudeDelta / 2,
                longitudeDelta: r.longitudeDelta / 2,
              }, 300);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Text style={[styles.mapBtnIcon, { color: colors.accent }]}>＋</Text>
        </TouchableOpacity>

        {/* Zoom out */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            tapLight();
            const r = mapRegion || initialRegion;
            if (mapRef.current && r) {
              mapRef.current.animateToRegion({
                ...r,
                latitudeDelta: Math.min(r.latitudeDelta * 2, 80),
                longitudeDelta: Math.min(r.longitudeDelta * 2, 80),
              }, 300);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Text style={[styles.mapBtnIcon, { color: colors.accent }]}>ー</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom bar — center MGRS + cache indicator */}
      <View style={[styles.bottomBar, { backgroundColor: colors.bg, borderTopColor: colors.border2 }]}>
        <Text style={[styles.bottomLabel, { color: colors.text3 }]}>{t('map.center')}</Text>
        <Text style={[styles.bottomMGRS, { color: colors.text }]} numberOfLines={1}>
          {centerMGRS || '\u2014'}
        </Text>
        {cachedCount > 0 && (
          <Text style={[styles.cacheIndicator, { color: offlineMode ? colors.accent : colors.text3 }]}>
            {offlineMode ? '⚡ OFFLINE' : `● ${cachedCount}`}
          </Text>
        )}
      </View>

      {/* Waypoint creation menu — themed, not native Alert */}
      <Modal visible={wpMenuVisible} transparent animationType="fade" onRequestClose={() => setWpMenuVisible(false)}>
        <View style={styles.wpMenuOverlay}>
          <View style={[styles.wpMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header with MGRS */}
            <Text style={[styles.wpMenuTitle, { color: colors.text }]}>
              {t('map.addWaypoint')}
            </Text>
            <Text style={[styles.wpMenuMGRS, { color: colors.accent }]}>
              {pendingWaypoint?.mgrs || ''}
            </Text>

            {/* Rename input */}
            <Text style={[styles.wpMenuLabel, { color: colors.text3 }]}>LABEL</Text>
            <TextInput
              style={[styles.wpMenuInput, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
              value={wpLabel}
              onChangeText={setWpLabel}
              maxLength={24}
              autoCapitalize="characters"
              placeholderTextColor={colors.text4}
              placeholder="Waypoint name"
            />

            {/* List picker */}
            <Text style={[styles.wpMenuLabel, { color: colors.text3 }]}>ADD TO LIST</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wpMenuListScroll}>
              {wpLists.map(list => (
                <TouchableOpacity
                  key={list.id}
                  style={[styles.wpMenuListBtn, {
                    borderColor: wpSelectedList === list.id ? colors.accent : colors.border,
                    backgroundColor: wpSelectedList === list.id ? colors.border2 : 'transparent',
                  }]}
                  onPress={() => setWpSelectedList(list.id)}
                >
                  <Text style={[styles.wpMenuListText, { color: wpSelectedList === list.id ? colors.accent : colors.text2 }]}>
                    {list.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {wpLists.length === 0 && (
                <Text style={[styles.wpMenuHint, { color: colors.text4 }]}>New "MAP" list will be created</Text>
              )}
            </ScrollView>

            {/* Action buttons */}
            <View style={styles.wpMenuActions}>
              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.accent, backgroundColor: colors.border2 }]}
                onPress={saveWaypointFromMenu}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.accent }]}>SAVE</Text>
              </TouchableOpacity>

              {onSetWaypoint && (
                <TouchableOpacity
                  style={[styles.wpMenuBtn, { borderColor: colors.text2 }]}
                  onPress={() => { saveWaypointFromMenu().then(() => navigateToWaypoint()); }}
                >
                  <Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>SAVE + NAV</Text>
                </TouchableOpacity>
              )}

              {onSetWaypoint && (
                <TouchableOpacity
                  style={[styles.wpMenuBtn, { borderColor: colors.text2 }]}
                  onPress={navigateToWaypoint}
                >
                  <Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>NAV ONLY</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.border }]}
                onPress={() => { setWpMenuVisible(false); setPendingWaypoint(null); }}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.border }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* First-visit free-tier upgrade banner */}
      {firstVisitBannerVisible && (
        <View style={[styles.firstVisitBanner, { backgroundColor: colors.card, borderColor: colors.text2 }]}>
          <View style={{ flex:1 }}>
            <Text style={[styles.firstVisitTitle, { color: colors.text }]}>OFFLINE MAPS READY</Text>
            <Text style={[styles.firstVisitBody, { color: colors.text3 }]}>Download tiles for your area with Red Grid Pro. Never get caught with a blank map in the field.</Text>
          </View>
          <View style={{ gap:6 }}>
            <TouchableOpacity
              style={[styles.firstVisitPrimary, { borderColor: colors.text, backgroundColor: colors.border2 }]}
              onPress={() => { setFirstVisitBannerVisible(false); onShowProGate && onShowProGate('Offline Maps'); }}
            >
              <Text style={[styles.firstVisitPrimaryText, { color: colors.text }]}>UPGRADE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.firstVisitSecondary, { borderColor: colors.border }]}
              onPress={() => setFirstVisitBannerVisible(false)}
            >
              <Text style={[styles.firstVisitSecondaryText, { color: colors.border }]}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* First-visit Pro-tier download modal */}
      <Modal visible={firstVisitModalVisible} transparent animationType="fade" onRequestClose={() => setFirstVisitModalVisible(false)}>
        <View style={styles.wpMenuOverlay}>
          <View style={[styles.wpMenuBox, { backgroundColor: colors.card, borderColor: colors.text2 }]}>
            <Text style={[styles.wpMenuTitle, { color: colors.text }]}>READY FOR THE FIELD?</Text>
            <Text style={[styles.firstVisitBody, { color: colors.text3, marginBottom:16 }]}>
              Download offline map tiles for your current area now. You'll have maps even when you lose cell service.
            </Text>
            <View style={styles.wpMenuActions}>
              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.text, backgroundColor: colors.border2 }]}
                onPress={() => { setFirstVisitModalVisible(false); setTimeout(() => handleDownloadTiles(), 250); }}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.text }]}>DOWNLOAD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.border }]}
                onPress={() => setFirstVisitModalVisible(false)}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.border }]}>LATER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  // Selected-marker info card (top-anchored so it never collides with bottom MGRS bar)
  markerCard: {
    position: 'absolute', top: 50, left: 16, right: 16,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 6 },
    }),
  },
  markerCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  markerCardLabel: { flex: 1, fontFamily: 'monospace', fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  markerCardClose: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 32, minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  markerCardCloseText: { fontSize: 14, fontWeight: '700' },
  markerCardMgrs: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 2 },
  markerCardBrg: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  markerCardBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  markerCardBtn: { flex: 1, borderWidth: 1, paddingVertical: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  markerCardBtnText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, fontWeight: '700' },

  // Right-side button stack
  rightButtons: {
    position: 'absolute', bottom: 70, right: 16, gap: 10, alignItems: 'center',
  },
  mapBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  mapBtnIcon: { fontSize: 20, fontWeight: '700' },

  // Download progress overlay
  progressOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingVertical: 16, paddingTop: 50,
    alignItems: 'center',
  },
  progressText: { fontSize: 11, letterSpacing: 3, fontWeight: '700', marginBottom: 8 },
  progressBarBg: { width: '100%', height: 4, borderRadius: 2 },
  progressBarFill: { height: 4, borderRadius: 2 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bottomLabel: { fontSize: 9, letterSpacing: 3, fontWeight: '700' },
  bottomMGRS: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, fontWeight: '700', flex: 1 },
  cacheIndicator: { fontSize: 9, letterSpacing: 2, fontWeight: '600' },

  // Map style button label
  mapBtnLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  // Waypoint creation menu
  wpMenuOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 24 },
  wpMenuCard: { width: '100%', maxWidth: 340, borderWidth: 1, padding: 16, gap: 8 },
  wpMenuTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 4, fontWeight: '700' },
  wpMenuMGRS: { fontFamily: 'monospace', fontSize: 16, letterSpacing: 3, fontWeight: '700', marginBottom: 4 },
  wpMenuLabel: { fontSize: 9, letterSpacing: 3, fontWeight: '700', marginTop: 4 },
  wpMenuInput: { borderWidth: 1, fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, paddingHorizontal: 10, paddingVertical: 8 },
  wpMenuListScroll: { maxHeight: 40, marginVertical: 4 },
  wpMenuListBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  wpMenuListText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  wpMenuHint: { fontSize: 10, letterSpacing: 1, alignSelf: 'center' },
  wpMenuActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  wpMenuBtn: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  wpMenuBtnText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  firstVisitBanner: { position: 'absolute', left: 12, right: 12, bottom: 24, flexDirection: 'row', gap: 12, borderWidth: 1, padding: 12 },
  firstVisitTitle: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, fontWeight: '800', marginBottom: 4 },
  firstVisitBody: { fontFamily: 'monospace', fontSize: 10, lineHeight: 14 },
  firstVisitPrimary: { borderWidth: 2, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  firstVisitPrimaryText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  firstVisitSecondary: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, minHeight: 36, minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  firstVisitSecondaryText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, fontWeight: '600' },

  // Mesh node markers
  meshMarker: { alignItems: 'center', justifyContent: 'center' },
  meshMarkerDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  meshMarkerLabel: { fontFamily: 'monospace', fontSize: 8, fontWeight: '700', letterSpacing: 1, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
