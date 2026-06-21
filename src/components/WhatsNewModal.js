/**
 * WhatsNewModal — One-time post-update modal that lists new features.
 * Shown on first launch after the app version changes.
 * Tracks last seen version in AsyncStorage under `rg_whatsnew_seen_version`.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '../utils/ThemeContext';
import { tapLight } from '../utils/haptics';

const SEEN_KEY = 'rg_whatsnew_seen_version';

// Features to showcase for a given version. Keep terse — this is a glance screen.
const FEATURES_BY_VERSION = {
  '3.5.0': [
    {
      icon: '⤴',
      title: 'ROUTE CARD',
      body: 'Turn any waypoint list into a field-ready route card — every leg with bearing, distance, and grid — and share it as an image. Pro.',
    },
    {
      icon: '★',
      title: '7-DAY FREE TRIAL',
      body: 'Try Red Grid Pro free for 7 days on the annual plan — every tool, theme, and offline feature. No charge today, cancel anytime.',
    },
    {
      icon: '◆',
      title: 'POLISH & TRANSLATIONS',
      body: 'Clearer annual savings on the upgrade screen, more translated screens, and stability fixes. Still offline-first — no accounts, no tracking.',
    },
  ],
  '3.3.1': [
    {
      icon: '◉',
      title: 'MARK POSITION',
      body: 'One-tap save of your current grid on the main screen. Perfect for CCP, contact, or drop points.',
    },
    {
      icon: '▤',
      title: 'OFFLINE MAP PROMPTS',
      body: 'On first map visit, prep offline tiles so your device is field-ready before you lose signal.',
    },
    {
      icon: '⤴',
      title: 'SHARE FREE TRIAL',
      body: 'Give a friend 30 days of Red Grid Pro. One gift, one trial — both directions, just once.',
    },
  ],
  '3.3.2': [
    {
      icon: '🤖',
      title: 'NOW ON ANDROID',
      body: 'Red Grid MGRS is available on Android phones and tablets. Same precision, same zero-network privacy.',
    },
    {
      icon: '🔎',
      title: 'MAP ZOOM CONTROLS',
      body: 'Pinch or tap +/- for precise map zoom. MGRS grid reference now shows immediately in the bottom bar.',
    },
  ],
  '3.3.3': [
    {
      icon: '✓',
      title: 'SMOOTHER IN-APP REVIEW',
      body: 'If you like Red Grid, the review prompt now appears at natural moments — after a successful mark — instead of at random launches.',
    },
    {
      icon: '◆',
      title: 'PERFORMANCE POLISH',
      body: 'Background tuning and stability improvements across the grid, map, and tools.',
    },
  ],
  '3.3.4': [
    {
      icon: '✕',
      title: 'TAP-TO-DELETE WAYPOINTS',
      body: 'Tap any waypoint pin on the map to see its details and remove it. Works on free and Pro plans — no more stuck markers after you plot them.',
    },
    {
      icon: '◆',
      title: 'POLISH',
      body: 'Minor stability and readability tweaks across the map and grid screens.',
    },
  ],
  '3.3.5': [
    {
      icon: '◆',
      title: 'INFRASTRUCTURE UPDATE',
      body: 'Behind-the-scenes improvements to support reliability and faster ship cycles.',
    },
  ],
  '3.4.0': [
    {
      icon: '✓',
      title: 'MISSION PREFLIGHT',
      body: 'Open PFL on the map for GPS, mesh, offline tile, permission, battery, and network readiness before stepping off.',
    },
    {
      icon: '▤',
      title: 'SAVED AO PACKAGES',
      body: 'Save the current map viewport as a local AO package with tile estimates and one-tap refresh.',
    },
  ],
  '3.4.3': [
    {
      icon: '★',
      title: '7-DAY FREE TRIAL',
      body: 'Try Red Grid Pro free for 7 days on the annual plan — every tool, theme, and offline feature. No charge today, cancel anytime.',
    },
    {
      icon: '◉',
      title: 'SEE THE FULL LOADOUT',
      body: 'LISTS, COORDS, THEME, and MESH tabs are now visible to everyone — locked until Pro, so you can see exactly what the upgrade unlocks.',
    },
    {
      icon: '✓',
      title: 'FIELD RELIABILITY',
      body: 'Smoother map tile checks at wide zoom, report grids no longer overwritten by live GPS, smarter mesh reconnect, and purchase reliability fixes.',
    },
  ],
  '3.4.2': [
    {
      icon: '★',
      title: '7-DAY FREE TRIAL',
      body: 'Try Red Grid Pro free for 7 days on the annual plan — every tool, theme, and offline feature. No charge today, cancel anytime.',
    },
    {
      icon: '✓',
      title: 'POLISH & FIXES',
      body: 'A clearer upgrade screen and in-app purchase reliability fixes. Still offline-first — no accounts, no tracking.',
    },
  ],
  '3.4.1': [
    {
      icon: '★',
      title: '7-DAY FREE TRIAL',
      body: 'Try Red Grid Pro free for 7 days on the annual plan — every tool, theme, and offline feature. Cancel anytime.',
    },
    {
      icon: '✓',
      title: 'SMOOTHER RATINGS PROMPT',
      body: 'On Android, the review prompt now appears at natural moments instead of at launch. Plus minor fixes.',
    },
  ],
};

export function WhatsNewModal({ currentVersion, showTrialCta, onStartTrial }) {
  const [visible, setVisible] = useState(false);
  const colors = useColors();
  const features = FEATURES_BY_VERSION[currentVersion] || [];
  // Every fresh install sees this modal (first launch counts as a version
  // change), so when the version notes lead with the free trial, give the
  // reader a direct path into the paywall instead of a dead-end CONTINUE.
  const hasTrialCard = features.some((f) => /FREE TRIAL/i.test(f.title || ''));
  const showCta = !!showTrialCta && !!onStartTrial && hasTrialCard;

  useEffect(() => {
    if (!currentVersion || !features.length) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(SEEN_KEY);
        if (cancelled) return;
        if (seen !== currentVersion) setVisible(true);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentVersion]);

  const dismiss = async () => {
    tapLight();
    setVisible(false);
    try { await AsyncStorage.setItem(SEEN_KEY, currentVersion); } catch {}
  };

  if (!features.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.text2 }]}>
          <Text style={[styles.badge, { color: colors.bg, backgroundColor: colors.text }]}>v{currentVersion}</Text>
          <Text style={[styles.title, { color: colors.text }]}>WHAT'S NEW</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {features.map((f, i) => (
              <View key={i} style={[styles.row, { borderBottomColor: colors.border2 }]}>
                <Text style={[styles.icon, { color: colors.text }]}>{f.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{f.title}</Text>
                  <Text style={[styles.rowBody, { color: colors.text3 }]}>{f.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          {showCta && (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.text }]}
              onPress={() => { tapLight(); dismiss(); setTimeout(() => onStartTrial(), 250); }}
              accessibilityRole="button"
              accessibilityLabel="Start 7-day free trial"
            >
              <Text style={[styles.ctaText, { color: colors.bg }]}>START 7-DAY FREE TRIAL</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.dismiss, { borderColor: colors.text, backgroundColor: colors.border2 }]}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={[styles.dismissText, { color: colors.text }]}>CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: 22 },
  box: { width: '100%', maxWidth: 460, maxHeight: '88%', borderWidth: 1, padding: 22, alignItems: 'stretch' },
  badge: { alignSelf: 'center', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 },
  title: { fontFamily: 'monospace', fontSize: 18, letterSpacing: 4, fontWeight: '800', textAlign: 'center', marginBottom: 18 },
  list: { flexGrow: 0, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { fontFamily: 'monospace', fontSize: 22, width: 26, textAlign: 'center', marginTop: 2 },
  rowTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 2, fontWeight: '800', marginBottom: 4 },
  rowBody: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
  ctaBtn: { paddingVertical: 14, alignItems: 'center', marginBottom: 8, minHeight: 44 },
  ctaText: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '800' },
  dismiss: { borderWidth: 2, paddingVertical: 14, alignItems: 'center' },
  dismissText: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '800' },
});
