import { useCallback } from 'react';
import { useDurableFieldState } from './useDurableFieldState';
import { loadWaypointLists, saveWaypointLists } from '../utils/storage';
import { newFieldId, normalizeWaypointLists } from '../utils/waypoints';
import { fieldDataError } from '../utils/durableStorage';
const empty = () => [];

export function useWaypointLists() {
  const { value: lists, mutate, ...status } = useDurableFieldState(empty, loadWaypointLists, saveWaypointLists);
  const saveList = useCallback(async list => {
    const id = list.id || newFieldId();
    const now = Date.now();
    const next = await mutate(current => {
      if (current.some(item => item.id === id)) throw fieldDataError('DUPLICATE_ID', 'A route already uses this ID');
      return normalizeWaypointLists([...current, { ...list, id, createdAt: list.createdAt || now, updatedAt: now }]);
    });
    return next.find(item => item.id === id);
  }, [mutate]);
  const updateList = useCallback(async (id, updater) => {
    const next = await mutate(current => {
      if (!current.some(item => item.id === id)) throw fieldDataError('LIST_MISSING', 'Saved route no longer exists');
      return normalizeWaypointLists(current.map(item => item.id === id
        ? { ...(typeof updater === 'function' ? updater(JSON.parse(JSON.stringify(item))) : { ...item, ...updater }), id, createdAt: item.createdAt, updatedAt: Date.now() } : item));
    });
    return next.find(item => item.id === id);
  }, [mutate]);
  const deleteList = useCallback(id => mutate(current => current.filter(item => item.id !== id)), [mutate]);
  return { lists, ...status, saveList, updateList, deleteList };
}
