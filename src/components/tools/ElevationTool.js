/**
 * ElevationTool — Display GPS altitude and calculate slope/grade to a waypoint.
 * All computation local. No network. No storage.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { ToolResult, ToolRow, ToolHint, ToolInput } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';

const M_TO_FT = 3.28084;
const DEG = Math.PI / 180;

/**
 * Haversine distance between two lat/lon points in metres.
 */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ElevationTool({ location }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [wpLat, setWpLat] = useState('');
  const [wpLon, setWpLon] = useState('');
  const [wpAlt, setWpAlt] = useState('');

  const altM = location?.altitude;
  const hasAlt = altM !== null && altM !== undefined;

  // Slope calculation
  const slope = useMemo(() => {
    const lat2 = parseFloat(wpLat);
    const lon2 = parseFloat(wpLon);
    const alt2 = parseFloat(wpAlt);
    if (!hasAlt || isNaN(lat2) || isNaN(lon2) || isNaN(alt2)) return null;
    if (!location?.lat || !location?.lon) return null;

    const horizDist = haversineM(location.lat, location.lon, lat2, lon2);
    if (horizDist < 1) return null; // too close

    const rise = alt2 - altM;
    const angleRad = Math.atan2(rise, horizDist);
    const angleDeg = angleRad * (180 / Math.PI);
    const gradePercent = (rise / horizDist) * 100;

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
          <ToolRow label="ACCURACY" value={location?.accuracy ? `\u00b1${location.accuracy}m` : '--'} />
        </View>
      ) : (
        <Text style={[styles.noFix, { color: colors.text3 }]}>
          {t('gps.noGpsFix') || 'NO GPS FIX'}
        </Text>
      )}

      {/* Slope calculator inputs */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.border }]}>SLOPE TO WAYPOINT</Text>
        <ToolInput
          label="WAYPOINT LAT"
          value={wpLat}
          onChangeText={setWpLat}
          placeholder="e.g. 38.8977"
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <ToolInput
          label="WAYPOINT LON"
          value={wpLon}
          onChangeText={setWpLon}
          placeholder="e.g. -77.0365"
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <ToolInput
          label="WAYPOINT ALT (m)"
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

      <ToolHint text="Altitude from GPS. Enter waypoint coordinates and altitude to calculate slope angle and grade percentage." />
    </View>
  );
}

const styles = StyleSheet.create({
  results: { marginTop: 12, gap: 8 },
  noFix: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, marginVertical: 8 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 9, letterSpacing: 3, marginBottom: 8 },
});
