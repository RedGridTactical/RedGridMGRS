/**
 * ProGate — Paywall overlay with 2-tier pricing (Monthly / Lifetime).
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
import { detectFreeTrial } from '../utils/iapOffers';

// Outcome-led rows matching what the gates actually sell \u2014 a user gated on
// "Offline Maps" must land on a list that leads with offline maps.
const PRO_FEATURES = [
  { icon: '\ud83d\uddfa\ufe0f', labelKey: 'proGate.offlineMaps', subKey: 'proGate.offlineMapsSub' },
  { icon: '\ud83d\udce1', labelKey: 'proGate.meshAwareness', subKey: 'proGate.meshAwarenessSub' },
  { icon: '\ud83e\udded', labelKey: 'proGate.allTools', subKey: 'proGate.allToolsSub' },
  { icon: '\ud83d\udccd', labelKey: 'proGate.waypointsRoutes', subKey: 'proGate.waypointsRoutesSub' },
  { icon: '\ud83d\udccb', labelKey: 'proGate.reportsThemes', subKey: 'proGate.reportsThemesSub' },
];

// Pricing (2026-08-01, owner): two paid SKUs. Annual sold one unit in its entire
// existence and was retired; lifetime was repriced far down after $149.99/$199.99
// sold zero. LIFETIME is the default selection as of 2026-08-15: month-3
// retention is 11.11% on monthly against $49.99 banked once, so landing users
// on monthly pointed them at the worst-LTV tier. Lifetime also carries the
// value badge, so the default and the badge now agree.
// RETIRED 2026-08-01: the annual tier is gone. Two paid SKUs only — monthly and
// lifetime. Annual must not appear here even as a disabled card: a tier rendered
// from this array is selectable, and selecting a SKU the store no longer sells
// produces a purchase that always fails.
const TIERS = [
  { id: 'monthly',  labelKey: 'proGate.tierMonthly',  periodKey: 'proGate.perMonth' },
  { id: 'lifetime', labelKey: 'proGate.tierLifetime', periodKey: 'proGate.oneTime', badge: 'proGate.bestValue' },
];

export function ProGate({
  visible, onClose, featureName, product, products, trialEligible,
  isPurchasing, onPurchase, onRestore, selectedTier, onSelectTier,
}) {
  const colors = useColors();
  const { t } = useTranslation();

  // Live store prices only. When the store is unreachable (offline field use)
  // we show placeholders and disable purchase instead of hardcoded USD —
  // hardcoded fallbacks display the wrong currency in ~174 of 175 territories.
  const getPriceForTier = (tier) => {
    if (products?.[tier]?.displayPrice) return products[tier].displayPrice;
    if (tier === 'lifetime' && product?.displayPrice) return product.displayPrice;
    return null;
  };


  // Fallback must match useIAP's initial selectedTier, or the card highlighted
  // on open differs from the tier a blind tap would actually buy.
  const activeTier = selectedTier || 'lifetime';
  // Gate the purchase button on the SELECTED tier's own price, not on "any
  // price loaded": the two tiers come from two independent store fetches with
  // separate timeouts, so one can resolve while the other doesn't. An OR here
  // enabled the button on a card rendering '—' — the exact tap that cannot
  // succeed — while suppressing the prices-unavailable notice.
  const selectedPriceLoaded = !!getPriceForTier(activeTier);
  // Which sub tier currently carries a free-trial offer. Only monthly remains
  // sellable, so this is monthly or nothing. Derived from the same products prop.
  const trialTier = detectFreeTrial(products?.monthly).hasTrial ? 'monthly' : null;
  const showTrial = !!trialEligible && trialTier != null && activeTier === trialTier;

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
              // A trial-eligible tier leads with the free-trial hook instead of
              // its normal badge, surfacing the offer at tier selection.
              const badgeKey = (tier.id === trialTier && trialEligible) ? 'proGate.freeTrialBadge' : tier.badge;
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
                  accessibilityLabel={`${t(tier.labelKey)} ${getPriceForTier(tier.id) || ''}`}
                >
                  {badgeKey && (
                    <Text style={[styles.tierBadge, { color: colors.bg, backgroundColor: colors.text }]}>
                      {t(badgeKey)}
                    </Text>
                  )}
                  <Text style={[styles.tierPrice, { color: colors.text }]} maxFontSizeMultiplier={1.2}>{getPriceForTier(tier.id) || '—'}</Text>
                  <Text style={[styles.tierPeriod, { color: colors.text3 }]}>{t(tier.periodKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Purchase button — disabled until live store prices load */}
          <TouchableOpacity
            style={[styles.purchaseBtn, { backgroundColor: colors.text }, (isPurchasing || !selectedPriceLoaded) && { backgroundColor: colors.border }]}
            onPress={() => { tapMedium(); onPurchase(activeTier); }}
            disabled={isPurchasing || !selectedPriceLoaded}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showTrial
              ? `${t('proGate.startTrial')}. ${t('proGate.thenPrice', { price: getPriceForTier(trialTier) || '' })}`
              : `${t('proGate.unlockButton')} ${getPriceForTier(activeTier) || ''}`}
            accessibilityState={{ disabled: isPurchasing || !selectedPriceLoaded }}
          >
            {isPurchasing
              ? <ActivityIndicator color={colors.bg} />
              : <Text style={[styles.purchaseBtnText, { color: colors.bg }]} maxFontSizeMultiplier={1.2}>{showTrial ? t('proGate.startTrial') : t('proGate.unlockButton')}</Text>
            }
          </TouchableOpacity>

          {/* Offline note — store unreachable, prices unavailable */}
          {!selectedPriceLoaded && !isPurchasing && (
            <Text style={[styles.trialSub, { color: colors.text3 }]}>
              {t('proGate.pricesUnavailable')}
            </Text>
          )}

          {/* Trial terms subtext — only when the free trial is being offered */}
          {showTrial && !isPurchasing && selectedPriceLoaded && (
            <Text style={[styles.trialSub, { color: colors.text3 }]}>
              {t('proGate.thenPrice', { price: getPriceForTier(trialTier) })}
            </Text>
          )}

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
            {t(activeTier === 'monthly' ? 'proGate.legal' : 'proGate.legalOneTime')}
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
  trialSub: {
    fontSize: 9, letterSpacing: 1, textAlign: 'center',
    marginTop: -2, marginBottom: 8,
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
