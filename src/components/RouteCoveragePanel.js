/**
 * RouteCoveragePanel — route-wide imported-map coverage: one summary, one line
 * per planned leg, and a check / cancel control. Shared by Preflight and the
 * field pack sheet so both say the same thing.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { TYPE } from '../utils/typography';
import { describeRouteCoverage } from '../utils/routeCoverageText';

const toneColor = (colors, status) => (status === 'ok' ? colors.accentText
  : status === 'fail' ? (colors.danger || '#cc4444') : (colors.warn || '#d99a3a'));

export function RouteCoveragePanel({ waypoints, coverage }) {
  const colors = useColors();
  const { t } = useTranslation();
  const view = describeRouteCoverage(coverage, waypoints, t);
  const checking = coverage.status === 'checking';
  const checkedBefore = coverage.status === 'done' || coverage.status === 'stale';
  const actionLabel = checking ? t('routeCoverage.cancel') : checkedBefore ? t('routeCoverage.recheck') : t('routeCoverage.check');
  return (
    <View style={styles.root}>
      <Text style={[styles.title, { color: colors.text3, borderBottomColor: colors.border2 }]} accessibilityRole="header">{t('routeCoverage.title')}</Text>
      <Text style={[styles.summary, { color: toneColor(colors, view.status) }]} accessibilityLiveRegion="polite" accessibilityRole={view.status === 'fail' ? 'alert' : 'text'}>{view.summary}</Text>
      {view.legs.map(leg => (
        <View key={leg.key} style={[styles.leg, { borderBottomColor: colors.border2 }]} accessible accessibilityLabel={`${leg.label}: ${leg.state}`}>
          <Text style={[styles.legLabel, { color: colors.text }]}>{leg.label}</Text>
          <Text style={[styles.legState, { color: toneColor(colors, leg.status) }]}>{leg.state}</Text>
        </View>
      ))}
      {!!view.detail && <Text style={[styles.note, { color: colors.text3 }]}>{view.detail}</Text>}
      <TouchableOpacity style={[styles.action, { borderColor: checking ? colors.border : colors.accentText, backgroundColor: colors.card }]}
        onPress={checking ? coverage.cancel : coverage.check} accessibilityRole="button" accessibilityLabel={actionLabel}>
        <Text style={[styles.actionText, { color: checking ? colors.text2 : colors.accentText }]}>{actionLabel}</Text>
      </TouchableOpacity>
      <Text style={[styles.note, { color: colors.text3 }]}>{t('routeCoverage.disclaimer')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 14, gap: 6 },
  title: { ...TYPE.label, fontSize: 11, letterSpacing: 1.2, paddingTop: 14, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  summary: { ...TYPE.body, fontSize: 15, lineHeight: 21, paddingTop: 4 },
  leg: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  legLabel: { ...TYPE.body, fontSize: 14, flex: 1 },
  legState: { ...TYPE.label, fontSize: 11, letterSpacing: 0.8, paddingTop: 2 },
  note: { ...TYPE.body, fontSize: 13, lineHeight: 18 },
  action: { borderWidth: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, marginVertical: 6 },
  actionText: { ...TYPE.heading, fontSize: 14, letterSpacing: 0.8 },
});
