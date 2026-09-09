/**
 * Test suite for src/utils/storage.js
 * Tests AsyncStorage wrapper with mocked storage
 */

// Mock AsyncStorage before importing storage module
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(),
  setItem: jest.fn(),
  getItem: jest.fn(),
}));

const { normalizeWaypointLists } = require('../src/utils/waypoints');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const {
  loadSettings,
  saveDeclination,
  savePaceCount,
  saveTheme,
  saveCoordFormat,
  saveShakeToSpeak,
  saveTacticalSound,
  saveGridCrossing,
  saveGridScale,
  loadWaypointLists,
  saveWaypointLists,
} = require('../src/utils/storage');

describe('storage.js - Persistent Storage Wrapper', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore mock functions that may have been set to null by previous tests
    AsyncStorage.multiGet = jest.fn();
    AsyncStorage.setItem = jest.fn();
    AsyncStorage.getItem = jest.fn();
  });

  // ─── loadSettings ─────────────────────────────────────────────────────
  describe('loadSettings()', () => {

    test('Returns defaults when storage is empty', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', null],
        ['rg_pace_count', null],
        ['rg_theme', null],
      ]);

      const result = await loadSettings();
      expect(result.declination).toBe(0);
      expect(result.paceCount).toBe(62);
      expect(result.theme).toBe('standard');
    });

    test('Loads saved declination correctly', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', '15.5'],
        ['rg_pace_count', null],
        ['rg_theme', null],
      ]);

      const result = await loadSettings();
      expect(result.declination).toBe(15.5);
    });

    test('Loads saved pace count correctly', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', null],
        ['rg_pace_count', '65'],
        ['rg_theme', null],
      ]);

      const result = await loadSettings();
      expect(result.paceCount).toBe(65);
    });

    test('Loads saved theme correctly', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', null],
        ['rg_pace_count', null],
        ['rg_theme', 'blue'],
      ]);

      const result = await loadSettings();
      expect(result.theme).toBe('blue');
    });

    test('Loads all settings together', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', '-10.5'],
        ['rg_pace_count', '70'],
        ['rg_theme', 'green'],
      ]);

      const result = await loadSettings();
      expect(result.declination).toBe(-10.5);
      expect(result.paceCount).toBe(70);
      expect(result.theme).toBe('green');
    });

    test('Returns defaults when AsyncStorage is unavailable', async () => {
      AsyncStorage.multiGet = null;

      const result = await loadSettings();
      expect(result.declination).toBe(0);
      expect(result.paceCount).toBe(62);
      expect(result.theme).toBe('standard');
    });

    test('Returns defaults on parse error', async () => {
      AsyncStorage.multiGet.mockRejectedValue(new Error('Parse error'));

      const result = await loadSettings();
      expect(result.declination).toBe(0);
      expect(result.paceCount).toBe(62);
      expect(result.theme).toBe('standard');
    });

    test('Returns defaults on timeout', async () => {
      AsyncStorage.multiGet.mockImplementation(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10))
      );

      const result = await loadSettings();
      expect(result.declination).toBe(0);
      expect(result.paceCount).toBe(62);
      expect(result.theme).toBe('standard');
    });

    test('Handles invalid data types gracefully', async () => {
      AsyncStorage.multiGet.mockResolvedValue([
        ['rg_declination', 'not_a_number'],
        ['rg_pace_count', 'not_an_int'],
        ['rg_theme', null],
      ]);

      const result = await loadSettings();
      expect(result.declination).toBe(0);
      expect(result.paceCount).toBe(62);
      expect(result.theme).toBe('standard');
    });
  });

  describe('settings native bridge contract', () => {
    const validKey = key => typeof key === 'string' && key.length > 0;

    test('passes only nonempty string keys to native multiGet on startup', async () => {
      AsyncStorage.multiGet.mockImplementation(async keys => {
        if (!keys.every(validKey)) throw new TypeError('Invalid native storage key');
        return keys.map(key => [key, null]);
      });
      const settings = await loadSettings();
      expect(AsyncStorage.multiGet).toHaveBeenCalledTimes(1);
      const [keys] = AsyncStorage.multiGet.mock.calls[0];
      expect(keys.every(validKey)).toBe(true);
      expect(keys).toContain('rg_tactical_sound');
      expect(new Set(keys).size).toBe(keys.length);
      expect(settings.tacticalSound).toBe(false);
      expect(settings.shakeToSpeak).toBe(false);
    });

    test('every settings writer uses its stable string key', async () => {
      AsyncStorage.setItem.mockImplementation(async (key, value) => {
        if (!validKey(key) || typeof value !== 'string') throw new TypeError('Invalid native storage arguments');
      });
      const cases = [
        [saveDeclination, 0, 'rg_declination', '0'],
        [savePaceCount, 62, 'rg_pace_count', '62'],
        [saveTheme, 'standard', 'rg_theme', 'standard'],
        [saveCoordFormat, 'mgrs', 'rg_coord_format', 'mgrs'],
        [saveShakeToSpeak, false, 'rg_shake_to_speak', 'false'],
        [saveTacticalSound, true, 'rg_tactical_sound', 'true'],
        [saveGridCrossing, false, 'rg_grid_crossing', 'false'],
        [saveGridScale, 1, 'rg_grid_scale', '1'],
      ];
      for (const [save, value, key, serialized] of cases) {
        await save(value);
        expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(key, serialized);
      }
    });

    test('sound and shake remain off by default and sound survives a fresh settings read', async () => {
      const disk = new Map();
      AsyncStorage.setItem.mockImplementation(async (key, value) => {
        if (!validKey(key) || typeof value !== 'string') throw new TypeError('Invalid native storage arguments');
        disk.set(key, value);
      });
      AsyncStorage.multiGet.mockImplementation(async keys => {
        if (!keys.every(validKey)) throw new TypeError('Invalid native storage key');
        return keys.map(key => [key, disk.get(key) ?? null]);
      });
      expect(await loadSettings()).toMatchObject({ tacticalSound: false, shakeToSpeak: false });
      await saveTacticalSound(true);
      expect(await loadSettings()).toMatchObject({ tacticalSound: true, shakeToSpeak: false });
      await saveTacticalSound(false);
      expect(await loadSettings()).toMatchObject({ tacticalSound: false, shakeToSpeak: false });
      await saveShakeToSpeak(true);
      expect(await loadSettings()).toMatchObject({ tacticalSound: false, shakeToSpeak: true });
    });

    test('sound save failure rejects and a subsequent retry can persist', async () => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
      await expect(saveTacticalSound(true)).rejects.toThrow('Disk unavailable');
      await expect(saveTacticalSound(true)).resolves.toBeUndefined();
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('rg_tactical_sound', 'true');
    });
  });

  // ─── saveDeclination ──────────────────────────────────────────────────
  describe('saveDeclination(value)', () => {

    test('Saves numeric declination', async () => {
      await saveDeclination(15.5);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_declination', '15.5');
    });

    test('Saves negative declination', async () => {
      await saveDeclination(-10);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_declination', '-10');
    });

    test('Saves zero declination', async () => {
      await saveDeclination(0);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_declination', '0');
    });

    test('Handles null gracefully', async () => {
      await saveDeclination(null);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_declination', '0');
    });

    test('Handles AsyncStorage unavailable', async () => {
      AsyncStorage.setItem = null;
      await expect(saveDeclination(15)).rejects.toThrow();
    });

    test('Reports native write failure', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Save failed'));
      await expect(saveDeclination(15)).rejects.toThrow();
    });
  });

  // ─── savePaceCount ────────────────────────────────────────────────────
  describe('savePaceCount(value)', () => {

    test('Saves numeric pace count', async () => {
      await savePaceCount(65);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_pace_count', '65');
    });

    test('Saves zero pace count', async () => {
      await savePaceCount(0);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_pace_count', '0');
    });

    test('Handles null gracefully', async () => {
      await savePaceCount(null);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_pace_count', '62');
    });

    test('Reports native write failure', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Save failed'));
      await expect(savePaceCount(70)).rejects.toThrow();
    });
  });

  // ─── saveTheme ────────────────────────────────────────────────────────
  describe('saveTheme(value)', () => {

    test('Saves theme string', async () => {
      await saveTheme('blue');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_theme', 'blue');
    });

    test('Handles null gracefully', async () => {
      await saveTheme(null);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_theme', 'standard');
    });

    test('Reports native write failure', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Save failed'));
      await expect(saveTheme('green')).rejects.toThrow();
    });
  });

  // ─── loadWaypointLists ────────────────────────────────────────────────
  describe('loadWaypointLists()', () => {

    test('Returns empty array when storage is empty', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);

      const result = await loadWaypointLists();
      expect(result).toEqual([]);
    });

    test('Returns saved waypoint lists', async () => {
      const mockLists = [
        { id: 'wl_1', name: 'List 1', waypoints: [] },
        { id: 'wl_2', name: 'List 2', waypoints: [] },
      ];
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockLists));

      const result = await loadWaypointLists();
      expect(result).toEqual(normalizeWaypointLists(mockLists));
      expect(result.length).toBe(2);
    });

    test('Reports corrupted JSON without replacing it', async () => {
      AsyncStorage.getItem.mockResolvedValue('INVALID_JSON');

      await expect(loadWaypointLists()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('Reports invalid saved shape', async () => {
      AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ id: 'wl_1' }));

      await expect(loadWaypointLists()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('Reports failed storage read', async () => {
      AsyncStorage.getItem.mockRejectedValue(new Error('Load failed'));

      await expect(loadWaypointLists()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('Reports unavailable storage', async () => {
      AsyncStorage.getItem = null;

      await expect(loadWaypointLists()).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  // ─── saveWaypointLists ────────────────────────────────────────────────
  describe('saveWaypointLists(lists)', () => {

    test('Saves waypoint lists as JSON', async () => {
      const lists = [{ id: 'wl_1', name: 'List 1', waypoints: [] }];
      await saveWaypointLists(lists);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'rg_waypoint_lists',
        JSON.stringify(normalizeWaypointLists(lists))
      );
    });

    test('Saves empty array', async () => {
      await saveWaypointLists([]);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('rg_waypoint_lists', '[]');
    });

    test('Ignores non-array input', async () => {
      await expect(saveWaypointLists({ id: 'wl_1' })).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('Handles null gracefully', async () => {
      await expect(saveWaypointLists(null)).rejects.toThrow();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    test('Reports native write failure', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Save failed'));
      await expect(saveWaypointLists([{ id: 'wl_1', waypoints: [] }])).rejects.toThrow();
    });
  });

  // Note: addWaypointList, deleteWaypointList, addWaypointToList, and
  // removeWaypointFromList were removed as dead code. WaypointListsScreen
  // manages CRUD operations inline using loadWaypointLists/saveWaypointLists.

});
