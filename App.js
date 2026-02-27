/**
 * Red Grid Tactical — Root Application v2.0 (HARDENED)
 * Tabs: GRID · TOOLS · REPORT · LISTS (Pro) · THEME (Pro)
 *
 * Privacy: no location stored, no network (IAP uses Apple/Google native payment only), no analytics.
 *
 * CRITICAL HARDENING:
 *   - Error boundary catches any hook or component crashes
 *   - Graceful fallback UI if startup fails
 *   - All hooks guaranteed to never throw
 */
import React, { useState, useMemo, useCallback, Component } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, useWindowDimensions,
} from 'react-native';

import { useLocation }  from './src/hooks/useLocation';
import { useSettings }  from './src/hooks/useSettings';
import { useIAP }       from './src/hooks/useIAP';
import { useTheme }     from './src/hooks/useTheme';
import { ThemeProvider, useColors } from './src/utils/ThemeContext';

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
// Note: class component cannot use hooks, so error boundary keeps hardcoded red fallback
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
        <SafeAreaView style={staticStyles.errorRoot}>
          <View style={staticStyles.errorContainer}>
            <Text style={staticStyles.errorTitle}>REDGRID ERROR</Text>
            <Text style={staticStyles.errorMsg}>An unexpected error occurred during startup.</Text>
            <Text style={staticStyles.errorDetail}>{this.state.error?.message || 'Unknown error'}</Text>
            <TouchableOpacity
              style={staticStyles.errorRetryBtn}
              onPress={() => this.setState({ hasError: false })}
              accessibilityRole="button"
              accessibilityLabel="Retry loading application"
            >
              <Text style={staticStyles.errorRetryText}>RETRY</Text>
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

  const showProGate = useCallback((featureName) => {
    setProGateFeature(featureName);
    setProGateVisible(true);
  }, []);

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

  // Dynamic StatusBar style: white theme uses dark content, others use light
  const statusBarStyle = themeData.id === 'white' ? 'dark-content' : 'light-content';

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
    <ThemeProvider colors={themeData.colors}>
      <AppContent
        safeTab={safeTab}
        setTab={setTab}
        TABS={TABS}
        isPro={isPro}
        isLandscape={isLandscape}
        gridContent={gridContent}
        location={location}
        declination={declination}
        paceCount={paceCount}
        setDeclination={setDeclination}
        setPaceCount={setPaceCount}
        mgrsFormatted={mgrsFormatted}
        showProGate={showProGate}
        theme={theme}
        setTheme={setTheme}
        setWaypoint={setWaypoint}
        showModal={showModal}
        setShowModal={setShowModal}
        proGateVisible={proGateVisible}
        setProGateVisible={setProGateVisible}
        proGateFeature={proGateFeature}
        product={product}
        isPurchasing={isPurchasing}
        purchase={purchase}
        restore={restore}
        statusBarStyle={statusBarStyle}
        waypoint={waypoint}
      />
    </ThemeProvider>
  );
}

