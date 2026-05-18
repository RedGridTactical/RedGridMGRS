/**
 * PreflightScreen — Mission Preflight (v3.4).
 *
 * Surfaces every check an operator needs before stepping off coverage:
 *   • GPS source (phone vs external) + accuracy
 *   • Mesh radio (Meshtastic) BLE connection state
 *   • Offline tile coverage for the current AO at each zoom
 *   • Permissions health (location, photo)
 *   • Battery / network hints
 *   • Saved AO packages (named bbox + zoom set bundles)
 *
 * Top of the screen shows a single READY / NOT READY summary derived from the
 * worst row, so the operator gets one-glance status before drilling in.
 *
 * Free tier: see every check + save 1 AO package. Saving a 2nd routes to the
 * Pro paywall via onShowProGate('AO Packages').
 *
 * Network policy: no fetches. The only side-effect this screen can trigger is
 * `downloadTilesForRegion` which is already user-initiated (tap "Download").
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
} from 'react-native';

import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { useAOPackages, FREE_AO_LIMIT, DEFAULT_AO_ZOOMS } from '../hooks/useAOPackages';
import { PreflightStatusRow } from '../components/PreflightStatusRow';
import {
  estimateTilesForRegion,
  checkTilesForRegion,
  downloadTilesForRegion,
} from '../utils/tileManager';
import { tapLight, tapMedium, notifySuccess } from '../utils/haptics';

let LocationModule = null;
let ImagePickerModule = null;
let MediaLibraryModule = null;
let BatteryModule = null;
let NetworkModule = null;
try { LocationModule = require('expo-location'); } catch {}
try { ImagePickerModule = require('expo-image-picker'); } catch {}
try { MediaLibraryModule = require('expo-media-library'); } catch {}
try { BatteryModule = require('expo-battery'); } catch {}
try { NetworkModule = require('expo-network'); } catch {}

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {function} props.onClose
 * @param {object} props.location — { lat, lon, accuracy } or null
 * @param {string} props.gpsSource — 'internal' | 'external'
 * @param {string} props.gpsDeviceName — name of the connected external receiver
 * @param {object} props.mesh — { connectionState, connectedDevice, autoShare }
 * @param {object} props.mapRegion — current map viewport (latitudeDelta etc.)
 * @param {string} props.mapStyle — 'standard' | 'dark' | 'topo'
 * @param {boolean} props.isPro
 * @param {function} props.onShowProGate — (featureName: string) => void
 */
