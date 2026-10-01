import { useSessionDraft } from '../../hooks/useSessionDraft';
import { parseToolNumber } from '../../utils/toolWorkflow';
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { resection, applyDeclination, isBearing } from '../../utils/tactical';
import { parseMGRSToLatLon } from '../../utils/mgrs';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

export function ResectionTool() {
  const colors = useColors();
  const { t } = useTranslation();
  const [pt1MGRS, setPt1MGRS]   = useSessionDraft('tool:resect:pt1MGRS', '');
  const [bearing1, setBearing1] = useSessionDraft('tool:resect:bearing1', '');
  const [pt2MGRS, setPt2MGRS]   = useSessionDraft('tool:resect:pt2MGRS', '');
  const [bearing2, setBearing2] = useSessionDraft('tool:resect:bearing2', '');
  const [reference, setReference] = useSessionDraft('tool:resect:reference', 'true');
  const [declinationInput, setDeclinationInput] = useSessionDraft('tool:resect:declinationInput', '');

  const result = useMemo(() => {
    try {
      let b1 = parseToolNumber(bearing1, { min: 0, max: 360 });
      let b2 = parseToolNumber(bearing2, { min: 0, max: 360 });
      if (b1 === null || b2 === null || !isBearing(b1) || !isBearing(b2)) return null;
      if (reference === 'magnetic') {
        const declination = parseToolNumber(declinationInput, { min: -180, max: 180 });
        if (declination === null) return null;
        b1 = applyDeclination(b1, declination);
        b2 = applyDeclination(b2, declination);
        if (b1 === null || b2 === null) return null;
      }
      const p1 = parseMGRSToLatLon(pt1MGRS), p2 = parseMGRSToLatLon(pt2MGRS);
      if (!p1||!p2) return null;
      return resection(p1.lat, p1.lon, b1, p2.lat, p2.lon, b2);
    } catch {
      return null;
    }
  }, [pt1MGRS, bearing1, pt2MGRS, bearing2, reference, declinationInput]);

  return (
    <View>
      <ToolHint text={t('navigation.resectionInputs', { defaultValue: 'Bearings are from your position to each landmark. Select true (T) or magnetic (M) north.' })} />
      <View style={styles.referenceRow}>
        {['true', 'magnetic'].map(value => (
          <TouchableOpacity key={value} onPress={() => setReference(value)} accessibilityRole="radio" accessibilityState={{ checked: reference === value }} accessibilityLabel={t(value === 'true' ? 'toolLabels.trueBearingResult' : 'toolLabels.magneticBearingResult')} style={[styles.referenceButton, { borderColor: reference === value ? colors.text : colors.border2 }]}>
            <Text style={[styles.referenceText, { color: reference === value ? colors.text : colors.text3 }]}>{value === 'true' ? '°T' : '°M'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {reference === 'magnetic' && <>
        <ToolHint text={t('navigation.resectionDeclination', { defaultValue: 'For magnetic bearings, enter known local declination (east +, west −). Enter 0 only if confirmed.' })} />
        <ToolInput label={t('toolLabels.localDeclination')} value={declinationInput} onChangeText={setDeclinationInput} placeholder="+5 / -12 / 0" keyboardType="numbers-and-punctuation" />
      </>}
      <ToolDivider />
      <Text style={[styles.ptLabel, { color: colors.text3 }]}>{t('toolLabels.point1')}</Text>
      <ToolInput label={t('toolLabels.knownPoint1')} value={pt1MGRS} onChangeText={setPt1MGRS} placeholder="18S UJ 12345 67890" />
      <ToolInput label={`${t('toolLabels.bearingToPt1')} ${reference === 'true' ? 'T' : 'M'}`} value={bearing1} onChangeText={setBearing1} placeholder="0 – 360" keyboardType="numeric" />
      <ToolDivider />
      <Text style={[styles.ptLabel, { color: colors.text3 }]}>{t('toolLabels.point2')}</Text>
      <ToolInput label={t('toolLabels.knownPoint2')} value={pt2MGRS} onChangeText={setPt2MGRS} placeholder="18S UJ 98765 43210" />
      <ToolInput label={`${t('toolLabels.bearingToPt2')} ${reference === 'true' ? 'T' : 'M'}`} value={bearing2} onChangeText={setBearing2} placeholder="0 – 360" keyboardType="numeric" />

      {result && (
        <View style={styles.results}>
          <ToolResult label={t('toolLabels.yourPosition')} value={result.mgrsFormatted} primary />
        </View>
      )}
      {!result && pt1MGRS && bearing1 && pt2MGRS && bearing2 && (
        <ToolHint text={t('navigation.resectionInvalid', { defaultValue: 'No reliable local solution. Check coordinates, bearing direction, north reference and separation.' })} />
      )}
      <ToolHint text={t('navigation.resectionLimits', { defaultValue: 'Local estimate only: each landmark must be within 100 km; bearing separation must be 5°–175°. Compass and map errors affect the result.' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  referenceRow: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  referenceButton: { flex: 1, borderWidth: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  referenceText: { ...TYPE.data, fontSize: 15 },
  ptLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginBottom:6, marginTop:4 },
  results: { marginTop:12, gap:8 },
});
