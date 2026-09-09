import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { applyDeclination, removeDeclination, formatBearing, isBearing } from '../../utils/tactical';
import { gridConvergence, gmAngle, magneticToGrid, gridToMagnetic, pointScaleFactor } from '../../utils/geodesy';
import { ToolInput, ToolResult, ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { TYPE } from '../../utils/typography';

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
  const [bearingHasFix, setBearingHasFix] = useState(null);
  const [mode, setMode]           = useState('mag2grid'); // mag2grid | grid2mag

  const saveDec = () => {
    const v = decInput.trim() ? Number(decInput) : NaN;
    if (Number.isFinite(v) && Math.abs(v) <= 180) setDeclination(v);
  };

  const hasFix = !!location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
    && location.lat >= -80 && location.lat <= 84 && location.lon >= -180 && location.lon <= 180;
  // Losing/regaining grid convergence changes the input contract. Never reuse
  // a typed grid bearing as true (or vice versa) without another user entry.
  useEffect(() => { setBearing(''); }, [hasFix]);
  const convergence = hasFix ? gridConvergence(location.lat, location.lon) : null;
  const gm = hasFix ? gmAngle(location.lat, location.lon, declination) : null;
  // Grid vs ground: a UTM grid distance is not the distance you walk. k < 1
  // near the central meridian (grid short of ground), k > 1 out at the zone
  // edge. Reported as metres of ground per 1000 m of grid so it is usable
  // without doing the arithmetic in the field.
  const scale = hasFix ? pointScaleFactor(location.lat, location.lon) : null;
  const groundPerKm = Number.isFinite(scale) ? (1000 / scale) - 1000 : null;

  const b = bearing.trim() ? Number(bearing) : NaN;
  const valid = bearingHasFix === hasFix && isBearing(b);

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
      <Text style={[styles.sectionLabel, { color: colors.text3 }]}>{t('toolLabels.localDeclination')}</Text>
      <View style={styles.calibRow}>
        <View style={{ flex: 1 }}>
          <ToolInput label="" value={decInput} onChangeText={setDecInput} placeholder="+5 or -12" keyboardType="numbers-and-punctuation" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, { borderColor: colors.border }]} onPress={saveDec}>
          <Text style={[styles.saveBtnText, { color: colors.text3 }]}>{t('toolLabels.save')}</Text>
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
      <Text style={[styles.sectionLabel, { color: colors.text3 }]}>{t('toolLabels.bearingConverter')}</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='mag2grid' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('mag2grid')}>
          <Text style={[styles.modeBtnText, { color: colors.text3 }, mode==='mag2grid' && { color: colors.text }]}>{hasFix ? t('toolLabels.magToGrid') : t('navigation.magToTrue', { defaultValue: 'MAG → TRUE' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { borderColor: colors.border2 }, mode==='grid2mag' && { borderColor: colors.text2, backgroundColor: colors.text5 }]} onPress={() => setMode('grid2mag')}>
          <Text style={[styles.modeBtnText, { color: colors.text3 }, mode==='grid2mag' && { color: colors.text }]}>{hasFix ? t('toolLabels.gridToMag') : t('navigation.trueToMag', { defaultValue: 'TRUE → MAG' })}</Text>
        </TouchableOpacity>
      </View>

      <ToolInput
        label={mode === 'mag2grid' ? t('toolLabels.magneticBearingInput') : hasFix ? t('toolLabels.gridBearingInput') : t('navigation.trueBearingInput', { defaultValue: 'TRUE BEARING INPUT (°)' })}
        value={bearingHasFix === hasFix ? bearing : ''}
        onChangeText={value => { setBearing(value); setBearingHasFix(hasFix); }}
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
          value={formatBearing(converted, mode === 'mag2grid' ? (hasFix ? 'grid' : 'true') : 'magnetic')}
          primary
        />
      )}
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