/** Inner component that can call useColors() since it lives inside ThemeProvider */
function AppContent({
  safeTab, setTab, TABS, isPro, isLandscape,
  gridContent, location, declination, paceCount,
  setDeclination, setPaceCount, mgrsFormatted, showProGate,
  theme, setTheme, setWaypoint,
  showModal, setShowModal, proGateVisible, setProGateVisible,
  proGateFeature, product, isPurchasing, purchase, restore,
  statusBarStyle, waypoint,
}) {
  const colors = useColors();

  return (
    <SafeAreaView style={[staticStyles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.bg} hidden={isLandscape} />

      {/* Tab bar */}
      <View style={[staticStyles.tabBar, { borderBottomColor: colors.border2, backgroundColor: colors.bg }, isLandscape && staticStyles.tabBarLandscape]} accessibilityRole="tablist">
        {TABS && Array.isArray(TABS) && TABS.map(t => (
          <TouchableOpacity
            key={t?.id || 'unknown'}
            style={staticStyles.tabItem}
            onPress={() => t?.id && setTab(t.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: safeTab === t?.id }}
            accessibilityLabel={`${t?.label || ''} tab`}
          >
            <Text style={[staticStyles.tabLabel, { color: colors.border }, safeTab === t?.id && { color: colors.text }]}>{t?.label || ''}</Text>
            {safeTab === t?.id && <View style={[staticStyles.tabIndicator, { backgroundColor: colors.text }]} />}
          </TouchableOpacity>
        ))}
        {/* Pro badge in tab bar */}
        {isPro && (
          <View style={[staticStyles.proBadgeBar, { backgroundColor: colors.border2 }]}>
            <Text style={[staticStyles.proBadgeText, { color: colors.text }]}>PRO</Text>
          </View>
        )}
      </View>

      {/* Screen content */}
      <View style={staticStyles.screenContent}>
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
          <UpsellScreen onUpgrade={() => showProGate('Red Grid Pro')} />
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
  const colors = useColors();
  return (
    <View style={staticStyles.upsellRoot}>
      <Text style={[staticStyles.upsellTitle, { color: colors.text }]}>REDGRID PRO</Text>
      <Text style={[staticStyles.upsellSub, { color: colors.text3 }]}>Unlock the full experience</Text>
      <TouchableOpacity style={[staticStyles.upsellBtn, { borderColor: colors.text, backgroundColor: colors.border2 }]} onPress={onUpgrade} accessibilityRole="button" accessibilityLabel="Unlock Red Grid Pro">
        <Text style={[staticStyles.upsellBtnText, { color: colors.text }]}>UNLOCK PRO</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── PORTRAIT GRID ───────────────────────────────────────────────────────────
function PortraitGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, distance, arrowSize, onAddWaypoint, onClearWaypoint }) {
  const colors = useColors();
  return (
    <View style={staticStyles.portraitRoot}>
      <View style={staticStyles.header}>
        <Text style={[staticStyles.appTitle, { color: colors.text }]}>REDGRID TACTICAL</Text>
        <SignalBadge isLoading={isLoading} location={location} />
      </View>
      <Div />
      {error
        ? <ErrBlock error={error} retry={retry} />
        : <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact={false} />
      }
      <Div />
      {!waypoint ? (
        <View style={staticStyles.noWpBlock}>
          <Crosshair size={50} />
          <Text style={[staticStyles.noWpText, { color: colors.border }]}>NO WAYPOINT SET</Text>
          <TouchableOpacity style={[staticStyles.addBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel="Add waypoint">
            <Text style={[staticStyles.addBtnText, { color: colors.text }]}>+ ADD WAYPOINT</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={staticStyles.wpBlock}>
          {bearing !== null && (
            <View style={staticStyles.arrowWrap}>
              <WayfinderArrow bearing={bearing} size={arrowSize} />
              <Text style={[staticStyles.bearingText, { color: colors.text }]}>{Math.round(bearing)}°</Text>
            </View>
          )}
          <View style={staticStyles.wpInfo}>
            <Text style={[staticStyles.wpLabel, { color: colors.text2 }]}>{waypoint.label}</Text>
            <Text style={[staticStyles.wpGrid, { color: colors.text }]}>{waypointMGRS}</Text>
            {distance !== null && <Text style={[staticStyles.wpDist, { color: colors.text }]}>{formatDistance(distance)}</Text>}
          </View>
          <View style={staticStyles.wpBtns}>
            <TouchableOpacity style={[staticStyles.editBtn, { borderColor: colors.border }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel="Edit waypoint"><Text style={[staticStyles.editBtnText, { color: colors.text2 }]}>EDIT</Text></TouchableOpacity>
            <TouchableOpacity style={[staticStyles.clearBtn, { borderColor: colors.border, backgroundColor: colors.border2 }]} onPress={onClearWaypoint} accessibilityRole="button" accessibilityLabel="Clear waypoint"><Text style={[staticStyles.clearBtnText, { color: colors.text2 }]}>CLEAR</Text></TouchableOpacity>
          </View>
        </View>
      )}
      <View style={staticStyles.footer}><Text style={[staticStyles.footerText, { color: colors.text4 }]}>NO DATA STORED · NO NETWORK · OPEN SOURCE</Text></View>
    </View>
  );
}

// ─── LANDSCAPE GRID ──────────────────────────────────────────────────────────
function LandscapeGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, distance, arrowSize, onAddWaypoint, onClearWaypoint }) {
  const colors = useColors();
  return (
    <View style={staticStyles.landscapeRoot}>
      <View style={staticStyles.lsLeft}>
        <View style={staticStyles.lsHeader}>
          <Text style={[staticStyles.lsTitle, { color: colors.text }]}>REDGRID TACTICAL</Text>
          <SignalBadge isLoading={isLoading} location={location} />
        </View>
        <Div />
        {error ? <ErrBlock error={error} retry={retry} compact /> : <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact />}
        <Div />
        {waypoint ? (
          <View style={staticStyles.lsWpInfo}>
            <Text style={[staticStyles.lsWpLabel, { color: colors.text2 }]}>{waypoint.label}</Text>
            <Text style={[staticStyles.lsWpGrid, { color: colors.text }]}>{waypointMGRS}</Text>
            {distance !== null && <Text style={[staticStyles.lsWpDist, { color: colors.text }]}>{formatDistance(distance)}</Text>}
          </View>
        ) : (
          <Text style={[staticStyles.noWpText, { color: colors.border }]}>NO WAYPOINT SET</Text>
        )}
        <View style={staticStyles.lsBtnWrap}>
          <View style={staticStyles.lsBtns}>
            <TouchableOpacity style={[staticStyles.lsBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel={waypoint ? 'Edit waypoint' : 'Add waypoint'}>
              <Text style={[staticStyles.lsBtnText, { color: colors.text }]}>{waypoint ? 'EDIT WP' : '+ WAYPOINT'}</Text>
            </TouchableOpacity>
            {waypoint && (
              <TouchableOpacity style={[staticStyles.lsBtn, { borderColor: colors.border, backgroundColor: 'transparent' }]} onPress={onClearWaypoint} accessibilityRole="button" accessibilityLabel="Clear waypoint">
                <Text style={[staticStyles.lsBtnText, { color: colors.border }]}>CLEAR</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[staticStyles.footerText, { color: colors.text4 }]}>NO DATA STORED · NO NETWORK</Text>
        </View>
      </View>
      <View style={[staticStyles.lsVDiv, { backgroundColor: colors.border2 }]} />
      <View style={staticStyles.lsRight}>
        {waypoint && bearing !== null ? (
          <View style={staticStyles.lsArrow}>
            <WayfinderArrow bearing={bearing} size={arrowSize} />
            <Text style={[staticStyles.lsBearing, { color: colors.text }]}>{Math.round(bearing)}°</Text>
          </View>
        ) : (
          <View style={staticStyles.lsNoWp}>
            <Crosshair size={72} />
            <TouchableOpacity style={[staticStyles.addBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel="Add waypoint">
              <Text style={[staticStyles.addBtnText, { color: colors.text }]}>+ ADD WAYPOINT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function SignalBadge({ isLoading, location }) {
  const colors = useColors();
  const color = isLoading ? colors.border : location ? colors.text : colors.border;
  const label = isLoading ? 'ACQUIRING' : location ? 'FIX' : 'NO SIGNAL';
  return (
    <View style={staticStyles.signal} accessibilityRole="status" accessibilityLiveRegion="polite" accessibilityLabel={`GPS status: ${label}`}>
      <View style={[staticStyles.signalDot, { backgroundColor: color }]} />
      <Text style={[staticStyles.signalText, { color: colors.border }]}>{label}</Text>
    </View>
  );
}
function Div() {
  const colors = useColors();
  return <View style={[staticStyles.divider, { backgroundColor: colors.border2 }]} />;
}
function ErrBlock({ error, retry, compact }) {
  const colors = useColors();
  return (
    <View style={[staticStyles.errBlock, compact && { paddingVertical: 10 }]}>
      <Text style={[staticStyles.errText, { color: colors.text2 }]}>{error}</Text>
      <TouchableOpacity style={[staticStyles.retryBtn, { borderColor: colors.border }]} onPress={retry} accessibilityRole="button" accessibilityLabel="Retry GPS signal acquisition">
        <Text style={[staticStyles.retryText, { color: colors.text2 }]}>RETRY</Text>
      </TouchableOpacity>
    </View>
  );
}
function Crosshair({ size = 50 }) {
  const colors = useColors();
  return (
    <View style={{ width: size, height: size, opacity: 0.3 }} importantForAccessibility="no" accessibilityElementsHidden={true}>
      <View style={{ position:'absolute', width:1, height:size, left:size/2, backgroundColor:colors.text2 }} />
      <View style={{ position:'absolute', height:1, width:size, top:size/2, backgroundColor:colors.text2 }} />
      <View style={{ position:'absolute', top:size*.2, left:size*.2, right:size*.2, bottom:size*.2, borderRadius:size, borderWidth:1, borderColor:colors.text2 }} />
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
// Structural styles only — colours applied inline via useColors()
const staticStyles = StyleSheet.create({
  root: { flex:1 },
  // Error boundary fallback (hardcoded red — class component, no hooks)
  errorRoot: { flex:1, backgroundColor:'#0A0000' },
  errorContainer: { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  errorTitle: { fontFamily:'monospace', fontSize:18, fontWeight:'700', letterSpacing:4, color:'#CC0000', marginBottom:16, textAlign:'center' },
  errorMsg: { fontFamily:'monospace', fontSize:12, color:'#BB3333', textAlign:'center', marginBottom:12, lineHeight:18 },
  errorDetail: { fontFamily:'monospace', fontSize:10, color:'#AA2222', textAlign:'center', marginBottom:24, lineHeight:14, fontStyle:'italic' },
  errorRetryBtn: { borderWidth:1, borderColor:'#CC0000', backgroundColor:'#330000', paddingHorizontal:32, paddingVertical:12 },
  errorRetryText: { fontFamily:'monospace', fontSize:11, color:'#CC0000', letterSpacing:3, fontWeight:'700' },
  // Tab bar
  tabBar: { flexDirection:'row', borderBottomWidth:1, alignItems:'center' },
  tabBarLandscape: { paddingTop: 0 },
  tabItem: { flex:1, alignItems:'center', paddingVertical:12, position:'relative' },
  tabLabel: { fontFamily:'monospace', fontSize:10, letterSpacing:3, fontWeight:'700' },
  tabIndicator: { position:'absolute', bottom:0, left:'10%', right:'10%', height:2 },
  proBadgeBar: { paddingHorizontal:8, paddingVertical:3, marginRight:8 },
  proBadgeText: { fontFamily:'monospace', fontSize:9, letterSpacing:3, fontWeight:'700' },
  screenContent: { flex:1 },
  // Portrait
  portraitRoot: { flex:1, paddingHorizontal:20, paddingTop:12, paddingBottom:20 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:10 },
  appTitle: { fontFamily:'monospace', fontSize:16, fontWeight:'700', letterSpacing:4 },
  // Landscape
  landscapeRoot: { flex:1, flexDirection:'row' },
  lsLeft: { flex:1, paddingHorizontal:16, paddingVertical:8 },
  lsVDiv: { width:1, marginVertical:8 },
  lsRight: { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:8 },
  lsHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingBottom:6 },
  lsTitle: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:3 },
  lsWpInfo: { paddingVertical:8, gap:3 },
  lsWpLabel: { fontFamily:'monospace', fontSize:10, letterSpacing:4, fontWeight:'700' },
  lsWpGrid: { fontFamily:'monospace', fontSize:12, letterSpacing:2 },
  lsWpDist: { fontFamily:'monospace', fontSize:22, letterSpacing:3, fontWeight:'700', marginTop:2 },
  lsBtnWrap: { marginTop:'auto', gap:5 },
  lsBtns: { flexDirection:'row', gap:8 },
  lsBtn: { flex:1, borderWidth:1, paddingVertical:10, alignItems:'center' },
  lsBtnText: { fontFamily:'monospace', fontSize:10, letterSpacing:3, fontWeight:'700' },
  lsArrow: { alignItems:'center', gap:8 },
  lsBearing: { fontFamily:'monospace', fontSize:30, letterSpacing:4, fontWeight:'700' },
  lsNoWp: { alignItems:'center', gap:20 },
  // Atoms
  signal: { flexDirection:'row', alignItems:'center', gap:6 },
  signalDot: { width:7, height:7, borderRadius:4 },
  signalText: { fontFamily:'monospace', fontSize:9, letterSpacing:3 },
  divider: { height:1, marginVertical:6 },
  errBlock: { paddingVertical:20, alignItems:'center', gap:12 },
  errText: { fontFamily:'monospace', fontSize:11, textAlign:'center', letterSpacing:1 },
  retryBtn: { borderWidth:1, paddingHorizontal:18, paddingVertical:8, minHeight:44 },
  retryText: { fontFamily:'monospace', fontSize:11, letterSpacing:3 },
  noWpBlock: { paddingVertical:20, alignItems:'center', gap:16 },
  noWpText: { fontFamily:'monospace', fontSize:11, letterSpacing:4 },
  addBtn: { borderWidth:1, paddingHorizontal:26, paddingVertical:13, minHeight:44 },
  addBtnText: { fontFamily:'monospace', fontSize:12, letterSpacing:3, fontWeight:'700' },
  wpBlock: { alignItems:'center', paddingVertical:10, gap:12 },
  arrowWrap: { alignItems:'center', gap:6 },
  bearingText: { fontFamily:'monospace', fontSize:26, letterSpacing:4, fontWeight:'700' },
  wpInfo: { alignItems:'center', gap:4 },
  wpLabel: { fontFamily:'monospace', fontSize:12, letterSpacing:4, fontWeight:'700' },
  wpGrid: { fontFamily:'monospace', fontSize:14, letterSpacing:3 },
  wpDist: { fontFamily:'monospace', fontSize:22, letterSpacing:4, fontWeight:'700', marginTop:2 },
  wpBtns: { flexDirection:'row', gap:10 },
  editBtn: { borderWidth:1, paddingHorizontal:22, paddingVertical:9, minHeight:44 },
  editBtnText: { fontFamily:'monospace', fontSize:11, letterSpacing:3 },
  clearBtn: { borderWidth:1, paddingHorizontal:22, paddingVertical:9, minHeight:44 },
  clearBtnText: { fontFamily:'monospace', fontSize:11, letterSpacing:3 },
  footer: { marginTop:'auto', paddingTop:16, alignItems:'center' },
  footerText: { fontFamily:'monospace', fontSize:9, letterSpacing:2 },
  // Upsell
  upsellRoot: { flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:40 },
  upsellTitle: { fontFamily:'monospace', fontSize:24, fontWeight:'700', letterSpacing:6 },
  upsellSub: { fontFamily:'monospace', fontSize:11, letterSpacing:2 },
  upsellBtn: { borderWidth:1, paddingHorizontal:32, paddingVertical:14 },
  upsellBtnText: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:4 },
});
