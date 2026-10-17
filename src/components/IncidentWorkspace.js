import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Keyboard, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { TextInput } from './FieldInput';
import { useColors } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';
import { useTranslation } from '../hooks/useTranslation';
import { useSafeInsets } from '../hooks/useSafeInsets';
import { useReportDrafts } from '../hooks/useReportDrafts';
import { Alert, allowSystemDisplay } from '../utils/fieldAlert';
import { copyTextToClipboard } from '../utils/clipboard';
import { notifySuccess } from '../utils/haptics';
import { setReviewBlocker } from '../utils/reviewPresentation';
import { activeIncident, orderedActivities, beginIncidentDetails, beginIncidentEntry, keepIncidentEditor,
  archiveIncident, deleteArchivedIncident, deviceIncidentReference, localIncidentTime, INCIDENT_LIMITS, incidentError } from '../utils/incident';
import { incidentBackup, readIncidentBackup, importIncidentCopy, ics214Text, ics214HTML } from '../utils/incidentExport';

let FileSystem, Sharing, Picker, Print;
try { FileSystem=require('expo-file-system'); Sharing=require('expo-sharing'); Picker=require('expo-document-picker'); Print=require('expo-print'); } catch {}
const stamp = ms => new Date(ms).toISOString();

function Action({ label, onPress, disabled=false, quiet=false, colors, ...rest }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{disabled}}
    accessibilityLabel={label} style={[styles.action,{borderColor:colors.border,backgroundColor:quiet ? colors.bg : colors.card2,opacity:disabled ? .45 : 1}]} {...rest}>
    <Text style={[styles.actionText,{color:colors.text}]}>{label}</Text>
  </TouchableOpacity>;
}
function Field({ label, value, onChange, colors, hint, multiline=false, editable=true, maxLength=160, numeric=false }) {
  return <View style={styles.field}><Text style={[styles.label,{color:colors.text2}]}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} maxLength={maxLength}
      multiline={multiline} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} autoCapitalize="sentences"
      returnKeyType={multiline ? 'default' : 'done'} onSubmitEditing={multiline ? undefined : Keyboard.dismiss}
      style={[styles.input,{color:colors.text,backgroundColor:colors.card2,borderColor:colors.border},multiline&&styles.multiline]} />
    {!!hint&&<Text style={[styles.note,{color:colors.text3}]}>{hint}</Text>}</View>;
}
export function ReportSaveStatus({ state }) {
  const colors=useColors();const {t}=useTranslation();
  const {loading,saving,locked,loadError,saveError,store}=state;
  const recover=()=>Alert.alert(t('incident.recoverTitle'),t('incident.recoverBody'),[
    {text:t('common.cancel'),style:'cancel'}, {text:t('incident.recover'),onPress:()=>store.recoverPrevious().catch(()=>{})},
  ]);
  return <View style={[styles.saveStatus,{borderColor:colors.border2}]}>
    <Text accessibilityRole={loadError||saveError ? 'alert' : undefined} style={[styles.note,{color:colors.text2}]}>{t(loading?'incident.loading':loadError?(loadError.code==='UNSUPPORTED_SCHEMA'?'incident.errorUNSUPPORTED_SCHEMA':'incident.loadFailed'):(saving||locked)&&(!saveError||saveError.code==='STORAGE_TIMEOUT')?'incident.saving':saveError?'incident.saveFailed':'incident.saved')}</Text>
    {!!(loadError||saveError)&&<Action label={t('incident.retry')} colors={colors} quiet disabled={loading||locked} onPress={()=>{const action=loadError?store.load():store.retrySave();action.catch(()=>{});}}/>}
    {!!loadError?.canRecover&&<Action label={t('incident.recover')} colors={colors} quiet disabled={locked} onPress={recover}/>}
  </View>;
}
export function IncidentWorkspaceCard({ onPress }) {
  const state=useReportDrafts();const colors=useColors();const {t}=useTranslation();const incident=activeIncident(state.data);
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={t('incident.workspace')}
    style={[styles.workspaceCard,{backgroundColor:colors.card,borderColor:colors.border,borderLeftColor:colors.accentText}]}>
    <Text style={[styles.label,{color:colors.text2}]}>{t('incident.workspace')}</Text>
    <Text style={[styles.title,{color:colors.text}]}>{incident?.name || t('incident.ics214')}</Text>
    <Text style={[styles.note,{color:colors.text3}]}>{state.data.editor ? t('incident.resumeDraft') : incident ? `${incident.number} · ${t('incident.entryCount',{count:incident.activities.length})}` : t('incident.empty')}</Text>
  </TouchableOpacity>;
}
/** Compact entry point; ordinary MARK POSITION keeps its navigation behavior. */
export function IncidentShortcut({ location, onOpen }) {
  const {data,loading,loadError}=useReportDrafts();const colors=useColors();const {t}=useTranslation();const incident=activeIncident(data);
  useEffect(()=>{setReviewBlocker('incident-active',!!data.editor||!!incident&&!incident.archived);return()=>setReviewBlocker('incident-active',false);},[!!data.editor,incident?.id,incident?.archived]);
  if (loading||loadError||(!incident&&!data.editor)) return null;
  return <View style={[styles.shortcut,{borderColor:colors.border2}]}>
    <Action quiet colors={colors} label={data.editor?t('incident.resumeDraft'):`${incident?.number || incident?.name} · ${t('incident.workspace')}`} onPress={()=>onOpen?.(null)}/>
    {!!incident&&!incident.archived&&!data.editor&&<Action quiet colors={colors} label={t('incident.logDevice')} onPress={()=>{
      const reference=deviceIncidentReference(location);if(!reference){Alert.alert(t('incident.workspace'),t('incident.staleFix'));return;}onOpen?.(reference);
    }}/>}
  </View>;
}

