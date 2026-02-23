import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { timeToTravel, formatMinutes, formatDistance } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';

const RED = '#CC0000', RED2 = '#990000', RED3 = '#660000', RED4 = '#330000', RED5 = '#1A0000';

const PRESETS = [
  { label: 'OPEN TERRAIN', kmh: 4.0 },
  { label: 'WOOD LINE',    kmh: 2.5 },
  { label: 'URBAN',        kmh: 3.0 },
  { label: 'VEHICLE',      kmh: 30   },
];

export function TDSTool({ location }) {
  const [distance, setDistance] = useState('');
  const [speed, setSpeed]       = useState('');

  const d = parseFloat(distance);
  const s = parseFloat(speed);
  const time = !isNaN(d) && !isNaN(s) ? timeToTravel(d, s) : null;

  // ETA from now
  const eta = time !== null ? (() => {
    const future = new Date(Date.now() + time * 60000);
    const hh = String(future.getHours()).padStart(2,'0');
    const mm = String(future.getMinutes()).padStart(2,'0');
    return `${hh}${mm}L`;
  })() : null;

  return (
    <View>
      <ToolInput label="DISTANCE (METRES)" value={distance} onChangeText={setDistance} placeholder="e.g. 1500" keyboardType="numeric" />

      <Text style={styles.presetsLabel}>SPEED PRESETS</Text>
      <View style={styles.presets}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.label}
            style={[styles.preset, speed === String(p.kmh) && styles.presetActive]}
            onPress={() => setSpeed(String(p.kmh))}
          >
            <Text style={[styles.presetLabel, speed === String(p.kmh) && styles.presetLabelActive]}>{p.label}</Text>
            <Text style={[styles.presetVal, speed === String(p.kmh) && styles.presetValActive]}>{p.kmh}km/h</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ToolInput label="OR ENTER SPEED (KM/H)" value={speed} onChangeText={setSpeed} placeholder="e.g. 3.5" keyboardType="numeric" />

      {time !== null && (
        <View style={styles.results}>
          <ToolResult label="TRAVEL TIME" value={formatMinutes(time)} primary />
          {eta && <ToolResult label="ETA (LOCAL)" value={eta} />}
          <ToolRow label="DISTANCE" value={`${d}m`} />
          <ToolRow label="SPEED"    value={`${s}km/h`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  presetsLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, color:RED3, marginBottom:8 },
  presets: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:12 },
  preset: { flex:1, minWidth:'45%', borderWidth:1, borderColor:RED4, padding:8 },
  presetActive: { borderColor:RED2, backgroundColor:RED5 },
  presetLabel: { fontFamily:'monospace', fontSize:8, letterSpacing:2, color:RED4 },
  presetLabelActive: { color:RED2 },
  presetVal: { fontFamily:'monospace', fontSize:10, letterSpacing:2, color:RED4, fontWeight:'700', marginTop:2 },
  presetValActive: { color:RED },
  results: { marginTop:12, gap:8 },
});
