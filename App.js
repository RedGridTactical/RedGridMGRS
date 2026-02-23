/**
 * RedGrid Tactical — Root Application
 * Three tabs: GRID (position + wayfinder) · TOOLS (8 tactical calculators) · REPORT (radio templates)
 *
 * Privacy: no location stored, no network, no analytics.
 * Orientation: portrait and landscape both fully supported.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, useWindowDimensions, Platform,
} from 'react-native';

import { useLocation }  from './src/hooks/useLocation';
import { useSettings }  from './src/hooks/useSettings';

import { MGRSDisplay }    from './src/components/MGRSDisplay';
import { WayfinderArrow } from './src/components/WayfinderArrow';
import { WaypointModal }  from './src/components/WaypointModal';
import { ToolsScreen }    from './src/screens/ToolsScreen';
import { ReportScreen }   from './src/screens/ReportScreen';

import {
  toMGRS, formatMGRS, calculateBearing, calculateDistance, formatDistance,
} from './src/utils/mgrs';
import { applyDeclination } from './src/utils/tactical';

// ─── COLOURS ────────────────────────────────────────────────────────────────
const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

// ─── TABS ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'grid',   label: 'GRID'    },
  { id: 'tools',  label: 'TOOLS'   },
  { id: 'report', label: 'REPORT'  },
];

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { location, error, isLoading, retry } = useLocation();
  const { declination, setDeclination, paceCount, setPaceCount } = useSettings();

  const [tab, setTab]           = useState('grid');
  const [waypoint, setWaypoint] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // ── Derived MGRS values ──
  const mgrsRaw       = useMemo(() => location ? toMGRS(location.lat, location.lon, 5) : null, [location]);
  const mgrsFormatted = useMemo(() => mgrsRaw ? formatMGRS(mgrsRaw) : null, [mgrsRaw]);

  // ── Wayfinder ──
  const { bearing, distance } = useMemo(() => {
    if (!location || !waypoint) return { bearing: null, distance: null };
    const raw = calculateBearing(location.lat, location.lon, waypoint.lat, waypoint.lon);
    // Apply declination correction to displayed bearing
    const corrected = applyDeclination(raw, declination);
    return {
      bearing: corrected,
      distance: calculateDistance(location.lat, location.lon, waypoint.lat, waypoint.lon),
    };
  }, [location, waypoint, declination]);

  const waypointMGRS  = useMemo(() => waypoint ? formatMGRS(toMGRS(waypoint.lat, waypoint.lon, 5)) : null, [waypoint]);
  const arrowSize     = isLandscape ? Math.min(height * 0.52, 190) : 200;

  // ── Grid tab content (portrait / landscape aware) ──
  const gridContent = isLandscape ? (
    <LandscapeGrid
      isLoading={isLoading} location={location} error={error} retry={retry}
      mgrsFormatted={mgrsFormatted} waypoint={waypoint} waypointMGRS={waypointMGRS}
      bearing={bearing} distance={distance} arrowSize={arrowSize}
      onAddWaypoint={() => setShowModal(true)} onClearWaypoint={() => setWaypoint(null)}
    />
  ) : (
    <PortraitGrid
      isLoading={isLoading} location={location} error={error} retry={retry}
      mgrsFormatted={mgrsFormatted} waypoint={waypoint} waypointMGRS={waypointMGRS}
      bearing={bearing} distance={distance} arrowSize={arrowSize}
      onAddWaypoint={() => setShowModal(true)} onClearWaypoint={() => setWaypoint(null)}
    />
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} hidden={isLandscape} />

      {/* ── TAB BAR ── */}
      <View style={[styles.tabBar, isLandscape && styles.tabBarLandscape]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
            {tab === t.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── SCREEN CONTENT ── */}
      <View style={styles.screenContent}>
        {tab === 'grid' && gridContent}

        {tab === 'tools' && (
          <ToolsScreen
            location={location}
            declination={declination}
            paceCount={paceCount}
            setDeclination={setDeclination}
            setPaceCount={setPaceCount}
          />
        )}

        {tab === 'report' && (
          <ReportScreen mgrs={mgrsFormatted} />
        )}
      </View>

      {/* ── WAYPOINT MODAL ── */}
      <WaypointModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSetWaypoint={setWaypoint}
        currentLocation={location}
      />
    </SafeAreaView>
  );
}

