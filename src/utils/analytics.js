/**
 * On-device analytics — zero network, AsyncStorage only.
 * Key: rg_analytics
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'rg_analytics';

const today = () => new Date().toISOString().slice(0, 10);

async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function save(data) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* fail silently */ }
}

function ensureShape(data) {
  const d = data || {};
  return {
    screens: d.screens || {},
    events: d.events || {},
    sessions: d.sessions || 0,
    firstSeen: d.firstSeen || today(),
    lastSeen: today(),
  };
}

export async function trackEvent(eventName) {
  try {
    const data = ensureShape(await load());
    data.events[eventName] = (data.events[eventName] || 0) + 1;
    data.lastSeen = today();
    await save(data);
  } catch { /* fail silently */ }
}

export async function trackScreen(screenName) {
  try {
    const data = ensureShape(await load());
    data.screens[screenName] = (data.screens[screenName] || 0) + 1;
    data.lastSeen = today();
    await save(data);
  } catch { /* fail silently */ }
}

export async function trackSession() {
  try {
    const data = ensureShape(await load());
    data.sessions += 1;
    data.lastSeen = today();
    await save(data);
  } catch { /* fail silently */ }
}

export async function getAnalytics() {
  try {
    return ensureShape(await load());
  } catch { return ensureShape(null); }
}

export async function resetAnalytics() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* fail silently */ }
}
