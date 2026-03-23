/**
 * ThemeScreen — Pro settings. Display themes + Pro feature toggles.
 * Free users see the selector but are gated to the red theme.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { THEMES } from '../hooks/useTheme';
import { useColors } from '../utils/ThemeContext';
import { tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

export function ThemeScreen({ currentTheme, isPro, onSelectTheme, onShowProGate, shakeToSpeak, setShakeToSpeak, gridCrossing, setGridCrossing }) {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{t('theme.displayThemes')}</Text>
        <Text style={[styles.sub, { color: colors.text3 }]}>{t('theme.chooseScheme')}</Text>

        {Object.values(THEMES).map(theme => {
          const isActive  = currentTheme === theme.id;
          const isLocked  = theme.pro && !isPro;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, isActive && { borderColor: colors.text }, isLocked && styles.cardLocked]}
              onPress={() => {
                if (isLocked) { onShowProGate('Display Themes'); return; }
                onSelectTheme(theme.id);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.swatch, { backgroundColor: theme.colors.bg, borderColor: theme.colors.text }]}>
                <Text style={[styles.swatchText, { color: theme.colors.text }]}>MGRS</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: colors.text }]}>{theme.label}</Text>
                  {isLocked && <Text style={[styles.proBadge, { color: colors.bg, backgroundColor: colors.text }]}>PRO</Text>}
                  {isActive  && <Text style={[styles.activeBadge, { color: colors.text, borderColor: colors.text }]}>{t('theme.active')}</Text>}
                </View>
                <Text style={[styles.themeSub, { color: colors.text3 }]}>{theme.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ─── PRO FEATURE TOGGLES ──────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
        <Text style={[styles.title, { color: colors.text }]}>{t('theme.proFeatures')}</Text>
        <Text style={[styles.sub, { color: colors.text3 }]}>{t('theme.configureHaptic')}</Text>

        <ToggleRow
          label={t('theme.shakeToSpeak')}
          sub={t('theme.shakeToSpeakSub')}
          value={shakeToSpeak}
          onToggle={() => { tapLight(); setShakeToSpeak(!shakeToSpeak); }}
        />
        <ToggleRow
          label={t('theme.gridCrossingAlerts')}
          sub={t('theme.gridCrossingAlertsSub')}
          value={gridCrossing}
          onToggle={() => { tapLight(); setGridCrossing(!gridCrossing); }}
        />
      </ScrollView>
    </View>
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
        <Text style={[styles.toggleText, { color: value ? colors.bg : colors.border }]}>{value ? t('theme.on') : t('theme.off')}</Text>
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
  title: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 4, marginBottom: 4 },
  sub: { fontSize: 9, letterSpacing: 1, marginBottom: 20 },
  divider: { height: 1, marginVertical: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  cardLocked: { opacity: 0.6 },
  swatch: {
    width: 60, height: 44, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  swatchText: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  info: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  proBadge: {
    fontFamily: 'monospace', fontSize: 8,
    paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  activeBadge: {
    fontFamily: 'monospace', fontSize: 8,
    borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  themeSub: { fontSize: 9, letterSpacing: 0.5 },
  toggleIndicator: {
    width: 48, height: 28, borderWidth: 1, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  toggleText: { fontFamily: 'monospace', fontSize: 9, fontWeight: '700', letterSpacing: 2 },
});
