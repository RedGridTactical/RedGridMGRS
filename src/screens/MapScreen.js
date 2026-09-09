/**
 * MapScreen — Full-screen tactical map with MGRS grid overlay.
 * Uses react-native-maps with OpenStreetMap tiles.
 *
 * Features:
 * - Standard live tiles and imported local offline tiles
 * - User location as pulsing dot
 * - Saved waypoints as markers
 * - Long-press to add waypoint
 * - Bottom bar showing MGRS of map center
 * - MGRS grid overlay (100km + 1km lines)
 *
 * Privacy: no tracking, no analytics. Location is ephemeral.
 */
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform, ScrollView } from 'react-native';
import { Modal } from '../components/FieldModal';
import { TextInput } from '../components/FieldInput';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { toMGRS, formatMGRS, calculateBearing, calculateDistance, formatDistance } from '../utils/mgrs';
import { formatBearing } from '../utils/tactical';
import { tapLight, tapMedium, notifySuccess, notifyError } from '../utils/haptics';
import { MGRSGridOverlay } from '../components/MGRSGridOverlay';
import { RouteOverlay } from '../components/RouteOverlay';
import { TeamMarkers } from '../components/TeamMarkers';
import { calculateRoute, optimizeRoute, moveRoutePoint } from '../utils/routePlanner';
import {
  checkTilesForRegion, clearTileCache, getLocalTilePathTemplate, recoverOfflineTileCache, getOfflineMapMetadata,
  OSM_TILE_URL, DARK_TILE_URL, TOPO_TILE_URL,
} from '../utils/tileManager';
import { importRasterMBTiles } from '../utils/offlineMaps';
import * as DocumentPicker from 'expo-document-picker';
import { PreflightScreen } from './PreflightScreen';
import { TYPE } from '../utils/typography';

// Free-tier persistent-waypoint cap. Free users get 1 saved waypoint; Pro is
// limited to 10 saved lists with 20 points each.
const FREE_WAYPOINT_LIMIT = 1;
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

// Tile sources — Standard (OSM), Dark (CartoDB), Topo (OpenTopoMap).
// URLs come from tileManager so the offline cache and the live map agree.
const MAP_STYLES = ['standard', 'dark', 'topo'];
const MAP_STYLE_KEY = 'rg_map_style';

