/**
 * Shared UI primitives for all tool components.
 * Keeps styling consistent across every tool card.
 */
import React, { useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import { useColors } from '../../utils/ThemeContext';
import { tapLight, notifySuccess } from '../../utils/haptics';

export function ToolInput({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'characters' }) {
  const colors = useColors();
  return (
    <View style={ts.inputWrap}>
      <Text style={[ts.inputLabel, { color: colors.border }]}>{label}</Text>
      <TextInput
        style={[ts.input, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text4}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function ToolResult({ label, value, primary = false }) {
  const colors = useColors();

  const handleLongPress = useCallback(async () => {
    if (!value) return;
    tapLight();
    let ExpoClipboard = null;
    try { ExpoClipboard = require('expo-clipboard'); } catch {}
    if (ExpoClipboard?.setStringAsync) {
      await ExpoClipboard.setStringAsync(String(value)).catch(() => {});
    }
    notifySuccess();
    AccessibilityInfo.announceForAccessibility(`${label} copied`);
  }, [value, label]);

  return (
    <TouchableOpacity
      onLongPress={handleLongPress}
      delayLongPress={400}
      activeOpacity={0.8}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}. Long press to copy`}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[ts.result, { borderColor: colors.border2, backgroundColor: colors.text5 }, primary && { borderColor: colors.text2, backgroundColor: colors.card }]}
      >
        <Text style={[ts.resultLabel, { color: colors.border }, primary && { color: colors.text2 }]}>{label}</Text>
        <Text
          style={[ts.resultValue, { color: colors.text2 }, primary && { fontSize: 22, color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function ToolRow({ label, value }) {
  const colors = useColors();
  return (
    <View style={ts.row}>
      <Text style={[ts.rowLabel, { color: colors.border }]}>{label}</Text>
      <Text style={[ts.rowValue, { color: colors.text2 }]}>{value}</Text>
    </View>
  );
}

export function ToolDivider() {
  const colors = useColors();
  return <View style={[ts.divider, { backgroundColor: colors.border2 }]} />;
}

export function ToolHint({ text }) {
  const colors = useColors();
  return <Text style={[ts.hint, { color: colors.text4 }]}>{text}</Text>;
}

const ts = StyleSheet.create({
  inputWrap: { marginBottom: 10 },
  inputLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, marginBottom: 4 },
  input: {
    borderWidth: 1,
    fontFamily: 'monospace', fontSize: 14, letterSpacing: 3,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  result: {
    borderWidth: 1,
    padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  resultLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  resultValue: { fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  rowValue: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 },
  divider: { height: 1, marginVertical: 10 },
  hint: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 1, marginTop: 8, lineHeight: 14 },
});
