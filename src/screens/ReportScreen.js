/**
 * ReportScreen — Radio-ready report templates.
 * Free: SALUTE, 9-Line MEDEVAC, SPOT
 * Pro: ICS 201 (Incident Command), ANGUS (Artillery), Custom template
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, LayoutAnimation, UIManager, Platform, AccessibilityInfo,
} from 'react-native';
// Lazy-load expo-clipboard to prevent crash if native module is unavailable
let ExpoClipboard = null;
try {
  ExpoClipboard = require('expo-clipboard');
} catch (e) {
  // expo-clipboard not available — copy will fall back to alert-only
}
import { useColors } from '../utils/ThemeContext';
import { tapMedium, notifySuccess, notifyWarning } from '../utils/haptics';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const SPRING_ANIM = {
  duration: 280,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

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

const CASEVAC_FIELDS = [
  { key: 'grid',      label: 'PICKUP GRID',           placeholder: 'MGRS of pickup site', autoFill: 'grid' },
  { key: 'callsign',  label: 'CALLSIGN / FREQ',       placeholder: 'Requesting callsign & frequency' },
  { key: 'casualties', label: 'CASUALTIES',            placeholder: 'Number and type (ambulatory/litter)' },
  { key: 'injuries',  label: 'INJURIES / ILLNESS',     placeholder: 'Nature of injuries' },
  { key: 'security',  label: 'SECURITY AT PICKUP',     placeholder: 'Clear / Hostile / Unknown' },
  { key: 'marking',   label: 'MARKING',                placeholder: 'Panels / Smoke / None' },
  { key: 'equip',     label: 'EQUIPMENT NEEDED',       placeholder: 'Ventilator / Litter / None' },
  { key: 'time',      label: 'TIME OF INJURY',         placeholder: 'DTG', autoFill: 'datetime' },
];

const REPORTS = [
  { id: 'salute',   label: 'SALUTE',          sub: 'Enemy contact report',       fields: SALUTE_FIELDS,   pro: false },
  { id: 'medevac',  label: '9-LINE MEDEVAC',  sub: 'Medical evacuation request', fields: MEDEVAC_FIELDS,  pro: false },
  { id: 'spot',     label: 'SPOT REPORT',     sub: 'Observation report',         fields: SPOT_FIELDS,     pro: false },
  { id: 'ics201',   label: 'ICS 201',         sub: 'Incident command briefing',  fields: ICS201_FIELDS,   pro: true  },
  { id: 'casevac',  label: 'CASEVAC',         sub: 'Casualty evacuation request', fields: CASEVAC_FIELDS, pro: true  },
  { id: 'angus',    label: 'ANGUS / CFF',     sub: 'Call for fire — artillery',  fields: ANGUS_FIELDS,    pro: true  },
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
  const colors = useColors();
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

  // Keep auto-fill fields updated when GPS position changes
  useEffect(() => {
    setVals(prev => {
      const updated = { ...prev };
      let changed = false;
      report.fields.forEach(f => {
        if (f.autoFill === 'grid') {
          const newVal = mgrs || '';
          if (updated[f.key] !== newVal) { updated[f.key] = newVal; changed = true; }
        }
      });
      return changed ? updated : prev;
    });
  }, [mgrs, report.fields]);

  const handleOpen = () => {
    if (isLocked) {
      tapMedium();
      // Show ProGate modal directly — matches ThemeScreen pattern
      onShowProGate(report.label);
      return;
    }
    tapMedium();
    LayoutAnimation.configureNext(SPRING_ANIM);
    setOpen(o => !o);
  };

  const copy = () => {
    const text = buildReport(report.id, report.fields, vals);
    if (ExpoClipboard && typeof ExpoClipboard.setStringAsync === 'function') {
      ExpoClipboard.setStringAsync(text).catch(() => {});
    }
    notifySuccess();
    AccessibilityInfo.announceForAccessibility('Report copied to clipboard');
    Alert.alert('Copied', 'Report copied to clipboard.');
  };

  const clear = () => {
    Alert.alert('Clear Report?', 'Reset all fields to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { notifyWarning(); setVals(initVals()); } },
    ]);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, open && { borderColor: colors.text2 }, isLocked && styles.cardLocked]}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={handleOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${report.label} report. ${report.sub}${isLocked ? '. Pro feature, locked.' : ''}`}
        accessibilityHint={isLocked ? 'Double tap to view upgrade options' : (open ? 'Double tap to collapse' : 'Double tap to expand')}
      >
        <View>
          <View style={styles.labelRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{report.label}</Text>
            {isLocked && <Text style={[styles.proBadge, { color: colors.bg, backgroundColor: colors.text }]} importantForAccessibility="no">PRO</Text>}
          </View>
          <Text style={[styles.cardSub, { color: colors.text3 }]}>{report.sub}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.border }, open && { transform: [{ rotate: '90deg' }] }]} importantForAccessibility="no">▶</Text>
      </TouchableOpacity>

      {open && (
        <View style={[styles.cardBody, { borderTopColor: colors.border2 }]}>
          {report.fields.map(f => {
            const isAuto = !!f.autoFill;
            return (
              <View key={f.key} style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.border }]}>{f.label}</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }, isAuto && { borderColor: colors.text2 }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.border}
                  value={vals[f.key]}
                  onChangeText={t => setVals(v => ({ ...v, [f.key]: t }))}
                  multiline={f.key === 'situation' || f.key === 'objectives'}
                  accessibilityLabel={f.label}
                />
              </View>
            );
          })}
          <View style={styles.reportBtns}>
            <TouchableOpacity style={[styles.copyBtn, { backgroundColor: colors.border }]} onPress={copy} accessibilityRole="button" accessibilityLabel="Copy report to clipboard">
              <Text style={[styles.copyBtnText, { color: colors.text }]}>COPY REPORT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clear} accessibilityRole="button" accessibilityLabel="Clear all report fields">
              <Text style={[styles.clearBtnText, { color: colors.border }]}>CLEAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export function ReportScreen({ mgrs, isPro, onShowProGate }) {
  const colors = useColors();
  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>REPORTS</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>RADIO-READY TEMPLATES</Text>
      </View>

      {mgrs && (
        <View style={[styles.autoBanner, { borderColor: colors.border, backgroundColor: colors.text5 }]}>
          <Text style={[styles.autoText, { color: colors.text2 }]}>AUTO-FILLING GRID: {mgrs}</Text>
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

      <Text style={[styles.footer, { color: colors.text4 }]}>REPORTS ARE EPHEMERAL · CLEARED ON EXIT · NO DATA STORED</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 4 },
  subtitle: { fontSize: 8, letterSpacing: 2 },
  autoBanner: {
    borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
  },
  autoText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 },
  card: { marginBottom: 10, borderWidth: 1 },
  cardLocked: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  proBadge: {
    fontFamily: 'monospace', fontSize: 8,
    paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2,
  },
  cardSub: { fontSize: 9, letterSpacing: 1 },
  chevron: { fontFamily: 'monospace', fontSize: 10 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1 },
  fieldBlock: { marginTop: 10 },
  fieldLabel: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1,
    fontFamily: 'monospace', fontSize: 13,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  reportBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  copyBtn: { flex: 2, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  copyBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 3 },
  clearBtn: { flex: 1, borderWidth: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  clearBtnText: { fontSize: 10, letterSpacing: 3 },
  footer: { fontSize: 10, textAlign: 'center', marginTop: 20, letterSpacing: 1 },
});
