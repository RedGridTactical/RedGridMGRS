/**
 * Test suite for src/utils/tileManager.js
 * Tests tile coordinate math, region coverage, edge cases (poles, antimeridian),
 * and graceful degradation when expo-file-system is unavailable.
 */

const {
  latLonToTile,
  getTilesForRegion,
  getLocalTilePathTemplate,
  downloadTilesForRegion,
  checkTilesForRegion,
  clearTileCache,
  estimateTilesForRegion,
  AVG_TILE_BYTES,
  TILE_DIR,
} = require('../src/utils/tileManager');

describe('tileManager.js - Offline Tile Cache', () => {

  // ─── latLonToTile ─────────────────────────────────────────────────────
  describe('latLonToTile(lat, lon, zoom)', () => {

    test('Washington DC at zoom 10', () => {
      const tile = latLonToTile(38.8895, -77.0353, 10);
      expect(tile.x).toBe(292);
      expect(tile.y).toBe(391);
    });

    test('origin (0, 0) at zoom 1', () => {
      const tile = latLonToTile(0, 0, 1);
      expect(tile.x).toBe(1);
      expect(tile.y).toBe(1);
    });

    test('origin (0, 0) at zoom 0', () => {
      const tile = latLonToTile(0, 0, 0);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    test('northwest corner (-180, 85) at zoom 2', () => {
      const tile = latLonToTile(85, -180, 2);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    test('southeast corner (180, -85) at zoom 2', () => {
      const tile = latLonToTile(-85, 180, 2);
      // lon 180 wraps to max tile
      expect(tile.x).toBe(3);
      expect(tile.y).toBe(3);
    });

    test('London at zoom 14', () => {
      const tile = latLonToTile(51.5074, -0.1278, 14);
      expect(tile.x).toBe(8186);
      expect(tile.y).toBe(5448);
    });

    test('Sydney at zoom 12', () => {
      const tile = latLonToTile(-33.8688, 151.2093, 12);
      expect(tile.x).toBe(3768);
      expect(tile.y).toBe(2457);
    });

    test('Tokyo at zoom 16', () => {
      const tile = latLonToTile(35.6762, 139.6503, 16);
      expect(tile.x).toBe(58190);
      expect(tile.y).toBe(25807);
    });

    // ─── Edge cases ─────────────────────────────────────────────────────

    test('near north pole (89°) should clamp y to 0', () => {
      const tile = latLonToTile(89, 0, 10);
      expect(tile.y).toBe(0);
      expect(tile.x).toBeGreaterThanOrEqual(0);
    });

    test('near south pole (-89°) should clamp y to max', () => {
      const tile = latLonToTile(-89, 0, 10);
      const maxTile = Math.pow(2, 10) - 1;
      expect(tile.y).toBe(maxTile);
    });

    test('antimeridian east (179.99°)', () => {
      const tile = latLonToTile(0, 179.99, 10);
      const maxTile = Math.pow(2, 10) - 1;
      expect(tile.x).toBe(maxTile);
    });

    test('antimeridian west (-179.99°)', () => {
      const tile = latLonToTile(0, -179.99, 10);
      expect(tile.x).toBe(0);
    });

    test('exactly at dateline (180°) should clamp to max x', () => {
      const tile = latLonToTile(0, 180, 10);
      const maxTile = Math.pow(2, 10) - 1;
      expect(tile.x).toBe(maxTile);
    });

    test('negative longitude (-77°)', () => {
      const tile = latLonToTile(38.89, -77.04, 10);
      expect(tile.x).toBeLessThan(Math.pow(2, 10) / 2); // west hemisphere
    });

    test('zoom 0 always returns (0, 0)', () => {
      const tile1 = latLonToTile(45, 90, 0);
      expect(tile1.x).toBe(0);
      expect(tile1.y).toBe(0);
    });

    test('higher zoom gives higher tile numbers', () => {
      const z10 = latLonToTile(38.89, -77.04, 10);
      const z14 = latLonToTile(38.89, -77.04, 14);
      expect(z14.x).toBeGreaterThan(z10.x);
      expect(z14.y).toBeGreaterThan(z10.y);
    });
  });

  // ─── getTilesForRegion ────────────────────────────────────────────────
  describe('getTilesForRegion(region, zoom)', () => {

    const dcRegion = {
      latitude: 38.8895,
      longitude: -77.0353,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    test('returns array of tile objects with z, x, y', () => {
      const tiles = getTilesForRegion(dcRegion, 10);
      expect(Array.isArray(tiles)).toBe(true);
      expect(tiles.length).toBeGreaterThan(0);
      for (const t of tiles) {
        expect(t).toHaveProperty('z', 10);
        expect(t).toHaveProperty('x');
        expect(t).toHaveProperty('y');
        expect(typeof t.x).toBe('number');
        expect(typeof t.y).toBe('number');
      }
    });

    test('zoom 10 with small region returns 1-4 tiles', () => {
      const tiles = getTilesForRegion(dcRegion, 10);
      expect(tiles.length).toBeGreaterThanOrEqual(1);
      expect(tiles.length).toBeLessThanOrEqual(4);
    });

    test('zoom 16 with small region returns more tiles', () => {
      const tiles = getTilesForRegion(dcRegion, 16);
      expect(tiles.length).toBeGreaterThan(10);
    });

    test('higher zoom = more tiles for same region', () => {
      const z10 = getTilesForRegion(dcRegion, 10);
      const z14 = getTilesForRegion(dcRegion, 14);
      const z16 = getTilesForRegion(dcRegion, 16);
      expect(z14.length).toBeGreaterThan(z10.length);
      expect(z16.length).toBeGreaterThan(z14.length);
    });

    test('larger region = more tiles at same zoom', () => {
      const small = getTilesForRegion(dcRegion, 14);
      const big = getTilesForRegion({
        ...dcRegion,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }, 14);
      expect(big.length).toBeGreaterThan(small.length);
    });

    test('all tiles have the requested zoom level', () => {
      const tiles = getTilesForRegion(dcRegion, 14);
      for (const t of tiles) {
        expect(t.z).toBe(14);
      }
    });

    test('no duplicate tiles', () => {
      const tiles = getTilesForRegion(dcRegion, 14);
      const keys = tiles.map(t => `${t.z}/${t.x}/${t.y}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(tiles.length);
    });

    // ─── Edge case regions ──────────────────────────────────────────────

    test('region crossing prime meridian (London)', () => {
      const tiles = getTilesForRegion({
        latitude: 51.5,
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.2,
      }, 12);
      expect(tiles.length).toBeGreaterThan(0);
    });

    test('region near equator', () => {
      const tiles = getTilesForRegion({
        latitude: 0,
        longitude: 30,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }, 14);
      expect(tiles.length).toBeGreaterThan(0);
    });

    test('region in southern hemisphere (Sydney)', () => {
      const tiles = getTilesForRegion({
        latitude: -33.87,
        longitude: 151.21,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 14);
      expect(tiles.length).toBeGreaterThan(0);
    });

    test('very small region (single building) at high zoom', () => {
      const tiles = getTilesForRegion({
        latitude: 38.8895,
        longitude: -77.0353,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      }, 18);
      expect(tiles.length).toBeGreaterThanOrEqual(1);
      expect(tiles.length).toBeLessThanOrEqual(4);
    });

    test('large region at low zoom stays manageable', () => {
      const tiles = getTilesForRegion({
        latitude: 40,
        longitude: -100,
        latitudeDelta: 20,
        longitudeDelta: 30,
      }, 6);
      // At zoom 6, even a large CONUS region should be <100 tiles
      expect(tiles.length).toBeLessThan(200);
    });
  });

  // ─── Tile count estimation (for download cap) ─────────────────────────
  describe('tile count estimation', () => {

    const defaultRegion = {
      latitude: 38.8895,
      longitude: -77.0353,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    test('default region at [10, 12, 14, 16] is under 500 tiles', () => {
      let total = 0;
      for (const z of [10, 12, 14, 16]) {
        total += getTilesForRegion(defaultRegion, z).length;
      }
      expect(total).toBeLessThan(500);
      expect(total).toBeGreaterThan(10);
    });

    test('zoomed-out region at zoom 16 can exceed 5000 tiles', () => {
      const bigRegion = {
        latitude: 40,
        longitude: -100,
        latitudeDelta: 2.0,
        longitudeDelta: 2.0,
      };
      const tiles = getTilesForRegion(bigRegion, 16);
      expect(tiles.length).toBeGreaterThan(5000);
    });
  });

  // ─── Graceful degradation without expo-file-system ─────────────────────
  describe('graceful degradation (no FileSystem)', () => {

    test('TILE_DIR is null in test environment', () => {
      expect(TILE_DIR).toBeNull();
    });

    test('getLocalTilePathTemplate returns null without FileSystem', () => {
      expect(getLocalTilePathTemplate()).toBeNull();
    });

    test('downloadTilesForRegion returns zeros without FileSystem', async () => {
      const result = await downloadTilesForRegion(
        { latitude: 38.89, longitude: -77.04, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        [10, 12, 14]
      );
      expect(result).toEqual({ downloaded: 0, failed: 0, skipped: 0, total: 0 });
    });

    test('checkTilesForRegion returns zeros without FileSystem', async () => {
      const result = await checkTilesForRegion(
        { latitude: 38.89, longitude: -77.04, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        [10, 12]
      );
      expect(result).toEqual({ cached: 0, missing: 0, total: 0 });
    });

    test('clearTileCache returns false without FileSystem', async () => {
      const result = await clearTileCache();
      expect(result).toBe(false);
    });
  });

  // ─── estimateTilesForRegion (v3.4 Mission Preflight) ──────────────────
  describe('estimateTilesForRegion(region, zoomLevels)', () => {
    const dcRegion = {
      latitude: 38.8895,
      longitude: -77.0353,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    test('returns zeros for null/invalid region', () => {
      expect(estimateTilesForRegion(null)).toEqual({ totalTiles: 0, byZoom: {}, estimatedBytes: 0 });
      expect(estimateTilesForRegion({})).toEqual({ totalTiles: 0, byZoom: {}, estimatedBytes: 0 });
      expect(estimateTilesForRegion({ latitude: 1 })).toEqual({ totalTiles: 0, byZoom: {}, estimatedBytes: 0 });
    });

    test('returns zeros for empty zoom list', () => {
      expect(estimateTilesForRegion(dcRegion, [])).toEqual({ totalTiles: 0, byZoom: {}, estimatedBytes: 0 });
    });

    test('sums tile counts across zoom levels', () => {
      const est = estimateTilesForRegion(dcRegion, [10, 12, 14]);
      // Should match `getTilesForRegion` sums (no double-counting)
      const sum =
        getTilesForRegion(dcRegion, 10).length +
        getTilesForRegion(dcRegion, 12).length +
        getTilesForRegion(dcRegion, 14).length;
      expect(est.totalTiles).toBe(sum);
      expect(est.byZoom[10]).toBe(getTilesForRegion(dcRegion, 10).length);
      expect(est.byZoom[14]).toBe(getTilesForRegion(dcRegion, 14).length);
    });

    test('estimatedBytes = totalTiles * AVG_TILE_BYTES by default', () => {
      const est = estimateTilesForRegion(dcRegion, [10, 12]);
      expect(est.estimatedBytes).toBe(est.totalTiles * AVG_TILE_BYTES);
    });

    test('estimatedBytes respects custom bytesPerTile override', () => {
      const est = estimateTilesForRegion(dcRegion, [12], 1000);
      expect(est.estimatedBytes).toBe(est.totalTiles * 1000);
    });

    test('rejects out-of-range zoom levels', () => {
      const est = estimateTilesForRegion(dcRegion, [10, -1, 50, 12]);
      // Only zoom 10 and 12 should count
      expect(Object.keys(est.byZoom).sort()).toEqual(['10', '12']);
    });

    test('AVG_TILE_BYTES is a reasonable midpoint (10KB–35KB)', () => {
      expect(AVG_TILE_BYTES).toBeGreaterThanOrEqual(10 * 1024);
      expect(AVG_TILE_BYTES).toBeLessThanOrEqual(35 * 1024);
    });
  });
});