export function IncidentWorkspace({ location, isPro, onShowProGate, onClose, request, onRequestHandled }) {
  const state=useReportDrafts();const {data,store,loading,loadError,locked,saving,saveError}=state;
  const colors=useColors();const {t}=useTranslation();const insets=useSafeInsets();const {fontScale}=useWindowDimensions();
  const [view,setView]=useState('workspace');const [error,setError]=useState(null);const [sharing,setSharing]=useState(false);
  const [reviewedRevision,setReviewedRevision]=useState(null);const [historyId,setHistoryId]=useState(null);
  const proNow=useRef(isPro);proNow.current=isPro;
  const shareBusy=useRef(false);
  const seenRequest=useRef(null);const incident=activeIncident(data);const editor=data.editor;
  const readOnly=!isPro||!!incident?.archived;const busy=locked||sharing;
  const go=next=>{Keyboard.dismiss();setError(null);setView(next);};
  // Local banner errors carry their code so transient storage states can clear themselves once the native save settles.
  const explain=e=>setError({code:e?.code||null,text:e?.code==='PRO_REQUIRED'?t('incident.proReadOnly'):e?.code==='IMPORT_CAPACITY'?t('incident.importCapacity'):t(`incident.error${e?.code}`,{defaultValue:t('incident.saveFailed')})});
  const edit=fn=>{if(!isPro){onShowProGate?.(t('incident.workspace'),'reports');return;}try{store.change(fn);go('editor');}catch(e){explain(e);}};
  useEffect(()=>{setReviewBlocker('incident-workspace',true);return()=>setReviewBlocker('incident-workspace',false);},[]);
  useEffect(()=>{
    if(!request||loading||loadError||locked||seenRequest.current===request.id)return;
    seenRequest.current=request.id;
    if(request.reference){
      if(!isPro){onShowProGate?.(t('incident.workspace'),'reports');}
      else if(editor){go('editor');setError(t('incident.unfinished'));}
      else {
        // Only an active, non-archived incident can take the entry directly; otherwise park the reference and let the user choose.
        try{let next='list';store.change(current=>{const target=activeIncident(current);if(target&&!target.archived){next='editor';return beginIncidentEntry(current,{location:request.reference});}return {...current,pendingLocation:request.reference};});go(next);}catch(e){explain(e);}
      }
    }else if(editor)go('editor');
    onRequestHandled?.();
  },[request,loading,loadError,locked,isPro]);
  // A storage-class banner describes a transient state; clear it once the native save has really settled.
  // Validation and Pro errors stay until the user acts.
  useEffect(()=>{if(!saveError&&!locked&&!saving)setError(current=>current&&typeof current!=='string'&&String(current.code||'').startsWith('STORAGE')?null:current);},[saveError,locked,saving]);
  useEffect(()=>{if(!loading&&!loadError&&editor)setView('editor');},[loading,loadError]);
  const commit=async(fn,next='workspace',options,mapError=e=>e)=>{Keyboard.dismiss();setError(null);try{await store.commit(fn,options);go(next);return true;}catch(e){explain(mapError(e));return false;}};
  const commitEdit=(fn,next,mapError)=>commit(current=>{if(!proNow.current)throw incidentError('PRO_REQUIRED');return fn(current);},next,undefined,mapError);
  const close=async()=>{Keyboard.dismiss();try{await store.flush();onClose();}catch(e){explain(e);}};
  const discard=()=>Alert.alert(t('incident.discardTitle'),t('incident.discardBody'),[
    {text:t('common.cancel'),style:'cancel'}, {text:t('incident.discard'),style:'destructive',onPress:()=>commit(current=>({...current,editor:null}))},
  ]);
  const keep=()=>commitEdit(keepIncidentEditor);
  const updateEditor=patch=>{if(!proNow.current){setError(t('incident.proReadOnly'));return;}try{store.change(current=>({...current,editor:{...current.editor,...patch}}));}catch(e){explain(e);}};
  const updateDetails=(key,value)=>updateEditor({value:{...editor.value,[key]:value}});
  const chooseDevice=()=>{const reference=deviceIncidentReference(location);if(!reference){setError(t('incident.staleFix'));return;}updateEditor({location:reference,manualGrid:''});};
  const archive=()=>Alert.alert(t('incident.archiveTitle'),t('incident.archiveBody'),[
    {text:t('common.cancel'),style:'cancel'}, {text:t('incident.archive'),onPress:()=>commitEdit(current=>archiveIncident(current,incident.id,true),'list')},
  ]);
  // Selecting keeps a parked map/device reference; beginIncidentEntry consumes it (or expires it after 30 min).
  const select=async id=>{if(editor){go('editor');setError(t('incident.unfinished'));return;}await commit(current=>({...current,activeId:id}));};
  const importBackup=async()=>{
    if(!isPro){onShowProGate?.(t('incident.workspace'),'reports');return;}
    if(editor){go('editor');setError(t('incident.unfinished'));return;}
    if(shareBusy.current)return;shareBusy.current=true;
    if(!(await allowSystemDisplay())){shareBusy.current=false;return;}setSharing(true);
    try {
      const selected=await Picker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
      if(selected.canceled)return;
      const asset=selected.assets?.[0];if(!asset||!asset.uri?.startsWith('file://'))throw Error();
      const info=await FileSystem.getInfoAsync(asset.uri);if(!info.exists||info.size>INCIDENT_LIMITS.bytes)throw Error();
      const parsed=readIncidentBackup(await FileSystem.readAsStringAsync(asset.uri));
      const existing=data.incidents.find(i=>i.importedFrom?.digest===parsed.digest);
      if(existing){await commit(current=>({...current,activeId:existing.id}));Alert.alert(t('incident.workspace'),t('incident.alreadyImported'));return;}
      Alert.alert(t('incident.importTitle'),t('incident.importBody',{name:parsed.incident?.name||parsed.editor?.value?.name||t('incident.workspace'),count:parsed.incident?.activities.length||0}),[
        {text:t('common.cancel'),style:'cancel'}, {text:t('incident.importBackup'),onPress:()=>commitEdit(current=>importIncidentCopy(current,parsed),parsed.editor?'editor':'workspace',e=>e?.code==='RECORD_LIMIT'?incidentError('IMPORT_CAPACITY'):e)},
      ]);
    }catch{setError(t('incident.importFailed'));}finally{setSharing(false);shareBusy.current=false;}
  };
  const exportFile=async kind=>{
    if((kind!=='json'&&busy)||shareBusy.current)return;
    if(kind!=='json'&&(!incident||reviewedRevision!==incident.revision))return;
    const backupEditor=editor&&(view==='editor'||editor.incidentId===incident?.id)?editor:null;
    const backupIncident=backupEditor?data.incidents.find(i=>i.id===backupEditor.incidentId)||null:incident;
    if(kind==='json'&&!backupIncident&&!backupEditor)return;
    shareBusy.current=true;
    Keyboard.dismiss();setError(null);
    if(kind!=='text'&&!(await allowSystemDisplay())){shareBusy.current=false;return;}
    setSharing(true);
    try {
      // A backup also rescues current in-memory edits when local storage fails.
      // Only reviewed report exports require a confirmed local commit.
      if(kind!=='json')await store.flush();
      // Frozen reviewed snapshot: later navigation or edits cannot change an in-flight export.
      const current=JSON.parse(JSON.stringify(kind==='json'?backupIncident:incident));
      if(kind==='text') {const text=ics214Text(current);if(text.length>1000000)throw Error();await copyTextToClipboard(text);AccessibilityInfo.announceForAccessibility(t('incident.copied'));Alert.alert(t('incident.ics214'),t('incident.copied'));return;}
      if(!FileSystem?.cacheDirectory||!Sharing||!(await Sharing.isAvailableAsync()))throw Error();
      let uri;
      if(kind==='pdf') {const file=await Print.printToFileAsync({html:ics214HTML(current),width:612,height:792,base64:false});uri=file.uri;}
      else {uri=`${FileSystem.cacheDirectory}incident-${current?.id||'unfinished'}.redgridincident.json`;await FileSystem.writeAsStringAsync(uri,incidentBackup(current,Date.now(),backupEditor),{encoding:FileSystem.EncodingType.UTF8});}
      await Sharing.shareAsync(uri,{mimeType:kind==='pdf'?'application/pdf':'application/json',UTI:kind==='pdf'?'com.adobe.pdf':'public.json',dialogTitle:t(kind==='pdf'?'incident.exportPdf':'incident.backup')});
      notifySuccess();
    }catch(e){setError(t(e.code==='PDF_LIMIT'?'incident.pdfLimit':'incident.exportFailed'));}finally{setSharing(false);shareBusy.current=false;}
  };
  const status=<ReportSaveStatus state={state}/>;
  const action=(key,fn,disabled=false,quiet=false)=><Action key={key} colors={colors} label={t(key)} onPress={fn} disabled={(key==='incident.backup'?sharing:busy)||disabled} quiet={quiet}/>;
  const note=(value,key)=><Text key={key} style={[styles.note,{color:colors.text3}]}>{value}</Text>;
  const title=value=><Text style={[styles.title,{color:colors.text}]} accessibilityRole="header">{value}</Text>;
  const errorView=error?<Text style={[styles.error,{color:colors.text,borderColor:colors.accentText}]} accessibilityRole="alert">{typeof error==='string'?error:error.text}</Text>:null;
  const reference=loc=>loc&&<View style={[styles.reference,{borderColor:colors.border2}]}>
    <Text style={[styles.coordinate,{color:colors.text}]}>{loc.grid}</Text>
    {note(t('incident.locationSource',{kind:t(loc.kind==='device'?'incident.deviceSource':loc.kind==='map'?'incident.mapSource':'incident.manualSource'),grid:loc.grid}))}
    {note(loc.kind==='device'?t('incident.fixDetails',{time:stamp(loc.fixTimestamp),accuracy:loc.accuracyM===null?t('incident.unknownAccuracy'):`±${loc.accuracyM} m`}):t('incident.unknownAccuracy'))}
    {note(t('incident.selectedAt',{time:stamp(loc.selectedAt)}))}
  </View>;
  const back=<View style={styles.topActions}>{action('incident.backReports',close,false,true)}{action('nightDisplay.done',Keyboard.dismiss,false,true)}</View>;
  const header=<>{back}{status}{!isPro&&note(t('incident.proReadOnly'))}{errorView}</>;
  const scroll=children=><ScrollView style={{flex:1,backgroundColor:colors.bg}} contentContainerStyle={[styles.content,{paddingBottom:40+insets.bottom}]}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>{header}{children}</ScrollView>;
  if(loading||loadError)return scroll(null);
  if(view==='editor'&&editor) {
    const editable=isPro&&!busy&&!data.incidents.find(i=>i.id===editor.incidentId)?.archived;
    const content=editor.type==='details'?<>
      {title(t('incident.details'))}
      {['name','number','from','to','resource','person','position','agency','preparer','preparerPosition'].map(key=><View key={key}>
        <Field colors={colors} label={t(`incident.${key}`)} value={editor.value[key]} onChange={value=>updateDetails(key,value)} editable={editable}
          maxLength={key==='from'||key==='to'?30:160} hint={key==='from'||key==='to'?t('incident.timeHint'):null}/>
        {(key==='from'||key==='to')&&action(`workflow.insertCurrentTime`,()=>updateDetails(key,localIncidentTime()),!editable,true)}
      </View>)}
      {title(t('incident.resources'))}{editor.value.resources.map((r,index)=><View key={index} style={[styles.resource,{borderColor:colors.border2}]}>
        {['name','position','agency'].map(key=><Field key={key} colors={colors} label={`${index+1} · ${t(`incident.${key==='name'?'resourceName':key}`)}`} value={r[key]} editable={editable}
          onChange={value=>updateDetails('resources',editor.value.resources.map((entry,i)=>i===index?{...entry,[key]:value}:entry))}/>)}
        {action('incident.removeResource',()=>updateDetails('resources',editor.value.resources.filter((_,i)=>i!==index)),!editable,true)}
      </View>)}
      {action('incident.addResource',()=>updateDetails('resources',[...editor.value.resources,{name:'',position:'',agency:''}]),!editable||editor.value.resources.length>=INCIDENT_LIMITS.resources,true)}
    </>:<>
      {title(t(editor.correctingId?'incident.correctActivity':'incident.addActivity'))}
      <Field colors={colors} label={t('incident.eventTime')} value={editor.time} editable={editable} maxLength={30} onChange={time=>updateEditor({time})} hint={t('incident.timeHint')}/>
      {action('workflow.insertCurrentTime',()=>updateEditor({time:localIncidentTime()}),!editable,true)}{note(t('incident.eventTimeHint'))}
      <Field colors={colors} label={t('incident.notableActivity')} value={editor.text} editable={editable} multiline maxLength={2000} onChange={text=>updateEditor({text})} hint={t('incident.observationHint')}/>
      <Text style={[styles.label,{color:colors.text2}]}>{t('incident.location')}</Text>
      {reference(editor.location)}{action('incident.deviceLocation',chooseDevice,!editable,true)}
      {action('incident.noLocation',()=>updateEditor({location:null,manualGrid:''}),!editable,true)}
      <Field colors={colors} label={t('incident.manualGrid')} value={editor.manualGrid} maxLength={80} editable={editable}
        onChange={manualGrid=>updateEditor({manualGrid,location:null})} hint={t('incident.locationHint')}/>
      {!!editor.correctingId&&<Field colors={colors} label={t('incident.reason')} value={editor.reason} editable={editable} multiline maxLength={400} onChange={reason=>updateEditor({reason})}/>}
    </>;
    return scroll(<>{content}{action(editor.type==='details'?'incident.keepDetails':editor.correctingId?'incident.keepCorrection':'incident.keepActivity',keep,!editable)}
      {action('incident.returnWorkspace',()=>go('workspace'),false,true)}{action('incident.backup',()=>exportFile('json'),false,true)}{action('incident.discard',discard,false,true)}{errorView}</>);
  }
  if(view==='list'||!incident) return scroll(<>{title(t('incident.chooseIncident'))}{!data.incidents.length&&note(t('incident.empty'))}
    {data.incidents.map(item=><View key={item.id} style={[styles.resource,{borderColor:colors.border2}]}>
      {title(item.name)}{note(`${item.number} · ${item.from}`)}{item.archived&&note(t('incident.archived'))}
      <Action colors={colors} label={t('incident.open')} onPress={()=>select(item.id)} disabled={busy}/>
      {item.archived&&<Action colors={colors} label={t('waypoints.delete')} quiet disabled={busy} onPress={()=>Alert.alert(`${item.name} — ${t('waypoints.delete')}`,`${t('waypoints.deleteListMsg')}\n\n${t('incident.backupHint')}`,[
        {text:t('common.cancel'),style:'cancel'}, {text:t('waypoints.delete'),style:'destructive',onPress:()=>commit(current=>deleteArchivedIncident(current,item.id),'list',{removedIncidentIds:[item.id]})},
      ])}/>}
    </View>)}{action('incident.newIncident',()=>edit(current=>beginIncidentDetails(current)))}
    {editor&&action('incident.resumeDraft',()=>go('editor'),false,true)}{action('incident.importBackup',importBackup,false,true)}{note(t('incident.localOnly'))}
  </>);
  if(view==='history') {
    const entry=incident.activities.find(a=>a.id===historyId);
    return scroll(<>{action('incident.returnWorkspace',()=>go('workspace'),false,true)}{title(t('incident.history'))}{note(t('incident.historyHint'))}
      {entry?.revisions.map((r,index)=><View key={index} style={[styles.resource,{borderColor:colors.border2}]}>
        {title(`${t('incident.previous')} ${index+1}`)}{note(r.previous.time)}<Text style={[styles.body,{color:colors.text}]}>{r.previous.text}</Text>{reference(r.previous.location)}
        <Text style={[styles.body,{color:colors.text}]}>{t('incident.reason')}: {r.reason}</Text>{note(t('incident.correctedAt',{time:r.correctedAt}))}
      </View>)}
    </>);
  }
  const activityRow=({item})=><View style={[styles.logEntry,fontScale>1.4&&{flexDirection:'column'},{borderColor:colors.border2}]}>
    <View style={[styles.logTime,fontScale>1.4&&{width:'100%'}]}><Text style={[styles.coordinate,{color:colors.text}]}>{item.time.slice(11,16)}</Text>{note(`${item.time.slice(0,10)}\nUTC${item.time.slice(-6)}`)}</View>
    <View style={{flex:1}}><Text style={[styles.body,{color:colors.text}]}>{item.text}</Text>{view!=='review'&&reference(item.location)}
      {view!=='review'&&<>{note(t('incident.enteredAt',{time:item.enteredAt}))}{!!item.revisions.length&&<Action quiet colors={colors} label={t('incident.corrected',{count:item.revisions.length})} onPress={()=>{setHistoryId(item.id);go('history');}}/>}
        <Action quiet colors={colors} label={t('incident.correct')} disabled={readOnly||busy} onPress={()=>edit(current=>beginIncidentEntry(current,{correctingId:item.id,location:null}))}/></>}
    </View></View>;
  const block=(label,value)=><View style={[styles.resource,{borderColor:colors.border2}]}><Text style={[styles.label,{color:colors.text2}]}>{label}</Text><Text style={[styles.body,{color:colors.text}]}>{value||'—'}</Text></View>;
  const review=view==='review';
  const listHeader=<View style={styles.content}>{header}{review?<>
    {action('incident.returnWorkspace',()=>go('workspace'),false,true)}{title(t('incident.ics214'))}{note(t('incident.unsigned'))}{note(t('incident.reviewHint'))}
    {block('1 · INCIDENT NAME',incident.name)}{block('2 · OPERATIONAL PERIOD',`${incident.from}\n${incident.to}`)}
    {block('3 · NAME / RESOURCE DESIGNATOR',incident.resource)}{block('4 · ICS POSITION',`${incident.person} · ${incident.position}`)}{block('5 · HOME AGENCY (AND UNIT)',incident.agency)}
    {block('6 · RESOURCES ASSIGNED',incident.resources.map(r=>`${r.name} · ${r.position} · ${r.agency}`).join('\n'))}
    {title('7 · ACTIVITY LOG')}
  </>:<>
    <Text style={[styles.label,{color:colors.text2}]}>{t('incident.workspace')}</Text>{title(incident.name)}{note(incident.number)}
    {block(t('incident.period'),`${incident.from}\nto ${incident.to}\n${incident.resource}`)}
    {editor&&action('incident.resumeDraft',()=>go('editor'),false,true)}
    {action('incident.details',()=>edit(current=>beginIncidentDetails(current,incident.id)),readOnly,true)}
    {action('incident.addActivity',()=>edit(current=>beginIncidentEntry(current)),readOnly)}{action('incident.review',()=>{setReviewedRevision(null);go('review');},false,true)}
    {action('incident.chooseIncident',()=>go('list'),false,true)}
    {incident.archived?action('incident.restore',()=>{if(!isPro){onShowProGate?.(t('incident.workspace'),'reports');return;}commitEdit(current=>archiveIncident(current,incident.id,false));},false,true):action('incident.archive',archive,!isPro,true)}
    {title(t('incident.activityLog'))}{note(t('incident.entryCount',{count:incident.activities.length}))}
  </>}</View>;
  const listFooter=<View style={[styles.content,{paddingBottom:40+insets.bottom}]}>{review?<>
    {block('8 · PREPARED BY',`${incident.preparer} · ${incident.preparerPosition}\n\n${t('incident.signature')}\n\n${t('incident.preparationTime')}`)}
    {note(t('incident.annex'))}{note(t('incident.exportHint'))}{note(t('incident.backupHint'))}
    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={t('incident.reviewed')} accessibilityState={{checked:reviewedRevision===incident.revision,disabled:busy}}
      disabled={busy} onPress={()=>setReviewedRevision(value=>value===incident.revision?null:incident.revision)} style={[styles.action,{borderColor:colors.border}]}>
      <Text style={[styles.body,{color:colors.text}]}>{reviewedRevision===incident.revision?'☑':'☐'} {t('incident.reviewed')}</Text>
    </TouchableOpacity>
    {action('incident.exportPdf',()=>exportFile('pdf'),reviewedRevision!==incident.revision||saving||!!saveError)}
    {action('incident.copy',()=>exportFile('text'),reviewedRevision!==incident.revision||saving||!!saveError,true)}
    {action('incident.backup',()=>exportFile('json'),false,true)}{errorView}
  </>:note(t('incident.localOnly'))}</View>;
  return <FlatList style={{flex:1,backgroundColor:colors.bg}} data={orderedActivities(incident)} key={review?'review':'workspace'}
    keyExtractor={item=>item.id} renderItem={activityRow} ListHeaderComponent={listHeader} ListFooterComponent={listFooter}
    initialNumToRender={8} windowSize={5} maxToRenderPerBatch={8} removeClippedSubviews={false} extraData={{view,colors,reviewedRevision,busy}}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets />;
}
const styles=StyleSheet.create({
  content:{paddingHorizontal:16,paddingTop:14},topActions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  title:{...TYPE.heading,fontSize:22,letterSpacing:.7,marginVertical:10,flexShrink:1},label:{...TYPE.label,fontSize:13,letterSpacing:1,marginBottom:5},
  body:{...TYPE.body,fontSize:16,lineHeight:24},note:{...TYPE.body,fontSize:13,lineHeight:20,marginVertical:4},
  coordinate:{...TYPE.data,fontSize:13,marginVertical:5},action:{minHeight:48,borderWidth:1,padding:12,justifyContent:'center',marginVertical:5},
  actionText:{...TYPE.label,fontSize:15,textAlign:'center',letterSpacing:.7,flexShrink:1},field:{marginVertical:12},
  input:{...TYPE.body,fontSize:17,borderWidth:1,padding:12,minHeight:48,textAlignVertical:'top'},multiline:{minHeight:130},
  saveStatus:{borderBottomWidth:1,paddingVertical:8,marginBottom:12},error:{...TYPE.body,fontSize:15,padding:12,marginVertical:12,borderWidth:1},
  workspaceCard:{borderWidth:1,borderLeftWidth:3,padding:14,marginBottom:18},resource:{borderWidth:1,padding:12,marginVertical:9},
  reference:{borderWidth:1,padding:9,marginVertical:9},logEntry:{borderTopWidth:1,paddingVertical:15,marginHorizontal:16,flexDirection:'row',gap:12},
  logTime:{width:78},shortcut:{paddingVertical:10,borderTopWidth:1,marginTop:12},
});
