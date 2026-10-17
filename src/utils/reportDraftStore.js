import { createReportDraftStorage } from './reportDraftStorage';
import { emptyIncidentState, validateIncidentState, incidentError } from './incident';

/** One ordered writer. Typing coalesces; confirmed actions wait for a native commit. */
export function createReportDraftStore(storage = createReportDraftStorage()) {
  let snapshot = { data:emptyIncidentState(), loading:true, saving:false, locked:false, loadError:null, saveError:null };
  let revision = 0;
  let generation = 0;
  let savedGeneration = 0;
  let loading;
  let writing;
  const listeners = new Set();
  const publish = patch => { snapshot = {...snapshot,...patch}; listeners.forEach(fn => fn()); };
  const deadline = promise => {
    let timer;
    return Promise.race([promise,new Promise((_,reject) => { timer=setTimeout(() => reject(incidentError('STORAGE_TIMEOUT')),5000); })]).finally(() => clearTimeout(timer));
  };
  const pump = () => {
    if (writing || savedGeneration === generation || snapshot.loading || snapshot.loadError || snapshot.locked) return writing;
    publish({saving:true});
    writing = (async () => {
      while (savedGeneration !== generation) {
        const target = generation;
        const value = snapshot.data;
        revision = await storage.save(value,revision);
        savedGeneration = target;
      }
      publish({saveError:null});
    })().catch(error => { publish({saveError:error}); throw error; }).finally(() => { writing=null;publish({saving:false}); });
    // Autosave failures are visible in the store, never unhandled rejections.
    writing.catch(() => {});
    return writing;
  };
  const flush = async () => {
    try {
      const pending = pump();
      if (pending) await deadline(pending);
      if (savedGeneration !== generation || snapshot.loadError) throw snapshot.saveError || snapshot.loadError || incidentError('STORAGE_UNAVAILABLE');
    } catch(error) { if (!snapshot.loadError) publish({saveError:error}); throw error; }
  };
  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    load() {
      if (loading) return loading;
      if (!snapshot.loading && !snapshot.loadError) return Promise.resolve();
      publish({loading:true});
      loading=storage.load().then(result => { revision=result.revision;publish({data:result.data,loading:false,loadError:null}); })
        .catch(error => { publish({loading:false,loadError:error}); })
        .finally(() => { loading=null; });
      return loading;
    },
    change(updater) {
      if (snapshot.loading || snapshot.loadError || snapshot.locked) throw incidentError('STORAGE_UNAVAILABLE');
      const data=validateIncidentState(updater(snapshot.data));
      generation++;
      publish({data,saveError:null});
      pump();
    },
    flush,
    retrySave: flush,
    async commit(updater, options) {
      if (snapshot.locked || snapshot.loading || snapshot.loadError) throw incidentError('STORAGE_UNAVAILABLE');
      // Reserve the writer before yielding: a keystroke or another action may
      // not start a save between flushing and the confirmed transaction.
      const pending=pump();
      publish({locked:true,saving:true});
      const operation=(async()=>{
        if(pending)await pending;
        if(savedGeneration!==generation)throw snapshot.saveError||incidentError('STORAGE_UNAVAILABLE');
        const data=validateIncidentState(updater(snapshot.data));
        revision=await storage.save(data,revision,options);
        generation++;savedGeneration=generation;
        publish({data,saveError:null});
      })().catch(error=>{if(String(error.code||'').startsWith('STORAGE'))publish({saveError:error});throw error;})
        .finally(()=>publish({locked:false,saving:false}));
      operation.catch(()=>{});
      // Never release an in-flight native write at a UI timeout. A frozen JSON
      // backup remains available while it is pending; reopening reloads SQLite.
      try{await deadline(operation);}catch(error){if(error.code==='STORAGE_TIMEOUT')publish({saveError:error});throw error;}
    },
    async recoverPrevious() {
      if (!snapshot.loadError?.canRecover || snapshot.locked) throw incidentError('STORAGE_UNAVAILABLE');
      publish({locked:true});
      try { const result=await storage.recoverPrevious();revision=result.revision;publish({data:result.data,loadError:null,saveError:null}); }
      finally { publish({locked:false}); }
    },
  };
  return store;
}
export const reportDraftStore = createReportDraftStore();
