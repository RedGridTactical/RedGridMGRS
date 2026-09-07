import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useColors, useDisplaySafety } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';

export function TacticalSurfaceGuard({ children }) {
  const colors = useColors();
  const { tacticalMode, onExitTactical } = useDisplaySafety();
  const { t } = useTranslation();
  if (!tacticalMode) return children;
  return <View style={{ padding: 12, gap: 16 }}>
    <Text style={{ ...TYPE.body, fontSize: 16, color: colors.text2 }}>{t('nightDisplay.externalBody')}</Text>
    <TouchableOpacity style={{ padding: 16, borderWidth: 1, borderColor: colors.border }} onPress={onExitTactical}><Text style={{ ...TYPE.heading, color: colors.text }}>{t('nightDisplay.exit')}</Text></TouchableOpacity>
  </View>;
}
