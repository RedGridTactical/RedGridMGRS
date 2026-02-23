/**
 * Shared UI primitives for all tool components.
 * Keeps styling consistent across every tool card.
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';

export function ToolInput({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'characters' }) {
  return (
    <View style={ts.inputWrap}>
      <Text style={ts.inputLabel}>{label}</Text>
      <TextInput
        style={ts.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#3A0000"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

export function ToolResult({ label, value, primary = false }) {
  return (
    <View style={[ts.result, primary && ts.resultPrimary]}>
      <Text style={[ts.resultLabel, primary && ts.resultLabelPrimary]}>{label}</Text>
      <Text style={[ts.resultValue, primary && ts.resultValuePrimary]}>{value}</Text>
    </View>
  );
}

export function ToolRow({ label, value }) {
  return (
    <View style={ts.row}>
      <Text style={ts.rowLabel}>{label}</Text>
      <Text style={ts.rowValue}>{value}</Text>
    </View>
  );
}

export function ToolDivider() {
  return <View style={ts.divider} />;
}

export function ToolHint({ text }) {
  return <Text style={ts.hint}>{text}</Text>;
}

const ts = StyleSheet.create({
  inputWrap: { marginBottom: 10 },
  inputLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: RED3, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: RED3, backgroundColor: '#110000',
    color: RED, fontFamily: 'monospace', fontSize: 14, letterSpacing: 3,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  result: {
    borderWidth: 1, borderColor: RED4, backgroundColor: RED5,
    padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  resultPrimary: { borderColor: RED2, backgroundColor: '#1F0000' },
  resultLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3 },
  resultLabelPrimary: { color: RED2 },
  resultValue: { fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, color: RED2, fontWeight: '700' },
  resultValuePrimary: { fontSize: 22, color: RED },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3 },
  rowValue: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED2 },
  divider: { height: 1, backgroundColor: RED4, marginVertical: 10 },
  hint: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 1, color: RED4, marginTop: 8, lineHeight: 14 },
});
