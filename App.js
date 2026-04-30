/**
 * Red Grid MGRS — Root Application v2.1 (HARDENED)
 * Tabs: GRID · MAP · TOOLS · REPORT · LISTS (Pro) · COORDS (Pro) · THEME (Pro)
 *
 * Privacy: no location stored, no network (IAP uses Apple/Google native payment only), no analytics.
 *
 * CRITICAL HARDENING:
 *   - Error boundary catches any hook or component crashes
 *   - Graceful fallback UI if startup fails
 *   - All hooks guaranteed to never throw
 */
import './src/i18n';
import React, { useState, useMemo, useCallback, useRef, useEffect, Component } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  SafeAreaView, StatusBar, useWindowDimensions, AccessibilityInfo, Alert, Linking,
} from 'react-native';
import { useTranslation } from './src/hooks/useTranslation';

import { useLocation }  from './src/hooks/useLocation';
import { useSettings }  from './src/hooks/useSettings';
import { useIAP }       from './src/hooks/useIAP';
import { useTheme }     from './src/hooks/useTheme';
import { useStoreReview } from './src/hooks/useStoreReview';
import { useShakeToSpeak } from './src/hooks/useShakeToSpeak';
import { useGridCrossing } from './src/hooks/useGridCrossing';
import { ThemeProvider, useColors } from './src/utils/ThemeContext';

import { MGRSDisplay }    from './src/components/MGRSDisplay';
import { WayfinderArrow } from './src/components/WayfinderArrow';
import { WaypointModal }  from './src/components/WaypointModal';
import { ProGate }        from './src/components/ProGate';
import { WhatsNewModal }  from './src/components/WhatsNewModal';
import { extractTokenFromUrl, redeemShareToken, getTrialStatus } from './src/utils/referral';
import { ToolsScreen }    from './src/screens/ToolsScreen';
import { ReportScreen }   from './src/screens/ReportScreen';
import { WaypointListsScreen } from './src/screens/WaypointListsScreen';
import { ThemeScreen }    from './src/screens/ThemeScreen';
import { CoordFormatsScreen } from './src/screens/CoordFormatsScreen';
import { SupportScreen } from './src/screens/SupportScreen';
import { MapScreen }     from './src/screens/MapScreen';
import { MeshScreen }    from './src/screens/MeshScreen';
import { useMeshtastic } from './src/hooks/useMeshtastic';

import {
  toMGRS, formatMGRS, formatPosition, calculateBearing, calculateDistance, formatDistance, getDisplayPrecision,
} from './src/utils/mgrs';
import { tapLight, tapHeavy, tapMedium, notifySuccess } from './src/utils/haptics';
import { speakMGRS, stopSpeaking } from './src/utils/voice';
import { trackSession } from './src/utils/analytics';

// ─── GLOBAL TEXT SCALING CAP ────────────────────────────────────────────────
// Prevent system font-size from breaking tactical layout.
// Two-tier: structural UI locked via per-component caps, body text gets some room.
// MGRSDisplay overrides to 1.0 (precision data must never scale).
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.maxFontSizeMultiplier = 1.0;

