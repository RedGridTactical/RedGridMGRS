/**
 * Shared UI primitives for all tool components.
 * Keeps styling consistent across every tool card.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import { TextInput } from '../FieldInput';
import { useColors } from '../../utils/ThemeContext';
import { tapLight, notifySuccess } from '../../utils/haptics';
import { TYPE } from '../../utils/typography';

export function ToolInput({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'characters' }) {
  const colors = useColors();
  return (
    <View style={ts.inputWrap}>
      <Text style={[ts.inputLabel, { color: colors.text3 }]}>{label}</Text>
      <TextInput
        style={[ts.input, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
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
        <Text style={[ts.resultLabel, { color: colors.text3 }, primary && { color: colors.text2 }]}>{label}</Text>
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
      <Text style={[ts.rowLabel, { color: colors.text3 }]}>{label}</Text>
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
  return <Text style={[ts.hint, { color: colors.text3 }]} maxFontSizeMultiplier={1.3}>{text}</Text>;
}

const ts = StyleSheet.create({
  inputWrap: { marginBottom: 10 },
  inputLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginBottom: 4 },
  input: {
    borderWidth: 1,
    ...TYPE.data, fontSize: 14, letterSpacing: 0.6,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  result: {
    borderWidth: 1,
    padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  resultLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, flexShrink: 1, marginRight: 8 },
  resultValue: { ...TYPE.data, fontSize: 18, letterSpacing: 0.6, flexShrink: 1, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, flexShrink: 1, marginRight: 8 },
  rowValue: { ...TYPE.data, fontSize: 11, letterSpacing: 0.6, flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, marginVertical: 10 },
  hint: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, marginTop: 8, lineHeight: 17 },
});
