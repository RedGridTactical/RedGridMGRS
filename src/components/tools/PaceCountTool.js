import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { pacesToDistance, distanceToPaces } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';

export function PaceCountTool({ paceCount, setPaceCount }) {
  const colors = useColors();
  const [mode, setMode] = useState('p2d'); // p2d = paces->dist, d2p = dist->paces
  const [paces, setPaces] = useState('');
  const [distance, setDistance] = useState('');
  const [calibInput, setCalibInput] = useState(String(paceCount));

  const distResult = mode === 'p2d' && paces
    ? pacesToDistance(parseFloat(paces), paceCount) : null;
  const paceResult = mode === 'd2p' && distance
    ? distanceToPaces(parseFloat(distance), paceCount) : null;

  const saveCalib = () => {
    const v = parseInt(calibInput, 10);
    if (!isNaN(v) && v > 0) setPaceCount(v);
  };

  return (
    <View>
      {/* Calibration */}
      <Text style={[styles.sectionLabel, { color: colors.border }]}>CALIBRATION (PACES / 100m)</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={calibInput} onChangeText={setCalibInput} placeholder="62" keyboardType="numeric" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.border }]} onPress={saveCalib}>
          <Text style={[styles.saveBtnText, { color: colors.border }]}>SAVE</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`SAVED: ${paceCount} paces/100m  ·  Typical: 62-66`} />

      <ToolDivider />

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='p2d' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('p2d')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='p2d' && { color: colors.text }]}>PACES -> DIST</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='d2p' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('d2p')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='d2p' && { color: colors.text }]}>DIST -> PACES</Text>
        </TouchableOpacity>
      </View>

      {mode === 'p2d' ? (
        <View>
          <ToolInput label="PACES COUNTED" value={paces} onChangeText={setPaces} placeholder="e.g. 310" keyboardType="numeric" />
          {distResult !== null && !isNaN(distResult) && (
            <ToolResult label="DISTANCE" value={`${Math.round(distResult)}m`} primary />
          )}
        </View>
      ) : (
        <View>
          <ToolInput label="DISTANCE (METRES)" value={distance} onChangeText={setDistance} placeholder="e.g. 500" keyboardType="numeric" />
          {paceResult !== null && !isNaN(paceResult) && (
            <ToolResult label="PACES REQUIRED" value={String(paceResult)} primary />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, marginBottom:6 },
  calibRow: { flexDirection:'row', gap:8, alignItems:'flex-end' },
  saveBtn: { borderWidth:1, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  saveBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:2 },
  modeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  modeBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  modeBtnText: { fontFamily:'monospace', fontSize:9, letterSpacing:2 },
});
