import { useSessionDraft } from '../../hooks/useSessionDraft';
import { parseToolNumber } from '../../utils/toolWorkflow';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { pacesToDistance, distanceToPaces } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

export function PaceCountTool({ paceCount, setPaceCount }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [mode, setMode] = useSessionDraft('tool:pace:mode', 'p2d'); // p2d = paces->dist, d2p = dist->paces
  const [paces, setPaces] = useSessionDraft('tool:pace:paces', '');
  const [distance, setDistance] = useSessionDraft('tool:pace:distance', '');
  const [calibInput, setCalibInput] = useSessionDraft('tool:pace:calibInput', String(paceCount));

  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const p = parseToolNumber(paces, { min: 0, integer: true });
  const d = parseToolNumber(distance, { min: 0 });
  const calibration = parseToolNumber(calibInput, { min: 1, max: 999, integer: true });
  const savedCalibration = parseToolNumber(paceCount, { min: 1, max: 999, integer: true });
  const distResult = mode === 'p2d' && p !== null && savedCalibration !== null ? pacesToDistance(p, savedCalibration) : null;
  const paceResult = mode === 'd2p' && d !== null && savedCalibration !== null ? distanceToPaces(d, savedCalibration) : null;
  const saveCalib = async () => {
    if (calibration === null || saving) return;
    setSaving(true); setSaveError('');
    try { await setPaceCount(calibration); } catch { setSaveError(t('workflow.saveFailed')); }
    finally { setSaving(false); }
  };

  return (
    <View>
      {/* Calibration */}
      <Text style={[styles.sectionLabel, { color: colors.text3 }]}>{t('toolLabels.calibration')}</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label={t('toolLabels.calibration')} value={calibInput} onChangeText={setCalibInput} placeholder="62" keyboardType="numeric" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.border }]} onPress={saveCalib} disabled={saving || calibration === null} accessibilityRole="button" accessibilityState={{ disabled: saving || calibration === null }}>
          <Text style={[styles.saveBtnText, { color: colors.text3 }]}>{t('toolLabels.save')}</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`${t('toolLabels.saved')}: ${paceCount} paces/100m  ·  ${t('toolLabels.typical')}`} />

      <ToolHint text={t('workflow.calibrationRange')} />
      {!!saveError && <ToolHint text={saveError} />}
      <ToolDivider />

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='p2d' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('p2d')}>
          <Text style={[styles.modeBtnText, { color: colors.text3 }, mode==='p2d' && { color: colors.text }]}>{t('toolLabels.pacesToDist')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='d2p' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('d2p')}>
          <Text style={[styles.modeBtnText, { color: colors.text3 }, mode==='d2p' && { color: colors.text }]}>{t('toolLabels.distToPaces')}</Text>
        </TouchableOpacity>
      </View>

      {mode === 'p2d' ? (
        <View>
          <ToolInput label={t('toolLabels.pacesCounted')} value={paces} onChangeText={setPaces} placeholder="e.g. 310" keyboardType="numeric" />
          {Number.isFinite(distResult) && (
            <ToolResult label={t('toolLabels.distanceResult')} value={`${Math.round(distResult)}m`} primary />
          )}
        </View>
      ) : (
        <View>
          <ToolInput label={t('toolLabels.distanceMetres')} value={distance} onChangeText={setDistance} placeholder="e.g. 500" keyboardType="numeric" />
          {Number.isFinite(paceResult) && (
            <ToolResult label={t('toolLabels.pacesRequired')} value={String(paceResult)} primary />
          )}
        </View>
      )}
      {((mode === 'p2d' && !!paces && !Number.isFinite(distResult)) || (mode === 'd2p' && !!distance && !Number.isFinite(paceResult))) && <ToolHint text={t('workflow.inputInvalid')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, marginBottom:6 },
  calibRow: { flexDirection:'row', gap:8, alignItems:'flex-end' },
  saveBtn: { borderWidth:1, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  saveBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  modeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  modeBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  modeBtnText: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
});
