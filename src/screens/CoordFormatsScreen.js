/**
 * CoordFormatsScreen — Pro feature.
 * Display position in MGRS, UTM, Decimal Degrees, or DMS.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { formatPosition } from '../utils/mgrs';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';

const FORMATS = [
  { id: 'mgrs',      labelKey: 'coords.mgrs',      subKey: 'coords.mgrsSub' },
  { id: 'utm',       labelKey: 'coords.utm',       subKey: 'coords.utmSub' },
  { id: 'dd',        labelKey: 'coords.dd',        subKey: 'coords.ddSub' },
  { id: 'dms',       labelKey: 'coords.dms',       subKey: 'coords.dmsSub' },
  { id: 'fixphrase', labelKey: 'coords.fixphrase', subKey: 'coords.fixphraseSub' },
];

export function CoordFormatsScreen({ location, coordFormat, setCoordFormat }) {
  const colors = useColors();
  const { t } = useTranslation();
  const positions = useMemo(() => {
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') return null;
    const { lat, lon } = location;
    try {
      return {
        mgrs:      formatPosition(lat, lon, 'mgrs'),
        utm:       formatPosition(lat, lon, 'utm'),
        dd:        formatPosition(lat, lon, 'dd'),
        dms:       formatPosition(lat, lon, 'dms'),
        fixphrase: formatPosition(lat, lon, 'fixphrase'),
      };
    } catch {
      return null;
    }
  }, [location]);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: colors.text3 }]}>{t('coords.hint')}</Text>

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
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t(f.labelKey)}</Text>
                <Text style={[styles.cardSub, { color: colors.text3 }]}>{t(f.subKey)}</Text>
              </View>
              <View style={[styles.radio, { borderColor: colors.border }, isActive && { borderColor: colors.text }]}>
                {isActive && <View style={[styles.radioDot, { backgroundColor: colors.text }]} />}
              </View>
            </View>

            {positions && isActive && (
              <View style={[styles.preview, { borderTopColor: colors.border2 }]}>
                <Text style={[styles.previewLabel, { color: colors.border }]}>{t('coords.yourPosition')}</Text>
                <Text style={[styles.previewValue, { color: colors.text }]}>{positions[f.id]}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {!location && (
        <Text style={[styles.noFix, { color: colors.text4 }]}>{t('gps.noFixFormatPreview')}</Text>
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