export function PreflightScreen({
  visible,
  onClose,
  location,
  gpsSource,
  gpsDeviceName,
  mesh,
  mapRegion,
  mapStyle,
  isPro,
  onShowProGate,
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const {
    aoPackages,
    addAOPackage,
    deleteAOPackage,
    markAOPackageRefreshed,
    canSaveMore,
  } = useAOPackages();

  // ── Inline name prompt state for the "Save current AO" flow ──────────────
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [pendingName, setPendingName] = useState('');

  // ── Tile coverage for the current AO viewport ────────────────────────────
  const [tileCoverage, setTileCoverage] = useState({ cached: 0, total: 0 });
  const [tileCoverageByZoom, setTileCoverageByZoom] = useState({});
  const [tileEstimate, setTileEstimate] = useState({ totalTiles: 0, estimatedBytes: 0 });
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [permissionHealth, setPermissionHealth] = useState({ status: 'idle', value: '' });
  const [deviceHealth, setDeviceHealth] = useState({ status: 'idle', value: '' });

  // Refresh tile coverage whenever the modal opens or the viewport shifts.
  useEffect(() => {
    if (!visible || !mapRegion) return;
    let cancelled = false;
    (async () => {
      const estimate = estimateTilesForRegion(mapRegion, DEFAULT_AO_ZOOMS);
      const { aggregate, byZoom } = await readTileCoverage(mapRegion, DEFAULT_AO_ZOOMS);
      if (cancelled) return;
      setTileEstimate(estimate);
      setTileCoverage(aggregate);
      setTileCoverageByZoom(byZoom);
    })();
    return () => { cancelled = true; };
  }, [visible, mapRegion?.latitude, mapRegion?.longitude, mapRegion?.latitudeDelta, mapRegion?.longitudeDelta]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPermissionHealth({ status: 'idle', value: t('preflight.permissions.checking') });
    (async () => {
      const result = await buildPermissionHealth(t);
      if (!cancelled) setPermissionHealth(result);
    })();
    return () => { cancelled = true; };
  }, [visible, t]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setDeviceHealth({ status: 'idle', value: t('preflight.device.checking') });
    (async () => {
      const result = await buildDeviceHealth(t);
      if (!cancelled) setDeviceHealth(result);
    })();
    return () => { cancelled = true; };
  }, [visible, t]);

  // ── Derived status per row ───────────────────────────────────────────────
  const gpsStatus = useMemo(() => {
    if (!location) return { status: 'fail', value: t('preflight.gps.noFix') };
    const accuracyM = typeof location.accuracy === 'number' ? location.accuracy : null;
    const src = gpsSource === 'external'
      ? `${t('preflight.gps.external')} — ${gpsDeviceName || '—'}`
      : t('preflight.gps.internal');
    const accStr = accuracyM != null ? `±${Math.round(accuracyM)}m` : '';
    const status = accuracyM == null ? 'warn' : (accuracyM <= 10 ? 'ok' : accuracyM <= 50 ? 'warn' : 'fail');
    return { status, value: accStr ? `${src} · ${accStr}` : src };
  }, [location, gpsSource, gpsDeviceName, t]);

  const meshStatus = useMemo(() => {
    const state = mesh?.connectionState;
    if (state === 'connected') {
      const name = mesh?.connectedDevice?.name || mesh?.connectedDevice?.localName || 'Meshtastic';
      const share = mesh?.autoShare ? ` · ${t('preflight.mesh.autoShareOn')}` : '';
      return { status: 'ok', value: `${name}${share}` };
    }
    if (state === 'scanning' || state === 'connecting') {
      return { status: 'warn', value: t('preflight.mesh.connecting') };
    }
    return { status: 'warn', value: t('preflight.mesh.disconnected') };
  }, [mesh?.connectionState, mesh?.connectedDevice, mesh?.autoShare, t]);

  const tilesStatus = useMemo(() => {
    const total = tileCoverage.total || tileEstimate.totalTiles || 0;
    const cached = tileCoverage.cached || 0;
    if (total === 0) return { status: 'idle', value: t('preflight.tiles.noViewport') };
    const pct = Math.round((cached / total) * 100);
    if (pct === 100) return { status: 'ok', value: t('preflight.tiles.coverageFull', { count: total }) };
    if (pct >= 50) return { status: 'warn', value: t('preflight.tiles.coveragePartial', { pct, count: total }) };
    return { status: 'fail', value: t('preflight.tiles.coverageLow', { pct, count: total }) };
  }, [tileCoverage, tileEstimate.totalTiles, t]);

  const missingZoomStatus = useMemo(() => {
    const entries = DEFAULT_AO_ZOOMS
      .map((zoom) => ({ zoom, ...(tileCoverageByZoom[zoom] || {}) }))
      .filter((entry) => entry.total > 0);
    if (entries.length === 0) {
      return { status: 'idle', value: t('preflight.tiles.missingUnknown') };
    }
    const missing = entries.filter((entry) => entry.cached < entry.total).map((entry) => entry.zoom);
    if (missing.length === 0) {
      return { status: 'ok', value: t('preflight.tiles.allZoomsCached', { zooms: DEFAULT_AO_ZOOMS.join(', ') }) };
    }
    const status = missing.length === entries.length ? 'fail' : 'warn';
    return { status, value: t('preflight.tiles.missingZooms', { zooms: missing.join(', ') }) };
  }, [tileCoverageByZoom, t]);

  const overallStatus = useMemo(() => {
    const statuses = [
      gpsStatus.status,
      meshStatus.status,
      tilesStatus.status,
      missingZoomStatus.status,
      permissionHealth.status,
      deviceHealth.status,
    ];
    if (statuses.includes('fail')) return 'NOT_READY';
    if (statuses.includes('warn')) return 'CAUTION';
    return 'READY';
  }, [gpsStatus.status, tilesStatus.status, meshStatus.status, missingZoomStatus.status, permissionHealth.status, deviceHealth.status]);

  // ── Save AO flow ─────────────────────────────────────────────────────────
  const beginSaveAO = useCallback(() => {
    if (!mapRegion) {
      Alert.alert(t('preflight.errors.title'), t('preflight.errors.noViewport'));
      return;
    }
    if (!canSaveMore(isPro)) {
      onShowProGate && onShowProGate(t('preflight.aos.proFeatureName'));
      return;
    }
    setPendingName('');
    setNamePromptVisible(true);
  }, [mapRegion, canSaveMore, isPro, onShowProGate, t]);

  const confirmSaveAO = useCallback(async () => {
    const name = (pendingName || '').trim();
    if (!name || !mapRegion) {
      setNamePromptVisible(false);
      return;
    }
    setNamePromptVisible(false);
    tapMedium();
    const pkg = await addAOPackage({
      name,
      mapStyle,
      region: mapRegion,
    });
    if (pkg) notifySuccess();
  }, [pendingName, mapRegion, mapStyle, addAOPackage]);

  // ── Download flow ────────────────────────────────────────────────────────
  const triggerDownload = useCallback(async (
    region,
    aoId,
    zoomLevels = DEFAULT_AO_ZOOMS,
    style = mapStyle,
    updateCurrentCoverage = true
  ) => {
    if (!region) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const result = await downloadTilesForRegion(
        region,
        zoomLevels,
        (done, total) => {
          setDownloadProgress(total > 0 ? done / total : 0);
        },
        { style }
      );
      if (aoId) await markAOPackageRefreshed(aoId);
      const shouldUpdateCurrent = updateCurrentCoverage || regionsEqual(region, mapRegion);
      if (shouldUpdateCurrent) {
        const { aggregate, byZoom } = await readTileCoverage(mapRegion || region, DEFAULT_AO_ZOOMS);
        setTileCoverage(aggregate);
        setTileCoverageByZoom(byZoom);
      }
      Alert.alert(
        t('preflight.tiles.downloadDoneTitle'),
        t('preflight.tiles.downloadDoneBody', {
          downloaded: result.downloaded,
          skipped: result.skipped,
          failed: result.failed,
        })
      );
    } catch (err) {
      Alert.alert(t('preflight.errors.title'), t('preflight.errors.downloadFailed'));
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }, [mapStyle, mapRegion, markAOPackageRefreshed, t]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* Header bar */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: colors.text2 }]}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.accent }]}>{t('preflight.title')}</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Overall summary */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.text3 }]}>{t('preflight.summary.label')}</Text>
          <Text
            style={[
              styles.summaryStatus,
              { color: overallStatus === 'READY' ? colors.accent : overallStatus === 'CAUTION' ? (colors.warn || '#d99a3a') : (colors.danger || '#cc4444') },
            ]}
          >
            {t(`preflight.summary.${overallStatus}`)}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* GPS row */}
          <SectionHeader colors={colors} label={t('preflight.section.gps')} />
          <PreflightStatusRow
            label={t('preflight.gps.source')}
            value={gpsStatus.value}
            status={gpsStatus.status}
          />

          {/* Mesh row */}
          <SectionHeader colors={colors} label={t('preflight.section.mesh')} />
          <PreflightStatusRow
            label={t('preflight.mesh.label')}
            value={meshStatus.value}
            status={meshStatus.status}
          />

          {/* Tile coverage */}
          <SectionHeader colors={colors} label={t('preflight.section.offline')} />
          <PreflightStatusRow
            label={t('preflight.tiles.label')}
            value={tilesStatus.value}
            status={tilesStatus.status}
            actionLabel={
              downloading
                ? t('preflight.tiles.downloading', { pct: Math.round(downloadProgress * 100) })
                : (tileCoverage.total > 0 && tileCoverage.cached < tileCoverage.total ? t('preflight.tiles.download') : null)
            }
            onAction={
              !downloading && tileCoverage.total > 0 && tileCoverage.cached < tileCoverage.total
                ? () => triggerDownload(mapRegion, null, DEFAULT_AO_ZOOMS, mapStyle, true)
                : undefined
              }
          />
          <PreflightStatusRow
            label={t('preflight.tiles.missingLabel')}
            value={missingZoomStatus.value}
            status={missingZoomStatus.status}
          />
          {tileEstimate.totalTiles > 0 && (
            <Text style={[styles.estimateLine, { color: colors.text3 }]}>
              {t('preflight.tiles.estimate', {
                tiles: tileEstimate.totalTiles,
                size: formatMB(tileEstimate.estimatedBytes),
              })}
            </Text>
          )}

          {/* Device readiness */}
          <SectionHeader colors={colors} label={t('preflight.section.device')} />
          <PreflightStatusRow
            label={t('preflight.permissions.label')}
            value={permissionHealth.value || t('preflight.permissions.checking')}
            status={permissionHealth.status}
          />
          <PreflightStatusRow
            label={t('preflight.device.label')}
            value={deviceHealth.value || t('preflight.device.checking')}
            status={deviceHealth.status}
          />

          {/* Saved AOs */}
          <View style={styles.aoHeader}>
            <SectionHeader colors={colors} label={t('preflight.section.aos')} />
            <Text style={[styles.aoCount, { color: colors.text3 }]}>
              {isPro
                ? t('preflight.aos.countPro', { count: aoPackages.length })
                : t('preflight.aos.countFree', { count: aoPackages.length, limit: FREE_AO_LIMIT })}
            </Text>
          </View>

          {aoPackages.length === 0 && (
            <Text style={[styles.empty, { color: colors.text3 }]}>{t('preflight.aos.empty')}</Text>
          )}

          {aoPackages.map((pkg) => (
            <AOPackageRow
              key={pkg.id}
              pkg={pkg}
              colors={colors}
              t={t}
              onRefresh={() => triggerDownload(
                pkg.region,
                pkg.id,
                Array.isArray(pkg.zoomLevels) ? pkg.zoomLevels : DEFAULT_AO_ZOOMS,
                pkg.mapStyle || mapStyle,
                false
              )}
              onDelete={() => deleteAOPackage(pkg.id)}
              busy={downloading}
            />
          ))}

          <TouchableOpacity
            style={[styles.saveAOBtn, { borderColor: colors.accent }]}
            onPress={beginSaveAO}
            accessibilityRole="button"
            accessibilityLabel={t('preflight.aos.saveCurrent')}
          >
            <Text style={[styles.saveAOText, { color: colors.accent }]}>{t('preflight.aos.saveCurrent')}</Text>
          </TouchableOpacity>

          {/* Privacy footnote — reinforces the policy + future paywall copy */}
          <Text style={[styles.footnote, { color: colors.text3 }]}>{t('preflight.footnote')}</Text>
        </ScrollView>

        {/* AO name prompt (inline modal) */}
        {namePromptVisible && (
          <View style={[styles.promptScrim]}>
            <View style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
              <Text style={[styles.promptTitle, { color: colors.accent }]}>{t('preflight.aos.namePromptTitle')}</Text>
              <Text style={[styles.promptHint, { color: colors.text3 }]}>{t('preflight.aos.namePromptHint')}</Text>
              <TextInput
                style={[styles.promptInput, { color: colors.text, borderColor: colors.border2 }]}
                value={pendingName}
                onChangeText={setPendingName}
                placeholder={t('preflight.aos.namePlaceholder')}
                placeholderTextColor={colors.text3}
                autoFocus
                autoCorrect={false}
                maxLength={32}
              />
              <View style={styles.promptBtnRow}>
                <TouchableOpacity
                  style={[styles.promptBtn, { borderColor: colors.border }]}
                  onPress={() => { tapLight(); setNamePromptVisible(false); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.promptBtnText, { color: colors.text2 }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.promptBtn, { borderColor: colors.accent }]}
                  onPress={confirmSaveAO}
                  accessibilityRole="button"
                >
                  <Text style={[styles.promptBtnText, { color: colors.accent }]}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────
function SectionHeader({ colors, label }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.text3, borderBottomColor: colors.border2 }]}>{label}</Text>
  );
}

