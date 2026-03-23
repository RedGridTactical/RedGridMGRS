import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { timeToTravel, formatMinutes } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';

const PRESETS = [
  { labelKey: 'toolLabels.openTerrain', kmh: 4.0 },
  { labelKey: 'toolLabels.woodLine',    kmh: 2.5 },
  { labelKey: 'toolLabels.urban',       kmh: 3.0 },
  { labelKey: 'toolLabels.vehicle',     kmh: 30   },
];

export function TDSTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
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
      <ToolInput label={t('toolLabels.distanceMetres')} value={distance} onChangeText={setDistance} placeholder="e.g. 1500" keyboardType="numeric" />

      <Text style={[styles.presetsLabel, { color: colors.border }]}>{t('toolLabels.speedPresets')}</Text>
      <View style={styles.presets}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.labelKey}
            style={[styles.preset, { borderColor: colors.border2 }, speed === String(p.kmh) && { borderColor: colors.text2, backgroundColor: colors.text5 }]}
            onPress={() => setSpeed(String(p.kmh))}
          >
            <Text style={[styles.presetLabel, { color: colors.border2 }, speed === String(p.kmh) && { color: colors.text2 }]}>{t(p.labelKey)}</Text>
            <Text style={[styles.presetVal, { color: colors.border2 }, speed === String(p.kmh) && { color: colors.text }]}>{p.kmh}km/h</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ToolInput label={t('toolLabels.orEnterSpeed')} value={speed} onChangeText={setSpeed} placeholder="e.g. 3.5" keyboardType="numeric" />

      {time !== null && (
        <View style={styles.results}>
          <ToolResult label={t('toolLabels.travelTime')} value={formatMinutes(time)} primary />
          {eta && <ToolResult label={t('toolLabels.etaLocal')} value={eta} />}
          <ToolRow label={t('toolLabels.distance')} value={`${d}m`} />
          <ToolRow label={t('toolLabels.speed')}    value={`${s}km/h`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  presetsLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, marginBottom:8 },
  presets: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:12 },
  preset: { flex:1, minWidth:'45%', borderWidth:1, padding:8 },
  presetLabel: { fontFamily:'monospace', fontSize:8, letterSpacing:2 },
  presetVal: { fontFamily:'monospace', fontSize:10, letterSpacing:2, fontWeight:'700', marginTop:2 },
  results: { marginTop:12, gap:8 },
});
