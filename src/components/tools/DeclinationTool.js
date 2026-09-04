import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { applyDeclination, removeDeclination } from '../../utils/tactical';
import { gridConvergence, gmAngle, magneticToGrid, gridToMagnetic, pointScaleFactor } from '../../utils/geodesy';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Magnetic / grid / true bearing conversion.
 *
 * This tool previously offered "MAG -> GRID" but computed magnetic -> TRUE,
 * because it only applied declination. On a UTM/MGRS map the number you need is
 * the G-M angle (FM 3-25.26):
 *
 *     G-M angle = declination - grid convergence
 *
 * Convergence needs a position, so with no fix we fall back to declination
 * alone and label the result TRUE rather than silently mislabelling it.
 */
export function DeclinationTool({ declination, setDeclination, location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [decInput, setDecInput]   = useState(String(declination));
  const [bearing, setBearing]     = useState('');
  const [mode, setMode]           = useState('mag2grid'); // mag2grid | grid2mag

  const saveDec = () => {
    const v = parseFloat(decInput);
    if (!isNaN(v)) setDeclination(v);
  };

  const hasFix = !!location && Number.isFinite(location.lat) && Number.isFinite(location.lon);
  const convergence = hasFix ? gridConvergence(location.lat, location.lon) : null;
  const gm = hasFix ? gmAngle(location.lat, location.lon, declination) : null;
  // Grid vs ground: a UTM grid distance is not the distance you walk. k < 1
  // near the central meridian (grid short of ground), k > 1 out at the zone
  // edge. Reported as metres of ground per 1000 m of grid so it is usable
  // without doing the arithmetic in the field.
  const scale = hasFix ? pointScaleFactor(location.lat, location.lon) : null;
  const groundPerKm = Number.isFinite(scale) ? (1000 / scale) - 1000 : null;

  const b = parseFloat(bearing);
  const valid = !isNaN(b) && b >= 0 && b <= 360;

  let converted = null;
  if (valid) {
    if (hasFix) {
      converted = mode === 'mag2grid'
        ? magneticToGrid(b, location.lat, location.lon, declination)
        : gridToMagnetic(b, location.lat, location.lon, declination);
    } else {
      // No position: declination only, which yields TRUE, not grid.
      converted = mode === 'mag2grid'
        ? applyDeclination(b, declination)
        : removeDeclination(b, declination);
    }
  }

  const dir = declination > 0 ? 'EAST' : declination < 0 ? 'WEST' : 'NONE';
  const signed = (v, dp = 2) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}°`;

  return (
    <View>
      <Text style={[styles.sectionLabel, { color: colors.border }]}>{t('toolLabels.localDeclination')}</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={decInput} onChangeText={setDecInput} placeholder="+5 or -12" keyboardType="numbers-and-punctuation" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.border }]} onPress={saveDec}>
          <Text style={[styles.saveBtnText, { color: colors.border }]}>{t('toolLabels.save')}</Text>
        </TouchableOpacity>
      </View>
      <ToolHint text={`${t('toolLabels.saved')}: ${declination > 0 ? '+' : ''}${declination}° (${dir})  ·  + = EAST, - = WEST`} />

      <ToolDivider />
      {hasFix ? (
        <>
          <ToolRow label={t('toolLabels.gridConvergence')} value={signed(convergence)} />
          <ToolRow label={t('toolLabels.gmAngle')} value={signed(gm)} />
          {groundPerKm !== null && (
            <>
              <ToolRow label={t('declination.scale.factor')} value={scale.toFixed(6)} />
              <ToolRow
                label={t('declination.scale.groundPerKm')}
                value={`${groundPerKm > 0 ? '+' : ''}${groundPerKm.toFixed(2)} m`}
              />
            </>
          )}
          <ToolHint text={t('toolLabels.gmExplain')} />
          {groundPerKm !== null && <ToolHint text={t('declination.scale.explain')} />}
        </>
      ) : (
        <ToolHint text={t('toolLabels.noFixDeclinationOnly')} />
      )}

      <ToolDivider />
      <Text style={[styles.sectionLabel, { color: colors.border }]}>{t('toolLabels.bearingConverter')}</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='mag2grid' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('mag2grid')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='mag2grid' && { color: colors.text }]}>{t('toolLabels.magToGrid')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='grid2mag' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('grid2mag')}>
          <Text style={[styles.modeBtnText, { color: colors.border2 }, mode==='grid2mag' && { color: colors.text }]}>{t('toolLabels.gridToMag')}</Text>
        </TouchableOpacity>
      </View>

      <ToolInput
        label={mode === 'mag2grid' ? t('toolLabels.magneticBearingInput') : t('toolLabels.gridBearingInput')}
        value={bearing}
        onChangeText={setBearing}
        placeholder="0 – 360"
        keyboardType="numeric"
      />

      {converted !== null && (
        <ToolResult
          label={
            mode === 'mag2grid'
              ? (hasFix ? t('toolLabels.gridBearingResult') : t('toolLabels.trueBearingResult'))
              : t('toolLabels.magneticBearingResult')
          }
          value={`${Math.round(converted)}°`}
          primary
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontFamily:'monospace', fontSize:9, letterSpacing:3, marginBottom:6 },
  calibRow: { flexDirection:'row', gap:8, alignItems:'flex-end' },
  saveBtn: { borderWidth:1, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  saveBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:2 },
  modeRow: { flexDirection:'row', gap:8, marginBottom:12 },
  modeBtn: { flex:1, borderWidth:1, paddingVertical:9, alignItems:'center' },
  modeBtnText: { fontFamily:'monospace', fontSize:9, letterSpacing:2 },
});
