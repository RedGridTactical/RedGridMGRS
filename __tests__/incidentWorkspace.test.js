jest.mock('react',()=>({...jest.requireActual('react'),...require('./helpers/hookHarness')()}));
jest.mock('react-native',()=>({View:'View',Text:'Text',ScrollView:'ScrollView',FlatList:'FlatList',TouchableOpacity:'TouchableOpacity',StyleSheet:{create:x=>x},Keyboard:{dismiss:jest.fn()},AccessibilityInfo:{announceForAccessibility:jest.fn()},useWindowDimensions:()=>({fontScale:1})}));
jest.mock('@react-native-async-storage/async-storage',()=>({}));
jest.mock('../src/components/FieldInput',()=>({TextInput:'TextInput'}));
jest.mock('../src/utils/typography',()=>({TYPE:{body:{},label:{},heading:{},data:{}}}));
jest.mock('../src/utils/ThemeContext',()=>({useColors:()=>({})}));
jest.mock('../src/hooks/useTranslation',()=>({useTranslation:()=>({t:key=>mockTranslate?mockTranslate(key):key})}));
jest.mock('../src/hooks/useSafeInsets',()=>({useSafeInsets:()=>({bottom:0})}));
jest.mock('../src/hooks/useReportDrafts',()=>({useReportDrafts:()=>mockState}));
jest.mock('../src/utils/fieldAlert',()=>({Alert:{alert:jest.fn()},allowSystemDisplay:jest.fn(async()=>true)}));
jest.mock('../src/utils/haptics',()=>({notifySuccess:jest.fn()}));
jest.mock('expo-file-system',()=>({cacheDirectory:'file:///cache/',EncodingType:{UTF8:'utf8'},writeAsStringAsync:jest.fn(async()=>{})}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(async()=>true),shareAsync:jest.fn(async()=>{})}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-print',()=>({printToFileAsync:jest.fn(async()=>({uri:'file:///cache/ics214.pdf'}))}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn(async()=>true)}));
const React=require('react');const {IncidentWorkspace}=require('../src/components/IncidentWorkspace');
const {incidentFixture,NOW}=require('./helpers/incidentFixture');const {beginIncidentEntry,mapIncidentReference,archiveIncident}=require('../src/utils/incident');const {incidentBackup}=require('../src/utils/incidentExport');
const FS=require('expo-file-system'),Sharing=require('expo-sharing'),Print=require('expo-print');
let mockState,props,mockTranslate;
function nodes(v){if(!v||typeof v!=='object')return[];if(Array.isArray(v))return v.flatMap(nodes);return[v,...nodes(v.props?.children),...nodes(v.props?.ListHeaderComponent),...nodes(v.props?.ListFooterComponent)];}
function render(){return React.__render(()=>IncidentWorkspace(props));}
const action=(tree,key)=>nodes(tree).find(n=>n.props?.label===key&&n.type?.name==='Action');
beforeEach(()=>{
 React.__reset();jest.clearAllMocks();mockTranslate=null;props={isPro:true,location:null,onClose:jest.fn(),onShowProGate:jest.fn()};
 mockState={data:incidentFixture(),loading:false,locked:false,saving:false,loadError:null,saveError:null,store:{flush:jest.fn(async()=>{}),change:jest.fn(fn=>{mockState.data=fn(mockState.data);}),commit:jest.fn(async fn=>{mockState.data=fn(mockState.data);})}};
});
test('Thai operational period uses a localized end label while ICS export stays canonical',()=>{
 const th=require('../src/i18n/th').default;
 mockTranslate=key=>key.split('.').reduce((value,part)=>value?.[part],th)??key;
 const incident=mockState.data.incidents[0];
 const period=nodes(render()).find(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.startsWith(incident.from));
 expect(period.props.children).toContain(`\n${th.incident.to} ${incident.to}`);
 expect(period.props.children).not.toContain('\nto ');
 const output=require('../src/utils/incidentExport').ics214Text(incident,NOW);
 expect(output).toContain('2. OPERATIONAL PERIOD');
 expect(output).toContain('To: 10/17/2026 19:00 UTC-04:00');
 expect(output).not.toContain(th.incident.to);
});
test('expired Pro retains review/export access but cannot create or edit',async()=>{
 props.isPro=false;let tree=render();expect(action(tree,'incident.addActivity').props.disabled).toBe(true);
 action(tree,'incident.review').props.onPress();tree=render();
 const check=nodes(tree).find(n=>n.props?.accessibilityRole==='checkbox');check.props.onPress();tree=render();
 expect(action(tree,'incident.exportPdf').props.disabled).toBe(false);await action(tree,'incident.exportPdf').props.onPress();
 expect(Print.printToFileAsync).toHaveBeenCalled();expect(Sharing.shareAsync).toHaveBeenCalled();
});
test('unfinished edits remain available for read/export after Pro expires, including save failure',async()=>{
 mockState.data=beginIncidentEntry(mockState.data,{now:NOW});mockState.data.editor.text='UNFINISHED RESCUE';
 props.isPro=false;render();React.__effects();let tree=render();
 expect(action(tree,'incident.keepActivity').props.disabled).toBe(true);
 mockState.saveError={code:'STORAGE_UNAVAILABLE'};mockState.store.flush.mockRejectedValue(Error('disk full'));
 await action(tree,'incident.backup').props.onPress();
 const raw=FS.writeAsStringAsync.mock.calls[0][1];expect(JSON.parse(raw).editor.text).toBe('UNFINISHED RESCUE');expect(mockState.store.flush).not.toHaveBeenCalled();
});
test('entitlement is rechecked after a slow flush before a Keep commits',async()=>{
 mockState.data=beginIncidentEntry(mockState.data,{now:NOW});mockState.data.editor.text='WAITING';render();React.__effects();
 let apply;mockState.store.commit.mockImplementation(fn=>new Promise(resolve=>{apply=()=>{try{fn(mockState.data);}catch(e){expect(e.code).toBe('PRO_REQUIRED');}resolve();};}));
 const keeping=action(render(),'incident.keepActivity').props.onPress();props.isPro=false;render();apply();await keeping;
 expect(mockState.data.editor.text).toBe('WAITING');expect(mockState.data.incidents[0].activities).toHaveLength(1);
});
test('changing a kept record invalidates its reviewed revision',()=>{
 action(render(),'incident.review').props.onPress();let tree=render();nodes(tree).find(n=>n.props?.accessibilityRole==='checkbox').props.onPress();
 expect(action(render(),'incident.exportPdf').props.disabled).toBe(false);
 mockState.data={...mockState.data,incidents:mockState.data.incidents.map(i=>({...i,revision:i.revision+1}))};
 expect(action(render(),'incident.exportPdf').props.disabled).toBe(true);
});
test('all app languages have the complete incident UI and identical placeholders',()=>{
 const base=require('../src/i18n/en').default.incident;
 for(const code of ['fr','de','es','it','pt-BR','nl','ru','pl','tr','ja','ko','zh-Hans','zh-Hant','ar-SA','hi']){
  const locale=require(`../src/i18n/${code}`).default.incident;expect(Object.keys(locale).sort()).toEqual(Object.keys(base).sort());
  for(const key of Object.keys(base))expect((locale[key].match(/\{\{?\w+\}?\}/g)||[]).sort()).toEqual((base[key].match(/\{\{?\w+\}?\}/g)||[]).sort());
 }
});

test('a stalled native commit does not disable the frozen backup rescue path',async()=>{
 mockState.data=beginIncidentEntry(mockState.data,{now:NOW});mockState.data.editor.text='PENDING NATIVE COMMIT';render();React.__effects();mockState.locked=true;
 const backup=action(render(),'incident.backup');expect(backup.props.disabled).toBe(false);await backup.props.onPress();
 expect(JSON.parse(FS.writeAsStringAsync.mock.calls[0][1]).editor.text).toBe('PENDING NATIVE COMMIT');
});

const alertText=tree=>nodes(tree).find(n=>n.props?.accessibilityRole==='alert'&&n.props?.style?.length===2)?.props.children;
test('a map reference parked while choosing an incident survives selection and is consumed by Add Activity',async()=>{
 mockState.data={...mockState.data,activeId:null};const reference=mapIncidentReference({lat:38.9,lon:-77},Date.now());
 props.request={id:'req-list',reference};props.onRequestHandled=jest.fn();render();React.__effects();
 expect(mockState.data.editor).toBeNull();expect(mockState.data.pendingLocation).toEqual(reference);expect(props.onRequestHandled).toHaveBeenCalled();
 let tree=render();expect(action(tree,'incident.open')).toBeTruthy();expect(alertText(tree)).toBeUndefined();
 await action(tree,'incident.open').props.onPress();
 expect(mockState.data.activeId).toBe(mockState.data.incidents[0].id);expect(mockState.data.pendingLocation).toEqual(reference);
 tree=render();action(tree,'incident.addActivity').props.onPress();
 expect(mockState.data.editor.type).toBe('entry');expect(mockState.data.editor.location).toEqual(reference);expect(mockState.data.pendingLocation).toBeNull();
});
test('a map reference against an archived active incident is parked and never opens or overwrites an editor',()=>{
 const id=mockState.data.activeId;mockState.data={...archiveIncident(mockState.data,id,true,NOW),activeId:id};
 const reference=mapIncidentReference({lat:38.9,lon:-77},Date.now());props.request={id:'req-archived',reference};render();React.__effects();
 expect(mockState.data.editor).toBeNull();expect(mockState.data.pendingLocation).toEqual(reference);
 const tree=render();expect(action(tree,'incident.open')).toBeTruthy();expect(alertText(tree)).toBeUndefined();
 const live={...mockState.data,activeId:id,incidents:mockState.data.incidents.map(i=>({...i,archived:false}))};
 mockState.data={...beginIncidentEntry(live,{location:null,now:NOW}),activeId:null};mockState.data.editor.text='KEEP ME';props.request={id:'req-while-editing',reference};render();React.__effects();
 expect(mockState.data.editor.text).toBe('KEEP ME');expect(mockState.data.editor.location).toBeNull();
});
test('a storage timeout banner clears when the native save really settles, while validation errors stay',async()=>{
 mockState.data=beginIncidentEntry(mockState.data,{now:NOW});mockState.data.editor.text='SLOW';render();React.__effects();
 mockState.store.commit.mockRejectedValueOnce(Object.assign(Error('STORAGE_TIMEOUT'),{code:'STORAGE_TIMEOUT'}));mockState.saveError={code:'STORAGE_TIMEOUT'};mockState.locked=true;
 await action(render(),'incident.keepActivity').props.onPress();
 render();React.__effects();expect(alertText(render())).toBe('incident.errorSTORAGE_TIMEOUT');
 mockState.saveError=null;mockState.locked=false;render();React.__effects();expect(alertText(render())).toBeUndefined();
 mockState.store.commit.mockRejectedValueOnce(Object.assign(Error('INVALID_EVENT_TIME'),{code:'INVALID_EVENT_TIME'}));
 await action(render(),'incident.keepActivity').props.onPress();render();React.__effects();expect(alertText(render())).toBe('incident.errorINVALID_EVENT_TIME');
});
test('an in-progress native save outranks a timeout banner in the status line but not a real failure',()=>{
 const {ReportSaveStatus}=require('../src/components/IncidentWorkspace');const first=tree=>nodes(tree).find(n=>n.type==='Text')?.props.children;
 mockState.saving=true;mockState.locked=true;mockState.saveError={code:'STORAGE_TIMEOUT'};
 expect(first(React.__render(()=>ReportSaveStatus({state:mockState})))).toBe('incident.saving');
 mockState.saveError={code:'STORAGE_CONFLICT'};React.__reset();
 expect(first(React.__render(()=>ReportSaveStatus({state:mockState})))).toBe('incident.saveFailed');
});
test('an import that overflows local capacity explains import capacity while Pro loss still shows the Pro message',async()=>{
 const Picker=require('expo-document-picker');const raw=incidentBackup(mockState.data.incidents[0],NOW);
 Picker.getDocumentAsync.mockResolvedValue({canceled:false,assets:[{uri:'file:///cache/b.json'}]});FS.getInfoAsync=jest.fn(async()=>({exists:true,size:raw.length}));FS.readAsStringAsync=jest.fn(async()=>raw);
 const {Alert}=require('../src/utils/fieldAlert');mockState.data={...mockState.data,activeId:null};
 await action(render(),'incident.importBackup').props.onPress();const confirm=Alert.alert.mock.calls.at(-1)[2][1];
 mockState.store.commit.mockRejectedValueOnce(Object.assign(Error('RECORD_LIMIT'),{code:'RECORD_LIMIT'}));await confirm.onPress();
 expect(alertText(render())).toBe('incident.importCapacity');
 mockState.store.commit.mockRejectedValueOnce(Object.assign(Error('PRO_REQUIRED'),{code:'PRO_REQUIRED'}));await confirm.onPress();
 expect(alertText(render())).toBe('incident.proReadOnly');expect(mockState.data.incidents).toHaveLength(1);
});
