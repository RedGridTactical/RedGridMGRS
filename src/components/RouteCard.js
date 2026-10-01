/**
 * RouteCard — Pro feature.
 * Turns a waypoint list into a field-ready route card: ordered legs with
 * bearing / distance / MGRS plus total route stats, exportable as a clean
 * shareable image (or text fallback). Pure-local: no network, no storage.
 */
import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Modal } from './FieldModal';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { buildDTG, buildRouteSummary, buildRouteCardText, buildRouteProvenance, formatRouteTime, pointProvenanceText } from '../utils/routeCard';
import { formatTime } from '../utils/routePlanner';
import { TextInput } from './FieldInput';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatDistance } from '../utils/mgrs';
import { formatBearing } from '../utils/tactical';
import { useColors } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';
import { useTranslation } from '../hooks/useTranslation';
import { notifySuccess, notifyWarning, tapHeavy } from '../utils/haptics';

let ViewShot; try { ViewShot = require('react-native-view-shot'); } catch {}
let Sharing; try { Sharing = require('expo-sharing'); } catch {}
let MediaLibrary; try { MediaLibrary = require('expo-media-library'); } catch {}
const captureRef = ViewShot?.captureRef || null;

export function RouteCard({ visible, list, onClose, onSaveReviewNotes }) {
  const colors = useColors();
  const { t } = useTranslation();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [notesError, setNotesError] = useState(false);
  const notesDirty = reviewNotes.trim() !== (list?.reviewNotes || '');
  useEffect(() => { setReviewNotes(list?.reviewNotes || ''); setNotesError(false); }, [list?.id, list?.reviewNotes, visible]);

  const dtg = useMemo(() => buildDTG(new Date()), [visible]);

  const { legs, totalDistance } = useMemo(() => buildRouteSummary(list), [list, visible]);
  const provenance = useMemo(() => buildRouteProvenance(list), [list]);
  const closeCard = () => {
    if (!notesDirty || !onSaveReviewNotes) { onClose(); return; }
    Alert.alert(t('workflow.unsavedNotes'), t('workflow.discardNotesBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('workflow.discard'), style: 'destructive', onPress: onClose },
    ]);
  };
  const copyCard = async () => {
    try {
      await copyTextToClipboard(buildRouteCardText(list, legs, totalDistance, dtg, t));
      Alert.alert(t('waypoints.copied'), t('workflow.cardCopied'));
    } catch { Alert.alert(t('workflow.copyFailed'), t('workflow.copyRetry')); }
  };
  const saveReviewNotes = async () => {
    if (busy) return;
    setBusy(true); setNotesError(false);
    try { await onSaveReviewNotes(list.id, reviewNotes.trim()); }
    catch { setNotesError(true); }
    finally { setBusy(false); }
  };

  const captureCard = useCallback(async () => {
    if (!captureRef || !cardRef.current) return null;
    return captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
  }, []);

  const shareCard = useCallback(async () => {
    if (busy || !(await allowSystemDisplay())) return;
    setBusy(true);
    try {
      const uri = await captureCard();
      if (uri && Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('routeCard.shareTitle') });
        tapHeavy(); notifySuccess();
      } else {
        // Fallback: share the text version
        const text = buildRouteCardText(list, legs, totalDistance, dtg, t);
        if (Sharing && uri) { await Sharing.shareAsync(uri); }
        else { Alert.alert(t('routeCard.title'), text); }
        notifySuccess();
      }
    } catch (e) {
      notifyWarning();
      Alert.alert(t('routeCard.shareFailed'), e?.message || '');
    } finally { setBusy(false); }
  }, [busy, captureCard, list, legs, totalDistance, dtg, t]);

  const saveCard = useCallback(async () => {
    if (busy || !(await allowSystemDisplay())) return;
    setBusy(true);
    try {
      if (!MediaLibrary) { Alert.alert(t('routeCard.title'), t('routeCard.saveUnavailable')); return; }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('routeCard.title'), t('routeCard.savePermission')); return; }
      const uri = await captureCard();
      if (uri) { await MediaLibrary.saveToLibraryAsync(uri); tapHeavy(); notifySuccess(); Alert.alert(t('routeCard.saved'), t('routeCard.savedMsg')); }
    } catch (e) {
      notifyWarning();
      Alert.alert(t('routeCard.saveFailed'), e?.message || '');
    } finally { setBusy(false); }
  }, [busy, captureCard, t]);

  if (!visible || !list) return null;
  const first = list.waypoints[0];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeCard}>
      <View style={[styles.backdrop, { backgroundColor: colors.bg + 'F2' }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Capturable card */}
          <View ref={cardRef} collapsable={false} style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.text2 }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.brand, { color: colors.text2 }]}>RED GRID MGRS</Text>
              <Text style={[styles.cardKicker, { color: colors.text2 }]}>{t('routeCard.title')}</Text>
            </View>
            <Text style={[styles.listName, { color: colors.text }]}>{list.name}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: colors.text }]}>{legs.length}</Text>
                <Text style={[styles.summaryLbl, { color: colors.text3 }]}>{t('routeCard.legs')}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: colors.text }]}>{formatDistance(totalDistance)}</Text>
                <Text style={[styles.summaryLbl, { color: colors.text3 }]}>{t('workflow.plannedDistance')}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValSm, { color: colors.text2 }]}>{dtg}</Text>
                <Text style={[styles.summaryLbl, { color: colors.text3 }]}>{t('workflow.generated')}</Text>
              </View>
            </View>
            <Text style={[styles.detail, { color: colors.text3 }]}>{t('workflow.planBasis')}</Text>
            <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.planSaved')}: {formatRouteTime(list.updatedAt || list.createdAt)}</Text>
            <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.plannedStart')}: {formatRouteTime(list.plannedStartAt)}</Text>
            {provenance.pace != null && <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.pace')}: {provenance.pace} · {t('workflow.estimatedDuration')}: {formatTime(provenance.plannedMinutes)}</Text>}
            {!!list.notes && <Text style={[styles.detail, { color: colors.text }]}>{t('workflow.planNotes')}: {list.notes}</Text>}

            <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

            {/* START point */}
            {first && <View style={styles.legRow}>
              <Text style={[styles.legNum, { color: colors.text2 }]}>{t('routeCard.start')}</Text>
              <View style={styles.legBody}>
                <Text style={[styles.legName, { color: colors.text }]}>{first.label}</Text>
                <Text style={[styles.legMgrs, { color: colors.text2 }]}>{first.mgrs}</Text>
                <Text style={[styles.detail, { color: colors.text3 }]}>{pointProvenanceText(first, t)}</Text>
                {!!first.note && <Text style={[styles.detail, { color: colors.text3 }]}>{first.note}</Text>}
              </View>
              <Text style={[styles.legBrg, { color: colors.text3 }]}>—</Text>
            </View>}

            {/* Legs */}
            {legs.map((leg, i) => (
              <View key={i} style={[styles.legRow, { borderTopColor: colors.border2, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.legNum, { color: colors.text2 }]}>{String(i + 1).padStart(2, '0')}</Text>
                <View style={styles.legBody}>
                  <Text style={[styles.legName, { color: colors.text }]}>{leg.to.name || 'WP'}</Text>
                  <Text style={[styles.legMgrs, { color: colors.text2 }]}>{leg.mgrs}</Text>
                  <Text style={[styles.detail, { color: colors.text3 }]}>{pointProvenanceText(list.waypoints[i + 1], t)}</Text>
                  {!!leg.to.note && <Text style={[styles.detail, { color: colors.text3 }]}>{leg.to.note}</Text>}
                </View>
                <View style={styles.legBrgCol}>
                  <Text style={[styles.legBrg, { color: colors.text }]}>{formatBearing(leg.bearing, 'true', true)}</Text>
                  <Text style={[styles.legDist, { color: colors.text3 }]}>{leg.distanceFormatted}</Text>
                </View>
              </View>
            ))}
            {provenance.isRecord && <View style={styles.record}>
              <Text style={[styles.legName, { color: colors.text }]}>{t('workflow.manualRecord')}</Text>
              <Text style={[styles.detail, { color: colors.text3 }]}>{t('workflow.recordBasis')}</Text>
              <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.navigationStarted')}: {formatRouteTime(list.startedAt)}</Text>
              <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.navigationEnded')}: {formatRouteTime(list.endedAt)}</Text>
              {provenance.confirmations.map(entry => <Text key={entry.index} style={[styles.detail, { color: colors.text }]}>{entry.index + 1}. {entry.label} · {formatRouteTime(entry.confirmedAt)}</Text>)}
              {!provenance.confirmations.length && <Text style={[styles.detail, { color: colors.text3 }]}>{t('workflow.noConfirmations')}</Text>}
              {!!list.reviewNotes && <Text style={[styles.detail, { color: colors.text }]}>{t('workflow.reviewNotes')}: {list.reviewNotes}</Text>}
            </View>}

            <View style={[styles.divider, { backgroundColor: colors.border2, marginTop: 12 }]} />
            <Text style={[styles.footer, { color: colors.text3 }]}>{t('routeCard.footer')}</Text>
          </View>

          {/* Actions (not captured) */}
          <View style={styles.actions}>
            {provenance.isRecord && onSaveReviewNotes && <View>
              <Text style={[styles.detail, { color: colors.text2 }]}>{t('workflow.reviewNotes')}</Text>
              <TextInput value={reviewNotes} onChangeText={setReviewNotes} multiline maxLength={500} accessibilityLabel={t('workflow.reviewNotes')} style={[styles.notesInput, { color: colors.text, borderColor: colors.border }]} />
              {notesError && <Text accessibilityRole="alert" style={[styles.detail, { color: colors.text }]}>{t('workflow.saveFailed')}</Text>}
              {notesDirty && <Text style={[styles.detail, { color: colors.text3 }]}>{t('workflow.saveNotesBeforeExport')}</Text>}
              <TouchableOpacity style={[styles.actBtn, { borderColor: colors.border }]} onPress={saveReviewNotes} disabled={busy} accessibilityRole="button"><Text style={[styles.actBtnText, { color: colors.text }]}>{t('workflow.saveNotes')}</Text></TouchableOpacity>
            </View>}
            <TouchableOpacity style={[styles.actBtn, { borderColor: colors.text2 }]} onPress={copyCard} disabled={busy || notesDirty} accessibilityRole="button"><Text style={[styles.actBtnText, { color: colors.text }]}>{t('workflow.copyCard')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={shareCard} disabled={busy || notesDirty} accessibilityRole="button" accessibilityLabel={t('routeCard.share')}>
              <Text style={[styles.actBtnText, { color: colors.text }]}>{busy ? '···' : t('routeCard.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actBtn, { borderColor: colors.border }]} onPress={saveCard} disabled={busy || notesDirty} accessibilityRole="button" accessibilityLabel={t('routeCard.save')}>
              <Text style={[styles.actBtnText, { color: colors.text3 }]}>{t('routeCard.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={closeCard} accessibilityRole="button" accessibilityLabel={t('routeCard.close')}>
              <Text style={[styles.closeBtnText, { color: colors.text3 }]}>{t('routeCard.close')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  scroll: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  card: { borderWidth: 1, padding: 18 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { ...TYPE.data, fontSize: 10, letterSpacing: 3 },
  cardKicker: { ...TYPE.label, fontSize: 11, letterSpacing: 0.8 },
  listName: { ...TYPE.heading, fontSize: 21, letterSpacing: 1, marginTop: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryVal: { ...TYPE.data, fontSize: 18, letterSpacing: 0.5 },
  summaryValSm: { ...TYPE.data, fontSize: 11, letterSpacing: 0.3 },
  summaryLbl: { ...TYPE.label, fontSize: 11, letterSpacing: 0.8, marginTop: 3 },
  legRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  legNum: { ...TYPE.data, fontSize: 11, letterSpacing: 0.3, width: 44 },
  legBody: { flex: 1, gap: 2 },
  legName: { ...TYPE.heading, fontSize: 14, letterSpacing: 0.5 },
  legMgrs: { ...TYPE.data, fontSize: 11, letterSpacing: 0.3 },
  legBrgCol: { alignItems: 'flex-end', gap: 2 },
  legBrg: { ...TYPE.data, fontSize: 13, letterSpacing: 0.5 },
  legDist: { ...TYPE.data, fontSize: 11, letterSpacing: 0.3 },
  footer: { ...TYPE.body, fontSize: 12, lineHeight: 17, letterSpacing: 0.3, textAlign: 'center' },
  detail: { ...TYPE.body, fontSize: 13, lineHeight: 19, marginTop: 6 },
  record: { marginTop: 18 },
  notesInput: { ...TYPE.body, fontSize: 16, borderWidth: 1, minHeight: 88, padding: 10, marginVertical: 8, textAlignVertical: 'top' },
  actions: { marginTop: 16, gap: 10 },
  actBtn: { borderWidth: 1, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  actBtnText: { ...TYPE.heading, fontSize: 14, letterSpacing: 1 },
  closeBtn: { paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  closeBtnText: { ...TYPE.label, fontSize: 13, letterSpacing: 0.8 },
});
