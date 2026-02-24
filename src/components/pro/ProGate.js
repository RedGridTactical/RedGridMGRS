/**
 * ProGate — Wraps any Pro-only feature.
 * If the user owns Pro, renders children.
 * If not, renders the paywall overlay.
 *
 * Usage:
 *   <ProGate usePro={usePro}>
 *     <MyProFeature />
 *   </ProGate>
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const RED5 = '#1A0000';
const BG   = '#0A0000';

const PRO_FEATURES = [
  { icon: '◈', label: 'SAVED WAYPOINT LISTS', sub: 'Up to 10 named lists, 20 waypoints each — persisted across sessions' },
  { icon: '◉', label: 'ADDITIONAL REPORT TEMPLATES', sub: 'ICS 201 Incident Command, CASEVAC, and a custom template builder' },
  { icon: '⊕', label: 'COORDINATE FORMAT DISPLAY', sub: 'Switch between MGRS, UTM, Decimal Degrees, and DMS' },
  { icon: '◐', label: 'DISPLAY THEMES', sub: 'NVG green, day white, night blue — in addition to tactical red' },
];

export function ProGate({ pro, buying, restoring, buy, restore, error, price, children }) {
  if (pro) return children;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.crown}>◈</Text>
        <Text style={styles.title}>REDGRID PRO</Text>
        <Text style={styles.subtitle}>ONE-TIME PURCHASE · NO SUBSCRIPTION · NO ADS</Text>
      </View>

      {/* Feature list */}
      <View style={styles.features}>
        {PRO_FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureSub}>{f.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Price & buy */}
      <View style={styles.purchaseBlock}>
        <Text style={styles.price}>{price}</Text>
        <Text style={styles.priceNote}>One-time · Yours forever · All future Pro features included</Text>

        <TouchableOpacity
          style={[styles.buyBtn, buying && styles.buyBtnDisabled]}
          onPress={buy}
          disabled={buying || restoring}
          activeOpacity={0.8}
        >
          {buying
            ? <ActivityIndicator color={RED} size="small" />
            : <Text style={styles.buyBtnText}>UNLOCK REDGRID PRO</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={restore}
          disabled={buying || restoring}
          activeOpacity={0.7}
        >
          {restoring
            ? <ActivityIndicator color={RED3} size="small" />
            : <Text style={styles.restoreBtnText}>RESTORE PREVIOUS PURCHASE</Text>
          }
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.footer}>
        Payment processed by Apple or Google. RedGrid Tactical never sees your payment details.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 20, paddingBottom: 40 },

  header: { alignItems: 'center', paddingVertical: 24 },
  crown: { fontSize: 36, color: RED, marginBottom: 8 },
  title: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700', letterSpacing: 6, color: RED, marginBottom: 6 },
  subtitle: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, color: RED3, textAlign: 'center' },

  features: { marginVertical: 16, gap: 12 },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderWidth: 1, borderColor: RED4, backgroundColor: '#0D0000',
    padding: 14,
  },
  featureIcon: { fontFamily: 'monospace', fontSize: 20, color: RED, width: 24, textAlign: 'center', marginTop: 2 },
  featureText: { flex: 1, gap: 4 },
  featureLabel: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 2, color: RED },
  featureSub: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: RED3, lineHeight: 14 },

  purchaseBlock: { marginTop: 8, gap: 12, alignItems: 'center' },
  price: { fontFamily: 'monospace', fontSize: 36, fontWeight: '700', letterSpacing: 4, color: RED },
  priceNote: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: RED3, textAlign: 'center' },

  buyBtn: {
    width: '100%', borderWidth: 1, borderColor: RED,
    backgroundColor: RED4, paddingVertical: 16, alignItems: 'center',
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { fontFamily: 'monospace', fontSize: 13, fontWeight: '700', letterSpacing: 4, color: RED },

  restoreBtn: { paddingVertical: 10 },
  restoreBtnText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: RED3 },

  error: { fontFamily: 'monospace', fontSize: 10, color: RED, textAlign: 'center', marginTop: 4 },

  footer: {
    marginTop: 24, fontFamily: 'monospace', fontSize: 8,
    letterSpacing: 1, color: RED4, textAlign: 'center', lineHeight: 14,
  },
});
