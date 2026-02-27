import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { applyDeclination, removeDeclination } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';

export function DeclinationTool({ declination, setDeclination }) {
  const colors = useColors();
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
      <Text style={[styles.sectionLabel, { color: colors.border }]}>LOCAL DECLINATION (SAVED)</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={decInput} onChangeText={setDecInput} placeholder="+5 or -12" keyboardType="numbers-and-punctuation" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.border }]} onPress={saveDec}>
          <Text style={[styles.saveBtnText, { color: colors.border }]}>SAVE</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`SAVED: ${declination > 0 ? '+' : ''}${declination}° (${dir})  ·  + = EAST, - = WEST\nApplied automatically to wayfinder bearing.`} />

      <ToolDivider />
      <Text style={[styles.sectionLabel, { color: colors.border }]}>BEARING CONVERTER</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='mag2grid' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('mag2grid')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='mag2grid' && { color: colors.text }]}>MAG -> GRID</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='grid2mag' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('grid2mag')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='grid2mag' && { color: colors.text }]}>GRID -> MAG</Text>
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
  sectionLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, marginBottom:6 },
  calibRow: { flexDirection:'row', gap:8, alignItems:'flex-end' },
  saveBtn: { borderWidth:1, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  saveBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:2 },
  modeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  modeBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  modeBtnText: { fontFamily:'monospace', fontSize:9, letterSpacing:2 },
});