function AOPackageRow({ pkg, colors, t, onRefresh, onDelete, busy }) {
  const ago = pkg.lastRefreshed
    ? t('preflight.aos.refreshedAgo', { ago: timeAgo(pkg.lastRefreshed) })
    : t('preflight.aos.neverRefreshed');
  const mapStyle = String(pkg.mapStyle || 'standard').toUpperCase();
  const tileCount = Number.isFinite(pkg.tileCount) ? pkg.tileCount : 0;
  const estimatedBytes = Number.isFinite(pkg.estimatedBytes) ? pkg.estimatedBytes : 0;
  const detail = `${mapStyle} · ${tileCount} tiles · ${formatMB(estimatedBytes)} · ${ago}`;
  return (
    <View style={[styles.aoRow, { borderColor: colors.border2 }]}>
      <View style={styles.textCol}>
        <Text style={[styles.aoName, { color: colors.text }]} numberOfLines={1}>{pkg.name}</Text>
        <Text style={[styles.aoDetail, { color: colors.text3 }]} numberOfLines={2}>{detail}</Text>
      </View>
      <View style={styles.aoActions}>
        <TouchableOpacity
          style={[styles.aoBtn, { borderColor: colors.accent }, busy && { opacity: 0.4 }]}
          onPress={busy ? undefined : onRefresh}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${t('preflight.aos.refresh')} ${pkg.name}`}
        >
          <Text style={[styles.aoBtnText, { color: colors.accent }]}>{t('preflight.aos.refresh')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aoBtn, { borderColor: colors.border }]}
          onPress={() => {
            Alert.alert(
              t('preflight.aos.deleteTitle'),
              t('preflight.aos.deleteBody', { name: pkg.name }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('preflight.aos.delete'), style: 'destructive', onPress: onDelete },
              ]
            );
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t('preflight.aos.delete')} ${pkg.name}`}
        >
          <Text style={[styles.aoBtnText, { color: colors.text3 }]}>{t('preflight.aos.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
async function readTileCoverage(region, zoomLevels) {
  if (!region || !Array.isArray(zoomLevels)) {
    return { aggregate: { cached: 0, missing: 0, total: 0 }, byZoom: {} };
  }

  const results = await Promise.all(zoomLevels.map(async (zoom) => {
    try {
      const coverage = await checkTilesForRegion(region, [zoom]);
      return { zoom, coverage };
    } catch {
      return { zoom, coverage: { cached: 0, missing: 0, total: 0 } };
    }
  }));

  const byZoom = {};
  const aggregate = { cached: 0, missing: 0, total: 0 };
  results.forEach(({ zoom, coverage }) => {
    const safeCoverage = {
      cached: Number.isFinite(coverage?.cached) ? coverage.cached : 0,
      missing: Number.isFinite(coverage?.missing) ? coverage.missing : 0,
      total: Number.isFinite(coverage?.total) ? coverage.total : 0,
    };
    byZoom[zoom] = safeCoverage;
    aggregate.cached += safeCoverage.cached;
    aggregate.missing += safeCoverage.missing;
    aggregate.total += safeCoverage.total;
  });

  return { aggregate, byZoom };
}

async function buildPermissionHealth(t) {
  const location = await readPermission(LocationModule, 'getForegroundPermissionsAsync');
  const camera = await readPermission(ImagePickerModule, 'getCameraPermissionsAsync');
  const photos = await readPermission(MediaLibraryModule, 'getPermissionsAsync');

  let status = 'ok';
  if (location === 'denied' || location === 'unavailable') status = 'fail';
  else if (location !== 'granted') status = 'warn';

  if (camera !== 'granted') status = worstStatus(status, 'warn');
  if (photos !== 'granted') status = worstStatus(status, 'warn');

  return {
    status,
    value: [
      permissionPart(t, 'location', location),
      permissionPart(t, 'camera', camera),
      permissionPart(t, 'photos', photos),
    ].join(' · '),
  };
}

async function readPermission(module, methodName) {
  if (!module || typeof module[methodName] !== 'function') return 'unavailable';
  try {
    const result = await module[methodName]();
    if (result?.granted || result?.status === 'granted') return 'granted';
    if (result?.status === 'limited' || result?.accessPrivileges === 'limited') return 'limited';
    if (result?.status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

function permissionPart(t, name, state) {
  return `${t(`preflight.permissions.${name}`)}: ${t(`preflight.permissions.${state}`)}`;
}

async function buildDeviceHealth(t) {
  let status = 'ok';
  const parts = [];

  const power = await readPowerState();
  if (!power) {
    status = worstStatus(status, 'warn');
    parts.push(t('preflight.device.batteryUnavailable'));
  } else {
    const batteryPart = formatBatteryPart(t, power);
    parts.push(batteryPart.value);
    status = worstStatus(status, batteryPart.status);
    if (power.lowPowerMode) {
      status = worstStatus(status, 'warn');
      parts.push(t('preflight.device.lowPowerOn'));
    }
  }

  const network = await readNetworkState();
  if (!network) {
    status = worstStatus(status, 'warn');
    parts.push(t('preflight.device.networkUnavailable'));
  } else {
    const networkPart = await formatNetworkPart(t, network);
    parts.push(networkPart.value);
    status = worstStatus(status, networkPart.status);
  }

  return { status, value: parts.join(' · ') };
}

async function readPowerState() {
  if (!BatteryModule || typeof BatteryModule.getPowerStateAsync !== 'function') return null;
  try {
    return await BatteryModule.getPowerStateAsync();
  } catch {
    return null;
  }
}

function formatBatteryPart(t, power) {
  const batteryLevel = Number.isFinite(power?.batteryLevel) ? power.batteryLevel : -1;
  const batteryState = power?.batteryState;
  const charging =
    batteryState === BatteryModule?.BatteryState?.CHARGING ||
    batteryState === BatteryModule?.BatteryState?.FULL;

  if (batteryLevel < 0) {
    return { status: power?.lowPowerMode ? 'warn' : 'idle', value: t('preflight.device.batteryUnknown') };
  }

  const pct = Math.round(batteryLevel * 100);
  let status = 'ok';
  if (!charging && pct <= 10) status = 'fail';
  else if (!charging && pct <= 25) status = 'warn';

  return {
    status,
    value: t('preflight.device.batteryPct', {
      pct,
      state: t(`preflight.device.batteryState.${batteryStateName(batteryState)}`),
    }),
  };
}

function batteryStateName(state) {
  if (state === BatteryModule?.BatteryState?.CHARGING) return 'charging';
  if (state === BatteryModule?.BatteryState?.FULL) return 'full';
  if (state === BatteryModule?.BatteryState?.UNPLUGGED) return 'unplugged';
  return 'unknown';
}

async function readNetworkState() {
  if (!NetworkModule || typeof NetworkModule.getNetworkStateAsync !== 'function') return null;
  try {
    return await NetworkModule.getNetworkStateAsync();
  } catch {
    return null;
  }
}

async function formatNetworkPart(t, network) {
  const type = network?.type || 'UNKNOWN';
  let status = 'ok';
  let airplane = null;

  if (Platform.OS === 'android' && typeof NetworkModule?.isAirplaneModeEnabledAsync === 'function') {
    try {
      airplane = await NetworkModule.isAirplaneModeEnabledAsync();
    } catch {
      airplane = null;
    }
  }

  if (network?.isConnected === false || type === 'NONE') status = 'warn';
  if (network?.isInternetReachable === false) status = worstStatus(status, 'warn');
  if (airplane === true) status = worstStatus(status, 'warn');

  const link = network?.isConnected === false || type === 'NONE'
    ? t('preflight.device.noDataLink')
    : t('preflight.device.dataLink', { type: networkTypeLabel(t, type) });
  const airplaneText = Platform.OS === 'ios'
    ? t('preflight.device.airplaneManual')
    : airplane === true
      ? t('preflight.device.airplaneOn')
      : airplane === false
        ? t('preflight.device.airplaneOff')
        : t('preflight.device.airplaneUnknown');

  return { status, value: `${link}; ${airplaneText}` };
}

function networkTypeLabel(t, type) {
  const key = String(type || 'UNKNOWN').toLowerCase();
  return t(`preflight.device.networkType.${key}`, { defaultValue: type || 'UNKNOWN' });
}

function worstStatus(a, b) {
  const rank = { idle: 0, ok: 1, warn: 2, fail: 3 };
  return (rank[b] || 0) > (rank[a] || 0) ? b : a;
}

function regionsEqual(a, b) {
  if (!a || !b) return false;
  const fields = ['latitude', 'longitude', 'latitudeDelta', 'longitudeDelta'];
  return fields.every((field) => (
    Number.isFinite(a[field]) &&
    Number.isFinite(b[field]) &&
    Math.abs(a[field] - b[field]) < 0.000001
  ));
}

function formatMB(bytes) {
  if (!bytes || bytes < 1) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function timeAgo(iso) {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return '—';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 22, fontWeight: '700' },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: '800',
  },
  summary: {
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  summaryLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryStatus: {
    fontFamily: 'monospace',
    fontSize: 28,
    letterSpacing: 6,
    fontWeight: '800',
  },
  scrollContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    textTransform: 'uppercase',
  },
  estimateLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
  },
  aoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 14,
  },
  aoCount: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    paddingTop: 16,
  },
  empty: {
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    minHeight: 64,
  },
  textCol: { flex: 1, paddingRight: 10 },
  aoName: {
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 2,
  },
  aoDetail: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  aoActions: { flexDirection: 'row', gap: 6 },
  aoBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 2,
  },
  aoBtnText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  saveAOBtn: {
    marginHorizontal: 14,
    marginTop: 14,
    paddingVertical: 12,
    borderWidth: 2,
    alignItems: 'center',
    borderRadius: 2,
  },
  saveAOText: {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '800',
  },
  footnote: {
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12,
    lineHeight: 14,
  },

  // Inline name prompt
  promptScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  promptCard: {
    width: '100%',
    maxWidth: 380,
    padding: 18,
    borderWidth: 2,
    borderRadius: 4,
  },
  promptTitle: {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '800',
    marginBottom: 6,
  },
  promptHint: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 12,
  },
  promptInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontFamily: 'monospace',
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 14,
  },
  promptBtnRow: { flexDirection: 'row', gap: 10 },
  promptBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  promptBtnText: {
    fontFamily: 'monospace',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
  },
});
