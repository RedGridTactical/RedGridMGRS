/**
 * ExtraReportsScreen — Pro report templates.
 * ICS 201 Incident Command, CASEVAC, and a Custom template builder.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Clipboard } from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

const ICS201_FIELDS = [
  { key: 'incident',  label: 'INCIDENT NAME',           placeholder: '' },
  { key: 'date',      label: 'DATE / TIME',              placeholder: '', autoFill: 'datetime' },
  { key: 'location',  label: 'INCIDENT LOCATION (MGRS)', placeholder: '', autoFill: 'grid' },
  { key: 'cmdpost',   label: 'COMMAND POST LOCATION',    placeholder: '' },
  { key: 'ic',        label: 'INCIDENT COMMANDER',       placeholder: '' },
  { key: 'situation', label: 'SITUATION SUMMARY',        placeholder: '' },
  { key: 'objectives',label: 'CURRENT OBJECTIVES',       placeholder: '' },
  { key: 'resources', label: 'RESOURCES ASSIGNED',       placeholder: '' },
  { key: 'comms',     label: 'COMMUNICATIONS PLAN',      placeholder: '' },
];

const CASEVAC_FIELDS = [
  { key: 'grid',      label: 'LINE 1 — PICKUP GRID',         placeholder: '', autoFill: 'grid' },
  { key: 'callsign',  label: 'LINE 2 — CALLSIGN / FREQ',     placeholder: '' },
  { key: 'patients',  label: 'LINE 3 — PATIENT COUNT',       placeholder: 'Ambulatory / Litter' },
  { key: 'equipment', label: 'LINE 4 — SPECIAL EQUIPMENT',   placeholder: 'Litter / Oxygen / None' },
  { key: 'security',  label: 'LINE 5 — SECURITY AT SITE',    placeholder: 'Hot / Cold / Unknown' },
  { key: 'marking',   label: 'LINE 6 — SITE MARKING',        placeholder: 'Smoke color / Panels / None' },
  { key: 'nation',    label: 'LINE 7 — NATIONALITY / STATUS',placeholder: 'US / Allied / Civilian' },
  { key: 'terrain',   label: 'LINE 8 — TERRAIN / OBSTACLES', placeholder: '' },
];

function getNowDTG() {
  const n = new Date();
  const dd = String(n.getUTCDate()).padStart(2,'0');
  const hh = String(n.getUTCHours()).padStart(2,'0');
  const mm = String(n.getUTCMinutes()).padStart(2,'0');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${dd}${hh}${mm}Z ${months[n.getUTCMonth()]} ${n.getUTCFullYear()}`;
}

function buildText(fields, values, title) {
  return [`=== ${title} ===`, ...fields.map(f => `${f.label}: ${values[f.key] || '---'}`)].join('\n');
}

function ReportForm({ fields, label, mgrs }) {
  const init = () => {
    const v = {};
    fields.forEach(f => {
      if (f.autoFill === 'grid') v[f.key] = mgrs || '';
      else if (f.autoFill === 'datetime') v[f.key] = getNowDTG();
      else v[f.key] = '';
    });
    return v;
  };
  const [values, setValues] = useState(init);
  const [copied, setCopied] = useState(false);
  const set = (k, v) => setValues(p => ({ ...p, [k]: v }));
  const copy = () => {
    Clipboard.setString(buildText(fields, values, label));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View>
      {fields.map(f => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <TextInput
            style={[styles.fieldInput, f.autoFill && styles.fieldInputAuto]}
            value={values[f.key]}
            onChangeText={v => set(f.key, v)}
            placeholder={f.placeholder || '—'}
            placeholderTextColor="#3A0000"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      ))}
      <View style={styles.btns}>
        <TouchableOpacity style={styles.copyBtn} onPress={copy}>
          <Text style={styles.copyBtnText}>{copied ? 'COPIED ✓' : 'COPY REPORT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={() => setValues(init())}>
          <Text style={styles.clearBtnText}>CLEAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const REPORTS = [
  { id: 'ics201',  label: 'ICS 201',   sub: 'Incident Command System',  fields: ICS201_FIELDS },
  { id: 'casevac', label: 'CASEVAC',   sub: 'Casualty evacuation',       fields: CASEVAC_FIELDS },
];

export function ExtraReportsScreen({ mgrs }) {
  const [open, setOpen] = useState(null);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>ADDITIONAL REPORT TEMPLATES — PRO</Text>

      {REPORTS.map(r => {
        const isOpen = open === r.id;
        return (
          <View key={r.id} style={[styles.card, isOpen && styles.cardOpen]}>
            <TouchableOpacity style={styles.cardHeader} onPress={() => setOpen(isOpen ? null : r.id)}>
              <View>
                <Text style={styles.cardTitle}>{r.label}</Text>
                <Text style={styles.cardSub}>{r.sub}</Text>
              </View>
              <Text style={[styles.chev, isOpen && styles.chevOpen]}>▶</Text>
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.cardBody}>
                <View style={styles.divider} />
                <ReportForm fields={r.fields} label={r.label} mgrs={mgrs} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3, marginBottom: 12 },
  card: { borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000', marginBottom: 8 },
  cardOpen: { borderColor: RED2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, color: RED, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3 },
  chev: { fontFamily: 'monospace', fontSize: 10, color: RED3 },
  chevOpen: { color: RED, transform: [{ rotate: '90deg' }] },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, backgroundColor: RED4, marginBottom: 12 },
  field: { marginBottom: 10 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3, marginBottom: 4 },
  fieldInput: { borderWidth: 1, borderColor: RED3, backgroundColor: '#110000', color: RED, fontFamily: 'monospace', fontSize: 11, paddingHorizontal: 10, paddingVertical: 8 },
  fieldInputAuto: { borderColor: RED2 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  copyBtn: { flex: 2, borderWidth: 1, borderColor: RED2, backgroundColor: RED4, paddingVertical: 12, alignItems: 'center' },
  copyBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: RED, fontWeight: '700' },
  clearBtn: { flex: 1, borderWidth: 1, borderColor: RED3, paddingVertical: 12, alignItems: 'center' },
  clearBtnText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: RED3 },
});
