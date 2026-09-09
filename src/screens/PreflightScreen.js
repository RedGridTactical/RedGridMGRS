/** Local readiness checks. Saved areas are references, not downloaded map packages. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Modal } from '../components/FieldModal';
import { TextInput } from '../components/FieldInput';
import { Alert } from '../utils/fieldAlert';

import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { useAOPackages, FREE_AO_LIMIT } from '../hooks/useAOPackages';
import { PreflightStatusRow } from '../components/PreflightStatusRow';
import { checkImportedMapCoverage } from '../utils/tileManager';
import { tapLight, tapMedium, notifySuccess } from '../utils/haptics';
import { TYPE } from '../utils/typography';
import { navigationReadiness, locationPermissionReadiness } from '../utils/fieldReadiness';

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
  preparedRoute,
  onStartNavigation,
  onImportMap,
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const {
    aoPackages,
    addAOPackage,
    deleteAOPackage,
    canSaveMore, loadError, saveError, isSaving, isLoading, loaded, retryLoad, retrySave,
  } = useAOPackages();

  // ── Inline name prompt state for the "Save current AO" flow ──────────────
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [pendingName, setPendingName] = useState('');

  // ── Tile coverage for the current AO viewport ────────────────────────────
  const [mapCoverage, setMapCoverage] = useState({ state: 'checking', zoomLevels: [], byZoom: {} });
  const [areaCoverage, setAreaCoverage] = useState({});
  const [checkingArea, setCheckingArea] = useState(null);
  const areaCheckRequest = useRef(null);
  const [permissionHealth, setPermissionHealth] = useState({ status: 'idle', value: '' });
  const [deviceHealth, setDeviceHealth] = useState({ status: 'idle', value: '' });
  const [readinessMode, setReadinessMode] = useState('solo');

  // Refresh tile coverage whenever the modal opens or the viewport shifts.
  useEffect(() => {
    areaCheckRequest.current = null;
    setCheckingArea(null);
    if (!visible) return;
    let cancelled = false;
    setMapCoverage({ state: 'checking', zoomLevels: [], byZoom: {} });
    setAreaCoverage({});
    (async () => {
      const coverage = await checkImportedMapCoverage(mapRegion);
      if (!cancelled) setMapCoverage(coverage);
    })();
    return () => { cancelled = true; areaCheckRequest.current = null; };
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

  const tilesStatus = useMemo(() => describeCoverage(mapCoverage, t), [mapCoverage, t]);
  const missingZoomStatus = useMemo(() => {
    const zooms = mapCoverage.zoomLevels || [];
    if (!zooms.length) return { status: 'warn', value: t('preflight.tiles.missingUnknown') };
    const missing = zooms.filter(zoom => mapCoverage.byZoom?.[zoom]?.missing > 0);
    return {
      status: mapCoverage.state === 'complete' ? 'ok' : 'warn',
      value: missing.length
        ? t('preflight.tiles.missingZooms', { zooms: missing.join(', ') })
        : t('offlinePreflight.zoomInventory', { zooms: zooms.join(', ') }),
    };
  }, [mapCoverage, t]);

  const overallStatus = navigationReadiness({
    gps: gpsStatus.status,
    permissions: permissionHealth.status,
    device: deviceHealth.status,
    mesh: meshStatus.status,
    mode: readinessMode,
    mapStatuses: [tilesStatus.status],
  });

  const beginNavigation = () => {
    const start = () => onStartNavigation?.(readinessMode);
    if (overallStatus === 'READY') { start(); return; }
    Alert.alert(t('fieldNav.reviewChecksTitle'), t('fieldNav.reviewChecksBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('fieldNav.continue'), onPress: start },
    ]);
  };

  // ── Save AO flow ─────────────────────────────────────────────────────────
  const beginSaveAO = useCallback(() => {
    if (!loaded || isSaving || loadError || saveError) return;
    if (!mapRegion) {
      Alert.alert(t('preflight.errors.title'), t('preflight.errors.noViewport'));
      return;
    }
    if (!canSaveMore(isPro)) {
      onShowProGate && onShowProGate(t('preflight.aos.proFeatureName'), 'offline');
      return;
    }
    setPendingName('');
    setNamePromptVisible(true);
  }, [mapRegion, canSaveMore, isPro, onShowProGate, t, loaded, isSaving, loadError, saveError]);

  const confirmSaveAO = useCallback(async () => {
    if (isSaving || loadError || saveError) return;
    const name = (pendingName || '').trim();
    if (!name || !mapRegion) {
      setNamePromptVisible(false);
      return;
    }
    tapMedium();
    try {
      const pkg = await addAOPackage({ name, mapStyle, region: mapRegion, zoomLevels: mapCoverage.zoomLevels });
      if (!pkg) throw new Error('INVALID_AREA');
      setNamePromptVisible(false); setPendingName(''); notifySuccess();
    } catch { Alert.alert(t('workflow.saveFailed')); }
  }, [pendingName, mapRegion, mapStyle, mapCoverage.zoomLevels, addAOPackage, isSaving, loadError, saveError, t]);

  const retryPackages = async () => {
    try {
      if (loadError) await retryLoad();
      else { await retrySave(); setNamePromptVisible(false); setPendingName(''); notifySuccess(); }
    } catch { Alert.alert(t(loadError ? 'workflow.loadFailed' : 'workflow.saveFailed')); }
  };
  const removePackage = async id => {
    try { await deleteAOPackage(id); }
    catch { Alert.alert(t('workflow.saveFailed')); }
  };

  // Recheck saved bounds against the currently imported map. This never
  // downloads tiles or changes a saved area's refresh timestamp.
  const checkSavedArea = useCallback(async (pkg) => {
    if (areaCheckRequest.current) return;
    const request = {};
    areaCheckRequest.current = request;
    setCheckingArea(pkg.id);
    try {
      const coverage = await checkImportedMapCoverage(pkg.region);
      if (areaCheckRequest.current === request) setAreaCoverage(current => ({ ...current, [pkg.id]: coverage }));
    } finally {
      if (areaCheckRequest.current === request) { areaCheckRequest.current = null; setCheckingArea(null); }
    }
  }, []);

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
          <Text style={[styles.headerTitle, { color: colors.accentText }]}>{t('preflight.title')}</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Overall summary */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.text3 }]}>{t('fieldNav.readinessLabel')}</Text>
          <Text
            style={[
              styles.summaryStatus,
              { color: overallStatus === 'READY' ? colors.accentText : overallStatus === 'CAUTION' ? (colors.warn || '#d99a3a') : (colors.danger || '#cc4444') },
            ]}
          >
            {t(`preflight.summary.${overallStatus}`)}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {preparedRoute && (
            <View style={[styles.preparedRoute, { borderBottomColor: colors.border2 }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>{preparedRoute.name}</Text>
              <Text style={[styles.modeHint, { color: colors.text3 }]}>{t('fieldNav.preparedPoints', { count: preparedRoute.waypoints.length })}</Text>
              <Text style={[styles.modeHint, { color: colors.text2 }]}>{preparedRoute.waypoints.map((point, index) => `${index + 1}. ${point.label || point.name || `WP ${index + 1}`}`).join(' → ')}</Text>
            </View>
          )}
          <View style={styles.modeRow} accessibilityRole="radiogroup">
            {['solo', 'team'].map(mode => (
              <TouchableOpacity key={mode} style={[styles.modeButton, { borderColor: readinessMode === mode ? colors.accentText : colors.border2, backgroundColor: colors.card }]}
                onPress={() => setReadinessMode(mode)} accessibilityRole="radio" accessibilityState={{ selected: readinessMode === mode }}>
                <Text style={[styles.headerTitle, { color: readinessMode === mode ? colors.accentText : colors.text3 }]}>{t(`fieldNav.${mode}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.modeHint, { color: colors.text3 }]}>{t(readinessMode === 'solo' ? 'fieldNav.soloHint' : 'fieldNav.teamHint')}</Text>
          {!mapRegion && <Text style={[styles.modeHint, { color: colors.text3 }]}>{t('fieldNav.mapsNotChecked')}</Text>}
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
            value={readinessMode === 'solo' && mesh?.connectionState !== 'connected' ? t('fieldNav.radioOptional') : meshStatus.value}
            status={readinessMode === 'solo' ? 'idle' : meshStatus.status}
          />

          {/* Tile coverage */}
          <SectionHeader colors={colors} label={t('preflight.section.offline')} />
          <PreflightStatusRow
            label={t('preflight.tiles.label')}
            value={tilesStatus.value}
            status={tilesStatus.status}
            actionLabel={onImportMap ? t('nightDisplay.importMap') : null}
            onAction={onImportMap}
          />
          <PreflightStatusRow
            label={t('offlinePreflight.importedZooms')}
            value={missingZoomStatus.value}
            status={missingZoomStatus.status}
          />
          <Text style={[styles.estimateLine, { color: colors.text3 }]}>{t(mapRegion ? 'offlinePreflight.viewportScope' : 'fieldNav.mapsNotChecked')}</Text>
          {mapCoverage.metadata && (
            <Text style={[styles.estimateLine, { color: colors.text3 }]}>
              {mapCoverage.metadata.name}{'\n'}{t('offlinePreflight.bounds', { bounds: formatBounds(mapCoverage.metadata.bounds) })}
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

          {preparedRoute && onStartNavigation && (
            <TouchableOpacity style={[styles.startNavigation, { backgroundColor: colors.card, borderColor: colors.accentText }]} onPress={beginNavigation} accessibilityRole="button">
              <Text style={[styles.headerTitle, { color: colors.accentText }]}>{t('fieldNav.start')}</Text>
            </TouchableOpacity>
          )}

          {/* Saved AO controls belong to a map viewport, not a list-only check. */}
          {mapRegion && <>
          <View style={styles.aoHeader}>
            <SectionHeader colors={colors} label={t('preflight.section.aos')} />
            <Text style={[styles.aoCount, { color: colors.text3 }]}>
              {isPro
                ? t('preflight.aos.countPro', { count: aoPackages.length })
                : t('preflight.aos.countFree', { count: aoPackages.length, limit: FREE_AO_LIMIT })}
            </Text>
          </View>

          {(loadError || saveError) && <View>
            <Text style={[styles.empty, { color: colors.text2 }]} accessibilityLiveRegion="polite">{t(loadError ? 'workflow.loadFailed' : 'workflow.saveFailed')}</Text>
            <TouchableOpacity onPress={retryPackages} disabled={isSaving || isLoading} accessibilityRole="button" style={styles.saveAOBtn}>
              <Text style={[styles.saveAOText, { color: colors.text2 }]}>{t('workflow.retry')}</Text>
            </TouchableOpacity>
          </View>}
          {loaded && !loadError && aoPackages.length === 0 && (
            <Text style={[styles.empty, { color: colors.text3 }]}>{t('preflight.aos.empty')}</Text>
          )}

          {aoPackages.map((pkg) => (
            <AOPackageRow
              key={pkg.id}
              pkg={pkg}
              colors={colors}
              t={t}
              onCheck={() => checkSavedArea(pkg)}
              coverage={areaCoverage[pkg.id]}
              onDelete={() => removePackage(pkg.id)}
              busy={!!checkingArea || isSaving || !!loadError || !!saveError}
            />
          ))}

          <TouchableOpacity
            style={[styles.saveAOBtn, { borderColor: colors.accent }]}
            onPress={beginSaveAO}
            disabled={!loaded || isSaving || !!loadError || !!saveError}
            accessibilityRole="button"
            accessibilityLabel={t('preflight.aos.saveCurrent')}
          >
            <Text style={[styles.saveAOText, { color: colors.accentText }]}>{t('preflight.aos.saveCurrent')}</Text>
          </TouchableOpacity>
          </>}

          {/* Privacy footnote — reinforces the policy + future paywall copy */}
          <Text style={[styles.footnote, { color: colors.text3 }]}>{t('preflight.footnote')}</Text>
        </ScrollView>

        {/* AO name prompt (inline modal) */}
        {namePromptVisible && (
          <View style={[styles.promptScrim]}>
            <View style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
              <Text style={[styles.promptTitle, { color: colors.accentText }]}>{t('preflight.aos.namePromptTitle')}</Text>
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
                  onPress={saveError ? retryPackages : confirmSaveAO}
                  disabled={isSaving || !!loadError}
                  accessibilityRole="button"
                >
                  <Text style={[styles.promptBtnText, { color: colors.accentText }]}>{t(saveError ? 'workflow.retry' : 'common.save')}</Text>
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

function AOPackageRow({ pkg, colors, t, onCheck, onDelete, busy, coverage }) {
  const detail = coverage ? describeCoverage(coverage, t).value : t('offlinePreflight.savedAreaOnly');
  return (
    <View style={[styles.aoRow, { borderColor: colors.border2 }]}>
      <View style={styles.textCol}>
        <Text style={[styles.aoName, { color: colors.text }]} numberOfLines={1}>{pkg.name}</Text>
        <Text style={[styles.aoDetail, { color: colors.text3 }]} numberOfLines={2}>{detail}</Text>
      </View>
      <View style={styles.aoActions}>
        <TouchableOpacity
          style={[styles.aoBtn, { borderColor: colors.accent }, busy && { opacity: 0.4 }]}
          onPress={busy ? undefined : onCheck}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${t('offlinePreflight.checkArea')} ${pkg.name}`}
        >
          <Text style={[styles.aoBtnText, { color: colors.accentText }]}>{t('offlinePreflight.checkArea')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aoBtn, { borderColor: colors.border }]}
          disabled={busy}
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
function describeCoverage(coverage, t) {
  const states = {
    checking: ['warn', 'offlinePreflight.checking'],
    unscoped: ['warn', 'fieldNav.mapsNotChecked'],
    no_map: ['fail', 'offlinePreflight.noMap'],
    uncheckable: ['warn', 'offlinePreflight.uncheckable'],
  };
  if (states[coverage.state]) {
    const [status, key] = states[coverage.state];
    return { status, value: t(key) };
  }
  if (coverage.state === 'complete') return { status: 'ok', value: t('preflight.tiles.coverageFull', { count: coverage.total }) };
  const pct = coverage.total ? Math.floor(coverage.cached / coverage.total * 100) : 0;
  return { status: 'fail', value: t('preflight.tiles.coverageLow', { pct, count: coverage.total || 0 }) };
}

function formatBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return '—';
  return bounds.map(value => value.toFixed(4)).join(', ');
}

async function buildPermissionHealth(t) {
  const location = await readPermission(LocationModule, 'getForegroundPermissionsAsync');
  const camera = await readPermission(ImagePickerModule, 'getCameraPermissionsAsync');
  const photos = await readPermission(MediaLibraryModule, 'getPermissionsAsync');

  // Camera and photo access support optional tools, not navigation readiness.
  const status = locationPermissionReadiness(location);

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
    parts.push(t('preflight.device.networkUnavailable'));
  } else {
    const networkPart = await formatNetworkPart(t, network);
    parts.push(networkPart.value);
    // A data link is informational: solo land navigation works without one.
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

const styles = StyleSheet.create({
  preparedRoute: { padding: 14, gap: 6, borderBottomWidth: 1 },
  modeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
  modeButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  modeHint: { ...TYPE.body, fontSize: 14, paddingHorizontal: 14, paddingBottom: 6 },
  startNavigation: { margin: 14, minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 10 },
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
    ...TYPE.heading,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  summary: {
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  summaryLabel: {
    ...TYPE.label,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  summaryStatus: {
    ...TYPE.heading,
    fontSize: 28,
    letterSpacing: 1.2,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    ...TYPE.heading,
    fontSize: 14,
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    textTransform: 'uppercase',
  },
  estimateLine: {
    ...TYPE.body,
    fontSize: 12,
    letterSpacing: 0.3,
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
    ...TYPE.data,
    fontSize: 11,
    letterSpacing: 0.6,
    paddingTop: 16,
  },
  empty: {
    ...TYPE.body,
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
    ...TYPE.heading,
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 2,
  },
  aoDetail: {
    ...TYPE.body,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  aoActions: { flexDirection: 'row', gap: 6 },
  aoBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 2,
  },
  aoBtnText: {
    ...TYPE.label,
    fontSize: 11,
    letterSpacing: 1.2,
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
    ...TYPE.label,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  footnote: {
    ...TYPE.body,
    fontSize: 12,
    letterSpacing: 0.3,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12,
    lineHeight: 17,
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
    ...TYPE.heading,
    fontSize: 14,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  promptHint: {
    ...TYPE.body,
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  promptInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    ...TYPE.body,
    fontSize: 14,
    letterSpacing: 0.3,
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
    ...TYPE.label,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
