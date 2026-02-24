/**
 * ReportScreen — Radio-ready report templates.
 * Current MGRS auto-fills the location field.
 * All text is ephemeral — cleared on tab switch.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Clipboard, Alert,
} from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

// ─── REPORT DEFINITIONS ──────────────────────────────────────────────────────
// Each report is a list of fields: { key, label, placeholder, autoFill? }
// autoFill: 'grid' | 'datetime' — auto-populated from live data

const SALUTE_FIELDS = [
  { key: 'size',     label: 'S — SIZE',       placeholder: 'Squad / Platoon / Vehicle...' },
  { key: 'activity', label: 'A — ACTIVITY',   placeholder: 'Moving N, Digging in, Firing...' },
  { key: 'location', label: 'L — LOCATION',   placeholder: 'MGRS grid', autoFill: 'grid' },
  { key: 'unit',     label: 'U — UNIT',       placeholder: 'Uniform / Marking / Equipment...' },
  { key: 'time',     label: 'T — TIME',       placeholder: 'DTG observed', autoFill: 'datetime' },
  { key: 'equip',    label: 'E — EQUIPMENT',  placeholder: 'Weapons / Vehicles / Comms...' },
];

const MEDEVAC_FIELDS = [
  { key: 'grid',     label: 'LINE 1 — GRID',         placeholder: 'MGRS of pickup site', autoFill: 'grid' },
  { key: 'callsign', label: 'LINE 2 — CALLSIGN/FREQ', placeholder: 'Callsign & freq...' },
  { key: 'patients', label: 'LINE 3 — PATIENTS',      placeholder: 'A=Urgent, B=Priority, C=Routine' },
  { key: 'equip',    label: 'LINE 4 — EQUIPMENT',     placeholder: 'H=Hoist, E=Extraction, N=None' },
  { key: 'num',      label: 'LINE 5 — NUM PATIENTS',  placeholder: 'Ambulatory / Litter' },
  { key: 'security', label: 'LINE 6 — SECURITY',      placeholder: 'N=None, P=Possible, E=Enemy, X=Armed escort' },
  { key: 'marking',  label: 'LINE 7 — MARKING',       placeholder: 'Panels / Smoke / None / Other' },
  { key: 'nation',   label: 'LINE 8 — NATIONALITY',   placeholder: 'US / Allied / Civilian / POW' },
  { key: 'cbrn',     label: 'LINE 9 — CBRN',          placeholder: 'CBRN contamination or N/A' },
];

const SPOT_FIELDS = [
  { key: 'who',      label: 'WHO',      placeholder: 'Reporting callsign' },
  { key: 'what',     label: 'WHAT',     placeholder: 'What observed' },
  { key: 'where',    label: 'WHERE',    placeholder: 'MGRS location', autoFill: 'grid' },
  { key: 'when',     label: 'WHEN',     placeholder: 'DTG', autoFill: 'datetime' },
  { key: 'why',      label: 'WHY',      placeholder: 'Intent / significance' },
];

const REPORTS = [
  { id: 'salute', label: 'SALUTE',       sub: 'Enemy contact report',  fields: SALUTE_FIELDS  },
  { id: 'medevac',label: '9-LINE MEDEVAC', sub: 'Medical evacuation request', fields: MEDEVAC_FIELDS },
  { id: 'spot',   label: 'SPOT REPORT',  sub: 'Observation report',    fields: SPOT_FIELDS    },
];

function getNowDTG() {
  const n = new Date();
  const dd = String(n.getUTCDate()).padStart(2,'0');
  const hh = String(n.getUTCHours()).padStart(2,'0');
  const mm = String(n.getUTCMinutes()).padStart(2,'0');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${dd}${hh}${mm}Z ${months[n.getUTCMonth()]} ${n.getUTCFullYear()}`;
}

function buildReportText(fields, values, label) {
  const lines = [`=== ${label} ===`];
  fields.forEach(f => {
    lines.push(`${f.label}: ${values[f.key] || '---'}`);
  });
  return lines.join('\n');
}

function ReportForm({ report, mgrs }) {
  const initValues = () => {
    const v = {};
    report.fields.forEach(f => {
      if (f.autoFill === 'grid') v[f.key] = mgrs || '';
      else if (f.autoFill === 'datetime') v[f.key] = getNowDTG();
      else v[f.key] = '';
    });
    return v;
  };

  const [values, setValues] = useState(initValues);
  const [copied, setCopied] = useState(false);

  const set = (key, val) => setValues(prev => ({ ...prev, [key]: val }));
  const clear = () => setValues(initValues());

  const copy = () => {
    const text = buildReportText(report.fields, values, report.label);
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View>
      {report.fields.map(f => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <TextInput
            style={[styles.fieldInput, f.autoFill && styles.fieldInputAuto]}
            value={values[f.key]}
            onChangeText={v => set(f.key, v)}
            placeholder={f.placeholder}
            placeholderTextColor="#3A0000"
            autoCapitalize="characters"
            autoCorrect={false}
            multiline={false}
          />
        </View>
      ))}

      <View style={styles.reportBtns}>
        <TouchableOpacity style={styles.copyBtn} onPress={copy}>
          <Text style={styles.copyBtnText}>{copied ? 'COPIED ✓' : 'COPY REPORT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={clear}>
          <Text style={styles.clearBtnText}>CLEAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ReportScreen({ mgrs }) {
  const [openReport, setOpenReport] = useState(null);

  const toggle = useCallback((id) => {
    setOpenReport(prev => prev === id ? null : id);
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>REPORTS</Text>
        <Text style={styles.subtitle}>RADIO-READY TEMPLATES</Text>
      </View>

      {mgrs && (
        <View style={styles.autoFillBanner}>
          <Text style={styles.autoFillText}>AUTO-FILLING GRID: {mgrs}</Text>
        </View>
      )}

      {REPORTS.map(report => {
        const isOpen = openReport === report.id;
        return (
          <View key={report.id} style={[styles.card, isOpen && styles.cardOpen]}>
            <TouchableOpacity style={styles.cardHeader} onPress={() => toggle(report.id)} activeOpacity={0.7}>
              <View>
                <Text style={styles.cardTitle}>{report.label}</Text>
                <Text style={styles.cardSub}>{report.sub}</Text>
              </View>
              <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>▶</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.cardBody}>
                <View style={styles.cardDivider} />
                <ReportForm report={report} mgrs={mgrs} />
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>REPORTS ARE EPHEMERAL · CLEARED ON EXIT · NO DATA STORED</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingTop: 4 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 5, color: RED },
  subtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, color: RED3 },

  autoFillBanner: { borderWidth: 1, borderColor: RED3, backgroundColor: RED5, padding: 8, marginBottom: 12 },
  autoFillText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED2 },

  card: { borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000', marginBottom: 8 },
  cardOpen: { borderColor: RED2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, color: RED, fontWeight: '700', marginBottom: 2 },
  cardSub:   { fontFamily: 'monospace', fontSize: 9,  letterSpacing: 2, color: RED3 },
  chevron:   { fontFamily: 'monospace', fontSize: 10, color: RED3 },
  chevronOpen: { color: RED, transform: [{ rotate: '90deg' }] },
  cardBody: { paddingHorizontal: 14, paddingBottom: 16 },
  cardDivider: { height: 1, backgroundColor: RED4, marginBottom: 14 },

  field: { marginBottom: 10 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: RED3, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1, borderColor: RED3, backgroundColor: '#110000',
    color: RED, fontFamily: 'monospace', fontSize: 12, letterSpacing: 2,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  fieldInputAuto: { borderColor: RED2, color: RED },

  reportBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  copyBtn: { flex: 2, borderWidth: 1, borderColor: RED2, backgroundColor: RED4, paddingVertical: 12, alignItems: 'center' },
  copyBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: RED, fontWeight: '700' },
  clearBtn: { flex: 1, borderWidth: 1, borderColor: RED3, paddingVertical: 12, alignItems: 'center' },
  clearBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: RED3 },

  footer: { paddingTop: 24, alignItems: 'center' },
  footerText: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: RED4 },
});
