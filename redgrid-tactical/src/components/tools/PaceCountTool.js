import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { pacesToDistance, distanceToPaces } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';

const RED = '#CC0000', RED3 = '#660000';

export function PaceCountTool({ paceCount, setPaceCount }) {
  const [mode, setMode] = useState('p2d'); // p2d = paces→dist, d2p = dist→paces
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
      <Text style={styles.sectionLabel}>CALIBRATION (PACES / 100m)</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={calibInput} onChangeText={setCalibInput} placeholder="62" keyboardType="numeric" />
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={saveCalib}>
          <Text style={styles.saveBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`SAVED: ${paceCount} paces/100m  ·  Typical: 62–66`} />

      <ToolDivider />

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode==='p2d' && styles.modeBtnActive]} onPress={() => setMode('p2d')}>
          <Text style={[styles.modeBtnText, mode==='p2d' && styles.modeBtnTextActive]}>PACES → DIST</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode==='d2p' && styles.modeBtnActive]} onPress={() => setMode('d2p')}>
          <Text style={[styles.modeBtnText, mode==='d2p' && styles.modeBtnTextActive]}>DIST → PACES</Text>
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

const RED2 = '#990000', RED4 = '#330000', RED5 = '#1A0000';
const styles = StyleSheet.create({
  sectionLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, color:RED3, marginBottom:6 },
  calibRow: { flexDirection:'row', gap:8, alignItems:'flex-end' },
  saveBtn: { borderWidth:1, borderColor:RED3, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  saveBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:2, color:RED3 },
  modeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  modeBtn: { flex:1, borderWidth:1, borderColor:RED4, paddingVertical:9, alignItems:'center' },
  modeBtnActive: { borderColor:RED2, backgroundColor:RED5 },
  modeBtnText: { fontFamily:'monospace', fontSize:9, letterSpacing:2, color:RED4 },
  modeBtnTextActive: { color:RED },
});
