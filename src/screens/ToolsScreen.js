/**
 * ToolsScreen — Nine tactical tools, each as an expandable card.
 * All computation is local. No network. No location data stored.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { tapMedium } from '../utils/haptics';
import { useTranslation } from '../hooks/useTranslation';

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
import { GeostampTool }      from '../components/tools/GeostampTool';
import { ElevationTool }     from '../components/tools/ElevationTool';

const TOOLS = [
  { id: 'backaz',   labelKey: 'tools.backAzimuth',    subKey: 'tools.backAzimuthSub',         Component: BackAzimuthTool   },
  { id: 'dr',       labelKey: 'tools.deadReckoning',   subKey: 'tools.deadReckoningSub',       Component: DeadReckoningTool },
  { id: 'resect',   labelKey: 'tools.resection',       subKey: 'tools.resectionSub',           Component: ResectionTool     },
  { id: 'pace',     labelKey: 'tools.paceCount',       subKey: 'tools.paceCountSub',           Component: PaceCountTool     },
  { id: 'declin',   labelKey: 'tools.declination',     subKey: 'tools.declinationSub',         Component: DeclinationTool   },
  { id: 'tds',      labelKey: 'tools.timeDistSpeed',   subKey: 'tools.timeDistSpeedSub',       Component: TDSTool           },
  { id: 'solar',    labelKey: 'tools.sunMoon',          subKey: 'tools.sunMoonSub',             Component: SolarTool         },
  { id: 'prec',     labelKey: 'tools.mgrsPrecision',   subKey: 'tools.mgrsPrecisionSub',       Component: PrecisionTool     },
  { id: 'elev',     labelKey: 'tools.elevation',         subKey: 'tools.elevationSub',           Component: ElevationTool  },
  { id: 'geostamp', labelKey: 'tools.photoGeostamp',   subKey: 'tools.photoGeostampSub',       Component: GeostampTool,  pro: true },
];

export function ToolsScreen({ location, declination, paceCount, setDeclination, setPaceCount, compassHeading, isPro, onShowProGate }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [openTool, setOpenTool] = useState(null);

  const toggle = useCallback((id) => {
    tapMedium();
    LayoutAnimation.configureNext(SPRING_ANIM);
    setOpenTool(prev => prev === id ? null : id);
  }, []);

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('tools.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>{t('tools.tapToExpand')}</Text>
      </View>

      {TOOLS.map(({ id, labelKey, subKey, Component, pro }) => {
        const label = t(labelKey);
        const sub = t(subKey);
        const isOpen = openTool === id;
        const isLocked = pro && !isPro;
        return (
          <View key={id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }, isOpen && { borderColor: colors.text2 }, isLocked && styles.cardLocked]}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => {
                if (isLocked) { tapMedium(); onShowProGate?.(label); return; }
                toggle(id);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${label}, ${sub}${isLocked ? '. Pro feature, locked.' : ''}`}
              accessibilityHint={isLocked ? 'Double tap to view upgrade options' : (isOpen ? 'Double tap to collapse' : 'Double tap to expand')}
            >
              <View>
                <View style={styles.labelRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{label}</Text>
                  {isLocked && <Text style={[styles.proBadge, { color: colors.bg, backgroundColor: colors.text }]}>PRO</Text>}
                </View>
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
                  compassHeading={compassHeading}
                />
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.text4 }]}>{t('tools.footer')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: 4 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 5 },
  subtitle: { fontSize: 8, letterSpacing: 3 },

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
  cardLocked: { opacity: 0.7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  proBadge: { fontFamily: 'monospace', fontSize: 8, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 2 },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  cardSub:   { fontSize: 9,  letterSpacing: 2 },
  chevron:   { fontFamily: 'monospace', fontSize: 10, transform: [{ rotate: '0deg' }] },

  cardBody: { paddingHorizontal: 14, paddingBottom: 16 },
  cardDivider: { height: 1, marginBottom: 14 },

  footer: { paddingTop: 24, alignItems: 'center' },
  footerText: { fontSize: 10, letterSpacing: 2 },
});
