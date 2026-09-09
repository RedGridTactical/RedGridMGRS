/**
 * ThemeScreen — display and interaction settings. Display themes + Pro feature toggles.
 * Standard and Tactical display modes are also available in the global switch.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { TYPE } from '../utils/typography';
import { THEMES } from '../hooks/useTheme';
import { useColors } from '../utils/ThemeContext';
import { tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';
import { useExternalGPS, ConnectionState } from '../hooks/useExternalGPS';

export function ThemeScreen({ currentTheme, isPro, onSelectTheme, onShowProGate, shakeToSpeak, setShakeToSpeak, gridCrossing, setGridCrossing, gridScale = 1.0, setGridScale, tacticalSound, setTacticalSound, settingsSaveError, onRetrySettingsSave }) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{t('workflow.settings.title')}</Text>
        <Text style={[styles.sub, { color: colors.text3 }]}>{t('workflow.settings.intro')}</Text>

        {settingsSaveError && <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.themeSub, { color: colors.text, flex: 1 }]} accessibilityRole="alert">{t('workflow.settings.saveFailed')}</Text>
          <TouchableOpacity onPress={onRetrySettingsSave} style={styles.retry} accessibilityRole="button"><Text style={{ ...TYPE.label, color: colors.text }}>{t('workflow.settings.retry')}</Text></TouchableOpacity>
        </View>}
        {Object.values(THEMES).map(theme => {
          const isActive  = currentTheme === theme.id;
          const isLocked  = theme.pro && !isPro;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, isActive && { borderColor: colors.text }, isLocked && styles.cardLocked]}
              onPress={() => {
                if (isLocked) { onShowProGate(t('theme.displayThemes'), 'display'); return; }
                onSelectTheme(theme.id);
              }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive, selected: isActive }}
              accessibilityLabel={`${t(`workflow.settings.${theme.id}Name`)}${isLocked ? ', Pro' : ''}`}
            >
              <View style={[styles.swatch, { backgroundColor: currentTheme === 'red' ? colors.bg : theme.colors.bg, borderColor: currentTheme === 'red' ? colors.text : theme.colors.text }]}>
                <Text style={[styles.swatchText, { color: currentTheme === 'red' ? colors.text : theme.colors.text }]}>MGRS</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: colors.text }]}>{t(`workflow.settings.${theme.id}Name`)}</Text>
                  {isLocked && <Text style={[styles.proBadge, { color: colors.bg, backgroundColor: colors.text }]}>PRO</Text>}
                  {isActive  && <Text style={[styles.activeBadge, { color: colors.text, borderColor: colors.text }]}>{t('theme.active')}</Text>}
                </View>
                <Text style={[styles.themeSub, { color: colors.text3 }]}>{t(`workflow.settings.${theme.id}Sub`)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ─── PRO FEATURE TOGGLES ──────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
        <Text style={[styles.title, { color: colors.text }]}>{t('workflow.settings.interactions')}</Text>
        <Text style={[styles.sub, { color: colors.text3 }]}>{t('workflow.settings.interactionsSub')}</Text>

        <ToggleRow
          label={t('theme.shakeToSpeak')}
          sub={t('workflow.settings.shakeSub')}
          value={isPro && shakeToSpeak}
          onToggle={() => { tapLight(); isPro ? setShakeToSpeak(!shakeToSpeak) : onShowProGate(t('theme.shakeToSpeak'), 'tools'); }}
        />
        <ToggleRow
          label={t('theme.gridCrossingAlerts')}
          sub={t('workflow.settings.crossingSub')}
          value={isPro && gridCrossing}
          onToggle={() => { tapLight(); isPro ? setGridCrossing(!gridCrossing) : onShowProGate(t('theme.gridCrossingAlerts'), 'tools'); }}
        />

        <ToggleRow label={t('workflow.settings.tacticalSound')} sub={t('workflow.settings.tacticalSoundSub')}
          value={isPro && tacticalSound} onToggle={() => isPro ? setTacticalSound(!tacticalSound) : onShowProGate(t('workflow.settings.tacticalSound'), 'tools')} />

        {/* ─── GRID DISPLAY SCALE ─────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
        <Text style={[styles.title, { color: colors.text }]}>{t('settings.gridScale')}</Text>
        <Text style={[styles.sub, { color: colors.text3 }]}>{t('settings.gridScaleSub')}</Text>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.scaleRow}>
            <TouchableOpacity
              style={[styles.scaleBtn, { borderColor: colors.border }]}
              onPress={() => { tapLight(); if (setGridScale) setGridScale(Math.max(0.7, gridScale - 0.1)); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('workflow.settings.decreaseScale')}
            >
              <Text style={[styles.scaleBtnText, { color: colors.text }]}>{'\u2212'}</Text>
            </TouchableOpacity>
            <Text style={[styles.scaleValue, { color: colors.text }]}>{(gridScale || 1.0).toFixed(1)}x</Text>
            <TouchableOpacity
              style={[styles.scaleBtn, { borderColor: colors.border }]}
              onPress={() => { tapLight(); if (setGridScale) setGridScale(Math.min(1.5, gridScale + 0.1)); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('workflow.settings.increaseScale')}
            >
              <Text style={[styles.scaleBtnText, { color: colors.text }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── GPS SOURCE ───────────────────────────────────────────── */}
        <GPSSourceSection isPro={isPro} onShowProGate={onShowProGate} />
      </ScrollView>
    </View>
  );
}

