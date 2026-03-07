/**
 * ToolsScreen — Six tactical tools, each as an expandable card.
 * All computation is local. No network. No location data stored.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { tapMedium } from '../utils/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SPRING_ANIM = {
  duration: 280,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

import { BackAzimuthTool }   from '../components/tools/BackAzimuthTool';
import { DeadReckoningTool } from '../components/tools/DeadReckoningTool';
import { ResectionTool }     from '../components/tools/ResectionTool';
import { PaceCountTool }     from '../components/tools/PaceCountTool';
import { DeclinationTool }   from '../components/tools/DeclinationTool';
import { TDSTool }           from '../components/tools/TDSTool';
import { SolarTool }         from '../components/tools/SolarTool';
import { PrecisionTool }     from '../components/tools/PrecisionTool';

const TOOLS = [
  { id: 'backaz',   label: 'BACK AZIMUTH',    sub: 'Reciprocal bearing calculator',         Component: BackAzimuthTool   },
  { id: 'dr',       label: 'DEAD RECKONING',   sub: 'Estimate position from heading+dist',   Component: DeadReckoningTool },
  { id: 'resect',   label: 'RESECTION',        sub: 'Fix position from two known points',    Component: ResectionTool     },
  { id: 'pace',     label: 'PACE COUNT',       sub: 'Paces ↔ distance converter',           Component: PaceCountTool     },
  { id: 'declin',   label: 'DECLINATION',      sub: 'Magnetic correction offset',            Component: DeclinationTool   },
  { id: 'tds',      label: 'TIME·DIST·SPEED',  sub: 'Movement planning calculator',          Component: TDSTool           },
  { id: 'solar',    label: 'SUN / MOON',        sub: 'Celestial bearing & orientation',       Component: SolarTool         },
  { id: 'prec',     label: 'MGRS PRECISION',   sub: 'Convert grid to reporting precision',   Component: PrecisionTool     },
];

export function ToolsScreen({ location, declination, paceCount, setDeclination, setPaceCount }) {
  const colors = useColors();
  const [openTool, setOpenTool] = useState(null);

  const toggle = useCallback((id) => {
    tapMedium();
    LayoutAnimation.configureNext(SPRING_ANIM);
    setOpenTool(prev => prev === id ? null : id);
  }, []);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>TOOLS</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>TAP TO EXPAND</Text>
      </View>

      {TOOLS.map(({ id, label, sub, Component }) => {
        const isOpen = openTool === id;
        return (
          <View key={id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, isOpen && { borderColor: colors.text2 }]}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => toggle(id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${label}, ${sub}`}
              accessibilityHint={isOpen ? 'Double tap to collapse' : 'Double tap to expand'}
            >
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.cardSub, { color: colors.text3 }]}>{sub}</Text>
              </View>
              <Text style={[styles.chevron, { color: colors.border }, isOpen && { color: colors.text, transform: [{ rotate: '90deg' }] }]} importantForAccessibility="no" accessibilityElementsHidden={true}>▶</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.cardBody}>
                <View style={[styles.cardDivider, { backgroundColor: colors.border2 }]} />
                <Component
                  location={location}
                  declination={declination}
                  paceCount={paceCount}
                  setDeclination={setDeclination}
                  setPaceCount={setPaceCount}
                />
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.text4 }]}>ALL COMPUTATIONS LOCAL · NO NETWORK · NO STORAGE</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: 4 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 5 },
  subtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 3 },

  card: {
    borderWidth: 1,
    marginBottom: 8,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700', marginBottom: 2 },
  cardSub:   { fontFamily: 'monospace', fontSize: 9,  letterSpacing: 2 },
  chevron:   { fontFamily: 'monospace', fontSize: 10, transform: [{ rotate: '0deg' }] },

  cardBody: { paddingHorizontal: 14, paddingBottom: 16 },
  cardDivider: { height: 1, marginBottom: 14 },

  footer: { paddingTop: 24, alignItems: 'center' },
  footerText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
});