// ─── PORTRAIT GRID ───────────────────────────────────────────────────────────
function PortraitGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, distance, arrowSize, onAddWaypoint, onClearWaypoint }) {
  return (
    <View style={styles.portraitRoot}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>REDGRID TACTICAL</Text>
        <SignalBadge isLoading={isLoading} location={location} />
      </View>
      <Div />

      {error
        ? <ErrBlock error={error} retry={retry} />
        : <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact={false} />
      }
      <Div />

      {!waypoint ? (
        <View style={styles.noWpBlock}>
          <Crosshair size={50} />
          <Text style={styles.noWpText}>NO WAYPOINT SET</Text>
          <TouchableOpacity style={styles.addBtn} onPress={onAddWaypoint}>
            <Text style={styles.addBtnText}>+ ADD WAYPOINT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.wpBlock}>
          {bearing !== null && (
            <View style={styles.arrowWrap}>
              <WayfinderArrow bearing={bearing} size={arrowSize} />
              <Text style={styles.bearingText}>{Math.round(bearing)}°</Text>
            </View>
          )}
          <View style={styles.wpInfo}>
            <Text style={styles.wpLabel}>{waypoint.label}</Text>
            <Text style={styles.wpGrid}>{waypointMGRS}</Text>
            {distance !== null && <Text style={styles.wpDist}>{formatDistance(distance)}</Text>}
          </View>
          <View style={styles.wpBtns}>
            <TouchableOpacity style={styles.editBtn} onPress={onAddWaypoint}><Text style={styles.editBtnText}>EDIT</Text></TouchableOpacity>
            <TouchableOpacity style={styles.clearBtn} onPress={onClearWaypoint}><Text style={styles.clearBtnText}>CLEAR</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.footer}><Text style={styles.footerText}>NO DATA STORED · NO NETWORK · OPEN SOURCE</Text></View>
    </View>
  );
}

