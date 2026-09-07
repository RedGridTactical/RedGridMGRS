import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert as NativeAlert } from 'react-native';
import { Modal } from './FieldModal';
import { registerAlertHost } from '../utils/fieldAlert';
import { useColors, useDisplaySafety } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';

export function FieldAlertHost() {
  const colors = useColors();
  const { tacticalMode } = useDisplaySafety();
  const [queue, setQueue] = useState([]);
  useEffect(() => registerAlertHost(item => {
    if (tacticalMode) setQueue(previous => [...previous, item]);
    else NativeAlert.alert(item.title, item.message, item.buttons, item.options);
  }), [tacticalMode]);
  const item = queue[0];
  const dismiss = () => setQueue(previous => previous.slice(1));
  if (!item) return null;
  const buttons = item.buttons?.length ? item.buttons : [{ text: 'OK' }];
  const cancel = () => {
    if (item.options?.cancelable) { dismiss(); item.options.onDismiss?.(); }
  };
  return (
    <Modal transparent animationType="none" visible onRequestClose={cancel} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityViewIsModal>
          <ScrollView><Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{item.title}</Text>
            {!!item.message && <Text style={[styles.body, { color: colors.text2 }]}>{item.message}</Text>}
          </ScrollView>
          {buttons.map((button, index) => <TouchableOpacity key={index} style={[styles.button, { borderColor: colors.border }]} accessibilityRole="button" onPress={() => { dismiss(); button.onPress?.(); }}><Text style={[styles.action, { color: colors.text }]}>{button.text}</Text></TouchableOpacity>)}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.9)' },
  sheet: { borderWidth: 1, padding: 20, maxHeight: '85%', gap: 10 },
  title: { ...TYPE.heading, fontSize: 20, marginBottom: 12 },
  body: { ...TYPE.body, fontSize: 16, lineHeight: 23, marginBottom: 12 },
  button: { borderTopWidth: 1, minHeight: 48, justifyContent: 'center' },
  action: { ...TYPE.label, fontSize: 16, textAlign: 'center' },
});
