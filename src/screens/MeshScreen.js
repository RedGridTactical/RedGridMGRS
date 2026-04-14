/**
 * MeshScreen — Meshtastic mesh radio integration (Pro feature).
 * Scan, connect, share position, view other nodes on the mesh.
 */
import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { tapLight, tapMedium } from '../utils/haptics';
import { CONNECTION_STATES } from '../utils/meshtastic';
import { toMGRS, formatMGRS, calculateBearing, calculateDistance, formatDistance } from '../utils/mgrs';

function timeSince(ts) {
  if (!ts) return '--';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function MeshScreen({
  location,
  connectionState,
  nearbyDevices,
  connectedDevice,
  meshPositions,
  autoShare,
  scanError,
  onScan,
  onConnect,
  onDisconnect,
  onToggleAutoShare,
}) {
  const colors = useColors();
  const { t } = useTranslation();

  const isScanning = connectionState === CONNECTION_STATES.SCANNING;
  const isConnecting = connectionState === CONNECTION_STATES.CONNECTING;
  const isConnected = connectionState === CONNECTION_STATES.CONNECTED;

  // Compute MGRS, bearing, distance for each mesh node
  const enrichedPositions = useMemo(() => {
    return meshPositions.map(pos => {
      let mgrs = null;
      let bearing = null;
      let distance = null;
      try { mgrs = formatMGRS(toMGRS(pos.lat, pos.lon, 5)); } catch {}
      if (location) {
        try { bearing = calculateBearing(location.lat, location.lon, pos.lat, pos.lon); } catch {}
        try { distance = calculateDistance(location.lat, location.lon, pos.lat, pos.lon); } catch {}
      }
      return { ...pos, mgrs, bearing, distance };
    });
  }, [meshPositions, location]);

  const statusColor = isConnected ? colors.text : isConnecting || isScanning ? colors.text2 : colors.border;
  const statusLabel = isConnected
    ? t('mesh.connected')
    : isConnecting
      ? t('mesh.connecting')
      : isScanning
        ? t('mesh.scanning')
        : t('mesh.disconnected');

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('mesh.title')}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: colors.border }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Connected device info */}
      {isConnected && connectedDevice && (
        <View style={[styles.card, { borderColor: colors.text2, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{connectedDevice.name}</Text>
          <Text style={[styles.cardSub, { color: colors.text3 }]}>{t('mesh.connectedTo')}</Text>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.border }]}
            onPress={() => { tapMedium(); onDisconnect(); }}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.disconnect')}
          >
            <Text style={[styles.btnText, { color: colors.text2 }]}>{t('mesh.disconnect')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-share toggle */}
      {isConnected && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{t('mesh.autoShare')}</Text>
              <Text style={[styles.cardSub, { color: colors.text3 }]}>{t('mesh.autoShareSub')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, { borderColor: autoShare ? colors.text : colors.border, backgroundColor: autoShare ? colors.border2 : 'transparent' }]}
              onPress={() => { tapLight(); onToggleAutoShare(); }}
              accessibilityRole="switch"
              accessibilityState={{ checked: autoShare }}
              accessibilityLabel={t('mesh.autoShare')}
            >
              <Text style={[styles.toggleText, { color: autoShare ? colors.text : colors.border }]}>
                {autoShare ? t('mesh.on') : t('mesh.off')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Scan section */}
      {!isConnected && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.scanBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]}
            onPress={() => { tapMedium(); onScan(); }}
            disabled={isScanning}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.scan')}
          >
            {isScanning ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={[styles.scanBtnText, { color: colors.text }]}>{t('mesh.scan')}</Text>
            )}
          </TouchableOpacity>

          {scanError && (
            <Text style={[styles.errorText, { color: colors.text2 }]}>{scanError}</Text>
          )}

          {/* Discovered devices */}
          {nearbyDevices.length > 0 && (
            <View style={styles.deviceList}>
              <Text style={[styles.sectionLabel, { color: colors.text3 }]}>{t('mesh.nearbyDevices')}</Text>
              {nearbyDevices.map(device => (
                <TouchableOpacity
                  key={device.id}
                  style={[styles.deviceRow, { borderColor: colors.border }]}
                  onPress={() => { tapMedium(); onConnect(device.id); }}
                  disabled={isConnecting}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('mesh.connectTo')} ${device.name}`}
                >
                  <View>
                    <Text style={[styles.deviceName, { color: colors.text }]}>{device.name}</Text>
                    <Text style={[styles.deviceRssi, { color: colors.text3 }]}>RSSI: {device.rssi} dBm</Text>
                  </View>
                  <Text style={[styles.connectLabel, { color: colors.text2 }]}>{t('mesh.connect')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {nearbyDevices.length === 0 && !isScanning && (
            <Text style={[styles.hint, { color: colors.text4 }]}>{t('mesh.scanHint')}</Text>
          )}
        </View>
      )}

      {/* Mesh nodes */}
      {enrichedPositions.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text3 }]}>{t('mesh.meshNodes')}</Text>
          {enrichedPositions.map((pos, idx) => (
            <View key={`${pos.nodeId}-${idx}`} style={[styles.nodeCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.nodeHeader}>
                <Text style={[styles.nodeId, { color: colors.text2 }]}>
                  {t('mesh.node')} {pos.nodeId ? `#${pos.nodeId.toString(16).toUpperCase()}` : `#${idx + 1}`}
                </Text>
                <Text style={[styles.nodeTime, { color: colors.text4 }]}>{timeSince(pos.timestamp)} {t('mesh.ago')}</Text>
              </View>
              {pos.mgrs && (
                <Text style={[styles.nodeMgrs, { color: colors.text }]}>{pos.mgrs}</Text>
              )}
              <View style={styles.nodeMetrics}>
                {pos.bearing !== null && (
                  <Text style={[styles.nodeMetric, { color: colors.text3 }]}>BRG {Math.round(pos.bearing)}°</Text>
                )}
                {pos.distance !== null && (
                  <Text style={[styles.nodeMetric, { color: colors.text3 }]}>DST {formatDistance(pos.distance)}</Text>
                )}
                {pos.altitude != null && pos.altitude !== 0 && !Number.isNaN(pos.altitude) && (
                  <Text style={[styles.nodeMetric, { color: colors.text3 }]}>ALT {Math.round(pos.altitude)}m</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.text4 }]}>{t('mesh.footer')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: 4 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 9, letterSpacing: 3 },

  card: { borderWidth: 1, marginBottom: 8, padding: 14 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  cardSub: { fontSize: 9, letterSpacing: 2, marginTop: 2 },

  btn: { borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9, alignItems: 'center', marginTop: 10, minHeight: 44 },
  btnText: { fontSize: 10, letterSpacing: 3, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleBtn: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  toggleText: { fontSize: 10, letterSpacing: 3, fontWeight: '700' },

  scanBtn: { borderWidth: 1, paddingVertical: 13, alignItems: 'center', minHeight: 44 },
  scanBtnText: { fontSize: 12, letterSpacing: 3, fontWeight: '700' },

  errorText: { fontSize: 10, letterSpacing: 1, marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 10, letterSpacing: 2, marginTop: 12, textAlign: 'center' },

  deviceList: { marginTop: 12, gap: 6 },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, padding: 12 },
  deviceName: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  deviceRssi: { fontSize: 9, letterSpacing: 1, marginTop: 2 },
  connectLabel: { fontSize: 10, letterSpacing: 3, fontWeight: '700' },

  sectionLabel: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 4, fontWeight: '700', marginBottom: 8 },
  section: { marginTop: 8 },

  nodeCard: { borderWidth: 1, marginBottom: 6, padding: 12 },
  nodeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nodeId: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  nodeTime: { fontSize: 9, letterSpacing: 1 },
  nodeMgrs: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 3, fontWeight: '700', marginBottom: 4 },
  nodeMetrics: { flexDirection: 'row', gap: 12 },
  nodeMetric: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },

  footer: { paddingTop: 24, alignItems: 'center' },
  footerText: { fontSize: 10, letterSpacing: 2 },
});
