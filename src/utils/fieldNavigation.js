/** Local navigation state. Route snapshots never follow later edits to a list. */
import { readLocalRecord, writeLocalRecord, fieldDataError } from './durableStorage';
import { normalizeWaypoint, normalizePlan, validFieldPosition } from './waypoints';

export const FIELD_NAVIGATION_KEY = 'rg_field_navigation_v1';
const HISTORY_LIMIT = 10;
let routeSequence = 0;

export function emptyNavigation() {
  return { version: 1, waypoint: null, route: null, history: [] };
}

export const validPosition = validFieldPosition;
function snapshotPoint(point, index = 0) {
  return point == null ? null : normalizeWaypoint(point, index);
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
    name: String(route.name || 'ROUTE').slice(0, 80), ...normalizePlan(route),
    reviewNotes: String(route.reviewNotes || '').slice(0, 500),
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
    waypoint: route ? snapshotPoint(route.waypoints[route.index], route.index) : validPosition(value.waypoint) ? snapshotPoint(value.waypoint) : null,
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
        listId: String(list.id || ''), name: String(list.name || 'ROUTE').slice(0, 80), ...normalizePlan(list), reviewNotes: '',
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
    case 'reviewNotes': {
      if (!state.history.some(item => item.id === action.routeId)) return state;
      return { ...state, history: state.history.map(item => item.id === action.routeId
        ? { ...item, reviewNotes: String(action.notes || '').slice(0, 500) } : item) };
    }
    case 'clearHistory': return { ...state, history: [] };
    default: return state;
  }
}

/** Refuse malformed records instead of silently overwriting them with empty state. */
export function validateNavigation(value) {
  if (value?.version !== 1 || !Array.isArray(value.history) || value.history.length > HISTORY_LIMIT
    || (value.waypoint != null && !validPosition(value.waypoint))
    || (value.route != null && (!validRoute(value.route) || value.route.confirmed.length !== value.route.index))
    || value.history.some(item => !validRoute(item) || !['completed', 'stopped'].includes(item.status)
      || !Number.isFinite(item.endedAt)
      || item.confirmed.length !== (item.status === 'completed' ? item.waypoints.length : item.index))) {
    throw fieldDataError('INVALID_NAVIGATION', 'Saved navigation needs recovery; original data preserved');
  }
  return normalizeNavigation(value);
}
export function saveNavigation(state) {
  return writeLocalRecord(FIELD_NAVIGATION_KEY, state, validateNavigation, emptyNavigation);
}
export function loadNavigation() {
  return readLocalRecord(FIELD_NAVIGATION_KEY, validateNavigation, emptyNavigation);
}
