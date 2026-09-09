import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Alert } from '../utils/fieldAlert';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatDistance } from '../utils/mgrs';
import { TYPE } from '../utils/typography';

/** Persistent destination and explicit route progression across the existing tabs. */
export function ActiveNavigationBar({ waypoint, route, bearing, distance, saveError, loading, loadError, isSaving,
  onRetryLoad, onRetrySave, onOpenNavigation, onConfirmPoint, onStopRoute, onReview }) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.2;
  const { t } = useTranslation();
  const [actionError, setActionError] = useState(false);
  const [working, setWorking] = useState(false);
  const actionBusy = useRef(false);
  const reviewAfterSave = useRef(false);
  const busy = working || isSaving || loading || !!loadError || !!saveError || actionError;
  const run = async (operation, review = false) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setWorking(true); setActionError(false);
    reviewAfterSave.current = review;
    try {
      await operation();
      if (reviewAfterSave.current) onReview?.();
      reviewAfterSave.current = false;
    } catch { setActionError(true); }
    finally { actionBusy.current = false; setWorking(false); }
  };
  if (!waypoint && !saveError && !loadError && !actionError && !loading && !working && !isSaving) return null;

  const confirm = () => Alert.alert(t('fieldNav.confirmTitle'), t('fieldNav.confirmBody', { name: waypoint.label }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('fieldNav.confirm'), onPress: () => run(() => onConfirmPoint(route.id, route.index), route.index === route.waypoints.length - 1) },
  ]);
  const stop = () => Alert.alert(t('fieldNav.stopTitle'), t('fieldNav.stopBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('fieldNav.stop'), onPress: () => run(() => onStopRoute(route.id), true) },
  ]);
  return (
    <View style={[styles.root, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
      {waypoint && <TouchableOpacity style={[styles.destination, largeText && { flexDirection: 'column', alignItems: 'stretch', gap: 3 }]} onPress={onOpenNavigation} accessibilityRole="button" accessibilityLabel={t('fieldNav.openNavigation')}>
        <View style={styles.nameBlock}>
          <Text style={[styles.caption, { color: colors.text3 }]} numberOfLines={largeText ? 3 : 1} maxFontSizeMultiplier={2}>
            {route ? t('fieldNav.pointOf', { current: route.index + 1, total: route.waypoints.length, name: route.name }) : t('fieldNav.destination')}
          </Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={largeText ? 3 : 1} maxFontSizeMultiplier={2}>{waypoint.label}</Text>
        </View>
        <Text maxFontSizeMultiplier={2} style={[styles.metrics, { color: colors.accentText }]}>
          {Number.isFinite(bearing) ? `${Math.round(bearing) % 360}°T` : '—'}{'  '}
          {Number.isFinite(distance) ? formatDistance(distance) : '—'}
        </Text>
      </TouchableOpacity>}
      {route && (
        <View style={[styles.actions, { borderTopColor: colors.border2 }, largeText && { flexDirection: 'column' }]}>
          <TouchableOpacity style={styles.action} onPress={stop} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
            <Text maxFontSizeMultiplier={2} style={[styles.actionText, { color: colors.text3 }]}>{t('fieldNav.stop')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={confirm} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}>
            <Text maxFontSizeMultiplier={2} style={[styles.actionText, { color: colors.accentText }]}>{t(route.index === route.waypoints.length - 1 ? 'fieldNav.finish' : 'fieldNav.confirmPoint')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {(loading || working || isSaving) && <Text style={[styles.error, { color: colors.text3 }]}>{t(loading ? 'workflow.loadingPlans' : 'workflow.saving')}</Text>}
      {(saveError || loadError || actionError) && <View>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.warn || colors.text }]}>{t(loadError ? 'workflow.loadFailed' : 'workflow.saveFailed')}</Text>
        <TouchableOpacity style={styles.action} disabled={working || isSaving || loading} accessibilityRole="button" onPress={() => run(() => loadError ? onRetryLoad() : onRetrySave(), !loadError && reviewAfterSave.current)}><Text maxFontSizeMultiplier={2} style={[styles.actionText, { color: colors.text2 }]}>{t('workflow.retry')}</Text></TouchableOpacity>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 1 },
  destination: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameBlock: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  caption: { ...TYPE.label, fontSize: 11, letterSpacing: 0.7 },
  name: { ...TYPE.heading, fontSize: 17 },
  metrics: { ...TYPE.data, fontSize: 14 },
  actions: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  action: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  actionText: { ...TYPE.heading, fontSize: 13, letterSpacing: 0.6 },
  error: { ...TYPE.body, fontSize: 13, paddingHorizontal: 14, paddingBottom: 8 },
});
