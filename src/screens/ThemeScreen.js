/**
 * ThemeScreen — Pro feature. Select display theme.
 * Free users see the selector but are gated to the red theme.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { THEMES } from '../hooks/useTheme';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

export function ThemeScreen({ currentTheme, isPro, onSelectTheme, onShowProGate }) {
  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>DISPLAY THEMES</Text>
        <Text style={styles.sub}>Choose a colour scheme for your environment</Text>

        {Object.values(THEMES).map(theme => {
          const isActive  = currentTheme === theme.id;
          const isLocked  = theme.pro && !isPro;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[styles.card, isActive && styles.cardActive, isLocked && styles.cardLocked]}
              onPress={() => {
                if (isLocked) { onShowProGate('Display Themes'); return; }
                onSelectTheme(theme.id);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.swatch, { backgroundColor: theme.colors.bg, borderColor: theme.colors.text }]}>
                <Text style={[styles.swatchText, { color: theme.colors.text }]}>MGRS</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{theme.label}</Text>
                  {isLocked && <Text style={styles.proBadge}>PRO</Text>}
                  {isActive  && <Text style={styles.activeBadge}>ACTIVE</Text>}
                </View>
                <Text style={styles.themeSub}>{theme.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 4, color: RED, marginBottom: 4 },
  sub: { fontFamily: 'monospace', fontSize: 9, color: RED3, letterSpacing: 1, marginBottom: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000',
  },
  cardActive: { borderColor: RED },
  cardLocked: { opacity: 0.6 },
  swatch: {
    width: 60, height: 44, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  swatchText: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  info: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  label: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', color: RED, letterSpacing: 2 },
  proBadge: {
    fontFamily: 'monospace', fontSize: 8, color: BG,
    backgroundColor: RED, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  activeBadge: {
    fontFamily: 'monospace', fontSize: 8, color: RED,
    borderWidth: 1, borderColor: RED, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  themeSub: { fontFamily: 'monospace', fontSize: 9, color: RED3, letterSpacing: 0.5 },
});
