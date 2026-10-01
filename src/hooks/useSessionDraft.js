import { useCallback, useRef, useSyncExternalStore } from 'react';
import { sessionDrafts } from '../utils/sessionDrafts';

/** A field survives tool/tab unmounts without leaving hidden tools mounted. */
export function useSessionDraft(key, initialValue) {
  const initial = useRef(initialValue);
  const subscribe = useCallback(listener => sessionDrafts.subscribe(key, listener), [key]);
  const snapshot = useCallback(() => sessionDrafts.read(key, initial.current), [key]);
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const setValue = useCallback(next => sessionDrafts.write(key, next, initial.current), [key]);
  return [value, setValue];
}
