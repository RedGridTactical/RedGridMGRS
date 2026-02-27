import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../utils/ThemeContext';

/**
 * MGRSDisplay — Current position in MGRS.
 * compact=true: tighter layout for landscape mode (smaller fonts, less padding).
 */
export const MGRSDisplay = React.memo(function MGRSDisplay({ mgrs, accuracy, altitude, compact = false }) {
  const colors = useColors();

  if (!mgrs || typeof mgrs !== 'string' || mgrs.trim().split(/\s+/).length < 3) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]} accessibilityRole="text" accessibilityLabel="MGRS grid: no fix">
        <Text style={[styles.gzd, { color: colors.text2 }]}>---</Text>
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
    // Landscape: horizontal layout, smaller text
    return (
      <View style={styles.containerCompact} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
        <Text style={[styles.labelCompact, { color: colors.text2 }]} importantForAccessibility="no">GRID</Text>
        <View style={styles.compactRow}>
          <Text style={[styles.gzdCompact, { color: colors.text2 }]} importantForAccessibility="no">{gzd}</Text>
          <Text style={[styles.squareCompact, { color: colors.text }]} importantForAccessibility="no">{sq}</Text>
        </View>
        <Text style={[styles.eastingCompact, { color: colors.text }]} importantForAccessibility="no">{en}</Text>
        <View style={styles.meta}>
          {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no">±{accuracy}m</Text>}
          {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no">ALT {altitude}m</Text>}
        </View>
      </View>
    );
  }

  // Portrait: vertical, large
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={accLabel} accessibilityLiveRegion="polite">
      <Text style={[styles.label, { color: colors.text2 }]} importantForAccessibility="no">GRID</Text>
      <View style={styles.coordBlock}>
        <Text style={[styles.gzd, { color: colors.text2 }]} importantForAccessibility="no">{gzd}</Text>
        <Text style={[styles.square, { color: colors.text }]} importantForAccessibility="no">{sq}</Text>
        <Text style={[styles.easting, { color: colors.text }]} importantForAccessibility="no">{en}</Text>
      </View>
      <View style={styles.meta}>
        {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no">±{accuracy}m</Text>}
        {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no">ALT {altitude}m</Text>}
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
