jest.mock('@react-native-async-storage/async-storage',()=>({}));
import { parseIncidentTime, beginIncidentEntry, beginIncidentDetails, keepIncidentEditor, validateIncidentState,
  deviceIncidentReference, mapIncidentReference, manualIncidentReference, orderedActivities, archiveIncident, deleteArchivedIncident } from '../src/utils/incident';
import { incidentBackup, readIncidentBackup, importIncidentCopy, ics214HTML, ics214Text } from '../src/utils/incidentExport';
import { incidentFixture, NOW } from './helpers/incidentFixture';

test.each(['2026-02-30 12:00 -04:00','2026-01-01 24:00 +00:00','2026-01-01 12:60 +00:00','2026-01-01 12:00 +14:01','2026-01-01 12:00','1900-02-29 12:00 +00:00','2026-00-01 12:00 +00:00'])('rejects impossible/ambiguous event time %s',value=>expect(parseIncidentTime(value)).toBeNull());
test('offsets, leap days and fall-back repeated local times retain their distinct instants',()=>{
  expect(parseIncidentTime('2028-02-29 12:00 +05:30')).toBe(Date.UTC(2028,1,29,6,30));
  expect(parseIncidentTime('2026-11-01 01:30 -05:00')-parseIncidentTime('2026-11-01 01:30 -04:00')).toBe(3600000);
});
test('an unfinished draft preserves independent event time and source; correction keeps original values',()=>{
  let state=incidentFixture();const incident=state.incidents[0];const original=incident.activities[0];
  state=beginIncidentEntry(state,{correctingId:original.id,now:NOW+2000});
  state.editor.text='Synthetic correction: access blocked.';
  expect(()=>keepIncidentEditor(state,NOW+3000)).toThrow('CORRECTION_REASON_REQUIRED');
  state.editor.reason='Added the observed obstruction.';
  state=keepIncidentEditor(state,NOW+3000);
  expect(state.incidents[0].activities[0].enteredAt).toBe(original.enteredAt);
  expect(state.incidents[0].activities[0].revisions[0].previous.text).toBe(original.text);
  expect(state.incidents[0].activities[0].revisions[0].correctedAt).toBe(new Date(NOW+3000).toISOString());
});
test('incident metadata changes cannot omit activities',()=>{
  let state=incidentFixture();state=beginIncidentDetails(state,state.activeId);
  state.editor.value.from='2026-10-17 09:00 -04:00';expect(()=>keepIncidentEditor(state)).toThrow('PERIOD_EXCLUDES_ACTIVITY');
  state.editor.value.from='1900-01-01 09:00 +00:00';state.editor.value.to='invalid';expect(()=>keepIncidentEditor(state)).toThrow('INVALID_PERIOD');
});
test('device references require a fresh fix; map/manual selections never invent measured accuracy',()=>{
  const fix={lat:38.9,lon:-77,timestamp:NOW-1000,accuracy:6,source:'external'};
  expect(deviceIncidentReference(fix,NOW).fixTimestamp).toBe(NOW-1000);
  expect(deviceIncidentReference({...fix,timestamp:NOW-60000},NOW)).toBeNull();
  expect(mapIncidentReference(fix,NOW)).toMatchObject({kind:'map',accuracyM:null,fixTimestamp:null});
  expect(manualIncidentReference('18S UJ 23531 06490',NOW)).toMatchObject({kind:'manual',accuracyM:null,fixTimestamp:null});
  expect(manualIncidentReference('not a grid',NOW)).toBeNull();
});
test('unsigned exports include all eight blocks and an annex, escape untrusted markup and do not load resources',()=>{
  const state=incidentFixture();const incident=state.incidents[0];incident.activities[0].text='<img src="https://invalid.example/track"> & training 한글';
  const text=ics214Text(incident,NOW),html=ics214HTML(incident,NOW);
  for(const label of ['1. INCIDENT NAME','2. OPERATIONAL PERIOD','3. NAME / RESOURCE DESIGNATOR','4. ICS POSITION','5. HOME AGENCY','6. RESOURCES ASSIGNED','7. ACTIVITY LOG','8. PREPARED BY'])expect(text).toContain(label);
  expect(text).toContain('DRAFT — UNSIGNED');expect(text).toContain('Signature: ____________________');
  expect(html).toContain('&lt;img src=');expect(html).not.toContain('<img');expect(html).toContain("default-src 'none'");
  expect(text).toContain('not the preparer signing time');expect(text).toContain('Entered:');expect(html).toContain('한글');
});
test('backup preserves correction history and import adds a separate copy, with exact-repeat deduplication',()=>{
  const state=incidentFixture(),raw=incidentBackup(state.incidents[0],NOW),parsed=readIncidentBackup(raw);
  const imported=importIncidentCopy(state,parsed,NOW+1000);
  expect(imported.incidents).toHaveLength(2);expect(imported.incidents[0]).toBe(state.incidents[0]);
  expect(imported.incidents[1].id).not.toBe(state.incidents[0].id);
  expect(imported.incidents[1].activities).toEqual(state.incidents[0].activities);
  expect(importIncidentCopy(imported,parsed,NOW+2000).incidents).toHaveLength(2);
  expect(()=>readIncidentBackup('{"schema":"redgrid.design-preview.incident.v0"}')).toThrow('UNSUPPORTED_SCHEMA');
});
test('archives are retained for reading/export; deletion is restricted to archived records',()=>{
  let state=incidentFixture();expect(()=>deleteArchivedIncident(state,state.activeId)).toThrow('INVALID_RECORD');
  const id=state.activeId;state=archiveIncident(state,id,true,NOW);expect(state.incidents).toHaveLength(1);
  expect(ics214Text(state.incidents[0],NOW)).toContain('SYNTHETIC INCIDENT QA');
  state={...state,activeId:id};expect(()=>beginIncidentEntry(state)).toThrow('NO_ACTIVE_INCIDENT');
  expect(deleteArchivedIncident(state,id).incidents).toHaveLength(0);
});
test('unfinished editors and imported records are validated rather than silently truncated',()=>{
  let state=incidentFixture();state=beginIncidentEntry(state,{now:NOW});state.editor.text='Incomplete but durable';
  expect(validateIncidentState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  state.editor.text='x'.repeat(2001);expect(()=>validateIncidentState(state)).toThrow('INVALID_RECORD');
});
test('activities sort by observed time, not insertion order',()=>{
  let state=incidentFixture();state=beginIncidentEntry(state,{now:NOW});state.editor.time='2026-10-17 07:30 -04:00';state.editor.text='Entered late';state=keepIncidentEditor(state,NOW+1000);
  expect(orderedActivities(state.incidents[0])[0].text).toBe('Entered late');
});
test('unfinished new details and activity corrections survive a portable backup',()=>{
  let fresh=beginIncidentDetails({version:1,activeId:null,pendingLocation:null,incidents:[],editor:null,worksheets:{}});
  fresh.editor.value.name='UNFINISHED ONLY';
  let parsed=readIncidentBackup(incidentBackup(null,NOW,fresh.editor));
  let imported=importIncidentCopy({version:1,activeId:null,pendingLocation:null,incidents:[],editor:null,worksheets:{}},parsed,NOW);
  expect(imported.editor.value.name).toBe('UNFINISHED ONLY');expect(imported.incidents).toHaveLength(0);
  let state=incidentFixture();state=beginIncidentEntry(state,{correctingId:state.incidents[0].activities[0].id,now:NOW});state.editor.text='Unkept correction';
  parsed=readIncidentBackup(incidentBackup(state.incidents[0],NOW,state.editor));
  imported=importIncidentCopy({...state,editor:null},parsed,NOW);
  expect(imported.editor.incidentId).toBe(imported.activeId);expect(imported.editor.text).toBe('Unkept correction');
  expect(imported.incidents[1].activities[0].text).not.toBe('Unkept correction');
});
test('an old pending map selection cannot attach itself to a later log entry',()=>{
  const state=incidentFixture();state.pendingLocation=mapIncidentReference({lat:38.9,lon:-77},NOW-31*60000);
  expect(beginIncidentEntry(state,{now:NOW}).editor.location).toBeNull();
  expect(beginIncidentEntry(state,{location:state.pendingLocation,now:NOW}).editor.location).toEqual(state.pendingLocation);
});
test('oversized printable reports fail explicitly while the full backup remains available',()=>{
  const state=incidentFixture(),incident=state.incidents[0];const original=incident.activities[0];
  incident.activities=Array.from({length:301},(_,i)=>({...original,id:`qa-${i}`}));
  expect(()=>ics214HTML(incident,NOW)).toThrow('PDF_LIMIT');
  expect(readIncidentBackup(incidentBackup(incident,NOW)).incident.activities).toHaveLength(301);
});
test('a parked map reference survives an imported copy and selection until an entry consumes it, and still expires after 30 minutes',()=>{
  const state={...incidentFixture(),pendingLocation:mapIncidentReference({lat:38.9,lon:-77},NOW)};
  const parsed=readIncidentBackup(incidentBackup(state.incidents[0],NOW));
  const imported=importIncidentCopy(state,parsed,NOW+1000);expect(imported.pendingLocation).toEqual(state.pendingLocation);
  expect(importIncidentCopy(imported,parsed,NOW+2000).pendingLocation).toEqual(state.pendingLocation);
  const entered=beginIncidentEntry(imported,{now:NOW+5*60000});expect(entered.editor.location).toEqual(state.pendingLocation);expect(entered.pendingLocation).toBeNull();
  expect(beginIncidentEntry(imported,{now:NOW+31*60000}).editor.location).toBeNull();
});
