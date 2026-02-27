import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { resection } from '../../utils/tactical';
import { parseMGRSToLatLon } from '../../utils/mgrs';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';

export function ResectionTool() {
  const colors = useColors();
  const [pt1MGRS, setPt1MGRS]   = useState('');
  const [bearing1, setBearing1] = useState('');
  const [pt2MGRS, setPt2MGRS]   = useState('');
  const [bearing2, setBearing2] = useState('');

  const result = useMemo(() => {
    const b1 = parseFloat(bearing1), b2 = parseFloat(bearing2);
    if (isNaN(b1)||isNaN(b2)) return null;
    const p1 = parseMGRSToLatLon(pt1MGRS), p2 = parseMGRSToLatLon(pt2MGRS);
    if (!p1||!p2) return null;
    return resection(p1.lat, p1.lon, b1, p2.lat, p2.lon, b2);
  }, [pt1MGRS, bearing1, pt2MGRS, bearing2]);

  return (
    <View>
      <ToolHint text={'Identify two terrain features on your map.\nTake a compass bearing to each.\nEnter their MGRS and your bearing — app computes your position.'} />
      <ToolDivider />
      <Text style={[styles.ptLabel, { color: colors.border }]}>POINT 1</Text>
      <ToolInput label="KNOWN POINT 1 — MGRS" value={pt1MGRS} onChangeText={setPt1MGRS} placeholder="18S UJ 12345 67890" />
      <ToolInput label="YOUR BEARING TO PT 1 (°)" value={bearing1} onChangeText={setBearing1} placeholder="0 – 360" keyboardType="numeric" />
      <ToolDivider />
      <Text style={[styles.ptLabel, { color: colors.border }]}>POINT 2</Text>
      <ToolInput label="KNOWN POINT 2 — MGRS" value={pt2MGRS} onChangeText={setPt2MGRS} placeholder="18S UJ 98765 43210" />
      <ToolInput label="YOUR BEARING TO PT 2 (°)" value={bearing2} onChangeText={setBearing2} placeholder="0 – 360" keyboardType="numeric" />

      {result && (
        <View style={styles.results}>
          <ToolResult label="YOUR POSITION" value={result.mgrsFormatted} primary />
        </View>
      )}
      {!result && pt1MGRS && bearing1 && pt2MGRS && bearing2 && (
        <ToolHint text="COULD NOT SOLVE — CHECK INPUTS. BEARINGS MAY BE PARALLEL." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ptLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:4, marginBottom:6, marginTop:4 },
  results: { marginTop:12, gap:8 },
});
