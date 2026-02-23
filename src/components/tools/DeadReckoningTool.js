import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { deadReckoning } from '../../utils/tactical';
import { toMGRS, formatMGRS } from '../../utils/mgrs';
import { ToolInput, ToolResult, ToolRow, ToolHint } from './ToolShared';

export function DeadReckoningTool({ location }) {
  const [startMGRS, setStartMGRS] = useState('');
  const [heading, setHeading]     = useState('');
  const [distance, setDistance]   = useState('');

  // Use live location as start if no override
  const startLat = location?.lat;
  const startLon = location?.lon;
  const liveMGRS = location ? formatMGRS(toMGRS(startLat, startLon, 5)) : null;

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

      <ToolInput label="HEADING (°  GRID NORTH)" value={heading} onChangeText={setHeading} placeholder="0 – 360" keyboardType="numeric" />
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

const styles = StyleSheet.create({ results: { marginTop: 12, gap: 8 } });
