import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { backAzimuth, applyDeclination } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow } from './ToolShared';

export function BackAzimuthTool({ declination }) {
  const [bearing, setBearing] = useState('');

  const b = parseFloat(bearing);
  const valid = !isNaN(b) && b >= 0 && b <= 360;
  const back = valid ? backAzimuth(b) : null;
  const backCorrected = valid ? applyDeclination(back, declination) : null;

  return (
    <View>
      <ToolInput label="MAGNETIC BEARING (°)" value={bearing} onChangeText={setBearing} placeholder="0 – 360" keyboardType="numeric" />

      {back !== null && (
        <View style={styles.results}>
          <ToolResult label="BACK AZIMUTH" value={`${Math.round(back)}°`} primary />
          {declination !== 0 && (
            <ToolResult label={`+ ${declination > 0 ? '+' : ''}${declination}° DECLINATION`} value={`${Math.round(backCorrected)}° GRID`} />
          )}
          <ToolRow label="INPUT" value={`${Math.round(b)}°`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  results: { marginTop: 12, gap: 8 },
});
