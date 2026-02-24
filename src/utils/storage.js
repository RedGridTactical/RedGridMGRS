/**
 * storage.js — AsyncStorage wrapper for all persisted user data.
 *
 * Stored values:
 *   rg_declination    — magnetic declination offset (float)
 *   rg_pace_count     — pace count calibration (int)
 *   rg_pro_unlocked   — Pro purchase cache (bool string)
 *   rg_waypoint_lists — saved waypoint lists (JSON, Pro only)
 *   rg_theme          — display theme (string, Pro only)
 *
 * NO location data, NO PII, NO tracking ever stored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DECLINATION:     'rg_declination',
  PACE_COUNT:      'rg_pace_count',
  PRO_UNLOCKED:    'rg_pro_unlocked',
  WAYPOINT_LISTS:  'rg_waypoint_lists',
  THEME:           'rg_theme',
};

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export async function loadSettings() {
  try {
    const [dec, pace, theme] = await AsyncStorage.multiGet([
      KEYS.DECLINATION, KEYS.PACE_COUNT, KEYS.THEME,
    ]);
    return {
      declination: dec[1]  !== null ? parseFloat(dec[1]) : 0,
      paceCount:   pace[1] !== null ? parseInt(pace[1], 10) : 62,
      theme:       theme[1] ?? 'red',
    };
  } catch {
    return { declination: 0, paceCount: 62, theme: 'red' };
  }
}

export async function saveDeclination(value) {
  try { await AsyncStorage.setItem(KEYS.DECLINATION, String(value)); } catch {}
}

export async function savePaceCount(value) {
  try { await AsyncStorage.setItem(KEYS.PACE_COUNT, String(value)); } catch {}
}

export async function saveTheme(value) {
  try { await AsyncStorage.setItem(KEYS.THEME, value); } catch {}
}

// ─── WAYPOINT LISTS (PRO) ────────────────────────────────────────────────────
export async function loadWaypointLists() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.WAYPOINT_LISTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveWaypointLists(lists) {
  try {
    await AsyncStorage.setItem(KEYS.WAYPOINT_LISTS, JSON.stringify(lists));
  } catch {}
}

export async function addWaypointList(name) {
  const lists = await loadWaypointLists();
  const newList = {
    id: `wl_${Date.now()}`,
    name,
    createdAt: Date.now(),
    waypoints: [],
  };
  await saveWaypointLists([...lists, newList]);
  return newList;
}

export async function deleteWaypointList(id) {
  const lists = await loadWaypointLists();
  await saveWaypointLists(lists.filter(l => l.id !== id));
}

export async function addWaypointToList(listId, waypoint) {
  const lists = await loadWaypointLists();
  const updated = lists.map(l =>
    l.id === listId
      ? { ...l, waypoints: [...l.waypoints, { ...waypoint, id: `wp_${Date.now()}` }] }
      : l
  );
  await saveWaypointLists(updated);
}

export async function removeWaypointFromList(listId, waypointId) {
  const lists = await loadWaypointLists();
  const updated = lists.map(l =>
    l.id === listId
      ? { ...l, waypoints: l.waypoints.filter(w => w.id !== waypointId) }
      : l
  );
  await saveWaypointLists(updated);
}
