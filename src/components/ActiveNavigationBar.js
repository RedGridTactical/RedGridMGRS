import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/fieldAlert';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatDistance } from '../utils/mgrs';
import { TYPE } from '../utils/typography';

/** Persistent destination and explicit route progression across the existing tabs. */
export function ActiveNavigationBar({ waypoint, route, bearing, distance, saveError, onOpenNavigation, onConfirmPoint, onStopRoute, onReview }) {
  const colors = useColors();
  const { t } = useTranslation();
  if (!waypoint) return null;

  const confirm = () => Alert.alert(t('fieldNav.confirmTitle'), t('fieldNav.confirmBody', { name: waypoint.label }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('fieldNav.confirm'), onPress: () => {
      onConfirmPoint?.(route.id, route.index);
      if (route.index === route.waypoints.length - 1) onReview?.();
    } },
  ]);
  const stop = () => Alert.alert(t('fieldNav.stopTitle'), t('fieldNav.stopBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('fieldNav.stop'), onPress: () => { onStopRoute?.(route.id); onReview?.(); } },
  ]);
  return (
    <View style={[styles.root, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
      <TouchableOpacity style={styles.destination} onPress={onOpenNavigation} accessibilityRole="button" accessibilityLabel={t('fieldNav.openNavigation')}>
        <View style={styles.nameBlock}>
          <Text style={[styles.caption, { color: colors.text3 }]} numberOfLines={1}>
            {route ? t('fieldNav.pointOf', { current: route.index + 1, total: route.waypoints.length, name: route.name }) : t('fieldNav.destination')}
          </Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{waypoint.label}</Text>
        </View>
        <Text style={[styles.metrics, { color: colors.accentText }]}>
          {Number.isFinite(bearing) ? `${Math.round(bearing) % 360}°T` : '—'}{'  '}
          {Number.isFinite(distance) ? formatDistance(distance) : '—'}
        </Text>
      </TouchableOpacity>
      {route && (
        <View style={[styles.actions, { borderTopColor: colors.border2 }]}>
          <TouchableOpacity style={styles.action} onPress={stop} accessibilityRole="button">
            <Text style={[styles.actionText, { color: colors.text3 }]}>{t('fieldNav.stop')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={confirm} accessibilityRole="button">
            <Text style={[styles.actionText, { color: colors.accentText }]}>{t(route.index === route.waypoints.length - 1 ? 'fieldNav.finish' : 'fieldNav.confirmPoint')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {saveError && <Text style={[styles.error, { color: colors.warn || colors.text }]}>{t('fieldNav.saveError')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderBottomWidth: 1 },
  destination: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameBlock: { flex: 1, minWidth: 0 },
  caption: { ...TYPE.label, fontSize: 11, letterSpacing: 0.7 },
  name: { ...TYPE.heading, fontSize: 17 },
  metrics: { ...TYPE.data, fontSize: 14 },
  actions: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  action: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  actionText: { ...TYPE.heading, fontSize: 13, letterSpacing: 0.6 },
  error: { ...TYPE.body, fontSize: 13, paddingHorizontal: 14, paddingBottom: 8 },
});
