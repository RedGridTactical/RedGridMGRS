import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';
import { useColors } from '../utils/ThemeContext';

/**
 * MGRSDisplay — Current position in MGRS.
 * compact=true: tighter layout for landscape mode (smaller fonts, less padding).
 * Large accessibility text splits easting/northing while keeping digits left to right.
 */
const FORMAT_LABEL_KEYS = { mgrs: 'tabs.grid', utm: 'coords.utm', dd: 'coords.dd', dms: 'coords.dms' };

// Android does not implement Text's writingDirection style. Keep coordinate
// groups in their canonical order inside RTL paragraphs, including each line
// of the large-text layout. These isolates belong only to rendered text, never
// to the stored, shared, exported or spoken coordinate value.
const coordinateText = value => value.split('\n').map(line => `\u2066${line}\u2069`).join('\n');

export const MGRSDisplay = React.memo(function MGRSDisplay({ mgrs, accuracy, altitude, compact = false, coordFormat = 'mgrs', altDisplay, gridScale = 1.0 }) {
  const colors = useColors();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.2;
  const label = t(FORMAT_LABEL_KEYS[coordFormat] || 'tabs.grid');
  const s = gridScale;
  const accuracyDescription = accuracy != null
    ? `, ${t('localeAccess.accuracyMeters', { accuracy, defaultValue: 'accuracy plus or minus {{accuracy}} meters' })}` : '';
  const altitudeDescription = altitude != null
    ? `, ${t('localeAccess.altitudeMeters', { altitude, defaultValue: 'altitude {{altitude}} meters' })}` : '';

  // If non-MGRS format is selected and altDisplay is provided, render alt format
  if (coordFormat !== 'mgrs' && altDisplay) {
    const accLabel = `${label}: ${altDisplay.replace(/\n/g, ', ')}` + accuracyDescription + altitudeDescription;

    if (compact) {
      return (
        <View style={styles.containerCompact} accessibilityRole="text" accessibilityLabel={accLabel} >
          <Text style={[styles.labelCompact, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{label}</Text>
          <Text style={[styles.altValueCompact, { color: colors.text, fontSize: 18 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{coordinateText(altDisplay)}</Text>
          <View style={styles.meta}>
            {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>±{accuracy}m</Text>}
            {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>ALT {altitude}m</Text>}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container} accessibilityRole="text" accessibilityLabel={accLabel} >
        <Text style={[styles.label, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{label}</Text>
        <Text style={[styles.altValue, { color: colors.text, fontSize: 26 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{coordinateText(altDisplay)}</Text>
        <View style={styles.meta}>
          {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>±{accuracy}m</Text>}
          {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>ALT {altitude}m</Text>}
        </View>
      </View>
    );
  }

  // MGRS format (default)
  if (!mgrs || typeof mgrs !== 'string' || mgrs.trim().split(/\s+/).length < 3) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]} accessibilityRole="text" accessibilityLabel={t('gps.noSignal')}>
        <Text style={[styles.gzd, { color: colors.text2 }]} maxFontSizeMultiplier={2}>---</Text>
      </View>
    );
  }

  const parts = mgrs.split(' ');
  const gzd = parts[0] || '';
  const sq  = parts[1] || '';
  const en = parts.slice(2).join(largeText ? '\n' : ' ');

  const accLabel = t('localeAccess.mgrsPosition', { value: `${gzd} ${sq} ${en}`, defaultValue: 'MGRS grid: {{value}}' })
    + accuracyDescription + altitudeDescription;

  if (compact) {
    return (
      <View style={styles.containerCompact} accessibilityRole="text" accessibilityLabel={accLabel} >
        <Text style={[styles.labelCompact, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{label}</Text>
        <Text style={[styles.compactRow, { fontSize: 16 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>
          {'\u2066'}
          <Text style={[styles.gzdCompact, { color: colors.text2, fontSize: 16 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{gzd}</Text>
          {'\u00a0'}
          <Text style={[styles.squareCompact, { color: colors.text, fontSize: 26 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{sq}</Text>
          {'\u2069'}
        </Text>
        <Text numberOfLines={largeText ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.eastingCompact, { color: colors.text, fontSize: 22 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{coordinateText(en)}</Text>
        <View style={styles.meta}>
          {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>±{accuracy}m</Text>}
          {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>ALT {altitude}m</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel={accLabel} >
      <Text style={[styles.label, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{label}</Text>
      <View style={styles.coordBlock}>
        <Text style={[styles.gzd, { color: colors.text2, fontSize: 22 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{gzd}</Text>
        <Text style={[styles.square, { color: colors.text, fontSize: 36 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{sq}</Text>
        <Text numberOfLines={largeText ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.easting, { color: colors.text, fontSize: 32 * s }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>{coordinateText(en)}</Text>
      </View>
      <View style={styles.meta}>
        {accuracy != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>±{accuracy}m</Text>}
        {altitude  != null && <Text style={[styles.metaText, { color: colors.text2 }]} importantForAccessibility="no" maxFontSizeMultiplier={2}>ALT {altitude}m</Text>}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // ── Portrait ──
  container: { width: '100%', alignItems: 'center', paddingVertical: 16 },
  label: { ...TYPE.label, fontSize: 12, letterSpacing: 1.2, marginBottom: 8 },
  coordBlock: { width: '100%', alignItems: 'center', gap: 2 },
  gzd: { ...TYPE.data, fontSize: 22, letterSpacing: 1.2, },
  square: { ...TYPE.data, fontSize: 36, letterSpacing: 1.2, },
  easting: { ...TYPE.data, fontSize: 32, letterSpacing: 1.2, },

  // ── Alt format (non-MGRS) ──
  altValue: { ...TYPE.data, fontSize: 26, letterSpacing: 1.2, textAlign: 'center' },
  altValueCompact: { ...TYPE.data, fontSize: 18, letterSpacing: 1.2 },

  // ── Compact / Landscape ──
  containerCompact: { paddingVertical: 8 },
  labelCompact: { ...TYPE.label, fontSize: 12, letterSpacing: 1.2, marginBottom: 4 },
  // One text run keeps zone then square together in RTL layouts on both platforms.
  compactRow: { ...TYPE.data, fontSize: 16, letterSpacing: 1.2 },
  gzdCompact: { ...TYPE.data, fontSize: 16, letterSpacing: 1.2, },
  squareCompact: { ...TYPE.data, fontSize: 26, letterSpacing: 1.2, },
  eastingCompact: { ...TYPE.data, fontSize: 22, letterSpacing: 1.2, marginTop: 2 },

  // ── Shared ──
  meta: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  metaText: { ...TYPE.data, fontSize: 12, letterSpacing: 1.2 },
});
