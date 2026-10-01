import { useSessionDraft } from '../../hooks/useSessionDraft';
import { parseToolNumber, validToolPoint } from '../../utils/toolWorkflow';
/**
 * ElevationTool — Display GPS altitude and calculate slope/grade to a waypoint.
 * All computation local. No network. No storage.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TextInput } from '../FieldInput';
import { ToolResult, ToolRow, ToolHint, ToolInput } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
// Ellipsoidal (Vincenty) horizontal distance — the slope angle is only as good
// as the run it is measured over. geodesicDistance falls back to haversine
// internally if Vincenty fails to converge.
import { geodesicDistance } from '../../utils/geodesy';
import { TYPE } from '../../utils/typography';

const M_TO_FT = 3.28084;

export function ElevationTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [wpLat, setWpLat] = useSessionDraft('tool:elev:wpLat', '');
  const [wpLon, setWpLon] = useSessionDraft('tool:elev:wpLon', '');
  const [wpAlt, setWpAlt] = useSessionDraft('tool:elev:wpAlt', '');

  const altM = location?.altitude;
  const hasAlt = validToolPoint(location) && Number.isFinite(altM);

  // Slope calculation
  const slope = useMemo(() => {
    const lat2 = parseToolNumber(wpLat, { min: -90, max: 90 });
    const lon2 = parseToolNumber(wpLon, { min: -180, max: 180 });
    const alt2 = parseToolNumber(wpAlt);
    if (!hasAlt || lat2 === null || lon2 === null || alt2 === null) return null;
    if (!validToolPoint(location)) return null;

    const horizDist = geodesicDistance(location.lat, location.lon, lat2, lon2);
    if (!Number.isFinite(horizDist) || horizDist < 1) return null; // too close

    const rise = alt2 - altM;
    const angleRad = Math.atan2(rise, horizDist);
    const angleDeg = angleRad * (180 / Math.PI);
    const gradePercent = (rise / horizDist) * 100;

    if (![rise, angleDeg, gradePercent].every(Number.isFinite)) return null;
    return {
      horizDist: Math.round(horizDist),
      rise: Math.round(rise),
      angleDeg: angleDeg.toFixed(1),
      gradePercent: gradePercent.toFixed(1),
    };
  }, [location, altM, hasAlt, wpLat, wpLon, wpAlt]);

  return (
    <View>
      {/* Current altitude */}
      {hasAlt ? (
        <View style={styles.results}>
          <ToolResult
            label={t('toolLabels.elevation') || 'ALTITUDE'}
            value={`${altM}m / ${Math.round(altM * M_TO_FT)}ft`}
            primary
          />
          <ToolRow label={t('workflow.horizontalAccuracy')} value={Number.isFinite(location?.accuracy) && location.accuracy >= 0 ? `\u00b1${location.accuracy}m` : '--'} />
        </View>
      ) : (
        <Text style={[styles.noFix, { color: colors.text3 }]}>
          {t('gps.noGpsFix') || 'NO GPS FIX'}
        </Text>
      )}

      {/* Slope calculator inputs */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text3 }]}>{t('toolLabels.slopeToWaypoint') || 'SLOPE TO WAYPOINT'}</Text>
        <ToolInput
          label={t('workflow.waypointLatitude')}
          value={wpLat}
          onChangeText={setWpLat}
          placeholder="e.g. 38.8977"
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <ToolInput
          label={t('workflow.waypointLongitude')}
          value={wpLon}
          onChangeText={setWpLon}
          placeholder="e.g. -77.0365"
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <ToolInput
          label={t('workflow.waypointAltitude')}
          value={wpAlt}
          onChangeText={setWpAlt}
          placeholder="e.g. 150"
          keyboardType="numeric"
          autoCapitalize="none"
        />
      </View>

      {slope && (
        <View style={styles.results}>
          <ToolResult label="SLOPE ANGLE" value={`${slope.angleDeg}\u00b0`} primary />
          <ToolResult label="GRADE" value={`${slope.gradePercent}%`} />
          <ToolRow label="HORIZ DIST" value={`${slope.horizDist}m`} />
          <ToolRow label="ELEV CHANGE" value={`${slope.rise > 0 ? '+' : ''}${slope.rise}m`} />
        </View>
      )}

      {(!!wpLat || !!wpLon || !!wpAlt) && !slope && <ToolHint text={t('workflow.slopeInvalid')} />}
      <ToolHint text={t('workflow.slopeHint')} />
    </View>
  );
}

const styles = StyleSheet.create({
  results: { marginTop: 12, gap: 8 },
  noFix: { ...TYPE.body, fontSize: 12, letterSpacing: 0.3, marginVertical: 8 },
  section: { marginTop: 16 },
  sectionTitle: { ...TYPE.heading, fontSize: 14, letterSpacing: 1.2, marginBottom: 8 },
});
