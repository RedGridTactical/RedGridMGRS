/**
 * ThemesScreen — Pro feature. Four display themes.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

const BG = '#0A0000';
const RED = '#CC0000'; const RED2 = '#990000'; const RED3 = '#660000'; const RED4 = '#330000';

const THEMES = [
  { id: 'red',   label: 'TACTICAL RED',  sub: 'Default — red on black, full light discipline', preview: { bg: '#0A0000', text: '#CC0000', border: '#660000' } },
  { id: 'green', label: 'NVG GREEN',     sub: 'Green on black — optimised for NVG environments', preview: { bg: '#000A00', text: '#00CC00', border: '#006600' } },
  { id: 'white', label: 'DAY WHITE',     sub: 'Black on white — full daylight / high ambient', preview: { bg: '#F5F5F5', text: '#1A1A1A', border: '#CCCCCC' } },
  { id: 'blue',  label: 'NIGHT BLUE',    sub: 'Blue on dark navy — low light, reduced eye strain', preview: { bg: '#00000A', text: '#4488FF', border: '#002266' } },
];

export function ThemesScreen({ activeTheme, setActiveTheme }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.hint}>DISPLAY THEME — APPLIES ACROSS THE ENTIRE APP</Text>
      {THEMES.map(t => {
        const isActive = activeTheme === t.id;
        const p = t.preview;
        return (
          <TouchableOpacity
            key={t.id}
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() => setActiveTheme(t.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.swatch, { backgroundColor: p.bg, borderColor: p.border }]}>
              <Text style={[styles.swatchText, { color: p.text }]}>18S UJ 47832 91204</Text>
              <Text style={[styles.swatchSub, { color: p.border }]}>±4m  ALT 312m</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.label}>{t.label}</Text>
              <Text style={styles.sub}>{t.sub}</Text>
            </View>
            <View style={[styles.radio, isActive && styles.radioActive]}>
              {isActive && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.note}>THEME CHANGE TAKES EFFECT IMMEDIATELY · STORED LOCALLY</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3, marginBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000', marginBottom: 8, padding: 12, gap: 12 },
  cardActive: { borderColor: RED2, backgroundColor: '#1A0000' },
  swatch: { width: 130, borderWidth: 1, padding: 8, gap: 3 },
  swatchText: { fontFamily: 'monospace', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  swatchSub: { fontFamily: 'monospace', fontSize: 8 },
  info: { flex: 1, gap: 3 },
  label: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 2, color: RED },
  sub: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: RED3, lineHeight: 14 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: RED3, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: RED },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  note: { marginTop: 20, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, color: RED4, textAlign: 'center' },
});
