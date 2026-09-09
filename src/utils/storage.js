/**
 * storage.js — AsyncStorage wrapper for all persisted user data (HARDENED).
 *
 * Stored values:
 *   rg_declination    — magnetic declination offset (float)
 *   rg_pace_count     — pace count calibration (int)
 *   rg_pro_unlocked   — Pro purchase cache (bool string)
 *   rg_waypoint_lists — saved waypoint lists (JSON, Pro only)
 *   rg_theme          — legacy display theme (read during migration)
 *   rg_display_preferences — preferred palette + Tactical display (atomic JSON)
 *   rg_coord_format   — coordinate format (string, Pro only)
 *
 * Saved coordinates and plans stay on this device; no automatic movement tracking.
 *
 * CRITICAL HARDENING:
 *   - All AsyncStorage calls guarded with existence checks
 *   - Explicit error handling with meaningful defaults
 *   - JSON.parse errors caught to prevent crash on corrupted data
 *   - Field data failures reject without replacing the original record
 *   - No unhandled promise rejections
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocalRecord, writeLocalRecord, fieldDataError } from './durableStorage';
import { normalizeWaypointLists } from './waypoints';

const KEYS = {
  DECLINATION:     'rg_declination',
  PACE_COUNT:      'rg_pace_count',
  PRO_UNLOCKED:    'rg_pro_unlocked',
  WAYPOINT_LISTS:  'rg_waypoint_lists',
  THEME:           'rg_theme',
  DISPLAY_PREFERENCES: 'rg_display_preferences',
  COORD_FORMAT:    'rg_coord_format',
  SHAKE_TO_SPEAK:  'rg_shake_to_speak',
  GRID_CROSSING:   'rg_grid_crossing',
  GRID_SCALE:      'rg_grid_scale',
  AO_PACKAGES:     'rg_ao_packages_v1',
};

/**
 * Race a promise against a timeout. Always clears the timer once the race
 * settles so we don't leak a Node timer (which jest --detectOpenHandles
 * surfaces as an open handle and which keeps the event loop alive in tests).
 */
function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({
  theme: 'standard',
  tacticalMode: false,
});
const PREFERRED_THEMES = ['standard', 'green', 'white', 'blue'];

/** The red palette is an overlay; the last non-red palette stays available. */
export function normalizeDisplayPreferences(value, legacyTheme) {
  if (value && PREFERRED_THEMES.includes(value.theme) && typeof value.tacticalMode === 'boolean') {
    return { theme: value.theme, tacticalMode: value.tacticalMode };
  }
  if (legacyTheme === 'red') return { theme: 'standard', tacticalMode: true };
  if (PREFERRED_THEMES.includes(legacyTheme)) return { theme: legacyTheme, tacticalMode: false };
  return { ...DEFAULT_DISPLAY_PREFERENCES };
}

export function effectiveDisplayTheme(preferences) {
  return preferences.tacticalMode ? 'red' : preferences.theme;
}

export function updateDisplayPreferences(current, change) {
  if (Object.prototype.hasOwnProperty.call(change, 'theme')) {
    if (change.theme === 'red') return { ...current, tacticalMode: true };
    if (PREFERRED_THEMES.includes(change.theme)) return { theme: change.theme, tacticalMode: false };
    return current;
  }
  if (typeof change.tacticalMode === 'boolean') return { ...current, tacticalMode: change.tacticalMode };
  return current;
}

// Keep native writes ordered even when rapid toggles arrive before a write ends.
// Timeout affects the caller only: it must not let a later write overtake a
// still-pending native operation.
let displayWriteQueue = Promise.resolve();
let displayWriteRevision = 0;

export function saveDisplayPreferences(value) {
  if (!value || !PREFERRED_THEMES.includes(value.theme) || typeof value.tacticalMode !== 'boolean') {
    return Promise.reject(new Error('Invalid display preferences'));
  }
  const json = JSON.stringify({ theme: value.theme, tacticalMode: value.tacticalMode });
  displayWriteRevision += 1;
  const native = displayWriteQueue.then(async () => {
    if (!AsyncStorage?.setItem) throw new Error('Local storage unavailable');
    await AsyncStorage.setItem(KEYS.DISPLAY_PREFERENCES, json);
  });
  displayWriteQueue = native.catch(() => {});
  return withTimeout(native, 5000, 'Display save timeout');
}

function defaultSettings() {
  return {
    declination: 0, paceCount: 62, theme: 'standard',
    displayPreferences: { ...DEFAULT_DISPLAY_PREFERENCES }, tacticalMode: false,
    coordFormat: 'mgrs', shakeToSpeak: false, tacticalSound: false, gridCrossing: true, gridScale: 1.0,
  };
}

