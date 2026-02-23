/**
 * ToolsScreen — Six tactical tools, each as an expandable card.
 * All computation is local. No network. No location data stored.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';

import { BackAzimuthTool }   from '../components/tools/BackAzimuthTool';
import { DeadReckoningTool } from '../components/tools/DeadReckoningTool';
import { ResectionTool }     from '../components/tools/ResectionTool';
import { PaceCountTool }     from '../components/tools/PaceCountTool';
import { DeclinationTool }   from '../components/tools/DeclinationTool';
import { TDSTool }           from '../components/tools/TDSTool';
import { SolarTool }         from '../components/tools/SolarTool';
import { PrecisionTool }     from '../components/tools/PrecisionTool';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

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
  const [openTool, setOpenTool] = useState(null);

  const toggle = useCallback((id) => {
    setOpenTool(prev => prev === id ? null : id);
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>TOOLS</Text>
        <Text style={styles.subtitle}>TAP TO EXPAND</Text>
      </View>

      {TOOLS.map(({ id, label, sub, Component }) => {
        const isOpen = openTool === id;
        return (
          <View key={id} style={[styles.card, isOpen && styles.cardOpen]}>
            <TouchableOpacity style={styles.cardHeader} onPress={() => toggle(id)} activeOpacity={0.7}>
              <View>
                <Text style={styles.cardTitle}>{label}</Text>
                <Text style={styles.cardSub}>{sub}</Text>
              </View>
              <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>▶</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.cardBody}>
                <View style={styles.cardDivider} />
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
        <Text style={styles.footerText}>ALL COMPUTATIONS LOCAL · NO NETWORK · NO STORAGE</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: 4 },
  title: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', letterSpacing: 5, color: RED },
  subtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, color: RED3 },

  card: {
    borderWidth: 1,
    borderColor: RED3,
    backgroundColor: '#0D0000',
    marginBottom: 8,
  },
  cardOpen: { borderColor: RED2 },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, color: RED, fontWeight: '700', marginBottom: 2 },
  cardSub:   { fontFamily: 'monospace', fontSize: 9,  letterSpacing: 2, color: RED3 },
  chevron:   { fontFamily: 'monospace', fontSize: 10, color: RED3, transform: [{ rotate: '0deg' }] },
  chevronOpen: { color: RED, transform: [{ rotate: '90deg' }] },

  cardBody: { paddingHorizontal: 14, paddingBottom: 16 },
  cardDivider: { height: 1, backgroundColor: RED4, marginBottom: 14 },

  footer: { paddingTop: 24, alignItems: 'center' },
  footerText: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: RED4 },
});
