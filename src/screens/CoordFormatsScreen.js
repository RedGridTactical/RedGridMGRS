/**
 * CoordFormatsScreen — Pro feature.
 * Display position in MGRS, UTM, Decimal Degrees, or DMS.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { toMGRS, formatMGRS } from '../utils/mgrs';
import { useColors } from '../utils/ThemeContext';

const FORMATS = [
  { id: 'mgrs', label: 'MGRS',             sub: 'Military Grid Reference System — standard tactical format' },
  { id: 'utm',  label: 'UTM',              sub: 'Universal Transverse Mercator — zone/easting/northing' },
  { id: 'dd',   label: 'DECIMAL DEGREES',  sub: 'Decimal latitude / longitude — Google Maps compatible' },
  { id: 'dms',  label: 'DEG MIN SEC',      sub: 'Degrees, minutes, seconds — aviation and nautical standard' },
];

function toUTM(lat, lon) {
  // Simplified UTM display (zone + easting/northing from MGRS math)
  const zone = Math.floor((lon + 180) / 6) + 1;
  const mgrs = toMGRS(lat, lon, 5);
  // Extract easting/northing from MGRS numerics
  const nums = mgrs.replace(/[^0-9]/g, '');
  const half = Math.floor(nums.length / 2);
  const e = parseInt(nums.slice(0, half), 10);
  const n = parseInt(nums.slice(half), 10);
  const hem = lat >= 0 ? 'N' : 'S';
  return `${zone}${hem}  ${e}E  ${n}N`;
}

function toDMS(deg) {
  const d = Math.floor(Math.abs(deg));
  const mFull = (Math.abs(deg) - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(1);
  return { d, m, s };
}

function formatDMS(lat, lon) {
  const la = toDMS(lat), lo = toDMS(lon);
  const latDir = lat >= 0 ? 'N' : 'S', lonDir = lon >= 0 ? 'E' : 'W';
  return `${la.d}° ${la.m}' ${la.s}" ${latDir}\n${lo.d}° ${lo.m}' ${lo.s}" ${lonDir}`;
}

export function CoordFormatsScreen({ location, coordFormat, setCoordFormat }) {
  const colors = useColors();
  const positions = useMemo(() => {
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') return null;
    const { lat, lon } = location;
    try {
      return {
        mgrs: formatMGRS(toMGRS(lat, lon, 5)),
        utm:  toUTM(lat, lon),
        dd:   `${lat.toFixed(6)}°\n${lon.toFixed(6)}°`,
        dms:  formatDMS(lat, lon),
      };
    } catch {
      return null;
    }
  }, [location]);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: colors.text3 }]}>SELECT COORDINATE FORMAT — APPLIES TO MAIN GRID DISPLAY</Text>

      {FORMATS.map(f => {
        const isActive = coordFormat === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, isActive && { borderColor: colors.text2, backgroundColor: colors.text5 }]}
            onPress={() => setCoordFormat(f.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cardTop}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{f.label}</Text>
                <Text style={[styles.cardSub, { color: colors.text3 }]}>{f.sub}</Text>
              </View>
              <View style={[styles.radio, { borderColor: colors.border }, isActive && { borderColor: colors.text }]}>
                {isActive && <View style={[styles.radioDot, { backgroundColor: colors.text }]} />}
              </View>
            </View>

            {positions && isActive && (
              <View style={[styles.preview, { borderTopColor: colors.border2 }]}>
                <Text style={[styles.previewLabel, { color: colors.border }]}>YOUR POSITION</Text>
                <Text style={[styles.previewValue, { color: colors.text }]}>{positions[f.id]}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {!location && (
        <Text style={[styles.noFix, { color: colors.text4 }]}>NO GPS FIX — ACQUIRE POSITION TO SEE FORMAT PREVIEW</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 8, letterSpacing: 2, marginBottom: 12 },
  card: { borderWidth: 1, marginBottom: 8, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 3 },
  cardSub: { fontSize: 9, letterSpacing: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  preview: { marginTop: 10, borderTopWidth: 1, paddingTop: 10 },
  previewLabel: { fontSize: 8, letterSpacing: 2, marginBottom: 4 },
  previewValue: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 2, lineHeight: 22 },
  noFix: { fontSize: 9, textAlign: 'center', marginTop: 20, letterSpacing: 2 },
});
