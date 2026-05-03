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
  SHAKE_TO_SPEAK:  'rg_shake_to_speak',
  GRID_CROSSING:   'rg_grid_crossing',
  GRID_SCALE:      'rg_grid_scale',
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
/**
 * Load all settings with safe defaults.
 * Returns defaults if AsyncStorage is unavailable or corrupted.
 */
export async function loadSettings() {
  try {
    if (!AsyncStorage || !AsyncStorage.multiGet) {
      return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs', shakeToSpeak: true, gridCrossing: true, gridScale: 1.0 };
    }

    const items = await withTimeout(
      AsyncStorage.multiGet([
        KEYS.DECLINATION, KEYS.PACE_COUNT, KEYS.THEME, KEYS.COORD_FORMAT,
        KEYS.SHAKE_TO_SPEAK, KEYS.GRID_CROSSING, KEYS.GRID_SCALE,
      ]),
      5000,
      'Storage timeout'
    );

    if (!items || !Array.isArray(items)) {
      return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs', shakeToSpeak: true, gridCrossing: true, gridScale: 1.0 };
    }

    const dec = items[0];
    const pace = items[1];
    const theme = items[2];
    const coord = items[3];

    let declination = 0;
    let paceCount = 62;
    let themeValue = 'red';
    let coordFormat = 'mgrs';
    let shakeToSpeak = true;
    let gridCrossing = true;
    let gridScale = 1.0;

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

    const shake = items[4];
    if (shake && Array.isArray(shake) && shake[1] !== null) {
      shakeToSpeak = shake[1] !== 'false';
    }

    const crossing = items[5];
    if (crossing && Array.isArray(crossing) && crossing[1] !== null) {
      gridCrossing = crossing[1] !== 'false';
    }

    const scale = items[6];
    if (scale && Array.isArray(scale) && scale[1] !== null) {
      const parsed = parseFloat(scale[1]);
      if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.5) gridScale = parsed;
    }

    return { declination, paceCount, theme: themeValue, coordFormat, shakeToSpeak, gridCrossing, gridScale };
  } catch (err) {
    // AsyncStorage unavailable, corrupted, permission denied, timeout, or parse error
    return { declination: 0, paceCount: 62, theme: 'red', coordFormat: 'mgrs', shakeToSpeak: true, gridCrossing: true, gridScale: 1.0 };
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

