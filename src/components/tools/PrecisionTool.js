import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { toMGRS, formatMGRS } from '../../utils/mgrs';
import { PRECISION_LABELS } from '../../utils/tactical';
import { ToolResult, ToolHint, ToolDivider } from './ToolShared';
import { useTranslation } from '../../hooks/useTranslation';

export function PrecisionTool({ location }) {
  const { t } = useTranslation();
  const grids = useMemo(() => {
    if (!location) return null;
    return [5,4,3,2,1].map(p => ({
      precision: p,
      label: PRECISION_LABELS[p],
      mgrs: formatMGRS(toMGRS(location.lat, location.lon, p)),
    }));
  }, [location]);

  if (!location) return <ToolHint text={t('gps.noFixLiveRequired')} />;

  return (
    <View style={styles.results}>
      <ToolHint text={t('toolLabels.yourPositionPrecision')} />
      <ToolDivider />
      {grids.map((g, i) => (
        <ToolResult key={g.precision} label={g.label} value={g.mgrs} primary={i === 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ results: { gap: 8 } });
