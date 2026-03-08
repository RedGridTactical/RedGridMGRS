/**
 * ProGate — Paywall overlay shown when a free user taps a Pro feature.
 * Displays the feature name, benefit list, price, and purchase/restore buttons.
 */
import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { tapMedium, tapLight } from '../utils/haptics';

const PRO_FEATURES = [
  { icon: '🗣️', label: 'Voice Readout', sub: 'NATO phonetic grid readout — hands-free operation' },
  { icon: '📍', label: 'Saved Waypoint Lists', sub: 'Save named patrol routes, OBJs, and rally points' },
  { icon: '📋', label: 'Tactical Reports', sub: 'ICS 201, CASEVAC, ANGUS/CFF, and custom templates' },
  { icon: '🧭', label: 'Coordinate Formats', sub: 'UTM, decimal degrees, DMS — on the main grid display' },
  { icon: '🔴', label: 'Display Themes', sub: 'NVG green, day white, blue-force — preserve night vision' },
];

export function ProGate({ visible, onClose, featureName, product, isPurchasing, onPurchase, onRestore }) {
  const colors = useColors();
  // expo-iap uses 'displayPrice' not 'priceString'
  const priceStr = product?.displayPrice ?? '$9.99';

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
            <Text style={[styles.badge, { color: colors.bg, backgroundColor: colors.text }]}>PRO</Text>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">RED GRID PRO</Text>
            <Text style={[styles.subtitle, { color: colors.text3 }]}>
              {featureName
                ? `${featureName} is a Pro feature`
                : 'Unlock the full Red Grid experience'}
            </Text>
          </View>

          {/* Feature list */}
          <ScrollView style={styles.features} showsVerticalScrollIndicator={false}>
            {PRO_FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, { borderBottomColor: colors.text5 }]}>
                <Text style={styles.featureIcon} importantForAccessibility="no" accessibilityElementsHidden={true}>{f.icon}</Text>
                <View style={styles.featureText}>
                  <Text style={[styles.featureLabel, { color: colors.text }]}>{f.label}</Text>
                  <Text style={[styles.featureSub, { color: colors.text3 }]}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border2 }]} />

          {/* Price */}
          <Text style={[styles.price, { color: colors.text }]}>{priceStr}</Text>
          <Text style={[styles.priceSub, { color: colors.text3 }]}>ONE-TIME PURCHASE · NO SUBSCRIPTION · NO ADS</Text>

          {/* Purchase button */}
          <TouchableOpacity
            style={[styles.purchaseBtn, { backgroundColor: colors.text }, isPurchasing && { backgroundColor: colors.border }]}
            onPress={() => { tapMedium(); onPurchase(); }}
            disabled={isPurchasing}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Unlock Red Grid Pro for ${priceStr}`}
            accessibilityState={{ disabled: isPurchasing }}
          >
            {isPurchasing
              ? <ActivityIndicator color={colors.bg} />
              : <Text style={[styles.purchaseBtnText, { color: colors.bg }]}>UNLOCK RED GRID PRO</Text>
            }
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity style={styles.restoreBtn} onPress={() => { tapLight(); onRestore(); }} disabled={isPurchasing} accessibilityRole="button" accessibilityLabel="Restore previous purchase">
            <Text style={[styles.restoreText, { color: colors.text3 }]}>RESTORE PREVIOUS PURCHASE</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close, not now">
            <Text style={[styles.closeText, { color: colors.text4 }]}>NOT NOW</Text>
          </TouchableOpacity>

          {/* Legal */}
          <Text style={[styles.legal, { color: colors.text4 }]}>
            Payment charged to your App Store / Google Play account at confirmation.
            No recurring charges. No subscription.
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
  features: { maxHeight: 180, marginBottom: 16 },
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
  divider: { height: 1, marginVertical: 16 },
  price: {
    fontFamily: 'monospace', fontSize: 28, fontWeight: '700',
    textAlign: 'center', letterSpacing: 4, marginBottom: 4,
  },
  priceSub: {
    fontSize: 8,
    textAlign: 'center', letterSpacing: 2, marginBottom: 20,
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
