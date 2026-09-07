/** Local navigation state. Route snapshots never follow later edits to a list. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toMGRS, formatMGRS } from './mgrs';

export const FIELD_NAVIGATION_KEY = 'rg_field_navigation_v1';
const HISTORY_LIMIT = 10;
let routeSequence = 0;

export function emptyNavigation() {
  return { version: 1, waypoint: null, route: null, history: [] };
}

export function validPosition(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
    && point.lat >= -80 && point.lat <= 84 && point.lon >= -180 && point.lon <= 180;
}

function snapshotPoint(point, index = 0) {
  if (!validPosition(point)) return null;
  return {
    id: String(point.id || `point-${index}`),
    lat: point.lat, lon: point.lon,
    label: String(point.label || point.name || `WP ${index + 1}`).slice(0, 80),
    mgrs: formatMGRS(toMGRS(point.lat, point.lon, 5)),
  };
}

function validRoute(route) {
  return route && Array.isArray(route.waypoints) && route.waypoints.length > 0
    && route.waypoints.length <= 20 && route.waypoints.every(validPosition)
    && Number.isInteger(route.index) && route.index >= 0 && route.index < route.waypoints.length
    && Number.isFinite(route.startedAt) && Array.isArray(route.confirmed)
    && route.confirmed.length <= route.waypoints.length
    && route.confirmed.every((point, index) => point?.index === index && Number.isFinite(point.confirmedAt));
}

function snapshotRoute(route) {
  return {
    id: String(route.id || `${route.startedAt}-route`), listId: String(route.listId || ''),
    name: String(route.name || 'ROUTE').slice(0, 80),
    waypoints: route.waypoints.map(snapshotPoint), index: route.index, startedAt: route.startedAt,
    confirmed: route.confirmed.map(point => ({ index: point.index, confirmedAt: point.confirmedAt })),
    mode: route.mode === 'team' ? 'team' : 'solo',
  };
}

export function normalizeNavigation(value) {
  if (value?.version !== 1) return emptyNavigation();
  const route = validRoute(value.route) && value.route.confirmed.length === value.route.index ? snapshotRoute(value.route) : null;
  return {
    version: 1,
    // The route index owns its destination, including after a interrupted save.
    waypoint: route ? snapshotPoint(route.waypoints[route.index], route.index) : snapshotPoint(value.waypoint),
    route,
    history: Array.isArray(value.history) ? value.history.filter(item =>
      validRoute(item) && ['completed', 'stopped'].includes(item.status) && Number.isFinite(item.endedAt)
      && item.confirmed.length === (item.status === 'completed' ? item.waypoints.length : item.index)
    ).slice(0, HISTORY_LIMIT).map(item => ({ ...snapshotRoute(item), status: item.status, endedAt: item.endedAt })) : [],
  };
}

function stopCurrent(state, now, status = 'stopped') {
  if (!state.route) return state;
  const record = { ...state.route, status, endedAt: now };
  return { ...state, waypoint: null, route: null, history: [record, ...state.history].slice(0, HISTORY_LIMIT) };
}

export function transitionNavigation(state, action) {
  const now = Number.isFinite(action.now) ? action.now : Date.now();
  switch (action.type) {
    case 'waypoint': {
      if (action.waypoint != null && !validPosition(action.waypoint)) return state;
      return { ...stopCurrent(state, now), waypoint: snapshotPoint(action.waypoint) };
    }
    case 'start': {
      const list = action.list;
      if (!Array.isArray(list?.waypoints) || !list.waypoints.length || list.waypoints.length > 20
        || !list.waypoints.every(validPosition)) return state;
      const previous = stopCurrent(state, now);
      const waypoints = list.waypoints.map(snapshotPoint);
      const route = {
        id: `${now}-${++routeSequence}`,
        listId: String(list.id || ''), name: String(list.name || 'ROUTE').slice(0, 80),
        waypoints, index: 0, startedAt: now, confirmed: [], mode: action.mode === 'team' ? 'team' : 'solo',
      };
      return { ...previous, route, waypoint: waypoints[0] };
    }
    case 'confirm': {
      if (!state.route) return state;
      // A stale confirmation dialog must not advance a different point/route.
      if (action.routeId !== state.route.id || action.index !== state.route.index) return state;
      const route = { ...state.route, confirmed: [...state.route.confirmed, { index: state.route.index, confirmedAt: now }] };
      if (route.index === route.waypoints.length - 1) return stopCurrent({ ...state, route }, now, 'completed');
      route.index += 1;
      return { ...state, route, waypoint: route.waypoints[route.index] };
    }
    case 'stop':
      if (action.routeId && action.routeId !== state.route?.id) return state;
      return stopCurrent(state, now);
    case 'clearHistory': return { ...state, history: [] };
    default: return state;
  }
}

// One ordered queue prevents a slow first save from overwriting later progress.
let writeQueue = Promise.resolve();

function storageTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Navigation storage timeout')), 5000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function saveNavigation(state) {
  const json = JSON.stringify(state);
  const result = writeQueue.then(() => AsyncStorage.setItem(FIELD_NAVIGATION_KEY, json));
  writeQueue = result.catch(() => {});
  return storageTimeout(result);
}

export async function loadNavigation() {
  await storageTimeout(writeQueue);
  const raw = await storageTimeout(AsyncStorage.getItem(FIELD_NAVIGATION_KEY));
  if (!raw) return emptyNavigation();
  try { return normalizeNavigation(JSON.parse(raw)); } catch { return emptyNavigation(); }
}
