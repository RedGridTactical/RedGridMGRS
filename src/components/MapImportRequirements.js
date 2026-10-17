/**
 * MapImportRequirements — what the map importer accepts, shown before the
 * system file picker opens. Numbers come from the importer's own limits.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Modal } from './FieldModal';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';
import { OFFLINE_MAP_LIMITS } from '../utils/offlineMapLimits';

const MB = 1024 * 1024;
const ROWS = ['format', 'limit', 'rights', 'replace', 'check'];

export function MapImportRequirements({ visible, onChoose, onClose }) {
  const colors = useColors();
  const { t } = useTranslation();
  const values = { tiles: OFFLINE_MAP_LIMITS.tiles.toLocaleString(), archive: OFFLINE_MAP_LIMITS.archiveBytes / MB, extracted: OFFLINE_MAP_LIMITS.extractedBytes / MB };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{t('mapImport.title')}</Text>
          <Text style={[styles.body, { color: colors.text2 }]}>{t('mapImport.intro')}</Text>
          {ROWS.map((row, index) => (
            <View key={row} style={[styles.row, { borderBottomColor: colors.border2 }]} accessible>
              <Text style={[styles.num, { color: colors.text3 }]}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.grow}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{t(`mapImport.${row}Title`, values)}</Text>
                <Text style={[styles.body, { color: colors.text2 }]}>{t(`mapImport.${row}Body`, values)}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={[styles.primary, { borderColor: colors.accentText, backgroundColor: colors.card }]} onPress={onChoose} accessibilityRole="button">
            <Text style={[styles.primaryText, { color: colors.accentText }]}>{t('mapImport.choose')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.body, { color: colors.text3 }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, paddingTop: 60 },
  content: { padding: 18, paddingBottom: 40 },
  title: { ...TYPE.heading, fontSize: 22, letterSpacing: 0.8, marginBottom: 6 },
  body: { ...TYPE.body, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  num: { ...TYPE.data, fontSize: 11, paddingTop: 3 },
  grow: { flex: 1, gap: 3 },
  rowTitle: { ...TYPE.heading, fontSize: 15, letterSpacing: 0.4 },
  primary: { borderWidth: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 18 },
  primaryText: { ...TYPE.heading, fontSize: 14, letterSpacing: 0.8 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
