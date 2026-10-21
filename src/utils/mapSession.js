/**
 * mapSession — the small, serializable part of MapScreen's state that must
 * survive the screen being unmounted (tab round trips, compact/expanded
 * changes). Nothing here keeps a native map alive; it only lets the next
 * MapScreen mount start where the previous one stopped: viewport, selected
 * marker and an unsaved long-press waypoint form.
 *
 * Deliberately not persisted to storage: it is in-memory session state.
 */

const isRegion = region => !!region
  && Number.isFinite(region.latitude) && Number.isFinite(region.longitude)
  && Number.isFinite(region.latitudeDelta) && Number.isFinite(region.longitudeDelta)
  && region.latitudeDelta > 0 && region.longitudeDelta > 0
  && Math.abs(region.latitude) <= 90 && Math.abs(region.longitude) <= 180;

const sameRegion = (a, b) => !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude && a.latitudeDelta === b.latitudeDelta && a.longitudeDelta === b.longitudeDelta;

export function createMapSession() {
  return Object.freeze({ region: null, selectedMarkerKey: null, waypointForm: null });
}

/**
 * Apply a patch. Unknown keys are ignored; invalid regions are dropped rather
 * than stored; `null` clears a field. Returns the same object when nothing changed.
 */
export function reduceMapSession(session, patch) {
  const current = session || createMapSession();
  if (!patch || typeof patch !== 'object') return current;
  let next = current, changed = false;
  const set = (key, value) => { if (current[key] !== value) { if (!changed) { next = { ...current }; changed = true; } next[key] = value; } };
  if ('region' in patch) {
    if (patch.region === null) set('region', null);
    else if (isRegion(patch.region) && !sameRegion(current.region, patch.region)) {
      set('region', { latitude: patch.region.latitude, longitude: patch.region.longitude, latitudeDelta: patch.region.latitudeDelta, longitudeDelta: patch.region.longitudeDelta });
    }
  }
  if ('selectedMarkerKey' in patch) {
    set('selectedMarkerKey', typeof patch.selectedMarkerKey === 'string' && patch.selectedMarkerKey ? patch.selectedMarkerKey : null);
  }
  if ('waypointForm' in patch) {
    const form = patch.waypointForm;
    if (form === null) set('waypointForm', null);
    else if (form && typeof form === 'object' && form.pending && Number.isFinite(form.pending.lat) && Number.isFinite(form.pending.lon)) {
      set('waypointForm', { pending: { ...form.pending }, label: typeof form.label === 'string' ? form.label : '', listId: form.listId ?? null, visible: form.visible !== false });
    }
  }
  return changed ? Object.freeze(next) : current;
}

/** Region to start the next map mount from: the remembered viewport, else the caller's fallback. */
export function restoreRegion(session, fallback) {
  return session && isRegion(session.region) ? session.region : fallback;
}

/** Re-find a remembered selected marker among the current markers (which may have changed meanwhile). */
export function restoreSelectedMarker(session, markers) {
  const key = session?.selectedMarkerKey;
  if (!key || !Array.isArray(markers)) return null;
  return markers.find(marker => marker && marker.mapKey === key) || null;
}

/**
 * Selection restore that tolerates lists still loading at mount. Returns the
 * marker when it can be found now; `waiting` says whether to try again when
 * markers change (true while lists are still loading and the key is unseen).
 */
export function resolvePendingSelection({ key, markers, listsLoading }) {
  if (!key) return { marker: null, waiting: false };
  const marker = Array.isArray(markers) ? markers.find(m => m && m.mapKey === key) || null : null;
  if (marker) return { marker, waiting: false };
  return { marker: null, waiting: listsLoading === true };
}
