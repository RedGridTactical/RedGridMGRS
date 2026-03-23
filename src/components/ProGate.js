/**
 * ProGate — Paywall overlay with 3-tier pricing (Monthly / Annual / Lifetime).
 * Shows feature list, tier selector, and purchase/restore buttons.
 */
import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { tapMedium, tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

const PRO_FEATURES = [
  { icon: '\ud83d\udde3\ufe0f', labelKey: 'proGate.voiceReadout', subKey: 'proGate.voiceReadoutSub' },
  { icon: '\ud83d\udccd', labelKey: 'proGate.savedWaypoints', subKey: 'proGate.savedWaypointsSub' },
  { icon: '\ud83d\udccb', labelKey: 'proGate.tacticalReports', subKey: 'proGate.tacticalReportsSub' },
  { icon: '\ud83e\udded', labelKey: 'proGate.coordFormats', subKey: 'proGate.coordFormatsSub' },
  { icon: '\ud83d\udd34', labelKey: 'proGate.displayThemes', subKey: 'proGate.displayThemesSub' },
];

const TIERS = [
  { id: 'monthly',  labelKey: 'proGate.tierMonthly',  periodKey: 'proGate.perMonth' },
  { id: 'annual',   labelKey: 'proGate.tierAnnual',   periodKey: 'proGate.perYear', badge: 'proGate.bestValue' },
  { id: 'lifetime', labelKey: 'proGate.tierLifetime', periodKey: 'proGate.oneTime' },
];

export function ProGate({
  visible, onClose, featureName, product, products,
  isPurchasing, onPurchase, onRestore, selectedTier, onSelectTier,
}) {
  const colors = useColors();
  const { t } = useTranslation();

  const getPriceForTier = (tier) => {
    if (products?.[tier]?.displayPrice) return products[tier].displayPrice;
    if (tier === 'monthly') return '$3.99';
    if (tier === 'annual') return '$29.99';
    return product?.displayPrice ?? '$49.99';
  };

  const activeTier = selectedTier || 'annual';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.text2 }]} accessibilityViewIsModal={true}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.badge, { color: colors.bg, backgroundColor: colors.text }]}>{t('proGate.badge')}</Text>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{t('proGate.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.text3 }]}>
              {featureName
                ? t('proGate.subtitleFeature', { feature: featureName })
                : t('proGate.subtitleGeneric')}
            </Text>
          </View>

          {/* Feature list */}
          <ScrollView style={styles.features} showsVerticalScrollIndicator={false}>
            {PRO_FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, { borderBottomColor: colors.text5 }]}>
                <Text style={styles.featureIcon} importantForAccessibility="no" accessibilityElementsHidden={true}>{f.icon}</Text>
                <View style={styles.featureText}>
                  <Text style={[styles.featureLabel, { color: colors.text }]}>{t(f.labelKey)}</Text>
                  <Text style={[styles.featureSub, { color: colors.text3 }]}>{t(f.subKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

          {/* Tier selector */}
          <View style={styles.tierRow}>
            {TIERS.map((tier) => {
              const isActive = activeTier === tier.id;
              return (
                <TouchableOpacity
                  key={tier.id}
                  style={[
                    styles.tierCard,
                    { borderColor: isActive ? colors.text : colors.text5 },
                    isActive && { backgroundColor: colors.text + '12' },
                  ]}
                  onPress={() => { tapLight(); onSelectTier?.(tier.id); }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${t(tier.labelKey)} ${getPriceForTier(tier.id)}`}
                >
                  {tier.badge && (
                    <Text style={[styles.tierBadge, { color: colors.bg, backgroundColor: colors.text }]}>
                      {t(tier.badge)}
                    </Text>
                  )}
                  <Text style={[styles.tierPrice, { color: colors.text }]}>{getPriceForTier(tier.id)}</Text>
                  <Text style={[styles.tierPeriod, { color: colors.text3 }]}>{t(tier.periodKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Purchase button */}
          <TouchableOpacity
            style={[styles.purchaseBtn, { backgroundColor: colors.text }, isPurchasing && { backgroundColor: colors.border }]}
            onPress={() => { tapMedium(); onPurchase(activeTier); }}
            disabled={isPurchasing}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${t('proGate.unlockButton')} ${getPriceForTier(activeTier)}`}
            accessibilityState={{ disabled: isPurchasing }}
          >
            {isPurchasing
              ? <ActivityIndicator color={colors.bg} />
              : <Text style={[styles.purchaseBtnText, { color: colors.bg }]}>{t('proGate.unlockButton')}</Text>
            }
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity style={styles.restoreBtn} onPress={() => { tapLight(); onRestore(); }} disabled={isPurchasing} accessibilityRole="button" accessibilityLabel={t('proGate.restore')}>
            <Text style={[styles.restoreText, { color: colors.text3 }]}>{t('proGate.restore')}</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('proGate.notNow')}>
            <Text style={[styles.closeText, { color: colors.text4 }]}>{t('proGate.notNow')}</Text>
          </TouchableOpacity>

          {/* Legal */}
          <Text style={[styles.legal, { color: colors.text4 }]}>
            {t('proGate.legal')}
          </Text>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    padding: 24,
  },
  header: { alignItems: 'center', marginBottom: 20 },
  badge: {
    fontFamily: 'monospace', fontSize: 10, letterSpacing: 6,
    paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'monospace', fontSize: 22, fontWeight: '700',
    letterSpacing: 6, marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    textAlign: 'center', letterSpacing: 1,
  },
  features: { maxHeight: 160, marginBottom: 12 },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 8, borderBottomWidth: 1,
  },
  featureIcon: { fontSize: 18, marginRight: 12, marginTop: 2 },
  featureText: { flex: 1 },
  featureLabel: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 1, marginBottom: 2,
  },
  featureSub: { fontSize: 9, letterSpacing: 0.5 },
  divider: { height: 1, marginVertical: 12 },
  // Tier selector
  tierRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tierCard: {
    flex: 1,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  tierBadge: {
    fontSize: 7, fontWeight: '700', letterSpacing: 2,
    paddingHorizontal: 6, paddingVertical: 2,
    marginBottom: 6,
  },
  tierPrice: {
    fontFamily: 'monospace', fontSize: 16, fontWeight: '700',
    letterSpacing: 1, marginBottom: 2,
  },
  tierPeriod: {
    fontSize: 8, letterSpacing: 1,
  },
  purchaseBtn: {
    paddingVertical: 14, alignItems: 'center', marginBottom: 10, minHeight: 44,
  },
  purchaseBtnText: {
    fontSize: 12, fontWeight: '700',
    letterSpacing: 4,
  },
  restoreBtn: { paddingVertical: 10, alignItems: 'center', marginBottom: 4, minHeight: 44 },
  restoreText: { fontSize: 9, letterSpacing: 2 },
  closeBtn: { paddingVertical: 8, alignItems: 'center', marginBottom: 12, minHeight: 44 },
  closeText: { fontSize: 9, letterSpacing: 3 },
  legal: {
    fontSize: 7,
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 12,
  },
});
