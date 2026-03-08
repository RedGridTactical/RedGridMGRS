import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { parseMGRSToLatLon } from '../utils/mgrs';
import { useColors } from '../utils/ThemeContext';
import { notifySuccess, notifyWarning } from '../utils/haptics';

export function WaypointModal({ visible, onClose, onSetWaypoint, currentLocation }) {
  const colors = useColors();
  const [mgrsInput, setMGRSInput] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const reset = () => { setMGRSInput(''); setLabel(''); setError(''); };

  const handleSubmit = () => {
    const cleaned = mgrsInput.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 6) { notifyWarning(); setError('INVALID MGRS — ENTER FULL GRID'); return; }
    const parsed = parseMGRSToLatLon(cleaned);
    if (!parsed) { notifyWarning(); setError('COULD NOT PARSE MGRS COORDINATE'); return; }
    onSetWaypoint({ lat: parsed.lat, lon: parsed.lon, mgrs: cleaned, label: label.trim().toUpperCase() || 'WAYPOINT' });
    notifySuccess(); reset(); onClose();
  };

  const handleMark = () => {
    if (!currentLocation) { notifyWarning(); setError('NO FIX — WAIT FOR GPS SIGNAL'); return; }
    onSetWaypoint({ lat: currentLocation.lat, lon: currentLocation.lon, mgrs: '', label: label.trim().toUpperCase() || 'MARK' });
    notifySuccess(); reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]} accessibilityViewIsModal={true}>
          <Text style={[styles.title, { color: colors.text }]}>SET WAYPOINT</Text>
          <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
          <Text style={[styles.fieldLabel, { color: colors.border }]}>LABEL (OPTIONAL)</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]} value={label} onChangeText={setLabel} placeholder="OBJ ALPHA" placeholderTextColor={colors.text4} autoCapitalize="characters" maxLength={16} accessibilityLabel="Waypoint label" accessibilityHint="Optional name for this waypoint" />
          <Text style={[styles.fieldLabel, { color: colors.border }]}>MGRS COORDINATE</Text>
          <TextInput style={[styles.input, styles.mgrsInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }]} value={mgrsInput} onChangeText={(t) => { setMGRSInput(t); setError(''); }} placeholder="18S UJ 12345 67890" placeholderTextColor={colors.text4} autoCapitalize="characters" autoCorrect={false} maxLength={20} accessibilityLabel="MGRS coordinate" accessibilityHint="Enter full MGRS grid coordinate" />
          {error ? <Text style={[styles.error, { color: colors.text }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text> : null}
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.border, borderColor: colors.text2 }]} onPress={handleSubmit} accessibilityRole="button" accessibilityLabel="Set waypoint"><Text style={[styles.primaryBtnText, { color: colors.text }]}>SET WAYPOINT</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border2 }]} onPress={handleMark} accessibilityRole="button" accessibilityLabel="Mark current position"><Text style={[styles.secondaryBtnText, { color: colors.border }]}>MARK CURRENT POSITION</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }} accessibilityRole="button" accessibilityLabel="Cancel"><Text style={[styles.cancelBtnText, { color: colors.text4 }]}>CANCEL</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: { borderTopWidth: 1, padding: 24, paddingBottom: 40, gap: 8 },
  title: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 5, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  divider: { height: 1, marginBottom: 8 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 4, marginTop: 4 },
  input: { borderWidth: 1, fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, paddingHorizontal: 12, paddingVertical: 10 },
  mgrsInput: { fontSize: 18, letterSpacing: 4 },
  error: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, textAlign: 'center' },
  primaryBtn: { borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3 },
});