function useTabDefs() {
  const { t } = useTranslation();
  return useMemo(() => ({
    free: [
      { id: 'grid',   label: t('tabs.grid')   },
      { id: 'map',    label: t('tabs.map')    },
      { id: 'tools',  label: t('tabs.tools')  },
      { id: 'report', label: t('tabs.reports') },
    ],
    pro: [
      { id: 'grid',   label: t('tabs.grid')   },
      { id: 'map',    label: t('tabs.map')    },
      { id: 'tools',  label: t('tabs.tools')  },
      { id: 'report', label: t('tabs.reports') },
      { id: 'lists',  label: t('tabs.lists')  },
      { id: 'coords', label: t('tabs.coords') },
      { id: 'theme',  label: t('tabs.theme')  },
      { id: 'mesh',   label: t('tabs.mesh')   },
    ],
  }), [t]);
}

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
            <Text style={staticStyles.errorTitle}>RED GRID ERROR</Text>
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

  const { location, error, isLoading, retry, compassHeading } = useLocation();
  const { declination, setDeclination, paceCount, setPaceCount, theme, setTheme, coordFormat, setCoordFormat, shakeToSpeak, setShakeToSpeak, gridCrossing, setGridCrossing, gridScale, setGridScale } = useSettings();
  const { isPro: iapIsPro, isPurchasing, product, products, selectedTier, setSelectedTier, purchase, restore } = useIAP();

  // Trial state from referral system — treated as Pro for feature gating.
  const [trialActive, setTrialActive] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const isPro = iapIsPro || trialActive;

  // Check trial status on mount and whenever we return from background
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const status = await getTrialStatus();
      if (cancelled) return;
      setTrialActive(status.active);
      setTrialDaysLeft(status.daysLeft);
    };
    refresh();
    return () => { cancelled = true; };
  }, []);

  // Deep link handler — redeem trial when user opens redgrid://share/<token>
  useEffect(() => {
    const handleUrl = async (url) => {
      if (!url) return;
      const token = extractTokenFromUrl(url);
      if (!token) return;
      const result = await redeemShareToken(token);
      if (result.ok) {
        const status = await getTrialStatus();
        setTrialActive(status.active);
        setTrialDaysLeft(status.daysLeft);
        try {
          Alert.alert(
            '30 DAYS OF PRO UNLOCKED',
            `A friend has shared Red Grid Pro with you. All features are now active for ${status.daysLeft} days. Enjoy.`
          );
        } catch {}
      } else if (result.reason === 'already_received') {
        try { Alert.alert('Trial Already Used', 'You have already redeemed a shared trial on this device.'); } catch {}
      } else if (result.reason === 'expired') {
        try { Alert.alert('Link Expired', 'This trial link has expired. Ask for a new one.'); } catch {}
      } else {
        try { Alert.alert('Invalid Trial Link', 'This trial link could not be verified.'); } catch {}
      }
    };
    // Handle cold-start deep link
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    // Handle warm deep links while running
    const sub = Linking.addEventListener('url', (ev) => handleUrl(ev?.url));
    return () => { try { sub?.remove?.(); } catch {} };
  }, []);

  const themeData = useTheme(theme || 'red');
  const { checkAndPromptReview, promptReviewOnPositiveMoment, openStoreReview } = useStoreReview();
  const mesh = useMeshtastic();

  // Prompt for App Store review on mount (gated by open count, install age, cooldown).
  // Pro users bypass the open/install-date gates — they've already demonstrated intent.
  useEffect(() => { checkAndPromptReview({ isPro }); trackSession(); }, [isPro]);

  // One-shot Apple Search Ads attribution fetch on first launch.
  // Calls AAAttribution.attributionToken() and exchanges with Apple's
  // adservices endpoint. Idempotent — only fires once per install.
  // Stored locally only; never sent to a third party. iOS-only no-op
  // on Android.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchAndStoreAttribution } = require('expo-ad-attribution');
        if (cancelled) return;
        await fetchAndStoreAttribution();
      } catch {
        // Module missing or platform unsupported — silent no-op.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [tab, setTab]               = useState('grid');
  const [waypoint, setWaypoint]     = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [proGateVisible, setProGateVisible] = useState(false);
  const [proGateFeature, setProGateFeature] = useState('');
  const [hudMode, setHudMode]       = useState(false);
  const [showSupport, setShowSupport] = useState(false);

  const tabDefs = useTabDefs();
  const TABS = isPro ? tabDefs.pro : tabDefs.free;

  const showProGate = useCallback((featureName) => {
    setProGateFeature(featureName);
    setProGateVisible(true);
  }, []);

  // Derived MGRS — free tier limited to 4-digit (1km) display precision
  const displayPrecision = getDisplayPrecision(isPro);
  const mgrsRaw       = useMemo(() => { try { return location ? toMGRS(location.lat, location.lon, displayPrecision) : null; } catch { return null; } }, [location, displayPrecision]);
  const mgrsFormatted = useMemo(() => { try { return mgrsRaw ? formatMGRS(mgrsRaw) : null; } catch { return null; } }, [mgrsRaw]);
  // Alt format display string (for non-MGRS coordinate formats)
  const altDisplay = useMemo(() => {
    if (!location || coordFormat === 'mgrs') return null;
    try { return formatPosition(location.lat, location.lon, coordFormat); } catch { return null; }
  }, [location, coordFormat]);

  // Mark Position — one-tap save of current GPS fix as active nav target
  const [markToast, setMarkToast] = useState(null);
  const handleMarkPosition = useCallback(() => {
    if (!location?.lat || !location?.lon) {
      try { Alert.alert('No GPS fix', 'Waiting for a valid position. Move to open sky and try again.'); } catch {}
      return;
    }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const newWaypoint = { lat: location.lat, lon: location.lon, label: `MARK ${hhmm}` };
    const commit = () => {
      tapHeavy();
      setWaypoint(newWaypoint);
      notifySuccess();
      setMarkToast(newWaypoint.label);
      setTimeout(() => setMarkToast(null), 2000);
      AccessibilityInfo.announceForAccessibility(`Position marked as ${newWaypoint.label}`);
      // Positive moment: user successfully marked a position. Gated inside the hook
      // (MIN_POSITIVE_MOMENTS=3, POSITIVE_COOLDOWN_DAYS=90) so this fires at most once
      // every 90 days and only after the user has done it ≥3 times.
      promptReviewOnPositiveMoment();
    };
    if (waypoint) {
      try {
        Alert.alert(
          'Replace current waypoint?',
          `Current: ${waypoint.label || 'Unnamed'}\nNew: ${newWaypoint.label}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace', style: 'destructive', onPress: commit },
          ]
        );
      } catch { commit(); }
    } else {
      commit();
    }
  }, [location, waypoint]);

  // Tap-to-copy grid — copies whatever format is displayed (MGRS, UTM, DD, or DMS)
  const [copyToast, setCopyToast] = useState(false);
  const copyGrid = useCallback(async () => {
    const text = altDisplay || mgrsFormatted;
    if (!text) return;
    tapLight();
    let ExpoClipboard = null;
    try { ExpoClipboard = require('expo-clipboard'); } catch {}
    if (ExpoClipboard?.setStringAsync) {
      await ExpoClipboard.setStringAsync(text.replace(/\n/g, '  ')).catch(() => {});
    }
    notifySuccess();
    setCopyToast(true);
    AccessibilityInfo.announceForAccessibility('Grid copied');
    setTimeout(() => setCopyToast(false), 1500);
  }, [mgrsFormatted, altDisplay]);

  // v2.5 Pro features: shake-to-speak and grid crossing haptics
  useShakeToSpeak(mgrsFormatted, isPro && shakeToSpeak);
  useGridCrossing(mgrsFormatted, isPro && gridCrossing);

  // Wayfinder — true bearing (no declination on digital display)
  const { bearing, distance } = useMemo(() => {
    if (!location || !waypoint) return { bearing: null, distance: null };
    try {
      return {
        bearing: calculateBearing(location.lat, location.lon, waypoint.lat, waypoint.lon),
        distance: calculateDistance(location.lat, location.lon, waypoint.lat, waypoint.lon),
      };
    } catch {
      return { bearing: null, distance: null };
    }
  }, [location, waypoint]);

  // Arrow angle: subtract device heading so arrow points toward waypoint
  // Falls back to absolute bearing when compass unavailable
  const arrowAngle = useMemo(() => {
    if (bearing === null) return null;
    if (compassHeading === null) return bearing;
    return ((bearing - compassHeading) + 360) % 360;
  }, [bearing, compassHeading]);

  const waypointMGRS = useMemo(() => { try { return waypoint ? formatMGRS(toMGRS(waypoint.lat, waypoint.lon, 5)) : null; } catch { return null; } }, [waypoint]);
  const arrowSize    = isLandscape ? Math.min(height * 0.52, 190) : 200;

  // Dynamic StatusBar style: white theme uses dark content, others use light
  const statusBarStyle = themeData.id === 'white' ? 'dark-content' : 'light-content';

  const onEnterHud = useCallback(() => {
    if (!isPro) { showProGate('HUD Mode'); return; }
    tapHeavy();
    setHudMode(true);
  }, [isPro, showProGate]);

  const gridContent = isLandscape ? (
    <LandscapeGrid
      isLoading={isLoading} location={location} error={error} retry={retry}
      mgrsFormatted={mgrsFormatted} waypoint={waypoint} waypointMGRS={waypointMGRS}
      bearing={bearing} arrowAngle={arrowAngle} distance={distance} arrowSize={arrowSize}
      onAddWaypoint={() => { tapHeavy(); setShowModal(true); }} onClearWaypoint={() => { tapMedium(); setWaypoint(null); }}
      onMarkPosition={handleMarkPosition} markToast={markToast}
      isPro={isPro} onShowProGate={showProGate}
      onCopyGrid={copyGrid} copyToast={copyToast}
      coordFormat={coordFormat} altDisplay={altDisplay}
      compassHeading={compassHeading}
      onRateApp={openStoreReview}
      onEnterHud={onEnterHud}
      onShowSupport={() => setShowSupport(true)}
      gridScale={gridScale}
    />
  ) : (
    <PortraitGrid
      isLoading={isLoading} location={location} error={error} retry={retry}
      mgrsFormatted={mgrsFormatted} waypoint={waypoint} waypointMGRS={waypointMGRS}
      bearing={bearing} arrowAngle={arrowAngle} distance={distance} arrowSize={arrowSize}
      onAddWaypoint={() => { tapHeavy(); setShowModal(true); }} onClearWaypoint={() => { tapMedium(); setWaypoint(null); }}
      onMarkPosition={handleMarkPosition} markToast={markToast}
      isPro={isPro} onShowProGate={showProGate}
      onCopyGrid={copyGrid} copyToast={copyToast}
      coordFormat={coordFormat} altDisplay={altDisplay}
      compassHeading={compassHeading}
      onRateApp={openStoreReview}
      onEnterHud={onEnterHud}
      onShowSupport={() => setShowSupport(true)}
      gridScale={gridScale}
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
        products={products}
        selectedTier={selectedTier}
        setSelectedTier={setSelectedTier}
        statusBarStyle={statusBarStyle}
        waypoint={waypoint}
        coordFormat={coordFormat}
        setCoordFormat={setCoordFormat}
        compassHeading={compassHeading}
        shakeToSpeak={shakeToSpeak}
        setShakeToSpeak={setShakeToSpeak}
        gridCrossing={gridCrossing}
        setGridCrossing={setGridCrossing}
        gridScale={gridScale}
        setGridScale={setGridScale}
        hudMode={hudMode}
        setHudMode={setHudMode}
        bearing={bearing}
        arrowAngle={arrowAngle}
        distance={distance}
        showSupport={showSupport}
        setShowSupport={setShowSupport}
        mesh={mesh}
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
  proGateFeature, product, products, isPurchasing, purchase, restore,
  selectedTier, setSelectedTier,
  statusBarStyle, waypoint, coordFormat, setCoordFormat,
  compassHeading,
  shakeToSpeak, setShakeToSpeak, gridCrossing, setGridCrossing,
  gridScale, setGridScale,
  hudMode, setHudMode, bearing, arrowAngle, distance,
  showSupport, setShowSupport,
  mesh,
}) {
  const colors = useColors();

  // Smooth tab transition — quick fade on content swap
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevTab = useRef(safeTab);
  useEffect(() => {
    if (prevTab.current !== safeTab) {
      prevTab.current = safeTab;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [safeTab, fadeAnim]);

  return (
    <View style={staticStyles.root}>
    <SafeAreaView style={[staticStyles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.bg} hidden={isLandscape || hudMode} />

      {/* Screen content with fade transition */}
      <Animated.View style={[staticStyles.screenContent, { opacity: fadeAnim }]}>
        {safeTab === 'grid' && gridContent}

        {safeTab === 'map' && (
          <MapScreen
            location={location}
            isPro={isPro}
            onShowProGate={showProGate}
            onSetWaypoint={setWaypoint}
            meshPositions={mesh.meshPositions}
          />
        )}

        {safeTab === 'tools' && (
          <ToolsScreen
            location={location}
            declination={declination}
            paceCount={paceCount}
            setDeclination={setDeclination}
            setPaceCount={setPaceCount}
            compassHeading={compassHeading}
            isPro={isPro}
            onShowProGate={showProGate}
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
            shakeToSpeak={shakeToSpeak}
            setShakeToSpeak={setShakeToSpeak}
            gridCrossing={gridCrossing}
            setGridCrossing={setGridCrossing}
            gridScale={gridScale}
            setGridScale={setGridScale}
          />
        )}

        {safeTab === 'coords' && isPro && (
          <CoordFormatsScreen
            location={location}
            coordFormat={coordFormat}
            setCoordFormat={setCoordFormat}
          />
        )}

        {safeTab === 'mesh' && isPro && (
          <MeshScreen
            location={location}
            connectionState={mesh.connectionState}
            nearbyDevices={mesh.nearbyDevices}
            connectedDevice={mesh.connectedDevice}
            meshPositions={mesh.meshPositions}
            autoShare={mesh.autoShare}
            scanError={mesh.scanError}
            onScan={mesh.scan}
            onConnect={mesh.connect}
            onDisconnect={mesh.disconnect}
            onToggleAutoShare={mesh.toggleAutoShare}
          />
        )}

        {/* Upsell tab for non-Pro */}
        {(safeTab === 'lists' || safeTab === 'theme' || safeTab === 'coords' || safeTab === 'mesh') && !isPro && (
          <UpsellScreen onUpgrade={() => showProGate('Red Grid Pro')} />
        )}
      </Animated.View>

      {/* Tab bar — bottom positioned, adaptive spacing for 5+ tabs */}
      <View style={[staticStyles.tabBar, { borderTopColor: colors.border2, backgroundColor: colors.bg }, isLandscape && staticStyles.tabBarLandscape]} accessibilityRole="tablist">
        {TABS && Array.isArray(TABS) && TABS.map(t => (
          <TouchableOpacity
            key={t?.id || 'unknown'}
            style={staticStyles.tabItem}
            onPress={() => { if (t?.id) { tapLight(); setTab(t.id); } }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: safeTab === t?.id }}
            accessibilityLabel={`${t?.label || ''} tab`}
          >
            {safeTab === t?.id && <View style={[staticStyles.tabIndicatorTop, { backgroundColor: colors.text }]} />}
            <Text style={[staticStyles.tabLabel, TABS.length > 4 && staticStyles.tabLabelCompact, { color: colors.border }, safeTab === t?.id && { color: colors.text }]}>{t?.label || ''}</Text>
          </TouchableOpacity>
        ))}
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
        products={products}
        isPurchasing={isPurchasing}
        onPurchase={purchase}
        onRestore={restore}
        selectedTier={selectedTier}
        onSelectTier={setSelectedTier}
      />

      {/* Help & Support */}
      <SupportScreen
        visible={showSupport}
        onClose={() => setShowSupport(false)}
      />

      {/* What's new in this version — first launch post-update only */}
      <WhatsNewModal currentVersion="3.3.4" />

    </SafeAreaView>

    {/* HUD Mode — full-screen simplified display (Pro), rendered above SafeAreaView for true full-screen */}
    {hudMode && (
      <HUDOverlay
        mgrsFormatted={mgrsFormatted}
        bearing={bearing}
        arrowAngle={arrowAngle}
        distance={distance}
        compassHeading={compassHeading}
        waypoint={waypoint}
        onExit={() => { stopSpeaking(); tapMedium(); setHudMode(false); }}
      />
    )}
    </View>
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
  const { t } = useTranslation();
  return (
    <View style={staticStyles.upsellRoot}>
      <Text style={[staticStyles.upsellTitle, { color: colors.text }]}>{t('upsell.title')}</Text>
      <Text style={[staticStyles.upsellSub, { color: colors.text3 }]}>{t('upsell.subtitle')}</Text>
      <TouchableOpacity style={[staticStyles.upsellBtn, { borderColor: colors.text, backgroundColor: colors.border2 }]} onPress={onUpgrade} accessibilityRole="button" accessibilityLabel={t('upsell.button')}>
        <Text style={[staticStyles.upsellBtnText, { color: colors.text }]}>{t('upsell.button')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── PORTRAIT GRID ───────────────────────────────────────────────────────────
function PortraitGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, arrowAngle, distance, arrowSize, onAddWaypoint, onClearWaypoint, onMarkPosition, markToast, isPro, onShowProGate, onCopyGrid, copyToast, coordFormat, altDisplay, compassHeading, onRateApp, onEnterHud, onShowSupport, gridScale }) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={staticStyles.portraitRoot}>
      <View style={staticStyles.header}>
        <Text style={[staticStyles.appTitle, { color: colors.text }]} suppressHighlighting={true}>RED GRID MGRS</Text>
        <View style={staticStyles.headerRight}>
          {compassHeading !== null && <Text style={[staticStyles.headingText, { color: colors.text2 }]}>HDG {Math.round(compassHeading)}°</Text>}
          <SignalBadge isLoading={isLoading} location={location} />
        </View>
      </View>
      <Div />
      {error
        ? <ErrBlock error={error} retry={retry} />
        : (
          <TouchableOpacity onPress={onCopyGrid} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Current MGRS grid. Tap to copy">
            <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact={false} coordFormat={coordFormat} altDisplay={altDisplay} gridScale={gridScale} />
            {copyToast && <Text style={[staticStyles.copyToast, { color: colors.text2 }]}>{t('grid.copiedToClipboard')}</Text>}
          </TouchableOpacity>
        )
      }
      <Div />
      <View style={staticStyles.markRow}>
        <TouchableOpacity
          style={[staticStyles.markBtn, { borderColor: colors.text, backgroundColor: colors.border2 }]}
          onPress={onMarkPosition}
          disabled={!location?.lat}
          accessibilityRole="button"
          accessibilityLabel="Mark current position as waypoint"
        >
          <Text style={[staticStyles.markBtnText, { color: colors.text, opacity: location?.lat ? 1 : 0.4 }]} suppressHighlighting={true}>◉ MARK POSITION</Text>
        </TouchableOpacity>
        {markToast && <Text style={[staticStyles.markToast, { color: colors.text2 }]}>✓ {markToast}</Text>}
      </View>
      {!waypoint ? (
        <View style={staticStyles.noWpBlock}>
          <Crosshair size={50} />
          <Text style={[staticStyles.noWpText, { color: colors.border }]}>{t('grid.noWaypoint')}</Text>
          <TouchableOpacity style={[staticStyles.addBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel={t('grid.addWaypoint')}>
            <Text style={[staticStyles.addBtnText, { color: colors.text }]}>{t('grid.addWaypoint')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={staticStyles.wpBlock}>
          {arrowAngle !== null && (
            <View style={staticStyles.arrowWrap}>
              <WayfinderArrow bearing={arrowAngle} size={arrowSize} />
              <Text style={[staticStyles.bearingText, { color: colors.text }]}>{Math.round(bearing)}°</Text>
            </View>
          )}
          <View style={staticStyles.wpInfo}>
            <Text style={[staticStyles.wpLabel, { color: colors.text2 }]}>{waypoint.label}</Text>
            <Text style={[staticStyles.wpGrid, { color: colors.text }]}>{waypointMGRS}</Text>
            {distance !== null && <Text style={[staticStyles.wpDist, { color: colors.text }]}>{formatDistance(distance)}</Text>}
          </View>
          <View style={staticStyles.wpBtns}>
            <TouchableOpacity style={[staticStyles.editBtn, { borderColor: colors.border }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel={t('grid.edit')}><Text style={[staticStyles.editBtnText, { color: colors.text2 }]}>{t('grid.edit')}</Text></TouchableOpacity>
            <TouchableOpacity style={[staticStyles.clearBtn, { borderColor: colors.border, backgroundColor: colors.border2 }]} onPress={onClearWaypoint} accessibilityRole="button" accessibilityLabel={t('grid.clear')}><Text style={[staticStyles.clearBtnText, { color: colors.text2 }]}>{t('grid.clear')}</Text></TouchableOpacity>
          </View>
        </View>
      )}
      <View style={staticStyles.footer}>
        {mgrsFormatted && (
          <TouchableOpacity
            style={[staticStyles.voiceBtn, { borderColor: colors.border }, !isPro && staticStyles.voiceBtnLocked]}
            onPress={() => { tapMedium(); isPro ? speakMGRS(mgrsFormatted) : onShowProGate('Voice Readout'); }}
            accessibilityRole="button"
            accessibilityLabel={isPro ? t('grid.speakGrid') : 'Voice readout. Pro feature, locked.'}
          >
            <Text style={[staticStyles.voiceBtnText, { color: isPro ? colors.text2 : colors.border }]}>{t('grid.speakGrid')}{!isPro ? '  ' + t('grid.pro') : ''}</Text>
          </TouchableOpacity>
        )}
        <View style={staticStyles.footerRow}>
          <TouchableOpacity onPress={onEnterHud} accessibilityRole="button" accessibilityLabel={isPro ? t('grid.hudMode') : 'HUD mode. Pro feature'}>
            <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>◈ {t('grid.hudMode')}{!isPro ? '  ' + t('grid.pro') : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { tapLight(); onShowSupport(); }} accessibilityRole="button" accessibilityLabel={t('grid.help')}>
            <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>? {t('grid.help')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { tapLight(); onRateApp(); }} accessibilityRole="button" accessibilityLabel={t('grid.rateApp')}>
            <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>★ {t('grid.rateApp')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[staticStyles.footerText, { color: colors.text4 }]} maxFontSizeMultiplier={1.3}>{t('grid.footer')}</Text>
      </View>
    </View>
  );
}

// ─── LANDSCAPE GRID ──────────────────────────────────────────────────────────
function LandscapeGrid({ isLoading, location, error, retry, mgrsFormatted, waypoint, waypointMGRS, bearing, arrowAngle, distance, arrowSize, onAddWaypoint, onClearWaypoint, onMarkPosition, markToast, isPro, onShowProGate, onCopyGrid, copyToast, coordFormat, altDisplay, compassHeading, onRateApp, onEnterHud, onShowSupport, gridScale }) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View style={staticStyles.landscapeRoot}>
      <View style={staticStyles.lsLeft}>
        <View style={staticStyles.lsHeader}>
          <Text style={[staticStyles.lsTitle, { color: colors.text }]} suppressHighlighting={true}>RED GRID MGRS</Text>
          <View style={staticStyles.headerRight}>
            {compassHeading !== null && <Text style={[staticStyles.headingText, { color: colors.text2 }]}>HDG {Math.round(compassHeading)}°</Text>}
            <SignalBadge isLoading={isLoading} location={location} />
          </View>
        </View>
        <Div />
        {error ? <ErrBlock error={error} retry={retry} compact /> : (
          <TouchableOpacity onPress={onCopyGrid} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Current MGRS grid. Tap to copy">
            <MGRSDisplay mgrs={mgrsFormatted} accuracy={location?.accuracy} altitude={location?.altitude} compact coordFormat={coordFormat} altDisplay={altDisplay} gridScale={gridScale} />
            {copyToast && <Text style={[staticStyles.copyToast, { color: colors.text2 }]}>{t('grid.copiedToClipboard')}</Text>}
          </TouchableOpacity>
        )}
        <Div />
        {waypoint ? (
          <View style={staticStyles.lsWpInfo}>
            <Text style={[staticStyles.lsWpLabel, { color: colors.text2 }]}>{waypoint.label}</Text>
            <Text style={[staticStyles.lsWpGrid, { color: colors.text }]}>{waypointMGRS}</Text>
            {distance !== null && <Text style={[staticStyles.lsWpDist, { color: colors.text }]}>{formatDistance(distance)}</Text>}
          </View>
        ) : (
          <Text style={[staticStyles.noWpText, { color: colors.border }]}>{t('grid.noWaypoint')}</Text>
        )}
        <View style={staticStyles.lsBtnWrap}>
          <TouchableOpacity
            style={[staticStyles.lsMarkBtn, { borderColor: colors.text, backgroundColor: colors.border2 }]}
            onPress={onMarkPosition}
            disabled={!location?.lat}
            accessibilityRole="button"
            accessibilityLabel="Mark current position as waypoint"
          >
            <Text style={[staticStyles.lsMarkBtnText, { color: colors.text, opacity: location?.lat ? 1 : 0.4 }]} suppressHighlighting={true}>◉ MARK POSITION</Text>
          </TouchableOpacity>
          {markToast && <Text style={[staticStyles.markToast, { color: colors.text2, textAlign: 'center' }]}>✓ {markToast}</Text>}
          <View style={staticStyles.lsBtns}>
            <TouchableOpacity style={[staticStyles.lsBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel={waypoint ? t('grid.edit') : t('grid.addWaypoint')}>
              <Text style={[staticStyles.lsBtnText, { color: colors.text }]}>{waypoint ? t('grid.editWp') : t('grid.plusWaypoint')}</Text>
            </TouchableOpacity>
            {waypoint && (
              <TouchableOpacity style={[staticStyles.lsBtn, { borderColor: colors.border, backgroundColor: 'transparent' }]} onPress={onClearWaypoint} accessibilityRole="button" accessibilityLabel={t('grid.clear')}>
                <Text style={[staticStyles.lsBtnText, { color: colors.border }]}>{t('grid.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {mgrsFormatted && (
            <TouchableOpacity
              style={[staticStyles.voiceBtn, { borderColor: colors.border }, !isPro && staticStyles.voiceBtnLocked]}
              onPress={() => { tapMedium(); isPro ? speakMGRS(mgrsFormatted) : onShowProGate('Voice Readout'); }}
              accessibilityRole="button"
              accessibilityLabel={isPro ? t('grid.speakGrid') : 'Voice readout. Pro feature, locked.'}
            >
              <Text style={[staticStyles.voiceBtnText, { color: isPro ? colors.text2 : colors.border }]}>{t('grid.speakGrid')}{!isPro ? '  ' + t('grid.pro') : ''}</Text>
            </TouchableOpacity>
          )}
          <View style={staticStyles.footerRow}>
            <TouchableOpacity onPress={onEnterHud} accessibilityRole="button" accessibilityLabel={isPro ? t('grid.hud') : 'HUD mode. Pro feature'}>
              <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>◈ {t('grid.hud')}{!isPro ? '  ' + t('grid.pro') : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { tapLight(); onShowSupport(); }} accessibilityRole="button" accessibilityLabel={t('grid.help')}>
              <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>? {t('grid.help')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { tapLight(); onRateApp(); }} accessibilityRole="button" accessibilityLabel={t('grid.rate')}>
              <Text style={[staticStyles.rateLink, { color: colors.text3 }]}>★ {t('grid.rate')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[staticStyles.footerText, { color: colors.text4 }]} maxFontSizeMultiplier={1.3}>{t('grid.footerShort')}</Text>
        </View>
      </View>
      <View style={[staticStyles.lsVDiv, { backgroundColor: colors.border2 }]} />
      <View style={staticStyles.lsRight}>
        {waypoint && arrowAngle !== null ? (
          <View style={staticStyles.lsArrow}>
            <WayfinderArrow bearing={arrowAngle} size={arrowSize} />
            <Text style={[staticStyles.lsBearing, { color: colors.text }]}>{Math.round(bearing)}°</Text>
          </View>
        ) : (
          <View style={staticStyles.lsNoWp}>
            <Crosshair size={72} />
            <TouchableOpacity style={[staticStyles.addBtn, { borderColor: colors.text2, backgroundColor: colors.border2 }]} onPress={onAddWaypoint} accessibilityRole="button" accessibilityLabel={t('grid.addWaypoint')}>
              <Text style={[staticStyles.addBtnText, { color: colors.text }]}>{t('grid.addWaypoint')}</Text>
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
  const { t } = useTranslation();
  const color = isLoading ? colors.border : location ? colors.text : colors.border;
  const label = isLoading ? t('gps.acquiring') : location ? t('gps.gpsFix') : t('gps.noSignal');
  return (
    <View style={staticStyles.signal} accessibilityLiveRegion="polite" accessibilityLabel={`GPS status: ${label}`}>
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
      <Text style={[staticStyles.errText, { color: colors.text2 }]} maxFontSizeMultiplier={1.3}>{error}</Text>
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

// ─── HUD OVERLAY ────────────────────────────────────────────────────────────
// Full-screen simplified display: large MGRS + optional waypoint arrow.
// Tap anywhere to exit. Black background for maximum contrast.
function HUDOverlay({ mgrsFormatted, bearing, arrowAngle, distance, compassHeading, waypoint, onExit }) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={staticStyles.hudRoot}
      activeOpacity={1}
      onPress={onExit}
      accessibilityRole="button"
      accessibilityLabel={t('grid.tapToExit')}
    >
      <View style={staticStyles.hudContent}>
        {compassHeading !== null && (
          <Text style={[staticStyles.hudHeading, { color: colors.text2 }]}>HDG {Math.round(compassHeading)}°</Text>
        )}
        <Text
          style={[staticStyles.hudMgrs, { color: colors.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {mgrsFormatted || '\u2014'}
        </Text>
        {waypoint && arrowAngle !== null && (
          <View style={staticStyles.hudWpSection}>
            <WayfinderArrow bearing={arrowAngle} size={120} />
            {bearing !== null && <Text style={[staticStyles.hudBearing, { color: colors.text }]}>{Math.round(bearing)}°</Text>}
            {distance !== null && (
              <Text style={[staticStyles.hudDist, { color: colors.text2 }]}>{formatDistance(distance)}</Text>
            )}
            <Text style={[staticStyles.hudWpLabel, { color: colors.text3 }]}>{waypoint.label}</Text>
          </View>
        )}
      </View>
      <Text style={[staticStyles.hudExit, { color: colors.text4 }]}>{t('grid.tapToExit')}</Text>
    </TouchableOpacity>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
// Structural styles only — colours applied inline via useColors()
const staticStyles = StyleSheet.create({
  root: { flex:1 },
  // Error boundary fallback (hardcoded red — class component, no hooks)
  errorRoot: { flex:1, backgroundColor:'#000000' },
  errorContainer: { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  errorTitle: { fontFamily:'monospace', fontSize:18, fontWeight:'700', letterSpacing:4, color:'#CC0000', marginBottom:16, textAlign:'center' },
  errorMsg: { fontSize:12, color:'#BB3333', textAlign:'center', marginBottom:12, lineHeight:18 },
  errorDetail: { fontSize:10, color:'#AA2222', textAlign:'center', marginBottom:24, lineHeight:14, fontStyle:'italic' },
  errorRetryBtn: { borderWidth:1, borderColor:'#CC0000', backgroundColor:'#330000', paddingHorizontal:32, paddingVertical:12 },
  errorRetryText: { fontSize:11, color:'#CC0000', letterSpacing:3, fontWeight:'700' },
  // Tab bar
  tabBar: { flexDirection:'row', borderTopWidth:1, alignItems:'center' },
  tabBarLandscape: { paddingBottom: 0 },
  tabItem: { flex:1, alignItems:'center', paddingVertical:12, position:'relative' },
  tabLabel: { fontSize:10, letterSpacing:3, fontWeight:'700' },
  tabLabelCompact: { letterSpacing:1, fontSize:9 },
  tabIndicatorTop: { position:'absolute', top:0, left:'10%', right:'10%', height:2 },
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
  lsBtnText: { fontSize:10, letterSpacing:3, fontWeight:'700' },
  lsArrow: { alignItems:'center', gap:8 },
  lsBearing: { fontFamily:'monospace', fontSize:30, letterSpacing:4, fontWeight:'700' },
  lsNoWp: { alignItems:'center', gap:20 },
  // Header right cluster (heading + signal badge)
  headerRight: { flexDirection:'row', alignItems:'center', gap:10 },
  headingText: { fontFamily:'monospace', fontSize:10, letterSpacing:2, fontWeight:'600' },
  // Atoms
  signal: { flexDirection:'row', alignItems:'center', gap:6 },
  signalDot: { width:7, height:7, borderRadius:4 },
  signalText: { fontSize:9, letterSpacing:3 },
  divider: { height:1, marginVertical:6 },
  errBlock: { paddingVertical:20, alignItems:'center', gap:12 },
  errText: { fontSize:11, textAlign:'center', letterSpacing:1 },
  retryBtn: { borderWidth:1, paddingHorizontal:18, paddingVertical:8, minHeight:44 },
  retryText: { fontSize:11, letterSpacing:3 },
  noWpBlock: { paddingVertical:20, alignItems:'center', gap:16 },
  noWpText: { fontSize:11, letterSpacing:4 },
  addBtn: { borderWidth:1, paddingHorizontal:26, paddingVertical:13, minHeight:44 },
  addBtnText: { fontSize:12, letterSpacing:3, fontWeight:'700' },
  markRow: { alignItems:'center', paddingVertical:4, gap:6 },
  markBtn: { borderWidth:2, paddingHorizontal:34, paddingVertical:14, minHeight:48, minWidth:220, alignItems:'center' },
  markBtnText: { fontSize:13, letterSpacing:3, fontWeight:'800' },
  markToast: { fontSize:10, letterSpacing:2, fontWeight:'700', marginTop:2 },
  lsMarkBtn: { borderWidth:2, paddingVertical:11, alignItems:'center', marginBottom:6 },
  lsMarkBtnText: { fontSize:12, letterSpacing:3, fontWeight:'800' },
  wpBlock: { alignItems:'center', paddingVertical:10, gap:12 },
  arrowWrap: { alignItems:'center', gap:6 },
  bearingText: { fontFamily:'monospace', fontSize:26, letterSpacing:4, fontWeight:'700' },
  wpInfo: { alignItems:'center', gap:4 },
  wpLabel: { fontFamily:'monospace', fontSize:12, letterSpacing:4, fontWeight:'700' },
  wpGrid: { fontFamily:'monospace', fontSize:14, letterSpacing:3 },
  wpDist: { fontFamily:'monospace', fontSize:22, letterSpacing:4, fontWeight:'700', marginTop:2 },
  wpBtns: { flexDirection:'row', gap:10 },
  editBtn: { borderWidth:1, paddingHorizontal:22, paddingVertical:9, minHeight:44 },
  editBtnText: { fontSize:11, letterSpacing:3 },
  clearBtn: { borderWidth:1, paddingHorizontal:22, paddingVertical:9, minHeight:44 },
  clearBtnText: { fontSize:11, letterSpacing:3 },
  footer: { marginTop:'auto', paddingTop:16, alignItems:'center' },
  footerText: { fontSize:10, letterSpacing:2 },
  copyToast: { fontSize:9, letterSpacing:2, textAlign:'center', marginTop:4, opacity:0.8 },
  voiceBtn: { borderWidth:1, paddingHorizontal:18, paddingVertical:10, minHeight:44, alignItems:'center', marginBottom:8 },
  voiceBtnLocked: { opacity: 0.6 },
  voiceBtnText: { fontSize:10, letterSpacing:3, fontWeight:'700' },
  rateLink: { fontSize:10, letterSpacing:2, paddingVertical:6 },
  footerRow: { flexDirection:'row', justifyContent:'center', gap:20, marginBottom:2 },
  // Upsell
  upsellRoot: { flex:1, alignItems:'center', justifyContent:'center', gap:16, padding:40 },
  upsellTitle: { fontFamily:'monospace', fontSize:24, fontWeight:'700', letterSpacing:6 },
  upsellSub: { fontSize:11, letterSpacing:2 },
  upsellBtn: { borderWidth:1, paddingHorizontal:32, paddingVertical:14 },
  upsellBtnText: { fontSize:12, fontWeight:'700', letterSpacing:4 },
  // HUD overlay
  hudRoot: { ...StyleSheet.absoluteFillObject, backgroundColor:'#000000', zIndex:100, justifyContent:'center', alignItems:'center', padding:24 },
  hudContent: { flex:1, justifyContent:'center', alignItems:'center', width:'100%' },
  hudHeading: { fontFamily:'monospace', fontSize:14, letterSpacing:4, fontWeight:'600', marginBottom:12 },
  hudMgrs: { fontFamily:'monospace', fontSize:48, fontWeight:'700', letterSpacing:6, textAlign:'center', marginBottom:20 },
  hudWpSection: { alignItems:'center', gap:4, marginTop:20 },
  hudBearing: { fontFamily:'monospace', fontSize:24, fontWeight:'700', letterSpacing:4, marginTop:16 },
  hudDist: { fontFamily:'monospace', fontSize:18, letterSpacing:3, fontWeight:'700', marginTop:6 },
  hudWpLabel: { fontFamily:'monospace', fontSize:11, letterSpacing:4, marginTop:8, opacity:0.7 },
  hudExit: { fontSize:10, letterSpacing:4, paddingBottom:44, opacity:0.4 },
});