// ─── LANDSCAPE GRID ──────────────────────────────────────────────────────────
function LandscapeGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, distance, arrowSize, onAddWaypoint, onClearWaypoint }) {
  return (
    <View style={styles.landscapeRoot}>
      <View style={styles.lsLeft}>
        <View style={styles.lsHeader}>
          <Text style={styles.lsTitle}>REDGRID TACTICAL</Text>
          <SignalBadge isLoading={isLoading} location={location} />
        </View>
        <Div />

        {error
          ? <ErrBlock error={error} retry={retry} compact />
          : <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact />
        }
        <Div />

        {waypoint ? (
          <View style={styles.lsWpInfo}>
            <Text style={styles.lsWpLabel}>{waypoint.label}</Text>
            <Text style={styles.lsWpGrid}>{waypointMGRS}</Text>
            {distance !== null && <Text style={styles.lsWpDist}>{formatDistance(distance)}</Text>}
          </View>
        ) : (
          <Text style={styles.noWpText}>NO WAYPOINT SET</Text>
        )}

        <View style={styles.lsBtnWrap}>
          <View style={styles.lsBtns}>
            <TouchableOpacity style={styles.lsBtn} onPress={onAddWaypoint}>
              <Text style={styles.lsBtnText}>{waypoint ? 'EDIT WP' : '+ WAYPOINT'}</Text>
            </TouchableOpacity>
            {waypoint && (
              <TouchableOpacity style={[styles.lsBtn, styles.lsBtnDim]} onPress={onClearWaypoint}>
                <Text style={[styles.lsBtnText, { color: RED3 }]}>CLEAR</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.footerText}>NO DATA STORED · NO NETWORK</Text>
        </View>
      </View>

      <View style={styles.lsVDiv} />

      <View style={styles.lsRight}>
        {waypoint && bearing !== null ? (
          <View style={styles.lsArrow}>
            <WayfinderArrow bearing={bearing} size={arrowSize} />
            <Text style={styles.lsBearing}>{Math.round(bearing)}°</Text>
          </View>
        ) : (
          <View style={styles.lsNoWp}>
            <Crosshair size={72} />
            <TouchableOpacity style={styles.addBtn} onPress={onAddWaypoint}>
              <Text style={styles.addBtnText}>+ ADD WAYPOINT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── SHARED ATOMS ────────────────────────────────────────────────────────────
function SignalBadge({ isLoading, location }) {
  const color = isLoading ? RED3 : location ? RED : RED3;
  const label = isLoading ? 'ACQUIRING' : location ? 'FIX' : 'NO SIGNAL';
  return (
    <View style={styles.signal}>
      <View style={[styles.signalDot, { backgroundColor: color }]} />
      <Text style={styles.signalText}>{label}</Text>
    </View>
  );
}

function Div() { return <View style={styles.divider} />; }

function ErrBlock({ error, retry, compact }) {
  return (
    <View style={[styles.errBlock, compact && { paddingVertical: 10 }]}>
      <Text style={styles.errText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={retry}>
        <Text style={styles.retryText}>RETRY</Text>
      </TouchableOpacity>
    </View>
  );
}

function Crosshair({ size = 50 }) {
  return (
    <View style={{ width: size, height: size, opacity: 0.3 }}>
      <View style={{ position:'absolute', width:1, height:size, left:size/2, backgroundColor:RED2 }} />
      <View style={{ position:'absolute', height:1, width:size, top:size/2, backgroundColor:RED2 }} />
      <View style={{ position:'absolute', top:size*.2, left:size*.2, right:size*.2, bottom:size*.2, borderRadius:size, borderWidth:1, borderColor:RED2 }} />
    </View>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex:1, backgroundColor:BG },

  // Tab bar
  tabBar: {
    flexDirection:'row',
    borderBottomWidth:1,
    borderBottomColor:RED4,
    backgroundColor:BG,
  },
  tabBarLandscape: { paddingTop: 0 },
  tabItem: { flex:1, alignItems:'center', paddingVertical:12, position:'relative' },
  tabItemActive: {},
  tabLabel: { fontFamily:'monospace', fontSize:11, letterSpacing:4, color:RED3, fontWeight:'700' },
  tabLabelActive: { color:RED },
  tabIndicator: { position:'absolute', bottom:0, left:'10%', right:'10%', height:2, backgroundColor:RED },

  screenContent: { flex:1 },

  // Portrait grid
  portraitRoot: { flex:1, paddingHorizontal:20, paddingTop:12, paddingBottom:20 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:10 },
  appTitle: { fontFamily:'monospace', fontSize:16, fontWeight:'700', letterSpacing:4, color:RED },

  // Landscape grid
  landscapeRoot: { flex:1, flexDirection:'row' },
  lsLeft: { flex:1, paddingHorizontal:16, paddingVertical:8, justifyContent:'flex-start' },
  lsVDiv: { width:1, backgroundColor:RED4, marginVertical:8 },
  lsRight: { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:8 },
  lsHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:6 },
  lsTitle: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:3, color:RED },
  lsWpInfo: { paddingVertical:8, gap:3 },
  lsWpLabel: { fontFamily:'monospace', fontSize:10, letterSpacing:4, color:RED2, fontWeight:'700' },
  lsWpGrid: { fontFamily:'monospace', fontSize:12, letterSpacing:2, color:RED },
  lsWpDist: { fontFamily:'monospace', fontSize:22, letterSpacing:3, color:RED, fontWeight:'700', marginTop:2 },
  lsBtnWrap: { marginTop:'auto', gap:5 },
  lsBtns: { flexDirection:'row', gap:8 },
  lsBtn: { flex:1, borderWidth:1, borderColor:RED2, backgroundColor:RED4, paddingVertical:10, alignItems:'center' },
  lsBtnDim: { borderColor:RED3, backgroundColor:'transparent' },
  lsBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:3, color:RED, fontWeight:'700' },
  lsArrow: { alignItems:'center', gap:8 },
  lsBearing: { fontFamily:'monospace', fontSize:30, letterSpacing:4, color:RED, fontWeight:'700' },
  lsNoWp: { alignItems:'center', gap:20 },

  // Shared
  signal: { flexDirection:'row', alignItems:'center', gap:6 },
  signalDot: { width:7, height:7, borderRadius:4 },
  signalText: { fontFamily:'monospace', fontSize:9, letterSpacing:3, color:RED3 },
  divider: { height:1, backgroundColor:RED4, marginVertical:6 },
  errBlock: { paddingVertical:20, alignItems:'center', gap:12 },
  errText: { fontFamily:'monospace', fontSize:11, color:RED2, textAlign:'center', letterSpacing:1 },
  retryBtn: { borderWidth:1, borderColor:RED3, paddingHorizontal:18, paddingVertical:8 },
  retryText: { fontFamily:'monospace', fontSize:11, color:RED2, letterSpacing:3 },
  noWpBlock: { paddingVertical:20, alignItems:'center', gap:16 },
  noWpText: { fontFamily:'monospace', fontSize:11, letterSpacing:4, color:RED3 },
  addBtn: { borderWidth:1, borderColor:RED2, paddingHorizontal:26, paddingVertical:13, backgroundColor:RED4 },
  addBtnText: { fontFamily:'monospace', fontSize:12, letterSpacing:3, color:RED, fontWeight:'700' },
  wpBlock: { alignItems:'center', paddingVertical:10, gap:12 },
  arrowWrap: { alignItems:'center', gap:6 },
  bearingText: { fontFamily:'monospace', fontSize:26, color:RED, letterSpacing:4, fontWeight:'700' },
  wpInfo: { alignItems:'center', gap:4 },
  wpLabel: { fontFamily:'monospace', fontSize:12, letterSpacing:4, color:RED2, fontWeight:'700' },
  wpGrid: { fontFamily:'monospace', fontSize:14, letterSpacing:3, color:RED },
  wpDist: { fontFamily:'monospace', fontSize:22, letterSpacing:4, color:RED, fontWeight:'700', marginTop:2 },
  wpBtns: { flexDirection:'row', gap:10 },
  editBtn: { borderWidth:1, borderColor:RED3, paddingHorizontal:22, paddingVertical:9 },
  editBtnText: { fontFamily:'monospace', fontSize:11, letterSpacing:3, color:RED2 },
  clearBtn: { borderWidth:1, borderColor:RED3, paddingHorizontal:22, paddingVertical:9, backgroundColor:RED4 },
  clearBtnText: { fontFamily:'monospace', fontSize:11, letterSpacing:3, color:RED2 },
  footer: { marginTop:'auto', paddingTop:16, alignItems:'center' },
  footerText: { fontFamily:'monospace', fontSize:7, letterSpacing:2, color:RED4 },
});
