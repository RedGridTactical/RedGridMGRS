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

// Outcome-led rows matching what the gates actually sell \u2014 a user gated on
// "Offline Maps" must land on a list that leads with offline maps.
const PRO_FEATURES = [
  { icon: '\ud83d\uddfa\ufe0f', labelKey: 'proGate.offlineMaps', subKey: 'proGate.offlineMapsSub' },
  { icon: '\ud83d\udce1', labelKey: 'proGate.meshAwareness', subKey: 'proGate.meshAwarenessSub' },
  { icon: '\ud83e\udded', labelKey: 'proGate.allTools', subKey: 'proGate.allToolsSub' },
  { icon: '\ud83d\udccd', labelKey: 'proGate.waypointsRoutes', subKey: 'proGate.waypointsRoutesSub' },
  { icon: '\ud83d\udccb', labelKey: 'proGate.reportsThemes', subKey: 'proGate.reportsThemesSub' },
];

// Pricing emphasis (May 26, 2026): tuned for recurring MRR. Annual is
// featured and the default selection — it counts fully toward MRR with the
// strongest retention. Lifetime stays available but is intentionally NOT
// featured/default, since a one-time purchase contributes $0 to recurring
// revenue and cannibalizes a would-be subscriber. (Reverses the May 24
// lifetime-first test now that the goal is strict MRR, not total proceeds.)
const TIERS = [
  { id: 'monthly',  labelKey: 'proGate.tierMonthly',  periodKey: 'proGate.perMonth' },
  { id: 'annual',   labelKey: 'proGate.tierAnnual',   periodKey: 'proGate.perYear', badge: 'proGate.bestValue' },
  { id: 'lifetime', labelKey: 'proGate.tierLifetime', periodKey: 'proGate.oneTime' },
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
  const pricesLoaded = !!(products?.monthly?.displayPrice || products?.annual?.displayPrice ||
    products?.lifetime?.displayPrice || product?.displayPrice);

  const activeTier = selectedTier || 'annual';
  // Surface the live 7-day free trial when the annual tier is selected and the
  // user is intro-offer eligible; otherwise fall back to the standard unlock CTA.
  const showTrial = activeTier === 'annual' && !!trialEligible;

  // Live "save X% vs monthly" framing — computed from real store prices so it
  // stays correct across all territories/PPP. Hidden when prices unavailable.
  const annualSavingsPct = (() => {
    const m = parseFloat(products?.monthly?.price);
    const a = parseFloat(products?.annual?.price);
    if (!m || !a || m <= 0) return null;
    const pct = Math.round((1 - a / (m * 12)) * 100);
    return pct > 5 && pct < 90 ? pct : null;
  })();

  // Per-month equivalent of the annual plan, formatted in the store's OWN
  // currency (never a hardcoded $) so the annual tier visibly undercuts the
  // monthly price. Degrades to null if prices/currency are unavailable or Intl
  // currency formatting is unsupported on the device — the line just won't render.
  const annualPerMonth = (() => {
    const a = parseFloat(products?.annual?.price);
    const cur = products?.annual?.currency;
    if (!a || a <= 0 || !cur) return null;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(a / 12);
    } catch (e) {
      return null;
    }
  })();

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
              // When the user is trial-eligible, the annual card leads with the
              // free-trial hook instead of "best value" — surfaces the $0-to-start
              // offer at tier selection, not just after the annual tier is picked.
              const badgeKey = (tier.id === 'annual' && trialEligible) ? 'proGate.freeTrialBadge' : tier.badge;
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
                  {tier.id === 'annual' && annualSavingsPct != null && (
                    <Text style={[styles.tierSavings, { color: colors.text2 }]} maxFontSizeMultiplier={1.2}>
                      {t('proGate.saveVsMonthly', { pct: annualSavingsPct })}
                    </Text>
                  )}
                  {tier.id === 'annual' && annualPerMonth && (
                    <Text style={[styles.tierSavings, { color: colors.text3 }]} maxFontSizeMultiplier={1.2}>
                      {`≈ ${annualPerMonth}${t('proGate.perMonth')}`}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Purchase button — disabled until live store prices load */}
          <TouchableOpacity
            style={[styles.purchaseBtn, { backgroundColor: colors.text }, (isPurchasing || !pricesLoaded) && { backgroundColor: colors.border }]}
            onPress={() => { tapMedium(); onPurchase(activeTier); }}
            disabled={isPurchasing || !pricesLoaded}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showTrial
              ? `${t('proGate.startTrial')}. ${t('proGate.thenPrice', { price: getPriceForTier('annual') || '' })}`
              : `${t('proGate.unlockButton')} ${getPriceForTier(activeTier) || ''}`}
            accessibilityState={{ disabled: isPurchasing || !pricesLoaded }}
          >
            {isPurchasing
              ? <ActivityIndicator color={colors.bg} />
              : <Text style={[styles.purchaseBtnText, { color: colors.bg }]} maxFontSizeMultiplier={1.2}>{showTrial ? t('proGate.startTrial') : t('proGate.unlockButton')}</Text>
            }
          </TouchableOpacity>

          {/* Offline note — store unreachable, prices unavailable */}
          {!pricesLoaded && !isPurchasing && (
            <Text style={[styles.trialSub, { color: colors.text3 }]}>
              {t('proGate.pricesUnavailable')}
            </Text>
          )}

          {/* Trial terms subtext — only when the free trial is being offered */}
          {showTrial && !isPurchasing && pricesLoaded && (
            <Text style={[styles.trialSub, { color: colors.text3 }]}>
              {t('proGate.thenPrice', { price: getPriceForTier('annual') })}
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
  tierSavings: {
    fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, fontWeight: '700', marginTop: 3,
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