export function MapScreen({
  location, tacticalMode = false, onExitTactical, activeRoute,
  savedLists = [], listsLoading = false, listsLoadError = false, listsSaveError = false, listsSaving = false,
  onRetryListsLoad, onRetryListsSave, onSaveList, onUpdateList, onDeleteList, onOpenSavedRoute,
  routeDraft, onRouteDraftChange,
  isPro,
  trialEligible,
  onShowProGate,
  onSetWaypoint,
  meshPositions = [],
  // v3.4 Mission Preflight pipes — optional so older callers keep working.
  gpsSource,
  gpsDeviceName,
  mesh,
  team,
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [centerMGRS, setCenterMGRS] = useState(null);
  const waypoints = useMemo(() => savedLists.flatMap(list => list.waypoints.map(point => ({ ...point, mapKey: `${list.id}:${point.id}`, listId: list.id, listName: list.name }))), [savedLists]);
  const mapWriteBusy = useRef(false);
  const [mapSaveError, setMapSaveError] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [cachedCount, setCachedCount] = useState(0);
  const [offlineMetadata, setOfflineMetadata] = useState(null);
  const [tileRevision, setTileRevision] = useState(0);
  const importCancelled = useRef(false);
  useEffect(() => {
    importCancelled.current = false;
    recoverOfflineTileCache().then(getOfflineMapMetadata).then(metadata => {
      if (importCancelled.current || !metadata) return;
      setOfflineMetadata(metadata);
      setCachedCount(metadata.tileCount || 0);
      setOfflineMode(true);
    }).catch(() => {});
    return () => { importCancelled.current = true; };
  }, []);
  const [offlineMode, setOfflineMode] = useState(false);
  const downloadingRef = useRef(false);
  const cacheCheckTimer = useRef(null);
  const isDark = colors.bg === '#000000' || colors.bg === '#0A0A0A' || colors.bg === '#000';
  const localTilePath = getLocalTilePathTemplate();

  // Map style: standard, dark, topo
  const [mapStyle, setMapStyle] = useState(isDark ? 'dark' : 'standard');

  // Throttled clock for the team layer. Peer decay is time-based, so the
  // markers need a moving `now` — but reading Date.now() inline made every
  // MapScreen render redraw every marker. 5 s is far finer than the LIVE ->
  // STALE -> GHOST thresholds and costs one re-render per tick. Only ticks
  // while there is actually a team layer to decay.
  const [teamClock, setTeamClock] = useState(() => Date.now());
  const hasTeamLayer = !!(isPro && team && team.roster && team.roster.length > 0);
  useEffect(() => {
    if (!hasTeamLayer) return;
    setTeamClock(Date.now());
    const id = setInterval(() => setTeamClock(Date.now()), 5000);
    return () => clearInterval(id);
  }, [hasTeamLayer]);

  // Load persisted map style preference
  useEffect(() => {
    AsyncStorage.getItem(MAP_STYLE_KEY).then(v => { if (v && MAP_STYLES.includes(v)) setMapStyle(v); }).catch(() => {});
  }, []);

  // Waypoint creation menu state
  const [wpMenuVisible, setWpMenuVisible] = useState(false);
  const [pendingWaypoint, setPendingWaypoint] = useState(null); // { lat, lon, mgrs }
  const [wpLabel, setWpLabel] = useState('');
  const wpLists = savedLists;
  const [wpSelectedList, setWpSelectedList] = useState(null);

  // Route-planning mode (Pro). When enabled, tapping waypoint markers adds/
  // removes them from the route in tap order and a polyline + summary appear.
  const [localRouteDraft, setLocalRouteDraft] = useState({ active: false, waypoints: [], name: '' });
  const draft = routeDraft || localRouteDraft;
  const updateRouteDraft = onRouteDraftChange || setLocalRouteDraft;
  const routeMode = !!draft.active;
  const routeWaypoints = draft.waypoints || [];
  const setRouteWaypoints = change => updateRouteDraft(previous => ({ ...previous,
    waypoints: typeof change === 'function' ? change(previous.waypoints || []) : change }));
  const [routeSaveVisible, setRouteSaveVisible] = useState(false);
  const [routePickerVisible, setRoutePickerVisible] = useState(false);
  const [routeSaveError, setRouteSaveError] = useState('');

  // v3.4 Mission Preflight modal visibility. Triggered by the PFL button in
  // the right-side stack; closes back to the map untouched.
  const [preflightVisible, setPreflightVisible] = useState(false);

  // Initial region — center on user location or default to CONUS center
  const initialRegion = useMemo(() => ({
    latitude: location?.lat ?? 38.8895,
    longitude: location?.lon ?? -77.0353,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }), [location?.lat, location?.lon]);

  const coverageZooms = useMemo(() => offlineMetadata?.zoomLevels || [], [offlineMetadata]);

  // Check cached tile count when region changes (debounced 800ms)
  useEffect(() => {
    const region = mapRegion || initialRegion;
    if (!region) return;
    let cancelled = false;
    if (cacheCheckTimer.current) clearTimeout(cacheCheckTimer.current);
    cacheCheckTimer.current = setTimeout(() => {
      checkTilesForRegion(region, coverageZooms).then((result) => {
        if (!cancelled) setCachedCount(result.cached);
      }).catch(() => {});
    }, 800);
    return () => { cancelled = true; clearTimeout(cacheCheckTimer.current); };
  }, [mapRegion, initialRegion, coverageZooms]);

  // Import a user-selected, locally licensed map; no public-provider prefetch.
  const handleImportMap = useCallback(() => {
    if (downloadingRef.current) return;
    if (!isPro) { onShowProGate('Offline Maps'); return; }
    Alert.alert(t('nightDisplay.importMap'), t('nightDisplay.importDescription', { defaultValue: 'Choose a local raster MBTiles map you have permission to use. This version accepts 256-pixel PNG tiles, up to 5,000 tiles and 256 MB. A valid import replaces the current saved map.' }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('nightDisplay.importMap'), onPress: async () => {
        if (!(await allowSystemDisplay())) return;
        try {
          const selected = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
          if (selected.canceled || !selected.assets?.[0]?.uri || importCancelled.current) return;
          downloadingRef.current = true;
          setDownloading(true); setDlProgress(0);
          const result = await importRasterMBTiles(selected.assets[0].uri, {
            shouldCancel: () => importCancelled.current,
            onProgress: (done, total) => { if (!importCancelled.current) setDlProgress(total ? done / total : 0); },
          });
          if (importCancelled.current) return;
          setOfflineMetadata(result.metadata);
          setCachedCount(result.total); setOfflineMode(true); setTileRevision(value => value + 1);
          const [west, south, east, north] = result.metadata.bounds;
          const region = { latitude: (south + north) / 2, longitude: (west + east) / 2,
            latitudeDelta: Math.max(0.002, (north - south) * 1.1), longitudeDelta: Math.max(0.002, (east - west) * 1.1) };
          setMapRegion(region); mapRef.current?.animateToRegion(region, 300);
          notifySuccess();
          Alert.alert(t('nightDisplay.importMap'), `${result.metadata.name} · ${result.total} tiles`);
        } catch (error) {
          if (!importCancelled.current && error.code !== 'IMPORT_CANCELLED') Alert.alert(t('nightDisplay.importMap'), error.message || t('nightDisplay.providerBody'));
        } finally {
          downloadingRef.current = false;
          if (!importCancelled.current) setDownloading(false);
        }
      } },
    ]);
  }, [isPro, onShowProGate, t]);

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
            const cleared = await clearTileCache();
            if (!cleared) { Alert.alert(t('nightDisplay.importMap'), t('nightDisplay.mapBusy')); return; }
            setCachedCount(0);
            setOfflineMetadata(null);
            setTileRevision(value => value + 1);
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
    setPendingWaypoint({ id: makeId(), newListId: makeId(), lat: latitude, lon: longitude, mgrs });
    setWpLabel(mgrs);
    setWpSelectedList(savedLists[0]?.id || null);
    setMapSaveError(false); setWpMenuVisible(true);
  }, [savedLists]);

  const saveWaypointFromMenu = async () => {
    if (!pendingWaypoint || mapWriteBusy.current || listsLoading || listsLoadError) return false;
    if (!isPro && waypoints.length >= FREE_WAYPOINT_LIMIT) {
      onShowProGate?.('Saved Waypoints', 'routes'); return false;
    }
    const point = { ...pendingWaypoint, label: wpLabel.trim() || pendingWaypoint.mgrs, source: 'map', recordedAt: Date.now() };
    mapWriteBusy.current = true; setMapSaveError(false);
    try {
      if (!savedLists.length) await onSaveList({ id: pendingWaypoint.newListId, name: 'MAP', waypoints: [point], createdAt: Date.now() });
      else {
        const listId = wpSelectedList || savedLists[0].id;
        await onUpdateList(listId, list => ({ ...list, waypoints: list.waypoints.some(item => item.id === point.id)
          ? list.waypoints.map(item => item.id === point.id ? point : item) : [...list.waypoints, point] }));
      }
      notifySuccess(); setWpMenuVisible(false); setPendingWaypoint(null); return true;
    } catch { setMapSaveError(true); return false; }
    finally { mapWriteBusy.current = false; }
  };

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
  const deleteWaypointById = async wpId => {
    if (!wpId || !selectedMarker?.listId || mapWriteBusy.current) return;
    mapWriteBusy.current = true;
    try {
      await onUpdateList(selectedMarker.listId, list => ({ ...list, waypoints: list.waypoints.filter(point => point.id !== wpId) }));
      setSelectedMarker(null); notifySuccess();
    } catch { Alert.alert(t('workflow.saveFailed'), t('workflow.retry')); }
    finally { mapWriteBusy.current = false; }
  };

  // Confirm before destructive delete
  const confirmDeleteSelectedMarker = useCallback(() => {
    if (!selectedMarker) return;
    Alert.alert(
      t('alerts.deleteWaypointTitle'),
      t('alerts.deleteWaypointBody', { label: selectedMarker.label || t('alerts.thisWaypoint') }),
      [
        { text: t('waypoints.cancel'), style: 'cancel' },
        { text: t('waypoints.delete'), style: 'destructive', onPress: () => deleteWaypointById(selectedMarker.id) },
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

  // Route order is retained by App across tab changes until saved or discarded.
  const beginRouteMode = () => {
    if (!isPro) { onShowProGate?.('Route Planning', 'routes'); return; }
    setSelectedMarker(null);
    updateRouteDraft(previous => ({ ...previous, active: true, id: previous?.id || makeId(), waypoints: previous?.waypoints || [], name: previous?.name || '' }));
  };
  const finishRouteMode = () => {
    if (!routeWaypoints.length) { updateRouteDraft({ active: false, waypoints: [], name: '' }); return; }
    setRouteSaveVisible(true);
  };
  const toggleRouteMode = () => routeMode ? finishRouteMode() : beginRouteMode();
  const handleWaypointPress = wp => {
    if (!routeMode) { setSelectedMarker(wp); return; }
    if (!routeWaypoints.some(point => point.originMapKey === wp.mapKey) && routeWaypoints.length >= 20) {
      Alert.alert(t('waypoints.limitReached'), t('waypoints.maxWaypoints')); return;
    }
    tapLight();
    setRouteWaypoints(previous => previous.some(point => point.originMapKey === wp.mapKey)
      ? previous.filter(point => point.originMapKey !== wp.mapKey)
      : [...previous, { ...wp, id: makeId(), originMapKey: wp.mapKey, label: wp.label || wp.listName || 'WP' }]);
  };
  const optimizeRouteOrder = () => {
    if (routeWaypoints.length < 2) return;
    const start = location || routeWaypoints[0];
    setRouteWaypoints(optimizeRoute(routeWaypoints, start));
  };
  const clearRoute = () => Alert.alert(t('workflow.discardRoute'), t('workflow.discardRouteBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('workflow.discard'), style: 'destructive', onPress: () => setRouteWaypoints([]) },
  ]);
  const discardRoute = () => Alert.alert(t('workflow.discardRoute'), t('workflow.discardRouteBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('workflow.discard'), style: 'destructive', onPress: () => {
      updateRouteDraft({ active: false, waypoints: [], name: '' }); setRouteSaveVisible(false);
    } },
  ]);
  const savePlannedRoute = async () => {
    if (mapWriteBusy.current || listsLoading || listsLoadError) return;
    if (!draft.name?.trim()) { setRouteSaveError(t('workflow.nameRequired')); return; }
    if (!routeWaypoints.length) return;
    mapWriteBusy.current = true; setRouteSaveError('');
    const id = draft.id || makeId();
    updateRouteDraft(previous => ({ ...previous, id }));
    try {
      await onSaveList({ id, name: draft.name.trim().toUpperCase(), waypoints: routeWaypoints.map(point => ({ ...point })), createdAt: Date.now() });
      updateRouteDraft({ active: false, waypoints: [], name: '' }); setRouteSaveVisible(false);
      notifySuccess(); onOpenSavedRoute?.(id);
    } catch { setRouteSaveError(t('workflow.saveFailed')); }
    finally { mapWriteBusy.current = false; }
  };
  const routeSummary = useMemo(() => routeWaypoints.length < 2 ? null : {
    count: routeWaypoints.length, distance: formatDistance(calculateRoute(routeWaypoints).totalDistance),
  }, [routeWaypoints]);

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

  if (tacticalMode) {
    return <View style={[styles.fallback, { backgroundColor: '#000000', padding: 24 }]}>
      <Text style={{ ...TYPE.heading, fontSize: 22, color: colors.text, marginBottom: 20 }}>{t('nightDisplay.mapTitle')}</Text>
      <Text style={{ ...TYPE.body, fontSize: 17, lineHeight: 25, color: colors.text2 }}>{t('nightDisplay.mapBody')}</Text>
      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, padding: 18, marginTop: 24 }} onPress={onExitTactical} accessibilityRole="button"><Text style={{ ...TYPE.heading, color: colors.text }}>{t('nightDisplay.exit')}</Text></TouchableOpacity>
    </View>;
  }

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
        mapType={Platform.OS === 'ios' ? 'standard' : 'none'}
        showsPointsOfInterest={false}
        showsBuildings={false}
        minZoomLevel={offlineMode && offlineMetadata ? offlineMetadata.minZoom : undefined}
        maxZoomLevel={offlineMode && offlineMetadata ? offlineMetadata.maxZoom : undefined}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Tile overlay — LocalTile for offline, UrlTile for online */}
        {offlineMode && localTilePath ? (
          <LocalTile
            key={`offline-${tileRevision}`}
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

        {!routeMode && activeRoute?.waypoints?.length > 1 && <RouteOverlay waypoints={activeRoute.waypoints} colors={colors} />}

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

        {/* Waypoint markers — in route mode, tapping toggles inclusion in
            the planned route; otherwise it opens the selected-marker card. */}
        {waypoints.map((wp) => {
          const routeIdx = routeMode ? routeWaypoints.findIndex(rw => rw.originMapKey === wp.mapKey) : -1;
          const inRoute = routeIdx >= 0;
          const description = inRoute
            ? `RT ${routeIdx + 1} • ${formatMGRS(toMGRS(wp.lat, wp.lon, 5))}`
            : formatMGRS(toMGRS(wp.lat, wp.lon, 5));
          return (
            <Marker
              key={wp.mapKey}
              coordinate={{ latitude: wp.lat, longitude: wp.lon }}
              title={wp.label || 'Waypoint'}
              description={description}
              onPress={() => handleWaypointPress(wp)}
              pinColor={colors.accent}
              tracksViewChanges={false}
            />
          );
        })}

        {/* Route polyline + segment labels */}
        {routeMode && routeWaypoints.length >= 2 && (
          <RouteOverlay waypoints={routeWaypoints} colors={colors} />
        )}

        {/* Mesh node markers */}
        {meshPositions.filter(p => p.lat && p.lon).map((node, idx) => {
          const nodeLabel = node.nodeId ? `#${node.nodeId.toString(16).toUpperCase()}` : `Node ${idx + 1}`;
          const mgrs = formatMGRS(toMGRS(node.lat, node.lon, 5));
          let desc = mgrs;
          if (location) {
            try {
              const brg = formatBearing(calculateBearing(location.lat, location.lon, node.lat, node.lon), 'true');
              const dst = formatDistance(calculateDistance(location.lat, location.lon, node.lat, node.lon));
              desc = `${mgrs}\nBRG ${brg} DST ${dst}`;
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

        {/* Team layer — named peers with ghost decay and SOS. Renders
            nothing when no roster is present, so free/solo users and
            radio-less sessions are unaffected. */}
        {hasTeamLayer && (
          <TeamMarkers
            roster={team.roster}
            origin={location}
            colors={colors}
            now={teamClock}
          />
        )}
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
              BRG {formatBearing(calculateBearing(location.lat, location.lon, selectedMarker.lat, selectedMarker.lon), 'true')}
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
              <Text style={[styles.markerCardBtnText, { color: colors.text3 }]}>{t('map.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {offlineMode && offlineMetadata && <View pointerEvents="none" style={{ position: 'absolute', top: 58, left: 12, right: 70, backgroundColor: colors.card, padding: 7 }}>
        <Text style={{ ...TYPE.label, color: colors.text, fontSize: 12 }} numberOfLines={2}>{offlineMetadata.name} · Z{offlineMetadata.minZoom}–{offlineMetadata.maxZoom}</Text>
        {!!offlineMetadata.attribution && <Text style={{ ...TYPE.body, color: colors.text2, fontSize: 10 }}>{offlineMetadata.attribution.replace(/<[^>]*>/g, '')}</Text>}
      </View>}

      {/* Download progress overlay */}
      {downloading && (
        <View style={[styles.progressOverlay, { backgroundColor: colors.bg + 'CC' }]}>
          <Text style={[styles.progressText, { color: colors.accentText }]}>
            {t('nightDisplay.importMap')} {Math.round(dlProgress * 100)}%
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: colors.border2 }]}>
            <View style={[styles.progressBarFill, { backgroundColor: colors.accent, width: `${Math.round(dlProgress * 100)}%` }]} />
          </View>
        </View>
      )}

      {/* Right-side buttons — lifted when the route panel is showing so the
          zoom controls stay reachable. */}
      <View style={[styles.rightButtons, routeMode && { bottom: 220 }]}>
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
            <Text style={[styles.mapBtnIcon, { color: offlineMode ? colors.actionText : colors.accentText }]}>
              {offlineMode ? '⚡' : '☁'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Download tiles button */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleImportMap}
          onLongPress={handleClearCache}
          disabled={downloading}
          accessibilityRole="button"
          accessibilityLabel={t('nightDisplay.importMap')}
          accessibilityHint="Long press to clear cached tiles"
        >
          <Text style={[styles.mapBtnIcon, { color: colors.accentText, opacity: downloading ? 0.4 : 1 }]}>⬇</Text>
        </TouchableOpacity>

        {/* Map style toggle */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={cycleMapStyle}
          accessibilityRole="button"
          accessibilityLabel={`Map style: ${mapStyleLabel}. Tap to cycle.`}
        >
          <Text style={[styles.mapBtnLabel, { color: colors.accentText }]}>{mapStyleLabel}</Text>
        </TouchableOpacity>

        {/* Route-planning toggle (Pro). Lit accent when active. */}
        <TouchableOpacity
          style={[styles.mapBtn, {
            backgroundColor: routeMode ? colors.accent : colors.card,
            borderColor: routeMode ? colors.accent : colors.border,
          }]}
          onPress={toggleRouteMode}
          accessibilityRole="button"
          accessibilityLabel={routeMode ? 'Exit route planning mode' : 'Start route planning mode (Pro)'}
          accessibilityState={{ selected: routeMode }}
        >
          <Text style={[styles.mapBtnLabel, { color: routeMode ? colors.actionText : colors.accentText }]}>RT</Text>
        </TouchableOpacity>

        {/* Mission Preflight (v3.4). Opens the readiness panel as a modal.
            Visible to all tiers — the free-tier AO cap is enforced inside. */}
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { tapLight(); setPreflightVisible(true); }}
          accessibilityRole="button"
          accessibilityLabel="Open Mission Preflight"
        >
          <Text style={[styles.mapBtnLabel, { color: colors.accentText }]}>PFL</Text>
        </TouchableOpacity>

        {/* Center on user button */}
        {location && (
          <TouchableOpacity
            style={[styles.mapBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={centerOnUser}
            accessibilityRole="button"
            accessibilityLabel="Center on current location"
          >
            <Text style={[styles.mapBtnIcon, { color: colors.accentText }]}>◎</Text>
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
          <Text style={[styles.mapBtnIcon, { color: colors.accentText }]}>＋</Text>
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
          <Text style={[styles.mapBtnIcon, { color: colors.accentText }]}>ー</Text>
        </TouchableOpacity>
      </View>

      {(listsLoadError || listsSaveError) && <View style={[styles.storageBanner, { backgroundColor: colors.card, borderColor: colors.text2 }]}>
        <Text accessibilityRole="alert" style={[styles.wpMenuHint, { color: colors.text }]}>{listsLoadError ? t('workflow.loadFailed') : t('workflow.saveFailed')}</Text>
        <TouchableOpacity onPress={listsLoadError ? onRetryListsLoad : onRetryListsSave} accessibilityRole="button" style={styles.wpMenuBtn}><Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('workflow.retry')}</Text></TouchableOpacity>
      </View>}
      {/* Route-planning summary panel — sits above the bottom MGRS bar while
          route mode is active. Shows count, total distance, and est. time, plus
          OPTIMIZE / CLEAR / EXIT controls. */}
      {routeMode && (
        <View style={[styles.routePanel, { backgroundColor: colors.card, borderColor: colors.accent, borderTopColor: colors.accent }]}>
          <View style={styles.routePanelHeader}>
            <Text style={[styles.routePanelTitle, { color: colors.accentText }]}>{t('map.route')}</Text>
            <Text style={[styles.routePanelHint, { color: colors.text3 }]} numberOfLines={1}>
              {routeWaypoints.length === 0
                ? t('map.routeHintEmpty')
                : routeWaypoints.length === 1
                  ? t('map.routeHintOne')
                  : `${routeSummary.count} • ${routeSummary.distance} • °T`}
            </Text>
          </View>
          <TouchableOpacity style={[styles.wpMenuBtn, { borderColor: colors.text2 }]} onPress={() => setRoutePickerVisible(true)} accessibilityRole="button">
            <Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('workflow.chooseSaved')}</Text>
          </TouchableOpacity>
          <View style={styles.routePanelBtnRow}>
            <TouchableOpacity
              style={[styles.routePanelBtn, {
                borderColor: routeWaypoints.length >= 2 ? colors.text2 : colors.border,
                opacity: routeWaypoints.length >= 2 ? 1 : 0.4,
              }]}
              onPress={optimizeRouteOrder}
              disabled={routeWaypoints.length < 2}
              accessibilityRole="button"
              accessibilityLabel="Optimize route order from current location"
            >
              <Text style={[styles.routePanelBtnText, { color: routeWaypoints.length >= 2 ? colors.text2 : colors.text3 }]}>{t('workflow.nearestOrder')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.routePanelBtn, {
                borderColor: routeWaypoints.length > 0 ? colors.border : colors.border,
                opacity: routeWaypoints.length > 0 ? 1 : 0.4,
              }]}
              onPress={clearRoute}
              disabled={routeWaypoints.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear all waypoints from route"
            >
              <Text style={[styles.routePanelBtnText, { color: colors.text3 }]}>{t('map.clear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.routePanelBtn, { borderColor: colors.text2 }]}
              onPress={finishRouteMode}
              accessibilityRole="button"
              accessibilityLabel={t(routeWaypoints.length >= 2 ? 'workflow.saveRoute' : 'map.done')}
            >
              <Text style={[styles.routePanelBtnText, { color: colors.text2 }]}>{t('map.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={routePickerVisible} transparent animationType="slide" onRequestClose={() => setRoutePickerVisible(false)}>
        <View style={[styles.routeEditor, { backgroundColor: colors.bg }]}><ScrollView contentContainerStyle={styles.routeEditorContent}>
          <Text style={[styles.wpMenuTitle, { color: colors.text }]}>{t('workflow.chooseSaved')}</Text>
          <Text style={[styles.wpMenuHint, { color: colors.text3 }]}>{t('map.routeHintEmpty')}</Text>
          {!waypoints.length && <Text style={[styles.wpMenuHint, { color: colors.text3 }]}>{t('workflow.noSavedPoints')}</Text>}
          {waypoints.map(point => {
            const index = routeWaypoints.findIndex(item => item.originMapKey === point.mapKey);
            return <TouchableOpacity key={point.mapKey} accessibilityRole="checkbox" accessibilityLabel={`${point.label} · ${point.listName} · ${point.mgrs}`} accessibilityState={{ checked: index >= 0 }} onPress={() => handleWaypointPress(point)} style={[styles.routeEditorPoint, { borderColor: index >= 0 ? colors.text2 : colors.border, minHeight: 48 }]}>
              <Text style={[styles.wpMenuTitle, { color: colors.text }]}>{index >= 0 ? `✓ ${index + 1}. ` : '○ '}{point.label}</Text>
              <Text style={[styles.wpMenuHint, { color: colors.text3, alignSelf: 'stretch' }]}>{point.listName} · {point.mgrs}</Text>
            </TouchableOpacity>;
          })}
          <TouchableOpacity style={[styles.wpMenuBtn, { borderColor: colors.text2 }]} accessibilityRole="button" onPress={() => setRoutePickerVisible(false)}><Text style={[styles.wpMenuBtnText, { color: colors.text }]}>{t('map.done')}</Text></TouchableOpacity>
        </ScrollView></View>
      </Modal>

      <Modal visible={routeSaveVisible} transparent animationType="slide" onRequestClose={() => setRouteSaveVisible(false)}>
        <View style={[styles.routeEditor, { backgroundColor: colors.bg }]}>
          <ScrollView contentContainerStyle={styles.routeEditorContent}>
            <Text style={[styles.wpMenuTitle, { color: colors.text }]}>{t('workflow.saveRoute')}</Text>
            <Text style={[styles.wpMenuHint, { color: colors.text3, alignSelf: 'stretch' }]}>{t('workflow.saveRouteHint')}</Text>
            <TextInput value={draft.name || ''} onChangeText={name => updateRouteDraft(previous => ({ ...previous, name }))} maxLength={80} placeholder={t('workflow.routeName')} placeholderTextColor={colors.text3} accessibilityLabel={t('workflow.routeName')} style={[styles.wpMenuInput, { borderColor: colors.border, color: colors.text, marginVertical: 14 }]} />
            {routeWaypoints.map((point, index) => <View key={point.id} style={[styles.routeEditorPoint, { borderColor: colors.border }]}>
              <Text style={[styles.wpMenuMGRS, { color: colors.text }]}>{index + 1}. {point.label || point.name}</Text>
              <Text style={[styles.wpMenuHint, { color: colors.text3, alignSelf: 'stretch' }]}>{point.mgrs || formatMGRS(toMGRS(point.lat, point.lon, 5))}</Text>
              <View style={styles.wpMenuActions}>
                <TouchableOpacity disabled={index === 0 || listsSaving} accessibilityRole="button" accessibilityLabel={t('workflow.moveUpLabel', { name: point.label || point.name })} onPress={() => setRouteWaypoints(points => moveRoutePoint(points, point.id, -1))} style={[styles.wpMenuBtn, { borderColor: colors.border, opacity: index === 0 ? 0.4 : 1 }]}><Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('workflow.moveUp')}</Text></TouchableOpacity>
                <TouchableOpacity disabled={index === routeWaypoints.length - 1 || listsSaving} accessibilityRole="button" accessibilityLabel={t('workflow.moveDownLabel', { name: point.label || point.name })} onPress={() => setRouteWaypoints(points => moveRoutePoint(points, point.id, 1))} style={[styles.wpMenuBtn, { borderColor: colors.border, opacity: index === routeWaypoints.length - 1 ? 0.4 : 1 }]}><Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('workflow.moveDown')}</Text></TouchableOpacity>
              </View>
            </View>)}
            {!!routeSaveError && <Text accessibilityRole="alert" style={[styles.wpMenuHint, { color: colors.text }]}>{routeSaveError}</Text>}
            <TouchableOpacity disabled={listsSaving || listsLoading || listsLoadError} onPress={savePlannedRoute} accessibilityRole="button" style={[styles.wpMenuBtn, { borderColor: colors.text2, marginTop: 12 }]}><Text style={[styles.wpMenuBtnText, { color: colors.text }]}>{listsSaving ? t('workflow.saving') : t('workflow.saveAndOpen')}</Text></TouchableOpacity>
            <TouchableOpacity disabled={listsSaving} onPress={() => setRouteSaveVisible(false)} accessibilityRole="button" style={styles.wpMenuBtn}><Text style={[styles.wpMenuBtnText, { color: colors.text3 }]}>{t('workflow.keepEditing')}</Text></TouchableOpacity>
            <TouchableOpacity disabled={listsSaving} onPress={discardRoute} accessibilityRole="button" style={styles.wpMenuBtn}><Text style={[styles.wpMenuBtnText, { color: colors.text3 }]}>{t('workflow.discard')}</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Bottom bar — center MGRS + cache indicator */}
      <View style={[styles.bottomBar, { backgroundColor: colors.bg, borderTopColor: colors.border2 }]}>
        <Text style={[styles.bottomLabel, { color: colors.text3 }]}>{t('map.center')}</Text>
        <Text style={[styles.bottomMGRS, { color: colors.text }]} numberOfLines={1}>
          {centerMGRS || '\u2014'}
        </Text>
        {cachedCount > 0 && (
          <Text style={[styles.cacheIndicator, { color: offlineMode ? colors.accentText : colors.text3 }]}>
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
            <Text style={[styles.wpMenuMGRS, { color: colors.accentText }]}>
              {pendingWaypoint?.mgrs || ''}
            </Text>

            {/* Rename input */}
            <Text style={[styles.wpMenuLabel, { color: colors.text3 }]}>{t('map.label')}</Text>
            <TextInput
              style={[styles.wpMenuInput, { borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }]}
              value={wpLabel}
              onChangeText={setWpLabel}
              maxLength={24}
              autoCapitalize="characters"
              placeholderTextColor={colors.text3}
              placeholder={t('map.waypointNamePlaceholder')}
            />

            {/* List picker */}
            <Text style={[styles.wpMenuLabel, { color: colors.text3 }]}>{t('map.addToList')}</Text>
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
                  <Text style={[styles.wpMenuListText, { color: wpSelectedList === list.id ? colors.text : colors.text2 }]}>
                    {list.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {wpLists.length === 0 && (
                <Text style={[styles.wpMenuHint, { color: colors.text3 }]}>{t('map.newListNote')}</Text>
              )}
            </ScrollView>

            {/* Action buttons */}
            {mapSaveError && <Text accessibilityRole="alert" style={[styles.wpMenuHint, { color: colors.text }]}>{t('workflow.saveFailed')}</Text>}
            <View style={styles.wpMenuActions}>
              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.accent, backgroundColor: colors.border2 }]}
                onPress={saveWaypointFromMenu}
                disabled={listsLoading || listsLoadError || listsSaving}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.text }]}>{t('common.save')}</Text>
              </TouchableOpacity>

              {onSetWaypoint && (
                <TouchableOpacity
                  style={[styles.wpMenuBtn, { borderColor: colors.text2 }]}
                  onPress={() => { saveWaypointFromMenu().then(saved => { if (saved) navigateToWaypoint(); }); }}
                  disabled={listsLoading || listsLoadError || listsSaving}
                >
                  <Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('map.saveNav')}</Text>
                </TouchableOpacity>
              )}

              {onSetWaypoint && (
                <TouchableOpacity
                  style={[styles.wpMenuBtn, { borderColor: colors.text2 }]}
                  onPress={navigateToWaypoint}
                >
                  <Text style={[styles.wpMenuBtnText, { color: colors.text2 }]}>{t('map.navOnly')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.wpMenuBtn, { borderColor: colors.border }]}
                onPress={() => { setWpMenuVisible(false); setPendingWaypoint(null); }}
              >
                <Text style={[styles.wpMenuBtnText, { color: colors.text3 }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* v3.4 Mission Preflight modal. Consumes the current map viewport so its
          coverage estimates and "Save current AO" reflect what the operator
          can actually see. Mesh + GPS props are optional; the screen degrades
          gracefully when the parent hasn't lifted them yet. */}
      <PreflightScreen
        visible={preflightVisible}
        onClose={() => setPreflightVisible(false)}
        location={location}
        gpsSource={gpsSource}
        gpsDeviceName={gpsDeviceName}
        mesh={mesh}
        mapRegion={mapRegion || initialRegion}
        mapStyle={mapStyle}
        isPro={isPro}
        onShowProGate={onShowProGate}
        onImportMap={() => { setPreflightVisible(false); handleImportMap(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  routeEditor: { flex: 1 },
  routeEditorContent: { padding: 20, paddingTop: 60, paddingBottom: 40, gap: 8 },
  routeEditorPoint: { borderWidth: 1, padding: 12, marginVertical: 4 },
  storageBanner: { position: 'absolute', top: 12, left: 12, right: 12, padding: 12, borderWidth: 1 },
  root: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  fallbackText: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, textAlign: 'center' },

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
  markerCardLabel: { flex: 1, ...TYPE.heading, fontSize: 14, letterSpacing: 1.2 },
  markerCardClose: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 32, minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  markerCardCloseText: { fontSize: 14, fontWeight: '700' },
  markerCardMgrs: { ...TYPE.data, fontSize: 11, letterSpacing: 0.6 },
  markerCardBrg: { ...TYPE.data, fontSize: 11, letterSpacing: 0.6 },
  markerCardBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  markerCardBtn: { flex: 1, borderWidth: 1, paddingVertical: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  markerCardBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

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
  progressText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginBottom: 8 },
  progressBarBg: { width: '100%', height: 4, borderRadius: 2 },
  progressBarFill: { height: 4, borderRadius: 2 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bottomLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  bottomMGRS: { ...TYPE.data, fontSize: 14, letterSpacing: 0.6, flex: 1 },
  cacheIndicator: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  // Map style button label
  mapBtnLabel: { ...TYPE.label, fontSize: 10, letterSpacing: 1 },

  // Waypoint creation menu
  wpMenuOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 24 },
  wpMenuCard: { width: '100%', maxWidth: 340, borderWidth: 1, padding: 16, gap: 8 },
  wpMenuTitle: { ...TYPE.heading, fontSize: 14, letterSpacing: 1.2 },
  wpMenuMGRS: { ...TYPE.data, fontSize: 16, letterSpacing: 0.6, marginBottom: 4 },
  wpMenuLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginTop: 4 },
  wpMenuInput: { borderWidth: 1, ...TYPE.body, fontSize: 13, letterSpacing: 0.3, paddingHorizontal: 10, paddingVertical: 8 },
  wpMenuListScroll: { maxHeight: 40, marginVertical: 4 },
  wpMenuListBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  wpMenuListText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  wpMenuHint: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, alignSelf: 'center' },
  wpMenuActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  wpMenuBtn: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  wpMenuBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },

  // Mesh node markers
  meshMarker: { alignItems: 'center', justifyContent: 'center' },
  meshMarkerDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  meshMarkerLabel: { ...TYPE.label, fontSize: 10, letterSpacing: 1, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

  // Route planning panel — sits above the bottom MGRS bar when route mode is on
  routePanel: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    borderTopWidth: 2,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 8 },
    }),
  },
  routePanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routePanelTitle: { ...TYPE.heading, fontSize: 14, letterSpacing: 1.2 },
  routePanelHint: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, flex: 1 },
  routePanelBtnRow: { flexDirection: 'row', gap: 8 },
  routePanelBtn: {
    flex: 1, borderWidth: 1, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center', minHeight: 38,
  },
  routePanelBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
});
