import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { applyDeclination, removeDeclination } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';

const RED = '#CC0000', RED2 = '#990000', RED3 = '#660000', RED4 = '#330000', RED5 = '#1A0000';

export function DeclinationTool({ declination, setDeclination }) {
  const [decInput, setDecInput]   = useState(String(declination));
  const [bearing, setBearing]     = useState('');
  const [mode, setMode]           = useState('mag2grid'); // mag2grid | grid2mag

  const saveDec = () => {
    const v = parseFloat(decInput);
    if (!isNaN(v)) setDeclination(v);
  };

  const b = parseFloat(bearing);
  const valid = !isNaN(b) && b >= 0 && b <= 360;
  const converted = valid
    ? (mode === 'mag2grid' ? applyDeclination(b, declination) : removeDeclination(b, declination))
    : null;

  const dir = declination > 0 ? 'EAST' : declination < 0 ? 'WEST' : 'NONE';

  return (
    <View>
      <Text style={styles.sectionLabel}>LOCAL DECLINATION (SAVED)</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={decInput} onChangeText={setDecInput} placeholder="+5 or -12" keyboardType="numbers-and-punctuation" />
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={saveDec}>
          <Text style={styles.saveBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`SAVED: ${declination > 0 ? '+' : ''}${declination}° (${dir})  ·  + = EAST, − = WEST\nApplied automatically to wayfinder bearing.`} />

      <ToolDivider />
      <Text style={styles.sectionLabel}>BEARING CONVERTER</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode==='mag2grid' && styles.modeBtnActive]} onPress={() => setMode('mag2grid')}>
          <Text style={[styles.modeBtnText, mode==='mag2grid' && styles.modeBtnTextActive]}>MAG → GRID</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode==='grid2mag' && styles.modeBtnActive]} onPress={() => setMode('grid2mag')}>
          <Text style={[styles.modeBtnText, mode==='grid2mag' && styles.modeBtnTextActive]}>GRID → MAG</Text>
        </TouchableOpacity>
      </View>

      <ToolInput
        label={mode === 'mag2grid' ? 'MAGNETIC BEARING (°)' : 'GRID BEARING (°)'}
        value={bearing}
        onChangeText={setBearing}
        placeholder="0 – 360"
        keyboardType="numeric"
      />

      {converted !== null && (
        <ToolResult
          label={mode === 'mag2grid' ? 'GRID BEARING' : 'MAGNETIC BEARING'}
          value={`${Math.round(converted)}°`}
          primary
        />
      )}
    </View>
  );
}

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
