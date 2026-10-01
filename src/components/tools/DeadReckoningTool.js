import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { compassToGridHeading, formatBearing } from '../../utils/tactical';
import { useColors } from '../../utils/ThemeContext';
import { tapLight, notifySuccess } from '../../utils/haptics';
import { Alert } from '../../utils/fieldAlert';
import { ToolInput, ToolResult, ToolRow, ToolHint, ToolDivider } from './ToolShared';
import { useTranslation } from '../../hooks/useTranslation';
import { useSessionDraft } from '../../hooks/useSessionDraft';
import { pinDROrigin, manualDROrigin, calculatePinnedDR, formatWorkflowUTC } from '../../utils/toolWorkflow';
import { TYPE } from '../../utils/typography';

export function DeadReckoningTool({ location, lastKnownLocation, savedWaypoints = [], onSaveEstimatedPoint, compassHeading, compassReference }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [origin, setOrigin] = useSessionDraft('tool:dr:origin', null);
  const [heading, setHeading] = useSessionDraft('tool:dr:heading', '');
  const [distance, setDistance] = useSessionDraft('tool:dr:distance', '');
  const [entry, setEntry] = useSessionDraft('tool:dr:entry', null);
  const [format, setFormat] = useSessionDraft('tool:dr:format', 'mgrs');
  const [grid, setGrid] = useSessionDraft('tool:dr:grid', '');
  const [latitude, setLatitude] = useSessionDraft('tool:dr:latitude', '');
  const [longitude, setLongitude] = useSessionDraft('tool:dr:longitude', '');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [saveMessage, setSaveMessage] = useState('');

  const pin = (point, source) => {
    const snapshot = pinDROrigin(point, source);
    if (!snapshot) { Alert.alert(t('workflow.originInvalid')); return; }
    tapLight(); setOrigin(snapshot); setEntry(null); setSaveMessage('');
  };
  const manual = manualDROrigin({ format, grid, latitude, longitude });
  // The origin and result never follow incoming GPS updates. Only deliberate
  // origin/input edits recompute an estimate; session remounts retain the origin.
  const result = useMemo(() => calculatePinnedDR(origin, heading, distance), [origin, heading, distance]);
  const compassGridHeading = compassToGridHeading(compassHeading, compassReference, origin?.lat, origin?.lon);
  const hasCompass = compassGridHeading !== null;
  const save = async () => {
    if (!result || busy.current || !onSaveEstimatedPoint) return;
    busy.current = true; setSaving(true); setSaveMessage('');
    try {
      await onSaveEstimatedPoint({ lat: result.lat, lon: result.lon, mgrs: result.mgrs,
        label: t('workflow.estimatedPointLabel'), provenance: result.provenance });
      notifySuccess(); setSaveMessage(t('workflow.estimateSaved'));
    } catch { setSaveMessage(t('workflow.saveFailed')); }
    finally { busy.current = false; setSaving(false); }
  };
  const action = (label, onPress, disabled = false, key = label) => (
    <TouchableOpacity key={key} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color: colors.text2 }]}>{label}</Text>
    </TouchableOpacity>
  );
  const sourceKey = { current: 'originCurrent', 'last-known': 'originLastKnown', manual: 'originManual', saved: 'originSaved' };

  return (
    <View>
      <Text style={[styles.heading, { color: colors.text }]}>{t('workflow.drOrigin')}</Text>
      <ToolHint text={t('workflow.drOriginHint')} />
      <View style={styles.buttons}>
        {action(t('workflow.pinCurrent'), () => pin(location, 'current'), !pinDROrigin(location, 'current'))}
        {action(t('workflow.pinLastKnown'), () => pin(lastKnownLocation, 'last-known'), !pinDROrigin(lastKnownLocation, 'last-known'))}
        {action(t('workflow.chooseSaved'), () => setEntry(entry === 'saved' ? null : 'saved'))}
        {action(t('workflow.enterManual'), () => setEntry(entry === 'manual' ? null : 'manual'))}
      </View>
      {entry === 'saved' && <View>
        {savedWaypoints.length === 0 && <ToolHint text={t('workflow.noSavedPoints')} />}
        {savedWaypoints.map((point, index) => action(`${point.label || point.name || point.mgrs || `${point.lat}, ${point.lon}`}${point.listName ? ` · ${point.listName}` : ''}`, () => pin(point, 'saved'), !pinDROrigin(point, 'saved'), `${point.id || index}:${index}`))}
      </View>}
      {entry === 'manual' && <View>
        <View style={styles.buttons}>
          {['mgrs', 'decimal'].map(value => <TouchableOpacity key={value} onPress={() => setFormat(value)} accessibilityRole="radio" accessibilityState={{ checked: format === value }} style={[styles.button, { borderColor: format === value ? colors.text : colors.border }]}>
            <Text style={[styles.buttonText, { color: colors.text2 }]}>{value === 'mgrs' ? 'MGRS' : 'LAT / LON'}</Text>
          </TouchableOpacity>)}
        </View>
        {format === 'mgrs' ? <ToolInput label={t('workflow.manualGrid')} value={grid} onChangeText={setGrid} placeholder="18S UJ 26587 07548" /> : <>
          <ToolInput label={t('workflow.manualLatitude')} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="38.9" />
          <ToolInput label={t('workflow.manualLongitude')} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="-77.0" />
        </>}
        {action(t('workflow.pinManual'), () => pin(manual, 'manual'), !manual)}
        {!manual && <ToolHint text={t('workflow.originInvalid')} />}
      </View>}
      {origin ? <View style={styles.results}>
        <ToolResult label={t(`workflow.${sourceKey[origin.source]}`)} value={origin.mgrs} />
        {!!origin.label && <ToolHint text={origin.label} />}
        <ToolHint text={t('workflow.pinnedAt', { time: formatWorkflowUTC(origin.pinnedAt) })} />
        {origin.observedAt !== null && <ToolHint text={t('workflow.observedAt', { time: formatWorkflowUTC(origin.observedAt) })} />}
      </View> : <ToolHint text={t('workflow.noPinnedOrigin')} />}
      <ToolDivider />
      <View style={styles.headingRow}>
        <View style={styles.headingInput}>
          <ToolInput label={t('toolLabels.headingGridNorth')} value={heading} onChangeText={value => { setHeading(value); setSaveMessage(''); }} placeholder="0 – 360" keyboardType="numeric" />
        </View>
        <TouchableOpacity style={[styles.compassBtn, { borderColor: hasCompass ? colors.text2 : colors.border2 }]} onPress={() => { if (hasCompass) { setHeading(String(Math.round(compassGridHeading) % 360)); setSaveMessage(''); } }} disabled={!hasCompass} accessibilityRole="button" accessibilityState={{ disabled: !hasCompass }} accessibilityLabel={hasCompass ? t('toolLabels.useCompassGrid', { heading: Math.round(compassGridHeading) % 360 }) : t('toolLabels.compassGridUnavailable')}>
          <Text style={[styles.buttonText, { color: colors.text3 }]}>{t('toolLabels.compassGrid')}</Text>
          <Text style={[styles.compassValue, { color: colors.text }]}>{formatBearing(compassGridHeading, 'grid')}</Text>
        </TouchableOpacity>
      </View>
      <ToolInput label={t('toolLabels.distanceMetres')} value={distance} onChangeText={value => { setDistance(value); setSaveMessage(''); }} placeholder="850" keyboardType="numeric" />
      {!!heading && !!distance && !result && <ToolHint text={t('workflow.drDistanceRange')} />}
      {result && <View style={styles.results}>
        <ToolResult label={t('toolLabels.estimatedPosition')} value={result.mgrsFormatted} primary />
        <ToolHint text={t('workflow.estimateHint')} />
        <ToolRow label={t('toolLabels.from')} value={origin.mgrs} />
        <ToolRow label={t('toolLabels.heading')} value={formatBearing(result.provenance.gridBearing, 'grid')} />
        <ToolRow label={t('toolLabels.distance')} value={`${result.provenance.distanceMeters}m`} />
        {action(t('workflow.saveEstimate'), save, saving || !onSaveEstimatedPoint)}
      </View>}
      {!!saveMessage && <ToolHint text={saveMessage} />}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { ...TYPE.heading, fontSize: 16 },
  results: { marginTop: 12, gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  button: { borderWidth: 1, minHeight: 44, padding: 10, justifyContent: 'center' },
  buttonText: { ...TYPE.label, fontSize: 12, flexShrink: 1 },
  headingRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  headingInput: { flex: 1 },
  compassBtn: { borderWidth: 1, padding: 10, alignItems: 'center', justifyContent: 'center', minHeight: 44, marginBottom: 10 },
  compassValue: { ...TYPE.data, fontSize: 14 },
});
