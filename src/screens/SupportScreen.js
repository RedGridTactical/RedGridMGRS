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
          <Text style={[styles.headerTitle, { color: colors.text }]}>HELP & SUPPORT</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close help screen">
            <Text style={[styles.closeBtn, { color: colors.text2 }]}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Quick Links */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>CONTACT</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(`mailto:${SUPPORT_EMAIL}`); }}
            accessibilityRole="button"
            accessibilityLabel="Email support"
          >
            <Text style={[styles.linkIcon]}>&#9993;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>Email Support</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>{SUPPORT_EMAIL}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(GITHUB_URL + '/issues'); }}
            accessibilityRole="button"
            accessibilityLabel="Report a bug on GitHub"
          >
            <Text style={[styles.linkIcon]}>&#128027;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>Report a Bug</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>Open a GitHub issue</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(GITHUB_URL); }}
            accessibilityRole="button"
            accessibilityLabel="View source code on GitHub"
          >
            <Text style={[styles.linkIcon]}>&#128193;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>Source Code</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>Open source on GitHub</Text>
            </View>
          </TouchableOpacity>

          {/* FAQ */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>FAQ</Text>

          <FAQItem colors={colors}
            q="Does this work without cell service?"
            a="Yes. The app uses your phone's GPS receiver, which communicates directly with satellites. No cell tower, Wi-Fi, or internet required. Works in airplane mode."
          />
          <FAQItem colors={colors}
            q="How do I restore my Pro purchase?"
            a="Pro purchases are tied to your Apple ID. If you reinstall or switch devices, the app will automatically detect your purchase. If it doesn't, go to the THEME tab and look for a Restore option."
          />
          <FAQItem colors={colors}
            q="What data does this app collect?"
            a="None. Zero analytics, zero tracking, zero crash reporting. GPS coordinates exist in memory only and are discarded when you close the app."
          />
          <FAQItem colors={colors}
            q="How accurate is the MGRS grid?"
            a="Red Grid uses the DMA (Defense Mapping Agency) MGRS algorithm from TM 8358.1 with Vincenty bearing/distance calculations. Accuracy depends on your phone's GPS chip and satellite geometry."
          />
          <FAQItem colors={colors}
            q="What is MGRS?"
            a="Military Grid Reference System. A geocoordinate standard used by NATO militaries. It's built on UTM but adds a grid zone designator and 100km square identification for unambiguous position reporting."
          />
          <FAQItem colors={colors}
            q="Does it replace my DAGR?"
            a="For training, STXs, ruck marches, and permissive GPS environments: yes. The DAGR's SAASM module matters in contested environments, but for most use cases Red Grid delivers the same core land nav capabilities."
          />

          {/* Privacy & Legal */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>PRIVACY & LEGAL</Text>
          <TouchableOpacity
            style={[styles.linkCard, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => { tapLight(); openLink(PRIVACY_URL); }}
            accessibilityRole="button"
            accessibilityLabel="View privacy policy"
          >
            <Text style={[styles.linkIcon]}>&#128274;</Text>
            <View style={styles.linkInfo}>
              <Text style={[styles.linkTitle, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[styles.linkSub, { color: colors.text3 }]}>Zero data collection. Verified.</Text>
            </View>
          </TouchableOpacity>

          {/* Version Info */}
          <View style={[styles.versionBlock, { borderTopColor: colors.border2 }]}>
            <Text style={[styles.versionText, { color: colors.text4 }]}>Red Grid MGRS v{APP_VERSION}</Text>
            <Text style={[styles.versionText, { color: colors.text4 }]}>MIT + Commons Clause License</Text>
            <Text style={[styles.versionText, { color: colors.text4 }]}>{'\u00A9'} 2026 Red Grid Tactical</Text>
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
