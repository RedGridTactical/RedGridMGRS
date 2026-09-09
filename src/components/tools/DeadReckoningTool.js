import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { deadReckoning, compassToGridHeading, formatBearing } from '../../utils/tactical';
import { toMGRS, formatMGRS } from '../../utils/mgrs';
import { useColors } from '../../utils/ThemeContext';
import { tapLight } from '../../utils/haptics';
import { ToolInput, ToolResult, ToolRow, ToolHint } from './ToolShared';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

export function DeadReckoningTool({ location, compassHeading, compassReference }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [heading, setHeading]     = useState('');
  const [distance, setDistance]   = useState('');

  // Use live location as start if no override
  const startLat = location?.lat;
  const startLon = location?.lon;
  const liveMGRS = location ? formatMGRS(toMGRS(startLat, startLon, 5)) : null;

  const compassGridHeading = compassToGridHeading(compassHeading, compassReference, startLat, startLon);
  const hasCompass = compassGridHeading !== null;
  const setFromCompass = () => {
    if (!hasCompass) return;
    tapLight();
    setHeading((Math.round(compassGridHeading) % 360).toString());
  };

  const result = useMemo(() => {
    const h = parseFloat(heading);
    const d = parseFloat(distance);
    if (isNaN(h) || isNaN(d) || d <= 0 || h < 0 || h > 360) return null;
    if (!Number.isFinite(startLat) || !Number.isFinite(startLon)) return null;
    return deadReckoning(startLat, startLon, h, d, 'grid');
  }, [startLat, startLon, heading, distance]);

  return (
    <View>
      <ToolHint text={liveMGRS ? `${t('toolLabels.currentPosition')}: ${liveMGRS}` : t('gps.noFixDR')} />

      <View style={styles.headingRow}>
        <View style={styles.headingInput}>
          <ToolInput label={t('toolLabels.headingGridNorth')} value={heading} onChangeText={setHeading} placeholder="0 – 360" keyboardType="numeric" />
        </View>
        <TouchableOpacity
          style={[styles.compassBtn, { borderColor: hasCompass ? colors.text2 : colors.border2 }]}
          onPress={setFromCompass}
          disabled={!hasCompass}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasCompass }}
          accessibilityLabel={hasCompass
            ? t('toolLabels.useCompassGrid', { heading: Math.round(compassGridHeading) % 360 })
            : t('toolLabels.compassGridUnavailable')}
        >
          <Text style={[styles.compassBtnLabel, { color: colors.text3 }]}>{t('toolLabels.compassGrid')}</Text>
          <Text style={[styles.compassBtnValue, { color: hasCompass ? colors.text : colors.text3 }]}>
            {formatBearing(compassGridHeading, 'grid')}
          </Text>
        </TouchableOpacity>
      </View>

      {!hasCompass && <ToolHint text={t('toolLabels.compassGridUnavailable')} />}

      <ToolInput label={t('toolLabels.distanceMetres')} value={distance} onChangeText={setDistance} placeholder="e.g. 850" keyboardType="numeric" />

      {result && (
        <View style={styles.results}>
          <ToolResult label={t('toolLabels.estimatedPosition')} value={result.mgrsFormatted} primary />
          <ToolRow label={t('toolLabels.from')} value={liveMGRS || '---'} />
          <ToolRow label={t('toolLabels.heading')} value={formatBearing(Number(heading), 'grid')} />
          <ToolRow label={t('toolLabels.distance')} value={`${distance}m`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  results: { marginTop: 12, gap: 8 },
  headingRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  headingInput: { flex: 1 },
  compassBtn: {
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 44, marginBottom: 10,
  },
  compassBtnLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  compassBtnValue: { ...TYPE.data, fontSize: 14, letterSpacing: 0.6 },
});
