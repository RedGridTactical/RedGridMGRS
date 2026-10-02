/**
 * FieldPackModal — one saved list as a field pack: what it contains, whether
 * the imported map covers its legs, and sharing through the system share sheet.
 * Nothing leaves the device until the user picks a destination there.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Modal } from './FieldModal';
import { RouteCoveragePanel } from './RouteCoveragePanel';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { useRouteCoverage } from '../hooks/useRouteCoverage';
import { TYPE } from '../utils/typography';
import { notifySuccess } from '../utils/haptics';
import { getOfflineMapMetadata } from '../utils/tileManager';
import {
  buildFieldPack, serializeFieldPack, fieldPackFileName, shortRevision, FIELD_PACK_MIME,
} from '../utils/fieldPack';

let FileSystem; try { FileSystem = require('expo-file-system'); } catch {}
let Sharing; try { Sharing = require('expo-sharing'); } catch {}

const dateText = iso => { const ms = Date.parse(iso || ''); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '—'; };

export function FieldPackModal({ visible, list, appVersion, onClose, onOpenRouteCard }) {
  const colors = useColors();
  const { t } = useTranslation();
  const waypoints = list?.waypoints || [];
  const coverage = useRouteCoverage(waypoints, { active: !!visible });
  const [mapMetadata, setMapMetadata] = useState(null);
  const [sharing, setSharing] = useState(false);

  // The map reference is read when the sheet opens and again after each check,
  // so it describes the map that is imported now.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    getOfflineMapMetadata().then(metadata => { if (!cancelled) setMapMetadata(metadata || null); }).catch(() => { if (!cancelled) setMapMetadata(null); });
    return () => { cancelled = true; };
  }, [visible, coverage.status]);

  const pack = useMemo(() => {
    if (!visible || !waypoints.length) return null;
    try { return buildFieldPack(list, { mapMetadata, appVersion }); } catch { return null; }
  }, [visible, list, mapMetadata, appVersion, waypoints.length]);
  const hasEstimated = waypoints.some(point => point.source === 'estimated');

  const share = async () => {
    if (sharing || !pack) return;
    if (!(await allowSystemDisplay())) return;
    setSharing(true);
    try {
      if (!FileSystem?.cacheDirectory || !Sharing || !(await Sharing.isAvailableAsync())) {
        Alert.alert(t('waypoints.sharingUnavailable'), t('waypoints.sharingUnavailableMsg'));
        return;
      }
      // Rebuilt at share time so the exported timestamp and map reference are current.
      const current = buildFieldPack(list, { mapMetadata: await getOfflineMapMetadata().catch(() => null), appVersion });
      const path = `${FileSystem.cacheDirectory}${fieldPackFileName(list.name)}`;
      await FileSystem.writeAsStringAsync(path, serializeFieldPack(current), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: FIELD_PACK_MIME, UTI: 'public.json', dialogTitle: t('fieldPack.share') });
      notifySuccess();
    } catch {
      Alert.alert(t('fieldPack.title'), t('fieldPack.exportFailed'));
    } finally { setSharing(false); }
  };

  const row = (key, title, body) => (
    <View key={key} style={[styles.row, { borderBottomColor: colors.border2 }]} accessible>
      <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
      {!!body && <Text style={[styles.body, { color: colors.text2 }]}>{body}</Text>}
    </View>
  );

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.kicker, { color: colors.text3 }]}>{t('fieldPack.title')}{pack ? ` · ${t('fieldPack.revision', { rev: shortRevision(pack.revision) })}` : ''}</Text>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{list?.name}</Text>
          {!!list?.notes && <Text style={[styles.body, { color: colors.text2 }]}>{list.notes}</Text>}

          {!waypoints.length ? (
            <Text style={[styles.body, { color: colors.text2 }]} accessibilityRole="alert">{t('fieldPack.empty')}</Text>
          ) : (
            <>
              <Text style={[styles.section, { color: colors.text3, borderBottomColor: colors.border2 }]}>{t('fieldPack.contents')}</Text>
              {row('points', t('fieldPack.points', { count: waypoints.length }), waypoints.map((point, index) => `${index + 1}. ${point.label}`).join(' → '))}
              {row('legs', t('fieldPack.legs'))}
              {row('map', pack?.mapReference ? t('fieldPack.mapReference', { name: pack.mapReference.name }) : t('fieldPack.noMapReference'), t('fieldPack.mapsNotIncluded'))}
              {hasEstimated && row('estimated', t('fieldPack.estimatedNote'))}
              {!!list?.pack && row('origin', t('fieldPack.importedFrom', { rev: shortRevision(list.pack.revision), date: dateText(list.pack.exportedAt) }),
                list.pack.mapReference ? t('fieldPack.senderMap', { name: list.pack.mapReference.name }) : '')}

              <View style={styles.coverage}><RouteCoveragePanel waypoints={waypoints} coverage={coverage} /></View>

              <TouchableOpacity style={[styles.primary, { borderColor: colors.accentText, backgroundColor: colors.card, opacity: sharing ? 0.5 : 1 }]}
                onPress={share} disabled={sharing || !pack} accessibilityRole="button" accessibilityState={{ disabled: sharing || !pack }}>
                <Text style={[styles.primaryText, { color: colors.accentText }]}>{t('fieldPack.share')}</Text>
              </TouchableOpacity>
              <Text style={[styles.body, { color: colors.text3 }]}>{t('fieldPack.shareHint')}</Text>
              {onOpenRouteCard && (
                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={onOpenRouteCard} accessibilityRole="button">
                  <Text style={[styles.primaryText, { color: colors.text2 }]}>{t('routeCard.button')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.body, { color: colors.text3 }]}>{t('common.close')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Preview of an incoming pack. Confirming only ever adds a new list. */
