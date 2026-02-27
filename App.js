/**
 * RedGrid Tactical — Root Application v2.0 (HARDENED)
 * Tabs: GRID · TOOLS · REPORT · LISTS (Pro) · THEME (Pro)
 *
 * Privacy: no location stored, no network (IAP uses Apple/Google native payment only), no analytics.
 *
 * CRITICAL HARDENING:
 *   - Error boundary catches any hook or component crashes
 *   - Graceful fallback UI if startup fails
 *   - All hooks guaranteed to never throw
 */
import React, { useState, useMemo, Component } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, useWindowDimensions,
} from 'react-native';

import { useLocation }  from './src/hooks/useLocation';
import { useSettings }  from './src/hooks/useSettings';
import { useIAP }       from './src/hooks/useIAP';
import { useTheme }     from './src/hooks/useTheme';

import { MGRSDisplay }    from './src/components/MGRSDisplay';
import { WayfinderArrow } from './src/components/WayfinderArrow';
import { WaypointModal }  from './src/components/WaypointModal';
import { ProGate }        from './src/components/ProGate';
import { ToolsScreen }    from './src/screens/ToolsScreen';
import { ReportScreen }   from './src/screens/ReportScreen';
import { WaypointListsScreen } from './src/screens/WaypointListsScreen';
import { ThemeScreen }    from './src/screens/ThemeScreen';

import {
  toMGRS, formatMGRS, calculateBearing, calculateDistance, formatDistance,
} from './src/utils/mgrs';
import { applyDeclination } from './src/utils/tactical';

const RED  = '#CC0000';
const RED2 = '#990000';
const RED3 = '#660000';
const RED4 = '#330000';
const BG   = '#0A0000';

const FREE_TABS = [
  { id: 'grid',   label: 'GRID'   },
  { id: 'tools',  label: 'TOOLS'  },
  { id: 'report', label: 'REPORT' },
];

const PRO_TABS = [
  { id: 'grid',   label: 'GRID'   },
  { id: 'tools',  label: 'TOOLS'  },
  { id: 'report', label: 'REPORT' },
  { id: 'lists',  label: 'LISTS'  },
  { id: 'theme',  label: 'THEME'  },
];

// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// Catches any unhandled errors during render or hook execution and shows safe UI
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log but don't crash
    console.error('App error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.root}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>REDGRID ERROR</Text>
            <Text style={styles.errorMsg}>An unexpected error occurred during startup.</Text>
            <Text style={styles.errorDetail}>{this.state.error?.message || 'Unknown error'}</Text>
            <TouchableOpacity
              style={styles.errorRetryBtn}
              onPress={() => this.setState({ hasError: false })}
            >
              <Text style={styles.errorRetryText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { location, error, isLoading, retry } = useLocation();
  const { declination, setDeclination, paceCount, setPaceCount, theme, setTheme } = useSettings();
  const { isPro, isPurchasing, product, purchase, restore } = useIAP();
  const themeData = useTheme(theme || 'red');

  const [tab, setTab]               = useState('grid');
  const [waypoint, setWaypoint]     = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [proGateVisible, setProGateVisible] = useState(false);
  const [proGateFeature, setProGateFeature] = useState('');

  const TABS = isPro ? PRO_TABS : FREE_TABS;

  const showProGate = (featureName) => {
    setProGateFeature(featureName);
    setProGateVisible(true);
  };

  // Derived MGRS
  const mgrsRaw       = useMemo(() => location ? toMGRS(location.lat, location.lon, 5) : null, [location]);
  const mgrsFormatted = useMemo(() => mgrsRaw ? formatMGRS(mgrsRaw) : null, [mgrsRaw]);

  // Wayfinder
  const { bearing, distance } = useMemo(() => {
    if (!location || !waypoint) return { bearing: null, distance: null };
    const raw = calculateBearing(location.lat, location.lon, waypoint.lat, waypoint.lon);
    return {
      bearing: applyDeclination(raw, declination),
      distance: calculateDistance(location.lat, location.lon, waypoint.lat, waypoint.lon),
    };
  }, [location, waypoint, declination]);

  const waypointMGRS = useMemo(() => waypoint ? formatMGRS(toMGRS(waypoint.lat, waypoint.lon, 5)) : null, [waypoint]);
  const arrowSize    = isLandscape ? Math.min(height * 0.52, 190) : 200;

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

  // Safely build tab list with error protection
  let safeTab = 'grid';
  if (TABS && TABS.length > 0 && TABS.some(t => t.id === tab)) {
    safeTab = tab;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} hidden={isLandscape} />

      {/* Tab bar */}
      <View style={[styles.tabBar, isLandscape && styles.tabBarLandscape]}>
        {TABS && Array.isArray(TABS) && TABS.map(t => (
          <TouchableOpacity
            key={t?.id || 'unknown'}
            style={[styles.tabItem, safeTab === t?.id && styles.tabItemActive]}
            onPress={() => t?.id && setTab(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, safeTab === t?.id && styles.tabLabelActive]}>{t?.label || ''}</Text>
            {safeTab === t?.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
        {/* Pro badge in tab bar */}
        {isPro && (
          <View style={styles.proBadgeBar}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Screen content */}
      <View style={styles.screenContent}>
        {safeTab === 'grid' && gridContent}

        {safeTab === 'tools' && (
          <ToolsScreen
            location={location}
            declination={declination}
            paceCount={paceCount}
            setDeclination={setDeclination}
            setPaceCount={setPaceCount}
          />
        )}

        {safeTab === 'report' && (
          <ReportScreen
            mgrs={mgrsFormatted}
            isPro={isPro}
            onShowProGate={showProGate}
          />
        )}

        {safeTab === 'lists' && isPro && (
          <WaypointListsScreen
            location={location}
            onSelectWaypoint={(wp) => { setWaypoint(wp); setTab('grid'); }}
          />
        )}

        {safeTab === 'theme' && isPro && (
          <ThemeScreen
            currentTheme={theme}
            isPro={isPro}
            onSelectTheme={setTheme}
            onShowProGate={showProGate}
          />
        )}

        {/* Upsell tab for non-Pro */}
        {(safeTab === 'lists' || safeTab === 'theme') && !isPro && (
          <UpsellScreen onUpgrade={() => showProGate('RedGrid Pro')} />
        )}
      </View>

      {/* Waypoint modal */}
      <WaypointModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSetWaypoint={setWaypoint}
        currentLocation={location}
      />

      {/* Pro gate */}
      <ProGate
        visible={proGateVisible}
        onClose={() => setProGateVisible(false)}
        featureName={proGateFeature}
        product={product}
        isPurchasing={isPurchasing}
        onPurchase={purchase}
        onRestore={restore}
      />
    </SafeAreaView>
  );
}

// Export the app wrapped in error boundary
export default function AppWithErrorBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

function UpsellScreen({ onUpgrade }) {
  return (
    <View style={styles.upsellRoot}>
      <Text style={styles.upsellTitle}>REDGRID PRO</Text>
      <Text style={styles.upsellSub}>Unlock the full experience</Text>
      <TouchableOpacity style={styles.upsellBtn} onPress={onUpgrade}>
        <Text style={styles.upsellBtnText}>UNLOCK PRO</Text>
      </TouchableOpacity>
    </View>
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
        {error ? <ErrBlock error={error} retry={retry} compact /> : <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact />}
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

// ─── ATOMS ───────────────────────────────────────────────────────────────────
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

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex:1, backgroundColor:BG },
  errorContainer: { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  errorTitle: { fontFamily:'monospace', fontSize:18, fontWeight:'700', letterSpacing:4, color:RED, marginBottom:16, textAlign:'center' },
  errorMsg: { fontFamily:'monospace', fontSize:12, color:RED2, textAlign:'center', marginBottom:12, lineHeight:18 },
  errorDetail: { fontFamily:'monospace', fontSize:10, color:RED3, textAlign:'center', marginBottom:24, lineHeight:14, fontStyle:'italic' },
  errorRetryBtn: { borderWidth:1, borderColor:RED, backgroundColor:RED4, paddingHorizontal:32, paddingVertical:12 },
  errorRetryText: { fontFamily:'monospace', fontSize:11, color:RED, letterSpacing:3, fontWeight:'700' },
  tabBar: { flexDirection:'row', borderBottomWidth:1, borderBottomColor:RED4, backgroundColor:BG, alignItems:'center' },
  tabBarLandscape: { paddingTop: 0 },
  tabItem: { flex:1, alignItems:'center', paddingVertical:12, position:'relative' },
  tabLabel: { fontFamily:'monospace', fontSize:10, letterSpacing:3, color:RED3, fontWeight:'700' },
  tabLabelActive: { color:RED },
  tabIndicator: { position:'absolute', bottom:0, left:'10%', right:'10%', height:2, backgroundColor:RED },
  proBadgeBar: { paddingHorizontal:8, paddingVertical:3, backgroundColor:RED4, marginRight:8 },
  proBadgeText: { fontFamily:'monospace', fontSize:7, color:RED, letterSpacing:3, fontWeight:'700' },
  screenContent: { flex:1 },
  portraitRoot: { flex:1, paddingHorizontal:20, paddingTop:12, paddingBottom:20 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:10 },
  appTitle: { fontFamily:'monospace', fontSize:16, fontWeight:'700', letterSpacing:4, color:RED },
  landscapeRoot: { flex:1, flexDirection:'row' },
  lsLeft: { flex:1, paddingHorizontal:16, paddingVertical:8 },
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
  upsellRoot: { flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:40 },
  upsellTitle: { fontFamily:'monospace', fontSize:24, fontWeight:'700', letterSpacing:6, color:RED },
  upsellSub: { fontFamily:'monospace', fontSize:11, color:RED3, letterSpacing:2 },
  upsellBtn: { borderWidth:1, borderColor:RED, backgroundColor:RED4, paddingHorizontal:32, paddingVertical:14 },
  upsellBtnText: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:4, color:RED },
});
