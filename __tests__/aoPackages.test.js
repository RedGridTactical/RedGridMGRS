/**
 * Test suite for v3.4 Mission Preflight — AO package storage + free-tier cap.
 *
 * Coverage:
 *   • loadAOPackages / saveAOPackages: AsyncStorage round-trip + graceful failure modes
 *   • Free-tier cap (FREE_AO_LIMIT = 1)
 *   • Estimator integration so saved AOs persist correct tileCount + estimatedBytes
 */

// Mock AsyncStorage before importing storage modules
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(),
  setItem: jest.fn(),
  getItem: jest.fn(),
}));

const validAO = id => ({ id, name: id, region: { latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 }, zoomLevels: [10] });
const AsyncStorage = require('@react-native-async-storage/async-storage');
const {
  loadAOPackages,
  saveAOPackages,
} = require('../src/utils/storage');
const {
  estimateTilesForRegion,
} = require('../src/utils/tileManager');

describe('aoPackages — v3.4 Mission Preflight storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem = jest.fn();
    AsyncStorage.setItem = jest.fn();
  });

  // ─── loadAOPackages ───────────────────────────────────────────────────
  describe('loadAOPackages()', () => {
    test('returns [] when storage is empty', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);
      const result = await loadAOPackages();
      expect(result).toEqual([]);
    });

    test('round-trips a single AO package', async () => {
      const pkg = {
        id: 'abc123',
        name: 'Range 23',
        mapStyle: 'standard',
        region: { latitude: 38.89, longitude: -77.03, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        zoomLevels: [10, 12, 14, 16],
        tileCount: 42,
        estimatedBytes: 900_000,
        lastRefreshed: null,
        createdAt: '2026-05-14T00:00:00.000Z',
      };
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify([pkg]));
      const result = await loadAOPackages();
      expect(result).toEqual([pkg]);
    });

    test('rejects corrupted JSON', async () => {
      AsyncStorage.getItem.mockResolvedValue('{not-json');
      await expect(loadAOPackages()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('rejects invalid saved shape', async () => {
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ id: 'x' }));
      await expect(loadAOPackages()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('rejects unavailable storage', async () => {
      AsyncStorage.getItem = null;
      await expect(loadAOPackages()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('reports native read failures', async () => {
      AsyncStorage.getItem.mockRejectedValue(new Error('boom'));
      await expect(loadAOPackages()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  // ─── saveAOPackages ───────────────────────────────────────────────────
  describe('saveAOPackages(packages)', () => {
    test('writes a JSON array under the expected key', async () => {
      const pkgs = [validAO('1'), validAO('2')];
      await saveAOPackages(pkgs);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_ao_packages_v1', JSON.stringify(pkgs));
    });

    test('rejects when payload is not an array', async () => {
      await expect(saveAOPackages('not an array')).rejects.toThrow();
      await expect(saveAOPackages(null)).rejects.toThrow();
      await expect(saveAOPackages(undefined)).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('rejects when AsyncStorage.setItem is missing', async () => {
      AsyncStorage.setItem = null;
      await expect(saveAOPackages([validAO('1')])).rejects.toThrow();
    });

    test('reports native write failure', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('disk full'));
      await expect(saveAOPackages([validAO('1')])).rejects.toThrow();
    });
  });

  // ─── Free-tier cap (FREE_AO_LIMIT enforcement, exercised at hook layer) ──
  describe('Free-tier cap semantics', () => {
    test('FREE_AO_LIMIT = 1 (v3.4 contract)', () => {
      const { FREE_AO_LIMIT } = require('../src/hooks/useAOPackages');
      expect(FREE_AO_LIMIT).toBe(1);
    });

    test('DEFAULT_AO_ZOOMS mirrors download dialog zooms', () => {
      const { DEFAULT_AO_ZOOMS } = require('../src/hooks/useAOPackages');
      expect(DEFAULT_AO_ZOOMS).toEqual([10, 12, 14, 16]);
    });
  });

  // ─── Estimator integration (an AO's persisted tileCount comes from the estimator) ──
  describe('estimateTilesForRegion sanity for AO save flow', () => {
    test('tileCount and estimatedBytes are non-negative and matched', () => {
      const region = {
        latitude: 38.8895,
        longitude: -77.0353,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      const est = estimateTilesForRegion(region, [10, 12, 14, 16]);
      expect(est.totalTiles).toBeGreaterThan(0);
      expect(est.estimatedBytes).toBeGreaterThan(0);
      expect(est.estimatedBytes % est.totalTiles).toBe(0);
    });
  });
});
