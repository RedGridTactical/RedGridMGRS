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
 * NO location data, NO PII, NO tracking ever stored.
 *
 * CRITICAL HARDENING:
 *   - All AsyncStorage calls guarded with existence checks
 *   - Explicit error handling with meaningful defaults
 *   - JSON.parse errors caught to prevent crash on corrupted data
 *   - All operations return sensible defaults on failure
 *   - No unhandled promise rejections
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    return Promise.resolve();
  }
  const json = JSON.stringify({ theme: value.theme, tacticalMode: value.tacticalMode });
  displayWriteRevision += 1;
  displayWriteQueue = displayWriteQueue.then(async () => {
    if (AsyncStorage && AsyncStorage.setItem) {
      await AsyncStorage.setItem(KEYS.DISPLAY_PREFERENCES, json);
    }
  }).catch(() => {});
  return withTimeout(displayWriteQueue, 5000, 'Display save timeout').catch(() => {});
}

function defaultSettings() {
  return {
    declination: 0, paceCount: 62, theme: 'standard',
    displayPreferences: { ...DEFAULT_DISPLAY_PREFERENCES }, tacticalMode: false,
    coordFormat: 'mgrs', shakeToSpeak: true, gridCrossing: true, gridScale: 1.0,
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
        KEYS.SHAKE_TO_SPEAK, KEYS.GRID_CROSSING, KEYS.GRID_SCALE, KEYS.DISPLAY_PREFERENCES,
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
    if (stored[KEYS.GRID_CROSSING] != null) settings.gridCrossing = stored[KEYS.GRID_CROSSING] !== 'false';

    let parsed;
    try { parsed = JSON.parse(stored[KEYS.DISPLAY_PREFERENCES]); } catch {}
    const displayPreferences = normalizeDisplayPreferences(parsed, stored[KEYS.THEME]);
    settings.displayPreferences = displayPreferences;
    settings.tacticalMode = displayPreferences.tacticalMode;
    settings.theme = effectiveDisplayTheme(displayPreferences);

    // A user choice made during this read wins over the historical migration.
    if (!stored[KEYS.DISPLAY_PREFERENCES] && stored[KEYS.THEME] && revisionAtLoad === displayWriteRevision) {
      saveDisplayPreferences(displayPreferences);
    }
    return settings;
  } catch (err) {
    return defaultSettings();
  }
}

/**
 * Save declination with error swallowing.
 */
export async function saveDeclination(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    const stringValue = String(value ?? '0');
    await withTimeout(
      AsyncStorage.setItem(KEYS.DECLINATION, stringValue),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — user data stays in memory for this session
  }
}

/**
 * Save pace count with error swallowing.
 */
export async function savePaceCount(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    const stringValue = String(value ?? '62');
    await withTimeout(
      AsyncStorage.setItem(KEYS.PACE_COUNT, stringValue),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — user data stays in memory for this session
  }
}

/**
 * Save theme with error swallowing.
 */
export async function saveTheme(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    const stringValue = String(value ?? 'red');
    await withTimeout(
      AsyncStorage.setItem(KEYS.THEME, stringValue),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — user data stays in memory for this session
  }
}

/**
 * Save coordinate format with error swallowing.
 */
export async function saveCoordFormat(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    const stringValue = String(value ?? 'mgrs');
    await withTimeout(
      AsyncStorage.setItem(KEYS.COORD_FORMAT, stringValue),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — user data stays in memory for this session
  }
}

/**
 * Save shake-to-speak toggle with error swallowing.
 */
export async function saveShakeToSpeak(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    await AsyncStorage.setItem(KEYS.SHAKE_TO_SPEAK, String(value));
  } catch {}
}

/**
 * Save grid crossing alerts toggle with error swallowing.
 */
export async function saveGridCrossing(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    await AsyncStorage.setItem(KEYS.GRID_CROSSING, String(value));
  } catch {}
}

/**
 * Save grid scale multiplier with error swallowing.
 */
export async function saveGridScale(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    await AsyncStorage.setItem(KEYS.GRID_SCALE, String(value ?? '1'));
  } catch {}
}

// ─── WAYPOINT LISTS (PRO) ────────────────────────────────────────────────────
/**
 * Load waypoint lists with corruption protection.
 * Returns empty array if AsyncStorage unavailable or JSON invalid.
 */
export async function loadWaypointLists() {
  try {
    if (!AsyncStorage || !AsyncStorage.getItem) {
      return [];
    }

    const raw = await withTimeout(
      AsyncStorage.getItem(KEYS.WAYPOINT_LISTS),
      5000,
      'Load timeout'
    );

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (err) {
    // AsyncStorage unavailable, corrupted JSON, timeout, or parse error
    return [];
  }
}

/**
 * Save waypoint lists with error swallowing.
 */
export async function saveWaypointLists(lists) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    if (!Array.isArray(lists)) return;

    const json = JSON.stringify(lists);
    await withTimeout(
      AsyncStorage.setItem(KEYS.WAYPOINT_LISTS, json),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — in-memory data persists for this session
  }
}

// ─── AO (Area of Operations) PACKAGES (v3.4 Mission Preflight) ──────────────
/**
 * AO package shape:
 *   {
 *     id:            string                  // local-only id
 *     name:          string                  // user-supplied label
 *     mapStyle:      'standard'|'dark'|'topo'
 *     region:        { latitude, longitude, latitudeDelta, longitudeDelta }
 *     zoomLevels:    number[]                // e.g. [10, 12, 14, 16]
 *     tileCount:     number                  // total tile count across zooms
 *     estimatedBytes:number                  // best-effort estimate at save time
 *     lastRefreshed: ISO string | null       // null until first download
 *     createdAt:     ISO string
 *   }
 *
 * Storage is local-only, never transmitted, mirrors the privacy posture of the
 * rest of storage.js. Reads/writes go through withTimeout() so a hung
 * AsyncStorage doesn't block the Preflight panel render.
 */
export async function loadAOPackages() {
  try {
    if (!AsyncStorage || !AsyncStorage.getItem) return [];
    const raw = await withTimeout(
      AsyncStorage.getItem(KEYS.AO_PACKAGES),
      5000,
      'Load timeout'
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    // AsyncStorage unavailable, corrupted JSON, timeout, or parse error
    return [];
  }
}

export async function saveAOPackages(packages) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    if (!Array.isArray(packages)) return;
    const json = JSON.stringify(packages);
    await withTimeout(
      AsyncStorage.setItem(KEYS.AO_PACKAGES, json),
      5000,
      'Save timeout'
    );
  } catch (err) {
    // Silent failure — UI keeps the in-memory list for this session
  }
}

