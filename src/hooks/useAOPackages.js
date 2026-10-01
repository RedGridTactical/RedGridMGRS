/**
 * useAOPackages — saved Area-of-Operations packages for v3.4 Mission Preflight.
 *
 * Responsibilities:
 *   - Load saved AO packages from AsyncStorage on mount.
 *   - Add / refresh / delete only after durable storage acknowledgment.
 *   - Enforce the free-tier cap (1 AO package). Pro-tier is unlimited.
 *
 * Storage is local-only; nothing about an AO ever leaves the device.
 */
import { useCallback } from 'react';
import { useDurableFieldState } from './useDurableFieldState';
import { loadAOPackages, saveAOPackages } from '../utils/storage';
import { estimateTilesForRegion } from '../utils/tileManager';

// Free-tier AO package cap. Pro = unlimited.
export const FREE_AO_LIMIT = 1;

// Default zoom set used when the user saves an AO. Mirrors the tile-download
// dialog so the preflight estimate matches what gets fetched.
export const DEFAULT_AO_ZOOMS = [10, 12, 14, 16];

function newAOId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isValidRegion(region) {
  return !!region &&
    Number.isFinite(region.latitude) &&
    Number.isFinite(region.longitude) &&
    Number.isFinite(region.latitudeDelta) &&
    Number.isFinite(region.longitudeDelta) &&
    region.latitudeDelta > 0 &&
    region.longitudeDelta > 0 && region.longitudeDelta <= 360 &&
    region.latitudeDelta <= 180 && Math.abs(region.latitude) <= 90 && Math.abs(region.longitude) <= 180;
}

function safeZooms(zoomLevels) {
  const zooms = Array.isArray(zoomLevels)
    ? zoomLevels.filter(z => Number.isInteger(z) && z >= 0 && z <= 19)
    : [];
  return zooms.length > 0 ? [...new Set(zooms)].sort((a, b) => a - b) : DEFAULT_AO_ZOOMS;
}

const emptyPackages = () => [];
export function useAOPackages() {
  const { value: aoPackages, mutate, loading: isLoading, ...status } = useDurableFieldState(emptyPackages, loadAOPackages, saveAOPackages);

  /**
   * Add a new AO package built from the current map viewport.
   *
   * @param {object} params
   * @param {string} params.name — user-supplied label
   * @param {string} params.mapStyle — 'standard' | 'dark' | 'topo'
   * @param {object} params.region — { latitude, longitude, latitudeDelta, longitudeDelta }
   * @param {number[]} [params.zoomLevels] — override defaults
   * @returns {object|null} the new package, or null if invalid input
   */
  const addAOPackage = useCallback(async ({ name, mapStyle, region, zoomLevels }) => {
    if (!isValidRegion(region)) return null;
    const safeName = (name && String(name).trim()) || 'Unnamed AO';
    const safeStyle = ['standard', 'dark', 'topo'].includes(mapStyle) ? mapStyle : 'standard';
    const zooms = safeZooms(zoomLevels);
    const { totalTiles, estimatedBytes } = estimateTilesForRegion(region, zooms);

    const newPkg = {
      id: newAOId(),
      name: safeName,
      mapStyle: safeStyle,
      region: {
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      },
      zoomLevels: zooms,
      tileCount: totalTiles,
      estimatedBytes,
      lastRefreshed: null,
      createdAt: new Date().toISOString(),
    };

    await mutate(current => [...current, newPkg]);
    return newPkg;
  }, [mutate]);

  const deleteAOPackage = useCallback(async (id) => {
    if (!id) return;
    await mutate(current => current.filter(p => p.id !== id));
  }, [mutate]);

  /**
   * Mark an AO as refreshed RIGHT NOW. The caller is responsible for triggering
   * the actual tile download via `downloadTilesForRegion` — this hook only
   * tracks the bookkeeping.
   */
  const markAOPackageRefreshed = useCallback(async (id) => {
    if (!id) return;
    await mutate(current => current.map(p => (
      p.id === id ? { ...p, lastRefreshed: new Date().toISOString() } : p
    )));
  }, [mutate]);

  /**
   * Free-tier predicate. UI callers should check this before letting a free
   * user save a NEW AO; existing AOs are unaffected.
   */
  const canSaveMore = useCallback((isPro) => {
    if (isPro) return true;
    return aoPackages.length < FREE_AO_LIMIT;
  }, [aoPackages.length]);

  return {
    aoPackages,
    isLoading,
    ...status,
    addAOPackage,
    deleteAOPackage,
    markAOPackageRefreshed,
    canSaveMore,
  };
}
