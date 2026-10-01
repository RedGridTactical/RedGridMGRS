import { useSessionDraft } from '../../hooks/useSessionDraft';
import { parseToolNumber } from '../../utils/toolWorkflow';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { backAzimuth, applyDeclination, formatBearing, isBearing, compassToGridHeading } from '../../utils/tactical';
import { ToolInput, ToolResult, ToolRow, ToolHint } from './ToolShared';
import { useTranslation } from '../../hooks/useTranslation';

export function BackAzimuthTool({ declination, location }) {
  const { t } = useTranslation();
  const [bearing, setBearing] = useSessionDraft('tool:backaz:bearing', '');

  const b = parseToolNumber(bearing, { min: 0, max: 360 });
  const valid = b !== null && isBearing(b);
  const back = valid ? backAzimuth(b) : null;
  const backCorrected = valid ? applyDeclination(back, declination) : null;
  const gridBack = compassToGridHeading(backCorrected, 'true', location?.lat, location?.lon);

  return (
    <View>
      <ToolInput label={t('toolLabels.magneticBearing')} value={bearing} onChangeText={setBearing} placeholder="0 – 360" keyboardType="numeric" />

      {!!bearing && !valid && <ToolHint text={t('workflow.headingRange')} />}
      {back !== null && (
        <View style={styles.results}>
          <ToolResult label={t('toolLabels.backAzimuthResult')} value={formatBearing(back, 'magnetic')} primary />
          <ToolResult label={`${declination > 0 ? '+' : ''}${declination}° ${t('toolLabels.declinationLabel')}`} value={formatBearing(backCorrected, 'true')} />
          {gridBack !== null && <ToolResult label={t('toolLabels.gridBearingResult')} value={formatBearing(gridBack, 'grid')} />}
          <ToolRow label={t('toolLabels.input')} value={formatBearing(b, 'magnetic')} />
          <ToolHint text={t('navigation.referenceLegend', { defaultValue: 'T = true north · M = magnetic north · G = grid north' })} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  results: { marginTop: 12, gap: 8 },
});
