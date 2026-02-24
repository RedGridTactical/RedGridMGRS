/**
 * ProFeaturesScreen — Houses all Pro sub-features on one tabbed screen.
 * Tabs: WAYPOINTS · TEMPLATES · FORMATS · THEMES
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { WaypointListsScreen }    from './WaypointListsScreen';
import { ExtraReportsScreen }     from './ExtraReportsScreen';
import { CoordFormatsScreen }     from './CoordFormatsScreen';
import { ThemesScreen }           from './ThemesScreen';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

const PRO_TABS = [
  { id: 'waypoints',  label: 'LISTS'     },
  { id: 'templates',  label: 'TEMPLATES' },
  { id: 'formats',    label: 'FORMATS'   },
  { id: 'themes',     label: 'THEMES'    },
];

export function ProFeaturesScreen({ location, mgrs, activeTheme, setActiveTheme, coordFormat, setCoordFormat, onSelectWaypoint }) {
  const [tab, setTab] = useState('waypoints');

  return (
    <View style={styles.root}>
      {/* Sub-tab bar */}
      <View style={styles.subBar}>
        {PRO_TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.subTab, tab === t.id && styles.subTabActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.subTabText, tab === t.id && styles.subTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {tab === 'waypoints'  && <WaypointListsScreen location={location} onSelectWaypoint={onSelectWaypoint} />}
        {tab === 'templates'  && <ExtraReportsScreen mgrs={mgrs} />}
        {tab === 'formats'    && <CoordFormatsScreen location={location} coordFormat={coordFormat} setCoordFormat={setCoordFormat} />}
        {tab === 'themes'     && <ThemesScreen activeTheme={activeTheme} setActiveTheme={setActiveTheme} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  subBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RED4 },
  subTab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: RED },
  subTabText: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: RED3, fontWeight: '700' },
  subTabTextActive: { color: RED },
  content: { flex: 1 },
});
