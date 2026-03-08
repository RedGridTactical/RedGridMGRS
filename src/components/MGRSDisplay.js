import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../utils/ThemeContext';

/**
 * MGRSDisplay — Current position in MGRS.
 * compact=true: tighter layout for landscape mode (smaller fonts, less padding).
 * All Text elements use maxFontSizeMultiplier={1.0} — precision tactical data must never scale.
 */
const FORMAT_LABELS = { mgrs: 'GRID', utm: 'UTM', dd: 'DECIMAL DEG', dms: 'DEG MIN SEC' };

export const MGRSDisplay = React.memo(function MGRSDisplay({ mgrs, accuracy, altitude, compact = false, coordFormat = 'mgrs', altDisplay }) {
  const colors = useColors();
  const label = FORMAT_LABELS[coordFormat] || 'GRID';

  // If non-MGRS format is selected and altDisplay is provided, render alt format
  if (coordFormat !== 'mgrs' && altDisplay) {
    const accLabel = `${label}: ${altDisplay.replace(/\n/g, ', ')}` +
      (accuracy != null ? `, accuracy plus or minus ${accuracy} meters` : '') +
      (altitude != null ? `, altitude ${altitude} meters` : '');

    if (compact) {
      return (
        <View style={styles.containerCompact} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
          <Text style={[styles.labelCompact, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{label}</Text>
          <Text style={[styles.altValueCompact, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{altDisplay}</Text>
          <View style={styles.meta}>
            {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>±{accuracy}m</Text>}
            {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>ALT {altitude}m</Text>}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
        <Text style={[styles.label, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{label}</Text>
        <Text style={[styles.altValue, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{altDisplay}</Text>
        <View style={styles.meta}>
          {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>±{accuracy}m</Text>}
          {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>ALT {altitude}m</Text>}
        </View>
      </View>
    );
  }

  // MGRS format (default)
  if (!mgrs || typeof mgrs !== 'string' || mgrs.trim().split(/\s+/).length < 3) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]} accessibilityRole="text" accessibilityLabel="MGRS grid: no fix">
        <Text style={[styles.gzd, { color: colors.text2 }]} maxFontSizeMultiplier={1.0}>---</Text>
      </View>
    );
  }

  const parts = mgrs.split(' ');
  const gzd = parts[0] || '';
  const sq  = parts[1] || '';
  const en  = parts.slice(2).join(' ');

  const accLabel = `MGRS grid: ${gzd} ${sq} ${en}` +
    (accuracy != null ? `, accuracy plus or minus ${accuracy} meters` : '') +
    (altitude != null ? `, altitude ${altitude} meters` : '');

  if (compact) {
    return (
      <View style={styles.containerCompact} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
        <Text style={[styles.labelCompact, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>GRID</Text>
        <View style={styles.compactRow}>
          <Text style={[styles.gzdCompact, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{gzd}</Text>
          <Text style={[styles.squareCompact, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{sq}</Text>
        </View>
        <Text style={[styles.eastingCompact, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{en}</Text>
        <View style={styles.meta}>
          {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>±{accuracy}m</Text>}
          {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>ALT {altitude}m</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
      <Text style={[styles.label, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>GRID</Text>
      <View style={styles.coordBlock}>
        <Text style={[styles.gzd, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{gzd}</Text>
        <Text style={[styles.square, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{sq}</Text>
        <Text style={[styles.easting, { color: colors.text }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>{en}</Text>
      </View>
      <View style={styles.meta}>
        {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>±{accuracy}m</Text>}
        {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={1.0}>ALT {altitude}m</Text>}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // ── Portrait ──
  container: { alignItems: 'center', paddingVertical: 16 },
  label: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 6, marginBottom: 8 },
  coordBlock: { alignItems: 'center', gap: 2 },
  gzd:     { fontFamily: 'monospace', fontSize: 22, letterSpacing: 3, fontWeight: '600' },
  square:  { fontFamily: 'monospace', fontSize: 36, letterSpacing: 6, fontWeight: '700' },
  easting: { fontFamily: 'monospace', fontSize: 32, letterSpacing: 8, fontWeight: '600' },

  // ── Alt format (non-MGRS) ──
  altValue: { fontFamily: 'monospace', fontSize: 26, letterSpacing: 4, fontWeight: '700', textAlign: 'center', lineHeight: 36 },
  altValueCompact: { fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, fontWeight: '700', lineHeight: 26 },

  // ── Compact / Landscape ──
  containerCompact: { paddingVertical: 8 },
  labelCompact: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 5, marginBottom: 4 },
  compactRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  gzdCompact:    { fontFamily: 'monospace', fontSize: 16, letterSpacing: 2, fontWeight: '600' },
  squareCompact: { fontFamily: 'monospace', fontSize: 26, letterSpacing: 4, fontWeight: '700' },
  eastingCompact:{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 5, fontWeight: '600', marginTop: 2 },

  // ── Shared ──
  meta: { flexDirection: 'row', gap: 16, marginTop: 6, opacity: 0.7 },
  metaText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
});
