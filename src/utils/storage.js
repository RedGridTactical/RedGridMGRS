/**
 * storage.js — AsyncStorage wrapper for all persisted user data (HARDENED).
 *
 * Stored values:
 *   rg_declination    — magnetic declination offset (float)
 *   rg_pace_count     — pace count calibration (int)
 *   rg_pro_unlocked   — Pro purchase cache (bool string)
 *   rg_waypoint_lists — saved waypoint lists (JSON, Pro only)
 *   rg_theme          — display theme (string, Pro only)
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
  COORD_FORMAT:    'rg_coord_format',
};

// ─── SETTINGS ────────────────────────────────────────────────────────────────
/**
 * Load all settings with safe defaults.
 * Returns defaults if AsyncStorage is unavailable or corrupted.
 */
export async function loadSettings() {
  try {
    if (!AsyncStorage || !AsyncStorage.multiGet) {
      return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs' };
    }

    const items = await Promise.race([
      AsyncStorage.multiGet([
        KEYS.DECLINATION, KEYS.PACE_COUNT, KEYS.THEME, KEYS.COORD_FORMAT,
      ]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Storage timeout')), 5000)
      )
    ]);

    if (!items || !Array.isArray(items)) {
      return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs' };
    }

    const dec = items[0];
    const pace = items[1];
    const theme = items[2];
    const coord = items[3];

    let declination = 0;
    let paceCount = 62;
    let themeValue = 'red';
    let coordFormat = 'mgrs';

    if (dec && Array.isArray(dec) && dec[1] !== null) {
      const parsed = parseFloat(dec[1]);
      if (!isNaN(parsed)) declination = parsed;
    }

    if (pace && Array.isArray(pace) && pace[1] !== null) {
      const parsed = parseInt(pace[1], 10);
      if (!isNaN(parsed)) paceCount = parsed;
    }

    if (theme && Array.isArray(theme) && theme[1]) {
      themeValue = String(theme[1]);
    }

    if (coord && Array.isArray(coord) && coord[1]) {
      coordFormat = String(coord[1]);
    }

    return { declination, paceCount, theme: themeValue, coordFormat };
  } catch (err) {
    // AsyncStorage unavailable, corrupted, permission denied, timeout, or parse error
    return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs' };
  }
}

/**
 * Save declination with error swallowing.
 */
export async function saveDeclination(value) {
  try {
    if (!AsyncStorage || !AsyncStorage.setItem) return;
    const stringValue = String(value ?? '0');
    await Promise.race([
      AsyncStorage.setItem(KEYS.DECLINATION, stringValue),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);
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
    await Promise.race([
      AsyncStorage.setItem(KEYS.PACE_COUNT, stringValue),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);
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
    await Promise.race([
      AsyncStorage.setItem(KEYS.THEME, stringValue),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);
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
    await Promise.race([
      AsyncStorage.setItem(KEYS.COORD_FORMAT, stringValue),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);
  } catch (err) {
    // Silent failure — user data stays in memory for this session
  }
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

    const raw = await Promise.race([
      AsyncStorage.getItem(KEYS.WAYPOINT_LISTS),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Load timeout')), 5000)
      )
    ]);

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
    await Promise.race([
      AsyncStorage.setItem(KEYS.WAYPOINT_LISTS, json),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timeout')), 5000)
      )
    ]);
  } catch (err) {
    // Silent failure — in-memory data persists for this session
  }
}

