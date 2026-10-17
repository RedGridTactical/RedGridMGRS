/**
 * ReportScreen — Radio-ready report templates.
 * Free: SALUTE, 9-Line MEDEVAC, SPOT
 * Draft fields save in on-device SQLite until explicitly cleared.
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, UIManager, Platform, AccessibilityInfo } from 'react-native';
import { TextInput } from '../components/FieldInput';
import { Alert } from '../utils/fieldAlert';
import { copyTextToClipboard } from '../utils/clipboard';
import { useSessionDraft } from '../hooks/useSessionDraft';
import { useReportDrafts } from '../hooks/useReportDrafts';
import { IncidentWorkspace, IncidentWorkspaceCard, ReportSaveStatus } from '../components/IncidentWorkspace';
import { createDeviceAnnotation, formatWorkflowUTC } from '../utils/toolWorkflow';
import { useColors } from '../utils/ThemeContext';
import { tapMedium, notifySuccess, notifyWarning } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';
import { getMedevacFields, validMedevacContext, hasReportContent, formatReportTimestamp, buildReportText, MEDEVAC_REFERENCE, ICS201_REFERENCE } from '../utils/reportTemplates';

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
  { key: 'date',      label: 'DATE / TIME',       placeholder: 'YYYY-MM-DD HH:mm ±HH:mm', autoFill: 'datetime' },
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
  { id: 'salute',   label: 'SALUTE',          labelKey: 'reports.salute',    subKey: 'reports.saluteSub',    fields: SALUTE_FIELDS,   pro: false },
  { id: 'medevac',  label: '9-LINE MEDEVAC',  labelKey: 'reports.medevac',   subKey: 'reports.medevacSub',   fields: [], pro: false, scopeKey: 'medevacScope', reference: MEDEVAC_REFERENCE },
  { id: 'spot',     label: 'SPOT REPORT',     labelKey: 'reportCorrections.spotTitle', subKey: 'reports.spotReportSub', fields: SPOT_FIELDS, pro: false, scopeKey: 'spotScope' },
  { id: 'ics201',   label: 'ICS 201',         labelKey: 'reportCorrections.adaptedTitle', subKey: 'reports.ics201Sub', fields: ICS201_FIELDS, pro: true, scopeKey: 'icsScope', reference: ICS201_REFERENCE },
  { id: 'casevac',  label: 'CASEVAC',         labelKey: 'reports.casevac',   subKey: 'reports.casevacSub',   fields: CASEVAC_FIELDS, pro: true, scopeKey: 'casevacScope' },
  { id: 'angus',    label: 'ANGUS / CFF',     labelKey: 'reports.angusCff',  subKey: 'reports.angusCffSub',  fields: ANGUS_FIELDS, pro: true, scopeKey: 'unverifiedScope' },
];

function ReportCard({ report, mgrs, location, isPro, trialEligible, onShowProGate }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [open, setOpen] = useSessionDraft(`report:${report.id}:open`, false);
  const saved = useReportDrafts();
  const draft = saved.data.worksheets[report.id] || { values:{},sources:{} };
  const setDraft = next => saved.store.change(current=>({...current,worksheets:{...current.worksheets,[report.id]:typeof next==='function'?next(current.worksheets[report.id]||{values:{},sources:{}}):next}}));
  const vals = draft.values;
  const fields = report.id === 'medevac' ? getMedevacFields(draft.context) : report.fields;
  const timeBasis = report.id === 'ics201' ? 'local' : 'utc';
  const hasTimeField = fields.some(field => field.autoFill === 'datetime');
  const scope = report.scopeKey ? t(`reportCorrections.${report.scopeKey}`) : null;
  const readOnly = report.pro && !isPro;
  const isLocked = readOnly && !hasReportContent(fields,vals);
  const editingDisabled = readOnly || saved.loading || !!saved.loadError || saved.locked;
  const copyBusy = useRef(false);
  const [copying, setCopying] = useState(false);
  const sourceLabel = source => source?.kind === 'device'
    ? t('reportCorrections.positionReference', { source: t(source.source === 'external' ? 'gps.sourceExternal' : 'gps.sourcePhone'), time: formatWorkflowUTC(source.fixTimestamp), accuracy: Number.isFinite(source.accuracy) ? `±${source.accuracy} m` : t('gps.accuracyUnknown') })
    : source?.kind === 'time' ? t('workflow.sourceTime', { time: formatWorkflowUTC(source.timestamp) })
    : t('workflow.manualValue');
  const insertReference = field => {
    const now = Date.now();
    if (field.autoFill === 'grid') {
      const annotation = createDeviceAnnotation(location, now);
      if (!annotation) { Alert.alert(t('gps.noGpsFix'), t('workflow.annotationNoFix')); return; }
      setDraft(previous => ({ ...previous, values: { ...previous.values, [field.key]: annotation.grid }, sources: { ...previous.sources, [field.key]: { kind: 'device', ...annotation } } }));
    } else {
      setDraft(previous => ({ ...previous, values: { ...previous.values, [field.key]: formatReportTimestamp(now, timeBasis) }, sources: { ...previous.sources, [field.key]: { kind: 'time', timestamp: now } } }));
    }
  };

  const handleOpen = () => {
    if (isLocked) {
      tapMedium();
      // Show ProGate modal directly — matches ThemeScreen pattern
      onShowProGate(report.label, 'reports');
      return;
    }
    tapMedium();
    LayoutAnimation.configureNext(SPRING_ANIM);
    setOpen(o => !o);
  };

  const copy = async () => {
    if (copyBusy.current) return;
    if (report.id === 'medevac' && !validMedevacContext(draft.context)) {
      Alert.alert(t('reportCorrections.contextMissing'), t('reportCorrections.chooseContext')); return;
    }
    if (!hasReportContent(fields, vals)) {
      Alert.alert(t('reportCorrections.emptyTitle'), t('reportCorrections.emptyBody')); return;
    }
    copyBusy.current = true; setCopying(true);
    const references = fields.filter(f => draft.sources[f.key]).map(f => `${f.labelKey ? t(f.labelKey) : f.label} — ${sourceLabel(draft.sources[f.key])}`);
    const text = [buildReportText({ title: t(report.labelKey), fields, values: vals, scope, reference: report.reference,
      context: report.id === 'medevac' ? draft.context : null, timeBasis: hasTimeField ? timeBasis : null, t }), ...references].join('\n');
    try {
      await saved.store.flush();
      await copyTextToClipboard(text);
      notifySuccess();
      AccessibilityInfo.announceForAccessibility(t('reports.reportCopied'));
      Alert.alert(t('reports.copied'), t('reports.copiedMsg'));
    } catch {
      AccessibilityInfo.announceForAccessibility(t('workflow.copyFailed'));
      Alert.alert(t('workflow.copyFailed'));
    } finally { copyBusy.current = false; setCopying(false); }
  };

  const clear = () => {
    Alert.alert(t('reports.clearReport'), t('reports.clearReportMsg'), [
      { text: t('reports.cancel'), style: 'cancel' },
      { text: t('reports.clear'), style: 'destructive', onPress: () => {
        saved.store.commit(current=>({...current,worksheets:{...current.worksheets,[report.id]:{values:{},sources:{}}}}))
          .then(notifyWarning).catch(()=>{});
      } },
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
        accessibilityLabel={`${t(report.labelKey)} report. ${t(report.subKey)}${isLocked ? '. Pro feature, locked.' : ''}`}
        accessibilityHint={isLocked ? 'Double tap to view upgrade options' : (open ? 'Double tap to collapse' : 'Double tap to expand')}
      >
        <View style={styles.cardText}>
          <View style={styles.labelRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t(report.labelKey)}</Text>
            {isLocked && <Text style={[styles.proBadge, { color: colors.bg, backgroundColor: colors.text }]} importantForAccessibility="no">{trialEligible ? t('proGate.tryFreeBadge') : 'PRO'}</Text>}
          </View>
          <Text style={[styles.cardSub, { color: colors.text3 }]}>{t(report.subKey)}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.text3 }, open && { transform: [{ rotate: '90deg' }] }]} importantForAccessibility="no">▶</Text>
      </TouchableOpacity>

      {open && !isLocked && (
        <View style={[styles.cardBody, { borderTopColor: colors.border2 }]}>
          {readOnly && <Text style={[styles.referenceHint,{color:colors.text2}]}>{t('incident.proReadOnly')}</Text>}
          {scope && <Text style={[styles.referenceHint, { color: colors.text2, marginTop: 12 }]}>{scope}</Text>}
          {report.reference && <Text style={[styles.referenceHint, { color: colors.text3, marginTop: 6 }]}>{t('reportCorrections.referenceLabel')}: {report.reference}</Text>}
          {hasTimeField && <Text style={[styles.referenceHint, { color: colors.text3, marginTop: 6 }]}>{t('reportCorrections.insertedTimeNote', { basis: t(`reportCorrections.${timeBasis === 'local' ? 'localTime' : 'utcTime'}`) })}</Text>}
          {report.id === 'medevac' && <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text3 }]}>{t('reportCorrections.contextTitle')}</Text>
            <View style={styles.contextRow}>{['peacetime', 'wartime'].map(context => <TouchableOpacity key={context}
              accessibilityRole="radio" accessibilityState={{ checked: draft.context === context, disabled: copying || editingDisabled }}
              accessibilityLabel={t(`reportCorrections.${context}`)} disabled={copying || editingDisabled}
              onPress={() => setDraft(previous => ({ ...previous, context }))}
              style={[styles.contextButton, { borderColor: draft.context === context ? colors.text2 : colors.border, backgroundColor: draft.context === context ? colors.card2 : colors.card }]}>
              <Text style={[styles.copyBtnText, { color: colors.text }]}>{t(`reportCorrections.${context}`)}</Text>
            </TouchableOpacity>)}</View>
            {!validMedevacContext(draft.context) && <Text style={[styles.referenceHint, { color: colors.text3 }]}>{t('reportCorrections.chooseContext')}</Text>}
          </View>}
          {fields.map(f => {
            const hasReference = !!draft.sources[f.key];
            const label = f.labelKey ? t(f.labelKey) : f.label;
            return (
              <View key={f.key} style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, { color: colors.text3 }]}>{label}</Text>
                {f.hintKey && <Text style={[styles.referenceHint, { color: colors.text2, marginBottom: 6 }]}>{t(f.hintKey)}</Text>}
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card2, color: colors.text }, hasReference && { borderColor: colors.text2 }]}
                  placeholder={f.placeholder || t('reportCorrections.blank')}
                  placeholderTextColor={colors.text3}
                  value={vals[f.key] || ''}
                  editable={!editingDisabled}
                  onChangeText={value => setDraft(previous => ({ ...previous, values: { ...previous.values, [f.key]: value }, sources: { ...previous.sources, [f.key]: null } }))}
                  maxLength={2000}
                  multiline={f.key === 'situation' || f.key === 'objectives' || f.key === 'injuryDetails' || f.key === 'terrain'}
                  accessibilityLabel={label}
                />
                {f.autoFill && <>
                  <Text style={[styles.referenceHint, { color: colors.text3 }]}>{sourceLabel(draft.sources[f.key])}</Text>
                  <TouchableOpacity onPress={() => insertReference(f)} disabled={editingDisabled || (f.autoFill === 'grid' && !location)} accessibilityRole="button" accessibilityState={{ disabled: editingDisabled || (f.autoFill === 'grid' && !location) }} style={styles.referenceButton}>
                    <Text style={[styles.referenceHint, { color: colors.text2 }]}>{t(f.autoFill === 'grid' ? 'workflow.insertDevicePosition' : 'workflow.insertCurrentTime')}</Text>
                  </TouchableOpacity>
                </>}
              </View>
            );
          })}
          <View style={styles.reportBtns}>
            <TouchableOpacity style={[styles.copyBtn, { backgroundColor: colors.border }]} onPress={copy} disabled={copying || saved.loading || !!saved.loadError || saved.locked} accessibilityState={{ disabled: copying || saved.loading || !!saved.loadError || saved.locked }} accessibilityRole="button" accessibilityLabel={t('reports.copyReport')}>
              <Text style={[styles.copyBtnText, { color: colors.text }]}>{t('reports.copyReport')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.clearBtn, { borderColor: colors.border }]} onPress={clear} disabled={saved.loading || !!saved.loadError || saved.locked} accessibilityRole="button" accessibilityLabel={t('reports.clear')}>
              <Text style={[styles.clearBtnText, { color: colors.text3 }]}>{t('reports.clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export function ReportScreen({ mgrs, location, isPro, trialEligible, onShowProGate, incidentRequest, onIncidentRequestHandled }) {
  const colors = useColors();
  const { t } = useTranslation();
  const saved=useReportDrafts();
  const [workspaceOpen,setWorkspaceOpen]=useSessionDraft('report:workspace:open',false);
  useEffect(()=>{if(incidentRequest)setWorkspaceOpen(true);},[incidentRequest]);
  if(workspaceOpen)return <IncidentWorkspace location={location} isPro={isPro} onShowProGate={onShowProGate} onClose={()=>setWorkspaceOpen(false)} request={incidentRequest} onRequestHandled={onIncidentRequestHandled}/>;
  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('reports.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>{t('reports.subtitle')}</Text>
      </View>
      <IncidentWorkspaceCard onPress={()=>setWorkspaceOpen(true)}/>
      <ReportSaveStatus state={saved}/>

      {mgrs && (
        <View style={[styles.autoBanner, { borderColor: colors.border, backgroundColor: colors.text5 }]}>
          <Text style={[styles.autoText, { color: colors.text2 }]}>{t('workflow.deviceReference')}: {mgrs}</Text>
        </View>
      )}

      <Text style={[styles.referenceHint, { color: colors.text3, marginBottom: 12 }]}>{t('workflow.reportSubjectHint')}</Text>
      {REPORTS.map(r => (
        <ReportCard
          key={r.id}
          report={r}
          mgrs={mgrs}
          location={location}
          isPro={isPro}
          trialEligible={trialEligible}
          onShowProGate={onShowProGate}
        />
      ))}

      <Text style={[styles.footer, { color: colors.text3 }]}>{t('incident.worksheetsSaved')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  referenceHint: { ...TYPE.body, fontSize: 13, lineHeight: 18 },
  referenceButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  contextButton: { minHeight: 44, minWidth: 120, flexGrow: 1, padding: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { ...TYPE.heading, fontSize: 22, letterSpacing: 1.2 },
  subtitle: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3 },
  autoBanner: {
    borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
  },
  autoText: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3 },
  card: { marginBottom: 10, borderWidth: 1 },
  cardLocked: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  cardText: { flex: 1, paddingRight: 10 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { ...TYPE.heading, fontSize: 14, letterSpacing: 1.2 },
  proBadge: {
    ...TYPE.label, fontSize: 11,
    paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 1.2,
  },
  cardSub: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3 },
  chevron: { ...TYPE.data, fontSize: 10 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1 },
  fieldBlock: { marginTop: 10 },
  fieldLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1,
    ...TYPE.body, fontSize: 13,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  reportBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  copyBtn: { flex: 2, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  copyBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  clearBtn: { flex: 1, borderWidth: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  clearBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  footer: { ...TYPE.body, fontSize: 12, textAlign: 'center', marginTop: 20, letterSpacing: 0.3 },
});
