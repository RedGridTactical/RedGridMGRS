/**
 * CoordFormatsScreen — Pro feature.
 * Display position in MGRS, UTM, Decimal Degrees, or DMS.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { toMGRS, formatMGRS } from '../utils/mgrs';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

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
  const positions = useMemo(() => {
    if (!location) return null;
    const { lat, lon } = location;
    return {
      mgrs: formatMGRS(toMGRS(lat, lon, 5)),
      utm:  toUTM(lat, lon),
      dd:   `${lat.toFixed(6)}°\n${lon.toFixed(6)}°`,
      dms:  formatDMS(lat, lon),
    };
  }, [location]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>SELECT COORDINATE FORMAT — APPLIES TO MAIN GRID DISPLAY</Text>

      {FORMATS.map(f => {
        const isActive = coordFormat === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() => setCoordFormat(f.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cardTop}>
              <View>
                <Text style={styles.cardTitle}>{f.label}</Text>
                <Text style={styles.cardSub}>{f.sub}</Text>
              </View>
              <View style={[styles.radio, isActive && styles.radioActive]}>
                {isActive && <View style={styles.radioDot} />}
              </View>
            </View>

            {positions && isActive && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>YOUR POSITION</Text>
                <Text style={styles.previewValue}>{positions[f.id]}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {!location && (
        <Text style={styles.noFix}>NO GPS FIX — ACQUIRE POSITION TO SEE FORMAT PREVIEW</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  hint: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3, marginBottom: 12 },
  card: { borderWidth: 1, borderColor: RED3, backgroundColor: '#0D0000', marginBottom: 8, padding: 14 },
  cardActive: { borderColor: RED2, backgroundColor: RED5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 3, color: RED, marginBottom: 3 },
  cardSub: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: RED3 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: RED3, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: RED },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  preview: { marginTop: 10, borderTopWidth: 1, borderTopColor: RED4, paddingTop: 10 },
  previewLabel: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: RED3, marginBottom: 4 },
  previewValue: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 2, color: RED, lineHeight: 22 },
  noFix: { fontFamily: 'monospace', fontSize: 9, color: RED4, textAlign: 'center', marginTop: 20, letterSpacing: 2 },
});
