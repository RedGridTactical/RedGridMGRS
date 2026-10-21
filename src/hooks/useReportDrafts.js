import { useEffect, useSyncExternalStore } from 'react';
import { reportDraftStore } from '../utils/reportDraftStore';

export function useReportDrafts() {
  const state = useSyncExternalStore(reportDraftStore.subscribe,reportDraftStore.getSnapshot,reportDraftStore.getSnapshot);
  useEffect(() => { reportDraftStore.load(); }, []);
  return { ...state, store:reportDraftStore };
}
