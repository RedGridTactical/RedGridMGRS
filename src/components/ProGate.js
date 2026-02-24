/**
 * ProGate — Paywall overlay shown when a free user taps a Pro feature.
 * Displays the feature name, benefit list, price, and purchase/restore buttons.
 */
import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

const PRO_FEATURES = [
  { icon: '📍', label: 'Saved Waypoint Lists', sub: 'Save named patrol routes, OBJs, and rally points' },
  { icon: '📋', label: 'Additional Report Templates', sub: 'ICS 201, ANGUS, custom template builder' },
  { icon: '🔴', label: 'Display Themes', sub: 'NVG green, day white, blue-force color schemes' },
];

export function ProGate({ visible, onClose, featureName, product, isPurchasing, onPurchase, onRestore }) {
  const priceStr = product?.priceString ?? '$4.99';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.badge}>PRO</Text>
            <Text style={styles.title}>REDGRID PRO</Text>
            <Text style={styles.subtitle}>
              {featureName
                ? `${featureName} is a Pro feature`
                : 'Unlock the full RedGrid experience'}
            </Text>
          </View>

          {/* Feature list */}
          <ScrollView style={styles.features} showsVerticalScrollIndicator={false}>
            {PRO_FEATURES.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={styles.featureText}>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                  <Text style={styles.featureSub}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Price */}
          <Text style={styles.price}>{priceStr}</Text>
          <Text style={styles.priceSub}>ONE-TIME PURCHASE · NO SUBSCRIPTION · NO ADS</Text>

          {/* Purchase button */}
          <TouchableOpacity
            style={[styles.purchaseBtn, isPurchasing && styles.purchaseBtnDisabled]}
            onPress={onPurchase}
            disabled={isPurchasing}
            activeOpacity={0.8}
          >
            {isPurchasing
              ? <ActivityIndicator color={BG} />
              : <Text style={styles.purchaseBtnText}>UNLOCK REDGRID PRO</Text>
            }
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity style={styles.restoreBtn} onPress={onRestore} disabled={isPurchasing}>
            <Text style={styles.restoreText}>RESTORE PREVIOUS PURCHASE</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>NOT NOW</Text>
          </TouchableOpacity>

          {/* Legal */}
          <Text style={styles.legal}>
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
    backgroundColor: '#0D0000',
    borderWidth: 1,
    borderColor: RED2,
    padding: 24,
  },
  header: { alignItems: 'center', marginBottom: 20 },
  badge: {
    fontFamily: 'monospace', fontSize: 10, letterSpacing: 6,
    color: BG, backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'monospace', fontSize: 22, fontWeight: '700',
    letterSpacing: 6, color: RED, marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'monospace', fontSize: 10, color: RED3,
    textAlign: 'center', letterSpacing: 1,
  },
  features: { maxHeight: 180, marginBottom: 16 },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: RED5,
  },
  featureIcon: { fontSize: 18, marginRight: 12, marginTop: 2 },
  featureText: { flex: 1 },
  featureLabel: {
    fontFamily: 'monospace', fontSize: 11, fontWeight: '700',
    color: RED, letterSpacing: 1, marginBottom: 2,
  },
  featureSub: { fontFamily: 'monospace', fontSize: 9, color: RED3, letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: RED4, marginVertical: 16 },
  price: {
    fontFamily: 'monospace', fontSize: 28, fontWeight: '700',
    color: RED, textAlign: 'center', letterSpacing: 4, marginBottom: 4,
  },
  priceSub: {
    fontFamily: 'monospace', fontSize: 8, color: RED3,
    textAlign: 'center', letterSpacing: 2, marginBottom: 20,
  },
  purchaseBtn: {
    backgroundColor: RED, paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  purchaseBtnDisabled: { backgroundColor: RED3 },
  purchaseBtnText: {
    fontFamily: 'monospace', fontSize: 12, fontWeight: '700',
    color: BG, letterSpacing: 4,
  },
  restoreBtn: { paddingVertical: 10, alignItems: 'center', marginBottom: 4 },
  restoreText: { fontFamily: 'monospace', fontSize: 9, color: RED3, letterSpacing: 2 },
  closeBtn: { paddingVertical: 8, alignItems: 'center', marginBottom: 12 },
  closeText: { fontFamily: 'monospace', fontSize: 9, color: RED4, letterSpacing: 3 },
  legal: {
    fontFamily: 'monospace', fontSize: 7, color: RED4,
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 12,
  },
});
