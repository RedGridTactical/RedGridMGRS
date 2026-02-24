/**
 * ReportScreen — Radio-ready report templates.
 * Free: SALUTE, 9-Line MEDEVAC, SPOT
 * Pro: ICS 201 (Incident Command), ANGUS (Artillery), Custom template
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Clipboard, Alert,
} from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

// ─── REPORT DEFINITIONS ──────────────────────────────────────────────────────
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
  { key: 'who',   label: 'WHO',   placeholder: 'Reporting callsign' },
  { key: 'what',  label: 'WHAT',  placeholder: 'What observed' },
  { key: 'where', label: 'WHERE', placeholder: 'MGRS location', autoFill: 'grid' },
  { key: 'when',  label: 'WHEN',  placeholder: 'DTG', autoFill: 'datetime' },
  { key: 'why',   label: 'WHY',   placeholder: 'Intent / significance' },
];

// Pro templates
const ICS201_FIELDS = [
  { key: 'incident',  label: 'INCIDENT NAME',    placeholder: 'Operation / incident name' },
  { key: 'date',      label: 'DATE / TIME',       placeholder: 'DTG', autoFill: 'datetime' },
  { key: 'location',  label: 'LOCATION',          placeholder: 'MGRS / address', autoFill: 'grid' },
  { key: 'situation', label: 'SITUATION',          placeholder: 'Current situation summary' },
  { key: 'resources', label: 'RESOURCES ASSIGNED', placeholder: 'Units / personnel / equipment' },
  { key: 'ic',        label: 'INCIDENT COMMANDER', placeholder: 'Name / callsign' },
  { key: 'objectives',label: 'OBJECTIVES',         placeholder: 'Priority actions' },
  { key: 'safety',    label: 'SAFETY MESSAGE',     placeholder: 'Hazards / precautions' },
];

const ANGUS_FIELDS = [
  { key: 'unit',      label: 'UNIT / CALLSIGN',    placeholder: 'Requesting callsign' },
  { key: 'grid',      label: 'TARGET GRID',         placeholder: 'MGRS', autoFill: 'grid' },
  { key: 'altitude',  label: 'TARGET ALTITUDE',     placeholder: 'MSL in metres' },
  { key: 'description',label:'TARGET DESCRIPTION',  placeholder: 'Personnel, vehicle, structure...' },
  { key: 'danger',    label: 'DANGER CLOSE',         placeholder: 'Distance to friendlies (m)' },
  { key: 'effects',   label: 'DESIRED EFFECTS',      placeholder: 'Neutralise / Suppress / Destroy' },
  { key: 'method',    label: 'METHOD OF ENGAGEMENT', placeholder: 'Direction, number of rounds...' },
  { key: 'clearance', label: 'CLEARANCE',            placeholder: 'Auth callsign / code word' },
];

const REPORTS = [
  { id: 'salute',  label: 'SALUTE',          sub: 'Enemy contact report',       fields: SALUTE_FIELDS,  pro: false },
  { id: 'medevac', label: '9-LINE MEDEVAC',  sub: 'Medical evacuation request', fields: MEDEVAC_FIELDS, pro: false },
  { id: 'spot',    label: 'SPOT REPORT',     sub: 'Observation report',         fields: SPOT_FIELDS,    pro: false },
  { id: 'ics201',  label: 'ICS 201',         sub: 'Incident command briefing',  fields: ICS201_FIELDS,  pro: true  },
  { id: 'angus',   label: 'ANGUS / CFF',     sub: 'Call for fire — artillery',  fields: ANGUS_FIELDS,   pro: true  },
];

function getNowDTG() {
  const n = new Date();
  const dd = String(n.getUTCDate()).padStart(2,'0');
  const hh = String(n.getUTCHours()).padStart(2,'0');
  const mm = String(n.getUTCMinutes()).padStart(2,'0');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${dd}${hh}${mm}Z ${months[n.getUTCMonth()]} ${n.getUTCFullYear()}`;
}

function buildReport(reportId, fields, values) {
  const header = `=== ${REPORTS.find(r=>r.id===reportId)?.label ?? reportId.toUpperCase()} ===`;
  const lines = fields.map(f => `${f.label}: ${values[f.key] || '—'}`);
  return [header, ...lines].join('\n');
}

function ReportCard({ report, mgrs, isPro, onShowProGate }) {
  const initVals = useCallback(() => {
    const v = {};
    report.fields.forEach(f => {
      v[f.key] = f.autoFill === 'grid' ? (mgrs || '') : f.autoFill === 'datetime' ? getNowDTG() : '';
    });
    return v;
  }, [report, mgrs]);

  const [open, setOpen]   = useState(false);
  const [vals, setVals]   = useState(initVals);
  const isLocked = report.pro && !isPro;

  const handleOpen = () => {
    if (isLocked) { onShowProGate(report.label); return; }
    setOpen(o => !o);
  };

  const copy = () => {
    const text = buildReport(report.id, report.fields, vals);
    Clipboard.setString(text);
    Alert.alert('Copied', 'Report copied to clipboard.');
  };

  const clear = () => setVals(initVals());

  return (
    <View style={[styles.card, open && styles.cardOpen, isLocked && styles.cardLocked]}>
      <TouchableOpacity style={styles.cardHeader} onPress={handleOpen} activeOpacity={0.7}>
        <View>
          <View style={styles.labelRow}>
            <Text style={styles.cardTitle}>{report.label}</Text>
            {isLocked && <Text style={styles.proBadge}>PRO</Text>}
          </View>
          <Text style={styles.cardSub}>{report.sub}</Text>
        </View>
        <Text style={[styles.chevron, open && styles.chevronOpen]}>▶</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.cardBody}>
          {report.fields.map(f => {
            const isAuto = !!f.autoFill;
            return (
              <View key={f.key} style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={[styles.fieldInput, isAuto && styles.fieldInputAuto]}
                  placeholder={f.placeholder}
                  placeholderTextColor={RED3}
                  value={vals[f.key]}
                  onChangeText={t => setVals(v => ({ ...v, [f.key]: t }))}
                  multiline={f.key === 'situation' || f.key === 'objectives'}
                />
              </View>
            );
          })}
          <View style={styles.reportBtns}>
            <TouchableOpacity style={styles.copyBtn} onPress={copy}>
              <Text style={styles.copyBtnText}>COPY REPORT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearBtn} onPress={clear}>
              <Text style={styles.clearBtnText}>CLEAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export function ReportScreen({ mgrs, isPro, onShowProGate }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>REPORTS</Text>
        <Text style={styles.subtitle}>RADIO-READY TEMPLATES</Text>
      </View>

      {mgrs && (
        <View style={styles.autoBanner}>
          <Text style={styles.autoText}>AUTO-FILLING GRID: {mgrs}</Text>
        </View>
      )}

      {REPORTS.map(r => (
        <ReportCard
          key={r.id}
          report={r}
          mgrs={mgrs}
          isPro={isPro}
          onShowProGate={onShowProGate}
        />
      ))}

      <Text style={styles.footer}>REPORTS ARE EPHEMERAL · CLEARED ON EXIT · NO DATA STORED</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 4, color: RED },
  subtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3 },
  autoBanner: {
    borderWidth: 1, borderColor: RED3, backgroundColor: RED5,
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
  },
  autoText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: RED2 },
  card: { marginBottom: 10, borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000' },
  cardOpen: { borderColor: RED2 },
  cardLocked: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2, color: RED },
  proBadge: {
    fontFamily: 'monospace', fontSize: 8, color: BG,
    backgroundColor: RED, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  cardSub: { fontFamily: 'monospace', fontSize: 9, color: RED3, letterSpacing: 1 },
  chevron: { fontFamily: 'monospace', fontSize: 10, color: RED3 },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: RED4 },
  fieldBlock: { marginTop: 10 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1, borderColor: RED3, backgroundColor: '#110000',
    color: RED, fontFamily: 'monospace', fontSize: 13,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  fieldInputAuto: { borderColor: RED2 },
  reportBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  copyBtn: { flex: 2, backgroundColor: RED3, paddingVertical: 11, alignItems: 'center' },
  copyBtnText: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', color: RED, letterSpacing: 3 },
  clearBtn: { flex: 1, borderWidth: 1, borderColor: RED3, paddingVertical: 11, alignItems: 'center' },
  clearBtnText: { fontFamily: 'monospace', fontSize: 10, color: RED3, letterSpacing: 3 },
  footer: { fontFamily: 'monospace', fontSize: 7, color: RED4, textAlign: 'center', marginTop: 20, letterSpacing: 1 },
});
