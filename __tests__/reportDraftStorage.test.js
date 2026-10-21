jest.mock('expo-sqlite',()=>({openDatabaseAsync:jest.fn()}));
jest.mock('@react-native-async-storage/async-storage',()=>({}));
const {DatabaseSync}=require('node:sqlite');
const fs=require('fs'),os=require('os'),path=require('path');
const {createReportDraftStorage}=require('../src/utils/reportDraftStorage');
const {createReportDraftStore}=require('../src/utils/reportDraftStore');
const {beginIncidentEntry,deleteArchivedIncident,archiveIncident}=require('../src/utils/incident');
const {incidentFixture,NOW}=require('./helpers/incidentFixture');
let directory,connections;
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'redgrid-report-test-'));connections=[];});
afterEach(()=>{connections.forEach(db=>db.close());fs.rmSync(directory,{recursive:true,force:true});jest.useRealTimers();});
function adapter({fail}={}) {
  const db=new DatabaseSync(path.join(directory,'reports.db'));connections.push(db);
  const api={
    execAsync:async sql=>db.exec(sql),
    getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args),
    getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args),
    runAsync:async(sql,...args)=>{if(fail?.(sql,args))throw Error('Injected disk error');return db.prepare(sql).run(...args);},
    withExclusiveTransactionAsync:async fn=>{db.exec('BEGIN IMMEDIATE');try{await fn(api);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  };
  return {api,db};
}
const settle=async()=>{for(let n=0;n<15;n++)await Promise.resolve();};
test('real SQLite reopen recovers kept activities, worksheet values and unfinished editor text',async()=>{
  const a=adapter(),storage=createReportDraftStorage(async()=>a.api);await storage.load();
  let state=incidentFixture();state=beginIncidentEntry(state,{now:NOW});state.editor.text='UNFINISHED DRAFT SURVIVES RESTART';
  state.worksheets.spot={values:{what:'Independent report draft'},sources:{}};
  await storage.save(state,0);
  const b=adapter(),reopened=await createReportDraftStorage(async()=>b.api).load();
  expect(reopened.data).toEqual(state);expect(reopened.revision).toBe(1);
  expect(b.db.prepare('PRAGMA synchronous').get().synchronous).toBe(2);
});
test('a transaction failure never commits half a new incident or clears its unfinished editor',async()=>{
  let failures=false;const a=adapter({fail:(sql,args)=>failures&&sql.startsWith('INSERT')&&args[0].startsWith('incident:')});
  const storage=createReportDraftStorage(async()=>a.api);await storage.load();const before=incidentFixture();await storage.save(before,0);
  const next={...before,editor:{type:'details',incidentId:null,value:{name:'Unfinished',number:'',from:'',to:'',resource:'',person:'',position:'',agency:'',preparer:'',preparerPosition:'',resources:[]}}};
  // Change editor and incident in the same batch; fail after the editor write.
  next.incidents=before.incidents.map(i=>({...i,name:'Changed name',revision:i.revision+1}));failures=true;
  await expect(storage.save(next,1)).rejects.toThrow('Injected disk error');
  expect((await storage.load()).data).toEqual(before);
});
test('corrupted current JSON cannot be replaced by defaults; explicit recovery retains the unreadable original',async()=>{
  const a=adapter(),storage=createReportDraftStorage(async()=>a.api);await storage.load();
  let state=beginIncidentEntry(incidentFixture(),{now:NOW});state.editor.text='First local copy';await storage.save(state,0);
  state={...state,editor:{...state.editor,text:'Second local copy'}};await storage.save(state,1);
  a.db.prepare("UPDATE report_records SET payload='broken' WHERE key='editor'").run();
  await expect(storage.load()).rejects.toMatchObject({code:'STORAGE_CORRUPT',canRecover:true});
  await expect(storage.save(state,2)).rejects.toMatchObject({code:'STORAGE_CORRUPT'});
  const recovered=await storage.recoverPrevious();expect(recovered.data.editor.text).toBe('First local copy');
  expect(a.db.prepare('SELECT payload FROM report_quarantine').get().payload).toBe('broken');
});
test('unknown schema and concurrent writers fail without resetting data',async()=>{
  const a=adapter(),storage=createReportDraftStorage(async()=>a.api);await storage.load();const state=incidentFixture();await storage.save(state,0);
  await expect(storage.save(state,0)).rejects.toMatchObject({code:'STORAGE_CONFLICT'});
  a.db.exec('PRAGMA user_version=2');const b=adapter();
  await expect(createReportDraftStorage(async()=>b.api).load()).rejects.toMatchObject({code:'UNSUPPORTED_SCHEMA'});
  expect(a.db.prepare('SELECT COUNT(*) AS count FROM report_records').get().count).toBeGreaterThan(0);
});
test('missing rows are not implicit deletions; a confirmed archived delete removes its saved copies',async()=>{
  const a=adapter(),storage=createReportDraftStorage(async()=>a.api);await storage.load();let state=incidentFixture();const id=state.activeId;await storage.save(state,0);
  state=archiveIncident(state,id,true,NOW);await storage.save(state,1);const next=deleteArchivedIncident(state,id);
  await expect(storage.save(next,2)).rejects.toThrow('INVALID_RECORD');
  await storage.save(next,2,{removedIncidentIds:[id]});expect((await storage.load()).data.incidents).toHaveLength(0);
});
test('coalesced typing cannot overtake a slow native write or report Saved early',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});let writes=0;
  const storage={load:async()=>({data:incidentFixture(),revision:0}),save:jest.fn(async(_data,revision)=>{if(writes++===0)await pending;return revision+1;})};
  const store=createReportDraftStore(storage);await store.load();
  store.change(data=>({...data,pendingLocation:null,worksheets:{spot:{values:{what:'A'},sources:{}}}}));
  store.change(data=>({...data,worksheets:{spot:{values:{what:'B'},sources:{}}}}));
  expect(store.getSnapshot().saving).toBe(true);expect(storage.save).toHaveBeenCalledTimes(1);
  release();await store.flush();expect(storage.save.mock.calls.at(-1)[0].worksheets.spot.values.what).toBe('B');expect(store.getSnapshot().saving).toBe(false);
});
test('a UI timeout retains the transaction lock until the real native operation settles',async()=>{
  jest.useFakeTimers();let release;const pending=new Promise(resolve=>{release=resolve;});
  const storage={load:async()=>({data:incidentFixture(),revision:0}),save:jest.fn(()=>pending)};
  const store=createReportDraftStore(storage);await store.load();
  const commit=store.commit(data=>({...data,activeId:null}));await settle();
  const rejection=expect(commit).rejects.toMatchObject({code:'STORAGE_TIMEOUT'});jest.advanceTimersByTime(5001);await rejection;
  expect(store.getSnapshot().locked).toBe(true);expect(()=>store.change(data=>data)).toThrow('STORAGE_UNAVAILABLE');
  release(1);await settle();expect(store.getSnapshot().locked).toBe(false);expect(store.getSnapshot().data.activeId).toBeNull();
});
test('hydration failure disables writes rather than saving an empty collection',async()=>{
  const storage={load:async()=>{throw Error('disk unavailable');},save:jest.fn()};const store=createReportDraftStore(storage);await store.load();
  expect(()=>store.change(data=>data)).toThrow('STORAGE_UNAVAILABLE');expect(storage.save).not.toHaveBeenCalled();
});
test('a confirmed action reserves the writer while earlier typing is still being saved',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});let writes=0;
  const storage={load:async()=>({data:incidentFixture(),revision:0}),save:jest.fn(async(_data,revision)=>{if(writes++===0)await pending;return revision+1;})};
  const store=createReportDraftStore(storage);await store.load();
  store.change(data=>({...data,worksheets:{spot:{values:{what:'Last typed observation'},sources:{}}}}));
  const commit=store.commit(data=>({...data,activeId:null}));
  expect(store.getSnapshot().locked).toBe(true);expect(()=>store.change(data=>data)).toThrow('STORAGE_UNAVAILABLE');
  release();await commit;
  expect(storage.save.mock.calls[1][1]).toBe(1);expect(store.getSnapshot().data.worksheets.spot.values.what).toBe('Last typed observation');
});
