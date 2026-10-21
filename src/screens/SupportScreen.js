/**
 * SupportScreen — Help & support modal overlay.
 * Shows FAQ, contact info, version, and links.
 * Opened via info button on grid footer.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Modal } from '../components/FieldModal';
import { ProGate } from '../components/ProGate';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { useColors } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';
import { tapLight, tapMedium, notifySuccess, notifyError } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';
import { shareTrialLink, shareApp } from '../utils/referral';
import { useReferralTrial } from '../hooks/useReferralTrial';
import { purchaseTiersForPlan, ownedPlanLabelKey, subscriptionManagementURL } from '../utils/proManagement';

const APP_VERSION = '4.1.5';
const SUPPORT_EMAIL = 'support@redgridtactical.com';
const GITHUB_URL = 'https://github.com/RedGridTactical/RedGridMGRS';
const PRIVACY_URL = 'https://redgridtactical.com/privacy';
const TERMS_URL = 'https://redgridtactical.com/terms';

async function openLink(url) {
  if (!(await allowSystemDisplay())) return;
  Linking.openURL(url).catch(() => {});
}

function FAQItem({ q, a, colors }) {
  return (
    <View style={[styles.faqItem, { borderBottomColor: colors.border2 }]}>
      <Text style={[styles.faqQ, { color: colors.text }]}>{q}</Text>
      <Text style={[styles.faqA, { color: colors.text3 }]}>{a}</Text>
    </View>
  );
}

export function SupportScreen({
  visible, onClose, onRestore, onReviewApp, isRestoring = false,
  ownedPlan = 'unknown', ownedPlanSource = 'none', giftActive = false,
  onPurchase, product, products, selectedTier, onSelectTier, trialEligible, onRetryPrices,
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [shareBusy, setShareBusy] = useState(false);
  const sharing = useRef(false);
  const [planOptionsVisible, setPlanOptionsVisible] = useState(false);
  const [openingSubscriptions, setOpeningSubscriptions] = useState(false);
  const subscriptionLinkBusy = useRef(false);
  const previousPlan = useRef(ownedPlan);
  const canOffer = purchaseTiersForPlan(ownedPlan).length > 0;
  const hasSubscription = ownedPlan === 'monthly' || ownedPlan === 'annual';
  const trialStatus = useReferralTrial();
  const { refresh: refreshTrial } = trialStatus;

  useEffect(() => { if (visible) refreshTrial(); }, [visible, refreshTrial]);
  useEffect(() => {
    // A completed purchase/restore closes only the nested chooser; Help remains
    // its native presenter, avoiding sibling-modal presentation races on iOS.
    if (!visible || (previousPlan.current !== ownedPlan && ['monthly', 'annual', 'lifetime'].includes(ownedPlan))) {
      setPlanOptionsVisible(false);
    }
    previousPlan.current = ownedPlan;
  }, [visible, ownedPlan]);

  const handleManageSubscriptions = useCallback(async () => {
    if (subscriptionLinkBusy.current || isRestoring) return;
    subscriptionLinkBusy.current = true;
    setOpeningSubscriptions(true);
    try {
      if (!(await allowSystemDisplay())) return;
      tapLight();
      await Linking.openURL(subscriptionManagementURL(Platform.OS));
    } catch {
      notifyError();
      Alert.alert(t('managePro.linkFailedTitle'), t('managePro.linkFailedBody'));
    } finally {
      subscriptionLinkBusy.current = false;
      setOpeningSubscriptions(false);
    }
  }, [isRestoring, t]);

  const handleShareTrial = useCallback(async () => {
    if (sharing.current) return;
    sharing.current = true;
    setShareBusy(true);
    try {
      if (!(await allowSystemDisplay())) return;
      tapMedium();
      const result = await shareTrialLink(url => t('trial.shareMessage', { url }));
      if (result.ok) {
        if (result.shared) notifySuccess();
        return;
      }
      notifyError();
      const key = result.reason === 'already_shared' ? 'alreadyShared'
        : result.reason === 'expired' ? 'linkExpired'
        : result.reason === 'storage' ? 'storageFailed'
        : result.reason === 'share' ? 'shareFailed' : 'invalid';
      Alert.alert(t(`trial.${key}Title`), t(`trial.${key}Body`));
    } catch {
      notifyError();
      try { Alert.alert(t('trial.shareFailedTitle'), t('trial.shareFailedBody')); } catch {}
    } finally {
      sharing.current = false;
      setShareBusy(false);
    }
  }, [t]);

  const handleShareApp = useCallback(async () => {
    if (sharing.current) return;
    sharing.current = true; setShareBusy(true);
    try {
      if (!(await allowSystemDisplay())) return;
      tapMedium();
      const result = await shareApp(url => t('support.shareAppMessage', { url }));
      if (!result.ok) Alert.alert(t('trial.shareFailedTitle'), t('trial.shareFailedBody'));
    } finally { sharing.current = false; setShareBusy(false); }
  }, [t]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border2 }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('support.title')}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('support.close')}>
            <Text style={[styles.closeBtn, { color: colors.text2 }]}>{t('support.close')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">{t('managePro.title')}</Text>
          <View style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.linkTitle, { color: colors.text }]}>{t(ownedPlanLabelKey(ownedPlan))}</Text>
            {giftActive && <Text style={[styles.planBody, { color: colors.text2 }]}>{t('managePro.giftActive')}</Text>}
            {ownedPlanSource === 'cache' && <Text style={[styles.planBody, { color: colors.text3 }]}>{t('managePro.cached')}</Text>}
            {!canOffer && ownedPlan !== 'lifetime' && ownedPlan !== 'loading' && <Text style={[styles.planBody, { color: colors.text3 }]}>{t('managePro.unknownBody')}</Text>}
            {ownedPlan === 'lifetime' && <Text style={[styles.planBody, { color: colors.text2 }]}>{t('proGate.lifetimePromise')}</Text>}
            {(hasSubscription || ownedPlan === 'lifetime') && <Text style={[styles.planBody, { color: colors.text3 }]}>{t('managePro.subscriptionNotice')}</Text>}
            {canOffer && onPurchase && (
              <TouchableOpacity style={[styles.planAction, { borderWidth: 1, paddingHorizontal: 10, borderColor: colors.text2, opacity: isRestoring ? 0.5 : 1 }]}
                onPress={() => { if (!canOffer || isRestoring) return; tapLight(); setPlanOptionsVisible(true); }}
                disabled={isRestoring} accessibilityRole="button"
                accessibilityState={{ disabled: isRestoring }}
                accessibilityLabel={t(hasSubscription ? 'managePro.viewLifetime' : 'managePro.viewOptions')}>
                <Text style={[styles.linkTitle, { color: colors.text }]}>{t(hasSubscription ? 'managePro.viewLifetime' : 'managePro.viewOptions')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.planAction}
              onPress={() => { if (!isRestoring) onRestore?.(); }}
              disabled={isRestoring || !onRestore} accessibilityRole="button"
              accessibilityLabel={t('proGate.restore')}
              accessibilityState={{ disabled: isRestoring || !onRestore, busy: isRestoring }}>
              <Text style={[styles.linkSub, { color: colors.text2 }]}>{t('proGate.restore')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.planAction} onPress={handleManageSubscriptions}
              disabled={openingSubscriptions || isRestoring} accessibilityRole="link"
              accessibilityLabel={t('managePro.manageSubscriptions')}
              accessibilityState={{ disabled: openingSubscriptions || isRestoring, busy: openingSubscriptions }}>
              <Text style={[styles.linkSub, { color: colors.text2, textDecorationLine: 'underline' }]}>{t('managePro.manageSubscriptions')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('support.supportRedGrid')}</Text>
          <TouchableOpacity style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); onReviewApp?.(); }} accessibilityRole="button" accessibilityLabel={t('support.writeReview')}>
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>RATE</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.writeReview')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.reviewDescription')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card, opacity: shareBusy ? 0.5 : 1 }]}
            onPress={handleShareApp} disabled={shareBusy} accessibilityState={{ disabled: shareBusy, busy: shareBusy }}
            accessibilityRole="button" accessibilityLabel={t('support.shareApp')}>
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>SHARE</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.shareApp')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.shareAppDescription')}</Text>
            </View>
          </TouchableOpacity>

          {/* Quick Links */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('support.contact')}</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(`mailto:${SUPPORT_EMAIL}`); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.emailSupport')}
          >
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>MAIL</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.emailSupport')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{SUPPORT_EMAIL}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(GITHUB_URL + '/issues'); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.reportBug')}
          >
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>BUG</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.reportBug')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.reportBugSub')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(GITHUB_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.sourceCode')}
          >
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>SRC</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.sourceCode')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.sourceCodeSub')}</Text>
            </View>
          </TouchableOpacity>

          {/* Share a free trial */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('support.giftFreeTrial')}</Text>
          <View style={[styles.shareCard, { borderColor: colors.text2, backgroundColor: colors.card }]}>
            <Text style={[styles.shareTitle, { color: colors.text }]}>{t('trial.shareCardTitle')}</Text>
            <Text style={[styles.shareBody, { color: colors.text3 }]}>
              {t('trial.shareCardBody')}
            </Text>
            {trialStatus.active && (
              <Text style={[styles.shareStatus, { color: colors.text2 }]}>
                {t('trial.banner', { days: trialStatus.daysLeft })}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.shareBtn,
                { borderColor: colors.text, backgroundColor: colors.border2, opacity: shareBusy ? 0.5 : 1 },
              ]}
              disabled={shareBusy}
              accessibilityState={{ disabled: shareBusy, busy: shareBusy }}
              onPress={handleShareTrial}
              accessibilityRole="button"
              accessibilityLabel={t('trial.shareAction')}
            >
              <Text style={[styles.shareBtnText, { color: colors.text }]}>
                {t('trial.shareAction')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* FAQ */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('support.faq')}</Text>

          <FAQItem colors={colors} q={t('support.faqCellService')} a={t('support.faqCellServiceA')} />
          <FAQItem colors={colors} q={t('support.faqRestore')} a={t('support.faqRestoreA')} />
          <FAQItem colors={colors} q={t('support.faqData')} a={t('support.faqDataA')} />
          <FAQItem colors={colors} q={t('support.faqAccuracy')} a={t('support.faqAccuracyA')} />
          <FAQItem colors={colors} q={t('support.faqWhatIsMgrs')} a={t('support.faqWhatIsMgrsA')} />
          <FAQItem colors={colors} q={t('support.faqDagr')} a={t('support.faqDagrA')} />
          <FAQItem colors={colors} q={t('support.faqSourcePaid')} a={t('support.faqSourcePaidA')} />

          {/* Privacy & Legal */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('support.privacyLegal')}</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(TERMS_URL); }}
            accessibilityRole="link"
            accessibilityLabel={t('proGate.termsOfUse')}
          >
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>PRO</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('proGate.termsOfUse')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('proGate.lifetimePromise')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(PRIVACY_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.privacyPolicy')}
          >
            <Text style={[styles.linkIcon, { color: colors.text2 }]} maxFontSizeMultiplier={1} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>LEGAL</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.privacyPolicy')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.privacySub')}</Text>
            </View>
          </TouchableOpacity>

          {/* Version Info */}
          <View style={[styles.versionBlock, { borderTopColor: colors.border2 }]}>
            <Text style={[styles.versionText, { color: colors.text3 }]}>Red Grid MGRS v{APP_VERSION}</Text>
            <Text style={[styles.versionText, { color: colors.text3 }]}>{t('support.license')}</Text>
            <Text style={[styles.versionText, { color: colors.text3 }]}>{t('support.copyright')}</Text>
          </View>

        </ScrollView>
        <ProGate visible={visible && planOptionsVisible} management ownedPlan={ownedPlan}
          onClose={() => setPlanOptionsVisible(false)} onPurchase={onPurchase} onRestore={onRestore}
          isPurchasing={isRestoring} product={product} products={products}
          selectedTier={selectedTier} onSelectTier={onSelectTier} trialEligible={trialEligible}
          onRetryPrices={onRetryPrices} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...TYPE.heading,
    fontSize: 18,
    letterSpacing: 1.2,
  },
  closeBtn: {
    ...TYPE.label,
    fontSize: 14,
    letterSpacing: 0.8,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  planCard: { borderWidth: 1, borderRadius: 2, padding: 14, marginBottom: 24 },
  planBody: { ...TYPE.body, fontSize: 14, lineHeight: 21, marginTop: 8 },
  planAction: { minHeight: 44, justifyContent: 'center', paddingVertical: 10, marginTop: 8 },
  sectionTitle: {
    ...TYPE.heading,
    fontSize: 15,
    letterSpacing: 1,
    marginBottom: 10,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 2,
    padding: 14,
    marginBottom: 8,
  },
  // Monospace text badges, not emoji: platform emoji render in colour and
  // would break the red-only Tactical display.
  linkIcon: {
    ...TYPE.data,
    fontSize: 11,
    letterSpacing: 0.8,
    marginRight: 10,
    width: 44,
    textAlign: 'center',
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    ...TYPE.heading, letterSpacing: 0.3,
    fontSize: 16,
  },
  linkSub: {
    ...TYPE.body, letterSpacing: 0.3,
    fontSize: 14,
    marginTop: 2,
  },
  faqItem: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  faqQ: {
    ...TYPE.heading, letterSpacing: 0.3,
    fontSize: 16,
    marginBottom: 4,
  },
  faqA: {
    ...TYPE.body, letterSpacing: 0.3,
    fontSize: 15,
    lineHeight: 22,
  },
  versionBlock: {
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 16,
    alignItems: 'center',
  },
  versionText: {
    ...TYPE.body, letterSpacing: 0.3,
    fontSize: 13,
    marginBottom: 2,
  },
  shareCard: {
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  shareTitle: {
    ...TYPE.heading, fontSize: 16, letterSpacing: 1 },
  shareBody: { ...TYPE.body, letterSpacing: 0.3, fontSize: 14, lineHeight: 20 },
  shareStatus: {
    ...TYPE.label, fontSize: 13, letterSpacing: 0.5, marginTop: 2 },
  shareBtn: { borderWidth: 2, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  shareBtnText: {
    ...TYPE.heading, fontSize: 14, letterSpacing: 1 },
});
