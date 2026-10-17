/**
 * Online basemap policy: only layers the app may lawfully show are offered,
 * each with visible attribution, viewport-only fetching and an identified,
 * validated Android request path. Guards the react-native-maps patch too.
 */
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///local/',
  cacheDirectory: 'file:///data/user/0/com.redgrid.redgridtactical/cache/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));
const fs = require('fs');
const path = require('path');
const manager = require('../src/utils/tileManager');

describe('offered online layers', () => {
  test('Dark (CARTO, API key required) is not offered; Standard and Topo are', () => {
    expect(manager.ONLINE_MAP_STYLES.map(s => s.id)).toEqual(['standard', 'topo']);
    expect(manager.ONLINE_MAP_STYLES.some(s => /cartocdn/.test(s.url))).toBe(false);
  });

  test('every offered layer carries provider attribution and a licence link', () => {
    for (const style of manager.ONLINE_MAP_STYLES) {
      expect(style.attribution).toMatch(/OpenStreetMap contributors/);
      expect(style.attributionUrl).toMatch(/^https:\/\//);
      expect(style.label).toBeTruthy();
    }
    expect(manager.getOnlineMapStyle('standard').attributionUrl).toBe('https://www.openstreetmap.org/copyright');
    expect(manager.getOnlineMapStyle('topo').attribution).toMatch(/OpenTopoMap \(CC-BY-SA\)/);
  });

  test('a stored Dark preference migrates to Standard; unknown values do too', () => {
    expect(manager.resolveMapStyle('dark')).toBe('standard');
    expect(manager.resolveMapStyle('bogus')).toBe('standard');
    expect(manager.resolveMapStyle(undefined)).toBe('standard');
    expect(manager.resolveMapStyle('topo')).toBe('topo');
    expect(manager.getOnlineMapStyle('dark').id).toBe('standard');
  });

  test('viewport cache is per provider, under the cache directory, separate from imported map tiles', () => {
    const std = manager.getOnlineTileCachePath('standard');
    const topo = manager.getOnlineTileCachePath('topo');
    expect(std).toBe('file:///data/user/0/com.redgrid.redgridtactical/cache/online-tiles/standard');
    expect(topo).not.toBe(std);
    expect(std).not.toContain('map_tiles');
    expect(manager.getOnlineTileCachePath('dark')).toBe(std);
  });

  test('each layer declares the provider native zoom so no request exceeds coverage', () => {
    expect(manager.getOnlineMapStyle('standard').maxNativeZoom).toBe(19);
    expect(manager.getOnlineMapStyle('topo').maxNativeZoom).toBe(17);
  });

  test('cache retention meets the seven-day tile policy minimum', () => {
    expect(manager.ONLINE_TILE_CACHE_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(604800);
  });

  test('bulk download stays blocked for every offered layer', async () => {
    for (const style of manager.ONLINE_MAP_STYLES) {
      const result = await manager.downloadTilesForRegion(null, [12], jest.fn(), { style: style.id });
      expect(result.blocked).toBe(true);
    }
  });
});

describe('MapScreen wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/MapScreen.js'), 'utf8');

  test('online tile overlay passes the per-provider cache and max age on Android only', () => {
    expect(src).toMatch(/Platform\.OS === 'android' \? getOnlineTileCachePath\(mapStyle\) : null/);
    expect(src).toMatch(/tileCacheMaxAge: ONLINE_TILE_CACHE_MAX_AGE_SECONDS/);
  });

  test('native zoom cap is applied per platform without the unvalidated iOS cached overlay', () => {
    expect(src).toMatch(/maximumZ=\{Platform\.OS === 'android' \? 19 : onlineStyle\.maxNativeZoom\}/);
    expect(src).toMatch(/Platform\.OS === 'android' \? \{ maximumNativeZ: onlineStyle\.maxNativeZoom \} : \{\}/);
  });

  test('attribution wraps fully; required credits are never ellipsized', () => {
    const attributionBlock = src.slice(src.indexOf('styles.attribution,'), src.indexOf('Download progress overlay'));
    expect(attributionBlock).not.toMatch(/numberOfLines/);
  });

  test('attribution is rendered as a link over online layers', () => {
    expect(src).toMatch(/accessibilityRole="link"/);
    expect(src).toMatch(/onlineStyle\.attribution\b/);
    expect(src).toMatch(/Linking\.openURL\(onlineStyle\.attributionUrl\)/);
  });

  test('no hard-coded Dark/CARTO layer remains in the screen', () => {
    expect(src).not.toMatch(/DARK_TILE_URL|'DRK'|cartocdn/);
  });

  test('Android base map is "none" with a label/POI-free style; iOS keeps the Apple standard map', () => {
    expect(src).toMatch(/mapType=\{Platform\.OS === 'ios' \? 'standard' : 'none'\}/);
    expect(src).toMatch(/Platform\.OS === 'android' \? \{ customMapStyle: ANDROID_BASEMAP_STYLE \} : \{\}/);
    const style = src.slice(src.indexOf('const ANDROID_BASEMAP_STYLE'), src.indexOf('];', src.indexOf('const ANDROID_BASEMAP_STYLE')));
    expect(style).toMatch(/elementType: 'labels', stylers: \[\{ visibility: 'off' \}\]/);
    expect(style).toMatch(/featureType: 'poi', stylers: \[\{ visibility: 'off' \}\]/);
    expect(src).not.toMatch(/googleRenderer/);
  });

  test('Android keeps the Google logo clear of the bottom bar and the reticle on the padded camera target', () => {
    expect(src).toMatch(/const androidMapPadding = Platform\.OS === 'android' && bottomBarHeight > 0 \? \{ top: 0, left: 0, right: 0, bottom: bottomBarHeight \} : undefined;/);
    expect(src).toMatch(/\{\.\.\.\(androidMapPadding \? \{ mapPadding: androidMapPadding \} : \{\}\)\}/);
    expect(src).toMatch(/styles\.reticle, androidMapPadding && \{ marginTop: -10 - androidMapPadding\.bottom \/ 2 \}/);
    expect(src).toMatch(/styles\.bottomBar, \{ backgroundColor: colors\.bg, borderTopColor: colors\.border2 \}\]\} onLayout=\{Platform\.OS === 'android' \? onBottomBarLayout : undefined\}/);
  });
});

