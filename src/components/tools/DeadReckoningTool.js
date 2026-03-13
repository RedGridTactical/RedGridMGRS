import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { deadReckoning } from '../../utils/tactical';
import { toMGRS, formatMGRS } from '../../utils/mgrs';
import { useColors } from '../../utils/ThemeContext';
import { tapLight } from '../../utils/haptics';
import { ToolInput, ToolResult, ToolRow, ToolHint } from './ToolShared';

export function DeadReckoningTool({ location, compassHeading }) {
  const colors = useColors();
  const [heading, setHeading]     = useState('');
  const [distance, setDistance]   = useState('');

  // Use live location as start if no override
  const startLat = location?.lat;
  const startLon = location?.lon;
  const liveMGRS = location ? formatMGRS(toMGRS(startLat, startLon, 5)) : null;

  const hasCompass = compassHeading !== null && compassHeading !== undefined;
  const setFromCompass = () => {
    if (!hasCompass) return;
    tapLight();
    setHeading(Math.round(compassHeading).toString());
  };

  const result = useMemo(() => {
    const h = parseFloat(heading);
    const d = parseFloat(distance);
    if (isNaN(h) || isNaN(d) || d <= 0 || h < 0 || h > 360) return null;
    if (!startLat || !startLon) return null;
    return deadReckoning(startLat, startLon, h, d);
  }, [startLat, startLon, heading, distance]);

  return (
    <View>
      <ToolHint text={liveMGRS ? `CURRENT POSITION: ${liveMGRS}` : 'NO GPS FIX — DR FROM LAST KNOWN'} />

      <View style={styles.headingRow}>
        <View style={styles.headingInput}>
          <ToolInput label="HEADING (°  GRID NORTH)" value={heading} onChangeText={setHeading} placeholder="0 – 360" keyboardType="numeric" />
        </View>
        <TouchableOpacity
          style={[styles.compassBtn, { borderColor: hasCompass ? colors.text2 : colors.border2 }]}
          onPress={setFromCompass}
          disabled={!hasCompass}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={hasCompass ? `Use current compass heading ${Math.round(compassHeading)} degrees` : 'Compass unavailable'}
        >
          <Text style={[styles.compassBtnLabel, { color: hasCompass ? colors.border : colors.text4 }]}>COMPASS</Text>
          <Text style={[styles.compassBtnValue, { color: hasCompass ? colors.text : colors.text4 }]}>
            {hasCompass ? `${Math.round(compassHeading)}°` : '---'}
          </Text>
        </TouchableOpacity>
      </View>

      <ToolInput label="DISTANCE (METRES)" value={distance} onChangeText={setDistance} placeholder="e.g. 850" keyboardType="numeric" />

      {result && (
        <View style={styles.results}>
          <ToolResult label="ESTIMATED POSITION" value={result.mgrsFormatted} primary />
          <ToolRow label="FROM" value={liveMGRS || '---'} />
          <ToolRow label="HEADING" value={`${heading}°`} />
          <ToolRow label="DISTANCE" value={`${distance}m`} />
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
  compassBtnLabel: { fontSize: 7, letterSpacing: 2 },
  compassBtnValue: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
});
