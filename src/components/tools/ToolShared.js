/**
 * Shared UI primitives for all tool components.
 * Keeps styling consistent across every tool card.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AccessibilityInfo } from 'react-native';
import { TextInput } from '../FieldInput';
import { useColors } from '../../utils/ThemeContext';
import { tapLight, notifySuccess } from '../../utils/haptics';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

export function ToolInput({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'characters', maxLength = 128 }) {
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
        maxLength={maxLength}
      />
    </View>
  );
}

export function ToolResult({ label, value, primary = false }) {
  const colors = useColors();

  const { t } = useTranslation();
  const busy = useRef(false);
  const [feedback, setFeedback] = useState(null);
  const handleCopy = useCallback(async () => {
    if (value === null || value === undefined || value === '' || busy.current) return;
    busy.current = true;
    tapLight();
    try {
      await copyTextToClipboard(String(value));
      notifySuccess();
      const message = t('workflow.copied', { label });
      setFeedback({ message, value: String(value), label });
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      const message = t('workflow.copyFailed');
      setFeedback({ message, value: String(value), label });
      AccessibilityInfo.announceForAccessibility(message);
    } finally { busy.current = false; }
  }, [value, label, t]);

  return (
    <TouchableOpacity
      onPress={handleCopy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('workflow.copyResult', { label, value })}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[ts.result, { borderColor: colors.border2, backgroundColor: colors.text5 }, primary && { borderColor: colors.text2, backgroundColor: colors.card }]}
      >
        <Text style={[ts.resultLabel, { color: colors.text3 }, primary && { color: colors.text2 }]}>{label} · {t('workflow.copy')}</Text>
        <Text
          style={[ts.resultValue, { color: colors.text2 }, primary && { fontSize: 22, color: colors.text }]}
        >
          {value}
        </Text>
      </View>
      {feedback?.value === String(value) && feedback?.label === label && <Text style={[ts.hint, { color: colors.text2 }]} accessibilityLiveRegion="polite">{feedback.message}</Text>}
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
