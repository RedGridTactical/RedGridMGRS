import { useCallback, useEffect, useRef, useState } from 'react';
import { fieldDataError } from '../utils/durableStorage';

/** Commit UI state only after storage acknowledges it; retain a failed candidate for Retry. */
export function useDurableFieldState(empty, load, save) {
  const [value, setValue] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const current = useRef(value);
  const ready = useRef(false);
  const pending = useRef(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const updates = useRef(Promise.resolve());

  const retryLoad = useCallback(async () => {
    if (busy.current || pending.current !== null) throw fieldDataError('SAVE_PENDING', 'Retry the pending save first');
    const revision = ++generation.current;
    ready.current = false;
    if (mounted.current) { setLoading(true); setLoadError(null); }
    try {
      const stored = await load();
      if (!mounted.current || revision !== generation.current) return;
      current.current = stored;
      ready.current = true;
      setValue(stored); setLoadError(null);
    } catch (error) {
      if (mounted.current && revision === generation.current) setLoadError(error);
      throw error;
    } finally {
      if (mounted.current && revision === generation.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    retryLoad().catch(() => {});
    return () => { mounted.current = false; generation.current += 1; ready.current = false; };
  }, [retryLoad]);

  const commit = useCallback(async next => {
    pending.current = next;
    busy.current = true;
    if (mounted.current) { setIsSaving(true); setSaveError(null); }
    try {
      await save(next);
      current.current = next;
      pending.current = null;
      if (mounted.current) { setValue(next); setSaveError(null); }
      return next;
    } catch (error) {
      if (mounted.current) setSaveError(error);
      throw error;
    } finally {
      busy.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }, [save]);

  const mutate = useCallback(updater => {
    const result = updates.current.then(async () => {
      if (!ready.current) throw fieldDataError('STORAGE_NOT_LOADED', 'Read saved field data before changing it');
      if (pending.current !== null) throw fieldDataError('SAVE_PENDING', 'Retry the pending save before another change');
      const next = updater(current.current);
      if (next === current.current) return current.current;
      return commit(next);
    });
    updates.current = result.catch(() => {});
    return result;
  }, [commit]);

  const retrySave = useCallback(() => {
    const result = updates.current.then(() => {
      if (pending.current === null) return current.current;
      return commit(pending.current);
    });
    updates.current = result.catch(() => {});
    return result;
  }, [commit]);

  return { value, loading, loaded: ready.current, loadError, saveError, isSaving, retryLoad, retrySave, mutate };
}