describe('react-native-maps Android request path (patch guard)', () => {
  const patch = fs.readFileSync(path.join(__dirname, '..', 'patches/react-native-maps+1.20.1.patch'), 'utf8');

  test('patch identifies the app, validates responses and never caches a block page', () => {
    expect(patch).toMatch(/setRequestProperty\("User-Agent", ua\)/);
    expect(patch).toMatch(/\+https:\/\/redgridtactical\.com/);
    expect(patch).toMatch(/getHeaderField\("x-blocked"\)/);
    expect(patch).toMatch(/startsWith\("image\/"\)/);
    expect(patch).toMatch(/isValidTileImage/);
    expect(patch).toMatch(/inJustDecodeBounds = true/);
    expect(patch).toMatch(/MAX_TILE_BYTES/);
    expect(patch).toMatch(/renameTo\(file\)/);
    expect(patch).toMatch(/this\.customMode = true;/);
    expect(patch).toMatch(/tileProvider\.setTileCachePath\(this\.tileCachePath\)/);
  });

  test('patch makes the Android base-map type persist from creation through map-ready and recreation', () => {
    // Creation: "none" goes into GoogleMapOptions so Google base tiles never load.
    expect(patch).toMatch(/initialProps\.hasKey\("mapType"\)/);
    expect(patch).toMatch(/googleMapOptions\.mapType\(initialType\)/);
    // Prop updates no longer dereference a possibly-null GoogleMap; the view stores the type.
    expect(patch).toMatch(/view\.setMapType\(typeId == null \? GoogleMap\.MAP_TYPE_NORMAL : typeId\)/);
    expect(patch).not.toMatch(/\+\s*view\.map\.setMapType\(typeId\)/);
    expect(patch).toMatch(/private Integer mapType = null;/);
    expect(patch).toMatch(/if\(mapType != null\) \{\n\+\s*map\.setMapType\(mapType\);/);
    // JS sends mapType with the pre-ready (Android-only) props so it is part of initialProps.
    expect(patch).toMatch(/\+\s*mapType: this\.props\.mapType,/);
  });

  test('installed react-native-maps files carry the same base-map persistence (patch is applied)', () => {
    const base = path.join(__dirname, '..', 'node_modules/react-native-maps');
    const manager = fs.readFileSync(path.join(base, 'android/src/main/java/com/rnmaps/maps/MapManager.java'), 'utf8');
    const view = fs.readFileSync(path.join(base, 'android/src/main/java/com/rnmaps/maps/MapView.java'), 'utf8');
    const js = fs.readFileSync(path.join(base, 'lib/MapView.js'), 'utf8');
    expect(manager).toMatch(/googleMapOptions\.mapType\(initialType\)/);
    expect(manager).not.toMatch(/view\.map\.setMapType/);
    expect(view).toMatch(/public void setMapType\(int mapType\)/);
    expect(view.indexOf('map.setMapType(mapType);')).toBeLessThan(view.indexOf('map.setMapStyle(new MapStyleOptions(customMapStyleString));'));
    const preReady = js.slice(js.indexOf('else {\n            props = {\n                style: this.props.style'), js.indexOf('const AIRMap = getNativeMapComponent'));
    expect(preReady).toMatch(/mapType: this\.props\.mapType,/);
  });

  test('new native log lines carry no tile URL or coordinates', () => {
    const added = patch.split('\n').filter(l => l.startsWith('+') && /Log\.[dw]\("urlTile"/.test(l));
    expect(added.length).toBeGreaterThan(0);
    for (const line of added) {
      const message = line.replace(/Log\.[dw]\("urlTile", /, '');
      expect(message).not.toMatch(/\burl\b|\bzoom\b|\bx\b|\by\b/);
    }
  });

  test('worker path uses the same identified fetch', () => {
    expect(patch).toMatch(/MapTileProvider\.fetchValidatedTile\(url, MapTileProvider\.userAgentFor/);
  });

  test('User-Agent is not a browser impersonation', () => {
    expect(patch).not.toMatch(/Mozilla\/5\.0/);
  });
});
