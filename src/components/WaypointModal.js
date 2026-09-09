import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Modal } from './FieldModal';
import { TextInput } from './FieldInput';
import { parseMGRSToLatLon } from '../utils/mgrs';
import { isFreshPosition } from '../utils/position';
import { useColors } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';
import { notifySuccess, notifyWarning } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

export function WaypointModal({ visible, onClose, onSetWaypoint, currentLocation }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [mgrsInput, setMGRSInput] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const close = () => { if (!saving.current) { reset(); onClose(); } };
  const save = async point => {
    if (saving.current) return;
    saving.current = true; setIsSaving(true); setError('');
    try { await onSetWaypoint(point); notifySuccess(); reset(); onClose(); }
    catch { notifyWarning(); setError(t('workflow.saveFailed')); }
    finally { saving.current = false; setIsSaving(false); }
  };

  const reset = () => { setMGRSInput(''); setLabel(''); setError(''); };

  const handleSubmit = () => {
    const cleaned = mgrsInput.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 6) { notifyWarning(); setError(t('waypointModal.invalidMgrs')); return; }
    const parsed = parseMGRSToLatLon(cleaned);
    if (!parsed) { notifyWarning(); setError(t('waypointModal.couldNotParse')); return; }
    save({ lat: parsed.lat, lon: parsed.lon, mgrs: cleaned, label: label.trim().toUpperCase() || 'WAYPOINT', source: 'manual', recordedAt: Date.now() });
  };

  const handleMark = () => {
    if (!isFreshPosition(currentLocation)) { notifyWarning(); setError(t('gps.waitForSignal')); return; }
    save({ lat: currentLocation.lat, lon: currentLocation.lon, mgrs: '', label: label.trim().toUpperCase() || 'MARK', source: 'gps', recordedAt: currentLocation.timestamp, accuracyM: currentLocation.accuracy });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]} accessibilityViewIsModal={true}>
          <Text style={[styles.title, { color: colors.text }]}>{t('waypointModal.title')}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
          <Text style={[styles.fieldLabel, { color: colors.text3 }]}>{t('waypointModal.labelOptional')}</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]} editable={!isSaving} value={label} onChangeText={setLabel} placeholder="OBJ ALPHA" placeholderTextColor={colors.text3} autoCapitalize="characters" maxLength={16} accessibilityLabel={t('waypointModal.labelOptional')} accessibilityHint="Optional name for this waypoint" />
          <Text style={[styles.fieldLabel, { color: colors.text3 }]}>{t('waypointModal.mgrsCoordinate')}</Text>
          <TextInput style={[styles.input, styles.mgrsInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]} editable={!isSaving} value={mgrsInput} onChangeText={(v) => { setMGRSInput(v); setError(''); }} placeholder="18S UJ 12345 67890" placeholderTextColor={colors.text3} autoCapitalize="characters" autoCorrect={false} maxLength={20} accessibilityLabel={t('waypointModal.mgrsCoordinate')} accessibilityHint="Enter full MGRS grid coordinate" />
          {error ? <Text style={[styles.error, { color: colors.text }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text> : null}
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.border, borderColor: colors.text2 }]} disabled={isSaving} accessibilityState={{ disabled: isSaving, busy: isSaving }} onPress={handleSubmit} accessibilityRole="button" accessibilityLabel={t('waypointModal.setWaypoint')}><Text style={[styles.primaryBtnText, { color: colors.text }]}>{isSaving ? t('workflow.saving') : t('waypointModal.setWaypoint')}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border2 }]} disabled={isSaving} accessibilityState={{ disabled: isSaving }} onPress={handleMark} accessibilityRole="button" accessibilityLabel={t('waypointModal.markCurrentPosition')}><Text style={[styles.secondaryBtnText, { color: colors.text3 }]}>{t('waypointModal.markCurrentPosition')}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={close} accessibilityRole="button" accessibilityLabel={t('waypointModal.cancel')}><Text style={[styles.cancelBtnText, { color: colors.text3 }]}>{t('waypointModal.cancel')}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: { borderTopWidth: 1, padding: 24, paddingBottom: 40, gap: 8 },
  title: {
    ...TYPE.heading, fontSize: 18, letterSpacing: 1.2, textAlign: 'center', marginBottom: 4 },
  divider: { height: 1, marginBottom: 8 },
  fieldLabel: {
    ...TYPE.label, fontSize: 12, letterSpacing: 0.8, marginTop: 4 },
  input: { ...TYPE.body, borderWidth: 1, fontSize: 16, letterSpacing: 0.5, paddingHorizontal: 12, paddingVertical: 10 },
  mgrsInput: {
    ...TYPE.data, fontSize: 17, letterSpacing: 0.5 },
  error: { ...TYPE.body, fontSize: 13, letterSpacing: 0.3, textAlign: 'center' },
  primaryBtn: { borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: {
    ...TYPE.heading, fontSize: 15, letterSpacing: 1 },
  secondaryBtn: { borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: {
    ...TYPE.label, fontSize: 14, letterSpacing: 0.8 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: {
    ...TYPE.label, fontSize: 13, letterSpacing: 0.8 },
});
