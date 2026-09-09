/**
 * RouteCard — Pro feature.
 * Turns a waypoint list into a field-ready route card: ordered legs with
 * bearing / distance / MGRS plus total route stats, exportable as a clean
 * shareable image (or text fallback). Pure-local: no network, no storage.
 */
import React, { useRef, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Modal } from './FieldModal';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { buildDTG, buildRouteSummary, buildRouteCardText } from '../utils/routeCard';
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

export function RouteCard({ visible, list, onClose }) {
  const colors = useColors();
  const { t } = useTranslation();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const dtg = useMemo(() => buildDTG(new Date()), [visible]);

  const { legs, totalDistance } = useMemo(() => buildRouteSummary(list), [list, visible]);

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
        const text = buildRouteCardText(list, legs, totalDistance, dtg);
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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
                <Text style={[styles.summaryLbl, { color: colors.text3 }]}>{t('routeCard.total')}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValSm, { color: colors.text2 }]}>{dtg}</Text>
                <Text style={[styles.summaryLbl, { color: colors.text3 }]}>{t('routeCard.dtg')}</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

            {/* START point */}
            <View style={styles.legRow}>
              <Text style={[styles.legNum, { color: colors.text2 }]}>{t('routeCard.start')}</Text>
              <View style={styles.legBody}>
                <Text style={[styles.legName, { color: colors.text }]}>{first.label}</Text>
                <Text style={[styles.legMgrs, { color: colors.text2 }]}>{first.mgrs}</Text>
              </View>
              <Text style={[styles.legBrg, { color: colors.text3 }]}>—</Text>
            </View>

            {/* Legs */}
            {legs.map((leg, i) => (
              <View key={i} style={[styles.legRow, { borderTopColor: colors.border2, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.legNum, { color: colors.text2 }]}>{String(i + 1).padStart(2, '0')}</Text>
                <View style={styles.legBody}>
                  <Text style={[styles.legName, { color: colors.text }]}>{leg.to.name || 'WP'}</Text>
                  <Text style={[styles.legMgrs, { color: colors.text2 }]}>{leg.mgrs}</Text>
                </View>
                <View style={styles.legBrgCol}>
                  <Text style={[styles.legBrg, { color: colors.text }]}>{formatBearing(leg.bearing, 'true', true)}</Text>
                  <Text style={[styles.legDist, { color: colors.text3 }]}>{leg.distanceFormatted}</Text>
                </View>
              </View>
            ))}

            <View style={[styles.divider, { backgroundColor: colors.border2, marginTop: 12 }]} />
            <Text style={[styles.footer, { color: colors.text3 }]}>{t('routeCard.footer')}</Text>
          </View>

          {/* Actions (not captured) */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={shareCard} disabled={busy} accessibilityRole="button" accessibilityLabel={t('routeCard.share')}>
              <Text style={[styles.actBtnText, { color: colors.text }]}>{busy ? '···' : t('routeCard.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actBtn, { borderColor: colors.border }]} onPress={saveCard} disabled={busy} accessibilityRole="button" accessibilityLabel={t('routeCard.save')}>
              <Text style={[styles.actBtnText, { color: colors.text3 }]}>{t('routeCard.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('routeCard.close')}>
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
  brand: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, fontWeight: '700' },
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
  actions: { marginTop: 16, gap: 10 },
  actBtn: { borderWidth: 1, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  actBtnText: { ...TYPE.heading, fontSize: 14, letterSpacing: 1 },
  closeBtn: { paddingVertical: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  closeBtnText: { ...TYPE.label, fontSize: 13, letterSpacing: 0.8 },
});
