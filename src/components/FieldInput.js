import React, { useState } from 'react';
import { View, Text, TextInput as NativeTextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Modal } from './FieldModal';
import { useColors, useDisplaySafety } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';

/** Local red keypad avoids launching a bright OS keyboard during field input. */
export function TextInput(props) {
  const colors = useColors();
  const { tacticalMode, onExitTactical } = useDisplaySafety();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!tacticalMode) return <NativeTextInput {...props} />;
  const numeric = ['numeric', 'number-pad', 'decimal-pad', 'phone-pad'].includes(props.keyboardType);
  const rows = numeric ? ['123', '456', '789', '-0.'] : ['12345', '67890', 'ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ', '-.,/'];
  const append = key => setDraft(value => (value + key).slice(0, props.maxLength ?? 2000));
  const close = commit => {
    if (commit) props.onChangeText?.(draft);
    setEditing(false);
    if (commit) props.onBlur?.({ nativeEvent: { text: draft } });
  };
  return (
    <>
      <TouchableOpacity style={props.style} disabled={props.editable === false} accessibilityRole="button" accessibilityLabel={`${props.accessibilityLabel || props.placeholder || t('nightDisplay.edit')}: ${props.value || ''}`} onPress={() => { setDraft(String(props.value ?? '')); setEditing(true); }}>
        <Text style={[TYPE.body, { fontSize: 16, color: props.value ? colors.text : props.placeholderTextColor || colors.text3 }]}>{props.value || props.placeholder || ' '}</Text>
      </TouchableOpacity>
      <Modal visible={editing} animationType="none" onRequestClose={() => close(false)} statusBarTranslucent>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{props.accessibilityLabel || props.placeholder || t('nightDisplay.edit')}</Text>
          <Text style={styles.value}>{draft || ' '}</Text>
          {rows.map(row => <View key={row} style={styles.row}>{Array.from(row).map(key => <TouchableOpacity key={key} style={styles.key} onPress={() => append(key)} accessibilityRole="button" accessibilityLabel={key}><Text style={styles.keyText}>{key}</Text></TouchableOpacity>)}</View>)}
          <View style={styles.row}>
            {!numeric && <TouchableOpacity style={styles.key} onPress={() => append(' ')}><Text style={styles.action}>{t('nightDisplay.space')}</Text></TouchableOpacity>}
            <TouchableOpacity style={styles.key} onPress={() => setDraft(value => Array.from(value).slice(0, -1).join(''))} accessibilityLabel={t('nightDisplay.backspace')}><Text style={styles.action}>⌫</Text></TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.key} onPress={() => close(false)}><Text style={styles.action}>{t('waypointModal.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.key} onPress={() => close(true)}><Text style={styles.action}>{t('nightDisplay.done')}</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.exit} onPress={() => { close(true); onExitTactical(); }}><Text style={styles.hint}>{t('nightDisplay.fullKeyboard')}</Text></TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { paddingHorizontal: 8, paddingTop: 54, paddingBottom: 32, gap: 8 },
  title: { ...TYPE.label, fontSize: 16, color: '#EF0000', marginHorizontal: 8 },
  value: { ...TYPE.data, color: '#FF0000', fontSize: 22, padding: 16, minHeight: 75, borderColor: '#700000', borderWidth: 1 },
  row: { flexDirection: 'row', gap: 3 },
  key: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: '#700000', alignItems: 'center', justifyContent: 'center' },
  keyText: { ...TYPE.data, color: '#FF0000', fontSize: 18 },
  action: { ...TYPE.label, color: '#EF0000', fontSize: 15 },
  exit: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  hint: { ...TYPE.body, color: '#EF0000', fontSize: 14, textAlign: 'center' },
});
