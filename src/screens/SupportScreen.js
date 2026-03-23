/**
 * SupportScreen — Help & support modal overlay.
 * Shows FAQ, contact info, version, and links.
 * Opened via info button on grid footer.
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Modal,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { tapLight } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

const APP_VERSION = '2.5.0';
const SUPPORT_EMAIL = 'support@redgridtactical.com';
const GITHUB_URL = 'https://github.com/RedGridTactical/RedGridMGRS';
const PRIVACY_URL = 'https://redgridtactical.github.io/RedGridMGRS/privacy.html';
const SUPPORT_URL = 'https://redgridtactical.github.io/RedGridMGRS/support.html';

function openLink(url) {
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

export function SupportScreen({ visible, onClose }) {
  const colors = useColors();
  const { t } = useTranslation();

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

          {/* Quick Links */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('support.contact')}</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(`mailto:${SUPPORT_EMAIL}`); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.emailSupport')}
          >
            <Text style={[styles.linkIcon]}>&#9993;</Text>
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
            <Text style={[styles.linkIcon]}>&#128027;</Text>
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
            <Text style={[styles.linkIcon]}>&#128193;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.sourceCode')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.sourceCodeSub')}</Text>
            </View>
          </TouchableOpacity>

          {/* FAQ */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('support.faq')}</Text>

          <FAQItem colors={colors} q={t('support.faqCellService')} a={t('support.faqCellServiceA')} />
          <FAQItem colors={colors} q={t('support.faqRestore')} a={t('support.faqRestoreA')} />
          <FAQItem colors={colors} q={t('support.faqData')} a={t('support.faqDataA')} />
          <FAQItem colors={colors} q={t('support.faqAccuracy')} a={t('support.faqAccuracyA')} />
          <FAQItem colors={colors} q={t('support.faqWhatIsMgrs')} a={t('support.faqWhatIsMgrsA')} />
          <FAQItem colors={colors} q={t('support.faqDagr')} a={t('support.faqDagrA')} />

          {/* Privacy & Legal */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('support.privacyLegal')}</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(PRIVACY_URL); }}
            accessibilityRole="button"
            accessibilityLabel={t('support.privacyPolicy')}
          >
            <Text style={[styles.linkIcon]}>&#128274;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>{t('support.privacyPolicy')}</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{t('support.privacySub')}</Text>
            </View>
          </TouchableOpacity>

          {/* Version Info */}
          <View style={[styles.versionBlock, { borderTopColor: colors.border2 }]}>
            <Text style={[styles.versionText, { color: colors.text4 }]}>Red Grid MGRS v{APP_VERSION}</Text>
            <Text style={[styles.versionText, { color: colors.text4 }]}>{t('support.license')}</Text>
            <Text style={[styles.versionText, { color: colors.text4 }]}>{t('support.copyright')}</Text>
          </View>

        </ScrollView>
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  closeBtn: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  linkIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
    textAlign: 'center',
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  linkSub: {
    fontSize: 12,
    marginTop: 2,
  },
  faqItem: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  faqQ: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  faqA: {
    fontSize: 13,
    lineHeight: 19,
  },
  versionBlock: {
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    marginBottom: 2,
  },
});
