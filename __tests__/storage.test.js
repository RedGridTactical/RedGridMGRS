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
