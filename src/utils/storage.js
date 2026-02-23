/**
 * storage.js — Minimal AsyncStorage wrapper for persistent user settings.
 * ONLY stores: declination offset, pace count calibration.
 * No location data, no waypoints, no PII ever.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DECLINATION: 'rg_declination',
  PACE_COUNT:  'rg_pace_count',
};

export async function loadSettings() {
  try {
    const [dec, pace] = await AsyncStorage.multiGet([KEYS.DECLINATION, KEYS.PACE_COUNT]);
    return {
      declination: dec[1] !== null ? parseFloat(dec[1]) : 0,
      paceCount:   pace[1] !== null ? parseInt(pace[1], 10) : 62,
    };
  } catch {
    return { declination: 0, paceCount: 62 };
  }
}

export async function saveDeclination(value) {
  try { await AsyncStorage.setItem(KEYS.DECLINATION, String(value)); } catch {}
}

export async function savePaceCount(value) {
  try { await AsyncStorage.setItem(KEYS.PACE_COUNT, String(value)); } catch {}
}