export function FieldPackImportModal({ preview, onConfirm, onCancel, busy, failed }) {
  const colors = useColors();
  const { t } = useTranslation();
  const pack = preview?.pack;
  const reference = pack?.mapReference;
  const mapLine = !pack ? '' : !reference ? t('fieldPack.mapNone')
    : t(`fieldPack.map${{ absent: 'Absent', different: 'Different', same: 'Same' }[preview.mapRelation] || 'Absent'}`, { name: reference.name });
  const hasEstimated = (pack?.route.points || []).some(point => point.source === 'estimated');
  return (
    <Modal visible={!!preview} transparent animationType="slide" onRequestClose={busy ? () => {} : onCancel}>
      <View style={[styles.backdrop, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.kicker, { color: colors.text3 }]}>{t('fieldPack.importTitle')}</Text>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{pack?.route.name}</Text>
          <Text style={[styles.body, { color: colors.text2 }]}>{preview?.fileName}</Text>
          {!!pack && <Text style={[styles.body, { color: colors.text2 }]}>{t('fieldPack.importMeta', { rev: shortRevision(pack.revision), date: dateText(pack.provenance.exportedAt) })}</Text>}
          {!!pack?.route.notes && <Text style={[styles.body, { color: colors.text2 }]}>{pack.route.notes}</Text>}

          <Text style={[styles.section, { color: colors.text3, borderBottomColor: colors.border2 }]}>{t('fieldPack.importPoints', { count: pack?.route.points.length || 0 })}</Text>
          {(pack?.route.points || []).map((point, index) => (
            <Text key={index} style={[styles.body, { color: colors.text2 }]}>{index + 1}. {point.label} · {point.mgrs}</Text>
          ))}

          <Text style={[styles.section, { color: colors.text3, borderBottomColor: colors.border2 }]}>{t('routeCoverage.title')}</Text>
          <Text style={[styles.body, { color: colors.text }]} accessibilityRole="alert">{mapLine}</Text>
          <Text style={[styles.body, { color: colors.text3 }]}>{t('fieldPack.mapsNotIncluded')}</Text>
          {hasEstimated && <Text style={[styles.body, { color: colors.text3 }]}>{t('fieldPack.estimatedNote')}</Text>}

          {!!preview?.renamed && <Text style={[styles.body, { color: colors.text }]}>{t('fieldPack.importRenamed', { name: preview.listName })}</Text>}
          <TouchableOpacity style={[styles.primary, { borderColor: colors.accentText, backgroundColor: colors.card, opacity: busy ? 0.5 : 1 }]}
            onPress={onConfirm} disabled={!!busy} accessibilityRole="button" accessibilityState={{ disabled: !!busy }}>
            <Text style={[styles.primaryText, { color: colors.accentText }]}>{t('fieldPack.importAdd')}</Text>
          </TouchableOpacity>
          <Text style={[styles.body, { color: colors.text3 }]}>{t('fieldPack.importHint')}</Text>
          {!!failed && <Text style={[styles.body, { color: colors.text }]} accessibilityRole="alert">{t('workflow.saveFailed')}</Text>}
          <TouchableOpacity style={[styles.close, { opacity: busy ? 0.4 : 1 }]} onPress={onCancel} disabled={!!busy} accessibilityRole="button" accessibilityState={{ disabled: !!busy }}>
            <Text style={[styles.body, { color: colors.text3 }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, paddingTop: 60 },
  content: { padding: 18, paddingBottom: 40, gap: 6 },
  kicker: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2 },
  title: { ...TYPE.heading, fontSize: 22, letterSpacing: 0.8 },
  section: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, paddingTop: 14, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { paddingVertical: 10, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { ...TYPE.body, fontSize: 15, lineHeight: 20 },
  body: { ...TYPE.body, fontSize: 14, lineHeight: 20 },
  coverage: { marginHorizontal: -14 },
  primary: { borderWidth: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 12 },
  secondaryBtn: { borderWidth: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 6 },
  primaryText: { ...TYPE.heading, fontSize: 14, letterSpacing: 0.8 },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
