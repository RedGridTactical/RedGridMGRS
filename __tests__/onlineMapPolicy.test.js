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