function GPSSourceSection({ isPro, onShowProGate }) {
  const colors = useColors();
  const { t } = useTranslation();
  const {
    connectionState, externalPosition, satellites, accuracy,
    deviceName, discoveredDevices, scan, connect, disconnect,
  } = useExternalGPS();

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isScanning = connectionState === ConnectionState.SCANNING;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <>
      <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
      <Text style={[styles.title, { color: colors.text }]}>{t('settings.gpsSource')}</Text>
      <Text style={[styles.sub, { color: colors.text3 }]}>
        {isConnected
          ? t('settings.gpsExternal', { name: deviceName })
          : t('settings.gpsInternal')}
      </Text>

      {/* Connected status card */}
      {isConnected && (
        <View style={[styles.card, { borderColor: colors.text, backgroundColor: colors.card }]}>
          <View style={[styles.gpsIndicator, { backgroundColor: colors.text }]}>
            <Text style={[styles.gpsIndicatorText, { color: colors.bg }]}>GPS</Text>
          </View>
          <View style={styles.info}>
            <Text style={[styles.label, { color: colors.text }]}>{deviceName}</Text>
            <Text style={[styles.themeSub, { color: colors.text3 }]}>
              {t('settings.gpsConnected')}
              {satellites != null ? ` \u00b7 ${t('settings.gpsSatellites', { count: satellites })}` : ''}
              {accuracy != null ? ` \u00b7 \u00b1${accuracy}m` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Scan / Disconnect buttons */}
      {isConnected ? (
        <TouchableOpacity
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => { tapLight(); disconnect(); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.label, { color: colors.text, textAlign: 'center', flex: 1 }]}>
            {t('settings.gpsDisconnect')}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => { tapLight(); isPro ? scan() : onShowProGate(t('settings.gpsSource'), 'receiver'); }}
          activeOpacity={0.8}
          disabled={isScanning || isConnecting}
        >
          {(isScanning || isConnecting) && (
            <ActivityIndicator size="small" color={colors.text} style={{ marginRight: 10 }} />
          )}
          <Text style={[styles.label, { color: colors.text, textAlign: 'center', flex: 1 }]}>
            {isScanning ? t('settings.gpsScanning') : isConnecting ? t('settings.gpsConnecting') : t('settings.gpsScan')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Discovered devices list */}
      {!isConnected && discoveredDevices.length > 0 && discoveredDevices.map(device => (
        <TouchableOpacity
          key={device.id}
          style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => { tapLight(); isPro ? connect(device.id, device.name) : onShowProGate(t('settings.gpsSource'), 'receiver'); }}
          activeOpacity={0.8}
        >
          <View style={[styles.gpsIndicator, { borderColor: colors.border, borderWidth: 1, backgroundColor: 'transparent' }]}>
            <Text style={[styles.gpsIndicatorText, { color: colors.text }]}>BLE</Text>
          </View>
          <View style={styles.info}>
            <Text style={[styles.label, { color: colors.text }]}>{device.name}</Text>
            <Text style={[styles.themeSub, { color: colors.text3 }]}>
              {device.rssi != null ? `RSSI: ${device.rssi} dBm` : t('workflow.settings.connectReceiver')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* No devices hint */}
      {!isConnected && !isScanning && discoveredDevices.length === 0 && (
        <Text style={[styles.themeSub, { color: colors.text3, marginBottom: 10 }]}>
          {t('settings.gpsNoDevices')}
        </Text>
      )}
    </>
  );
}

function ToggleRow({ label, sub, value, onToggle }) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, value && { borderColor: colors.text }]}
      onPress={onToggle}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${label}. ${sub}`}
    >
      <View style={[styles.toggleIndicator, { borderColor: colors.border }, value && { backgroundColor: colors.text, borderColor: colors.text }]}>
        <Text style={[styles.toggleText, { color: value ? colors.bg : colors.text3 }]}>{value ? t('theme.on') : t('theme.off')}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.themeSub, { color: colors.text3 }]}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { ...TYPE.heading,  fontSize: 16, letterSpacing: 0.8, marginBottom: 4 },
  sub: { ...TYPE.body,  fontSize: 12, letterSpacing: 0.8, marginBottom: 20 },
  divider: { height: 1, marginVertical: 20 },
  retry: { minHeight: 44, padding: 12, justifyContent: 'center' },
  card: {
    minHeight: 48,
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  cardLocked: { opacity: 0.6 },
  swatch: {
    width: 60, height: 44, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  swatchText: { ...TYPE.data,  fontSize: 10, letterSpacing: 0.8 },
  info: { flex: 1 },
  labelRow: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: { ...TYPE.heading,  fontSize: 12, letterSpacing: 0.8 },
  proBadge: { ...TYPE.label,
    fontSize: 10,
    paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 0.8,
  },
  activeBadge: { ...TYPE.label,
    fontSize: 10,
    borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 0.8,
  },
  themeSub: { ...TYPE.body,  fontSize: 12, letterSpacing: 0.8 },
  toggleIndicator: {
    width: 48, height: 28, borderWidth: 1, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  toggleText: { ...TYPE.label,  fontSize: 12, letterSpacing: 0.8 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  scaleBtn: {
    width: 48, height: 48, borderWidth: 1, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnText: { ...TYPE.label,  fontSize: 20, },
  scaleValue: { ...TYPE.data,  fontSize: 16, letterSpacing: 0.8, minWidth: 50, textAlign: 'center' },
  gpsIndicator: {
    width: 48, height: 28, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  gpsIndicatorText: { ...TYPE.label,  fontSize: 12, letterSpacing: 0.8 },
});
