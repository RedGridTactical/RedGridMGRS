import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';
import { THEMES } from '../hooks/useTheme';
import { tapLight } from '../utils/haptics';

/** An app-wide display preference, independent of paid features and map layers. */
export function TacticalDisplaySwitch({ theme, value, onChange, disabled = false }) {
  const colors = useColors();
  const { t } = useTranslation();
  const modeLabel = theme === 'standard' || theme === 'red'
    ? t(value ? 'display.tactical' : 'display.standard')
    : THEMES[theme]?.label;

  return (
    <View style={[styles.bar, { borderBottomColor: colors.border2 }]}>
      <Text style={[styles.mode, { color: colors.text2 }]} numberOfLines={1}>{modeLabel}</Text>
      <TouchableOpacity
        style={styles.control}
        onPress={() => { tapLight(); onChange(!value); }}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="switch"
        accessibilityLabel={t('display.tacticalDisplay')}
        accessibilityState={{ checked: value, disabled }}
        testID="tactical-display-switch"
      >
        <Text style={[styles.label, { color: colors.text }]}>{t('display.tacticalDisplay')}</Text>
        <View style={[styles.track, { borderColor: value ? colors.text : colors.border, backgroundColor: colors.card2 }]}>
          <View style={[styles.thumb, { backgroundColor: value ? colors.text : colors.text2, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 44, borderBottomWidth: 1, gap: 12 },
  mode: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, flexShrink: 1 },
  label: { ...TYPE.label, fontSize: 13, flexShrink: 1 },
  track: { width: 40, height: 24, borderWidth: 1, borderRadius: 2, padding: 3 },
  thumb: { width: 14, height: 16, borderRadius: 1 },
});