/** Load settings and migrate a valid legacy theme without replacing a new selection. */
export async function loadSettings() {
  const revisionAtLoad = displayWriteRevision;
  try {
    if (!AsyncStorage || !AsyncStorage.multiGet) return defaultSettings();
    // A remount can read while the preceding screen's native write is pending.
    // Let that write settle before consulting the legacy key.
    await withTimeout(displayWriteQueue, 5000, 'Display load timeout');

    const items = await withTimeout(
      AsyncStorage.multiGet([
        KEYS.DECLINATION, KEYS.PACE_COUNT, KEYS.THEME, KEYS.COORD_FORMAT,
        KEYS.SHAKE_TO_SPEAK, KEYS.TACTICAL_SOUND, KEYS.GRID_CROSSING, KEYS.GRID_SCALE, KEYS.DISPLAY_PREFERENCES,
      ]),
      5000,
      'Storage timeout'
    );
    if (!Array.isArray(items)) return defaultSettings();
    const stored = Object.fromEntries(items.filter(item => Array.isArray(item) && item.length === 2));
    const settings = defaultSettings();
    const declination = parseFloat(stored[KEYS.DECLINATION]);
    const paceCount = parseInt(stored[KEYS.PACE_COUNT], 10);
    const gridScale = parseFloat(stored[KEYS.GRID_SCALE]);
    if (Number.isFinite(declination)) settings.declination = declination;
    if (Number.isFinite(paceCount)) settings.paceCount = paceCount;
    if (Number.isFinite(gridScale) && gridScale >= 0.7 && gridScale <= 1.5) settings.gridScale = gridScale;
    if (stored[KEYS.COORD_FORMAT]) settings.coordFormat = String(stored[KEYS.COORD_FORMAT]);
    if (stored[KEYS.SHAKE_TO_SPEAK] != null) settings.shakeToSpeak = stored[KEYS.SHAKE_TO_SPEAK] !== 'false';
    if (stored[KEYS.TACTICAL_SOUND] != null) settings.tacticalSound = stored[KEYS.TACTICAL_SOUND] === 'true';
    if (stored[KEYS.GRID_CROSSING] != null) settings.gridCrossing = stored[KEYS.GRID_CROSSING] !== 'false';

    let parsed;
    try { parsed = JSON.parse(stored[KEYS.DISPLAY_PREFERENCES]); } catch {}
    const displayPreferences = normalizeDisplayPreferences(parsed, stored[KEYS.THEME]);
    settings.displayPreferences = displayPreferences;
    settings.tacticalMode = displayPreferences.tacticalMode;
    settings.theme = effectiveDisplayTheme(displayPreferences);

    // A user choice made during this read wins over the historical migration.
    if (!stored[KEYS.DISPLAY_PREFERENCES] && stored[KEYS.THEME] && revisionAtLoad === displayWriteRevision) {
      saveDisplayPreferences(displayPreferences).catch(() => {});
    }
    return settings;
  } catch (err) {
    return defaultSettings();
  }
}

// Settings use one native queue per key, with failures reported to the settings UI.
const settingQueues = new Map();
function saveSetting(key, value) {
  const native = (settingQueues.get(key) || Promise.resolve()).then(async () => {
    if (!AsyncStorage?.setItem) throw new Error('Local storage unavailable');
    await AsyncStorage.setItem(key, String(value));
  });
  settingQueues.set(key, native.catch(() => {}));
  return withTimeout(native, 5000, 'Settings save timeout');
}
export const saveDeclination = value => saveSetting(KEYS.DECLINATION, value ?? 0);
export const savePaceCount = value => saveSetting(KEYS.PACE_COUNT, value ?? 62);
export const saveTheme = value => saveSetting(KEYS.THEME, value ?? 'standard');
export const saveCoordFormat = value => saveSetting(KEYS.COORD_FORMAT, value ?? 'mgrs');
export const saveShakeToSpeak = value => saveSetting(KEYS.SHAKE_TO_SPEAK, Boolean(value));
export const saveTacticalSound = value => saveSetting(KEYS.TACTICAL_SOUND, Boolean(value));
export const saveGridCrossing = value => saveSetting(KEYS.GRID_CROSSING, Boolean(value));
export const saveGridScale = value => saveSetting(KEYS.GRID_SCALE, value ?? 1);

// Field data is local and durable. Read errors are distinct from empty storage.
export function loadWaypointLists() {
  return readLocalRecord(KEYS.WAYPOINT_LISTS, normalizeWaypointLists, () => []);
}
export function saveWaypointLists(lists) {
  return writeLocalRecord(KEYS.WAYPOINT_LISTS, lists, normalizeWaypointLists, () => []);
}

export function normalizeAOPackages(packages) {
  if (!Array.isArray(packages)) throw fieldDataError('INVALID_AO', 'Invalid saved areas');
  const ids = new Set();
  return packages.map(pkg => {
    const r = pkg?.region;
    if (!pkg || typeof pkg.id !== 'string' || !pkg.id || ids.has(pkg.id) || !r
      || !Number.isFinite(r.latitude) || r.latitude < -90 || r.latitude > 90
      || !Number.isFinite(r.longitude) || r.longitude < -180 || r.longitude > 180
      || !Number.isFinite(r.latitudeDelta) || r.latitudeDelta <= 0 || r.latitudeDelta > 180
      || !Number.isFinite(r.longitudeDelta) || r.longitudeDelta <= 0 || r.longitudeDelta > 360
      || !Array.isArray(pkg.zoomLevels) || !pkg.zoomLevels.length
      || !pkg.zoomLevels.every(z => Number.isInteger(z) && z >= 0 && z <= 19)) {
      throw fieldDataError('INVALID_AO', 'Invalid saved area; original data preserved');
    }
    ids.add(pkg.id);
    return { ...pkg, region: { ...r }, zoomLevels: [...pkg.zoomLevels] };
  });
}
export function loadAOPackages() {
  return readLocalRecord(KEYS.AO_PACKAGES, normalizeAOPackages, () => []);
}
export function saveAOPackages(packages) {
  return writeLocalRecord(KEYS.AO_PACKAGES, packages, normalizeAOPackages, () => []);
}
