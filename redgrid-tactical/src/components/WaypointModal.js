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

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

export function WaypointModal({ visible, onClose, onSetWaypoint, currentLocation }) {
  const [mgrsInput, setMGRSInput] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const reset = () => { setMGRSInput(''); setLabel(''); setError(''); };

  const handleSubmit = () => {
    const cleaned = mgrsInput.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 6) { setError('INVALID MGRS — ENTER FULL GRID'); return; }
    const parsed = parseMGRSToLatLon(cleaned);
    if (!parsed) { setError('COULD NOT PARSE MGRS COORDINATE'); return; }
    onSetWaypoint({ lat: parsed.lat, lon: parsed.lon, mgrs: cleaned, label: label.trim().toUpperCase() || 'WAYPOINT' });
    reset(); onClose();
  };

  const handleMark = () => {
    if (!currentLocation) { setError('NO FIX — WAIT FOR GPS SIGNAL'); return; }
    onSetWaypoint({ lat: currentLocation.lat, lon: currentLocation.lon, mgrs: '', label: label.trim().toUpperCase() || 'MARK' });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>SET WAYPOINT</Text>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>LABEL (OPTIONAL)</Text>
          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="OBJ ALPHA" placeholderTextColor="#440000" autoCapitalize="characters" maxLength={16} />
          <Text style={styles.fieldLabel}>MGRS COORDINATE</Text>
          <TextInput style={[styles.input, styles.mgrsInput]} value={mgrsInput} onChangeText={(t) => { setMGRSInput(t); setError(''); }} placeholder="18S UJ 12345 67890" placeholderTextColor="#440000" autoCapitalize="characters" autoCorrect={false} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}><Text style={styles.primaryBtnText}>SET WAYPOINT</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleMark}><Text style={styles.secondaryBtnText}>MARK CURRENT POSITION</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}><Text style={styles.cancelBtnText}>CANCEL</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function parseMGRSToLatLon(mgrs) {
  try {
    const match = mgrs.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{4,10})$/i);
    if (!match) return null;
    const [, zoneStr, band, sq, nums] = match;
    const zone = parseInt(zoneStr, 10);
    const half = Math.floor(nums.length / 2);
    const scale = Math.pow(10, 5 - half);
    const easting = parseInt(nums.slice(0, half), 10) * scale;
    const northing = parseInt(nums.slice(half), 10) * scale;
    const setNum = ((zone - 1) % 6) + 1;
    const colSet = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'][Math.floor((setNum - 1) / 2)];
    const rowSet = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'][(setNum - 1) % 2];
    const colIdx = colSet.indexOf(sq[0].toUpperCase());
    const rowIdx = rowSet.indexOf(sq[1].toUpperCase());
    if (colIdx === -1 || rowIdx === -1) return null;
    const fullEasting = (colIdx + 1) * 100000 + easting;
    const bandLatMin = 'CDEFGHJKLMNPQRSTUVWX'.indexOf(band.toUpperCase()) * 8 - 80;
    const latRad = ((bandLatMin + 4) * Math.PI) / 180;
    const a = 6378137.0, f = 1 / 298.257223563, e2 = 2 * f - f * f;
    const M_approx = a * ((1 - e2/4 - (3*e2**2)/64) * latRad - ((3*e2)/8 + (3*e2**2)/32) * Math.sin(2 * latRad));
    let fullNorthing = Math.round(M_approx / 2000000) * 2000000 + rowIdx * 100000 + northing;
    if (bandLatMin < 0) fullNorthing -= 10000000;
    const k0 = 0.9996, ep2 = e2 / (1 - e2);
    const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
    const M = fullNorthing / k0;
    const mu = M / (a * (1 - e2/4 - (3*e2**2)/64 - (5*e2**3)/256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + (3*e1)/2*Math.sin(2*mu) + (27*e1**2)/16*Math.sin(4*mu) + (151*e1**3)/96*Math.sin(6*mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1)**2);
    const T1 = Math.tan(phi1)**2, C1 = ep2 * Math.cos(phi1)**2;
    const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1)**2)**1.5;
    const D = (fullEasting - 500000) / (N1 * k0);
    const lat = phi1 - (N1 * Math.tan(phi1)) / R1 * (D**2/2 - ((5+3*T1+10*C1-4*C1**2-9*ep2)*D**4)/24 + ((61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6)/720);
    const lon = lonOrigin + (D - ((1+2*T1+C1)*D**3)/6 + ((5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5)/120) / Math.cos(phi1);
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
  } catch { return null; }
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: { backgroundColor: BG, borderTopWidth: 1, borderTopColor: RED3, padding: 24, paddingBottom: 40, gap: 8 },
  title: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 5, color: RED, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  divider: { height: 1, backgroundColor: RED4, marginBottom: 8 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 4, color: RED3, marginTop: 4 },
  input: { borderWidth: 1, borderColor: RED3, backgroundColor: '#110000', color: RED, fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, paddingHorizontal: 12, paddingVertical: 10 },
  mgrsInput: { fontSize: 18, letterSpacing: 4 },
  error: { fontFamily: 'monospace', fontSize: 11, color: RED, letterSpacing: 2, textAlign: 'center' },
  primaryBtn: { backgroundColor: RED3, borderWidth: 1, borderColor: RED2, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: 'monospace', fontSize: 14, letterSpacing: 4, color: RED, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderColor: RED4, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, color: RED3 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: RED4 },
});
