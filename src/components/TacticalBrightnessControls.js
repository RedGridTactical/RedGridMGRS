import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Modal } from './FieldModal';
import { TYPE } from '../utils/typography';
import { useTranslation } from '../hooks/useTranslation';

export function TacticalBrightnessControls({ display }) {
  const { t } = useTranslation();
  return (
    <View style={styles.controls}>
      <Text style={styles.label}>{t('nightDisplay.intensity')} {Math.round(display.level * 100)}%</Text>
      <TouchableOpacity style={styles.button} onPress={() => display.changeLevel(-1)} accessibilityLabel={t('nightDisplay.dimmer')}><Text style={styles.text}>−</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => display.changeLevel(1)} accessibilityLabel={t('nightDisplay.brighter')}><Text style={styles.text}>+</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.button, { paddingHorizontal: 12 }]} onPress={() => display.setBlackout(true)} accessibilityLabel={t('nightDisplay.blackoutHint')}><Text style={styles.label}>{t('nightDisplay.blackout')}</Text></TouchableOpacity>
    </View>
  );
}

export function TacticalBlackout({ visible, onRestore }) {
  const { t } = useTranslation();
  const lastTap = useRef(0);
  const recoverOnDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 450) { lastTap.current = 0; onRestore(); }
    else lastTap.current = now;
  };
  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onRestore}>
      <TouchableOpacity style={styles.blackout} activeOpacity={1} onPress={recoverOnDoubleTap} onLongPress={onRestore} delayLongPress={700} accessibilityRole="button" accessibilityLabel={t('nightDisplay.restoreHint')} onAccessibilityTap={onRestore} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#220000', backgroundColor: '#000000' },
  label: { ...TYPE.label, fontSize: 12, color: '#EF0000' },
  text: { ...TYPE.data, fontSize: 20, color: '#FF0000' },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  blackout: { flex: 1, backgroundColor: '#000000' },
});
