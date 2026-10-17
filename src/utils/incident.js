/** Local incident records. Event time, entry time and location provenance stay distinct. */
import { newFieldId } from './waypoints';
import { createDeviceAnnotation, validToolPoint } from './toolWorkflow';
import { formatReportTimestamp } from './reportTemplates';
import { toMGRS, formatMGRS, parseMGRSToLatLon } from './mgrs';

export const REPORT_SCHEMA = 1;
export const INCIDENT_LIMITS = { incidents: 50, activities: 2000, resources: 100, revisions: 100, text: 2000, bytes: 8 * 1024 * 1024 };
export const WORKSHEET_IDS = ['salute','medevac','spot','ics201','casevac','angus'];
const fields = ['name','number','from','to','resource','person','position','agency','preparer','preparerPosition'];
export function incidentError(code) { const e = new Error(code); e.code = code; return e; }
const fail = code => { throw incidentError(code); };
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = INCIDENT_LIMITS.text) => typeof v === 'string' && v.length <= max;
const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const id = v => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);

/** Strict calendar and offset parsing; Date.parse alone normalizes impossible dates. */
export function parseIncidentTime(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) ([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [,ys,mos,ds,hs,mins,sign,ohs,oms] = m;
  const [y,mo,d,h,min,oh,om] = [ys,mos,ds,hs,mins,ohs,oms].map(Number);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || h > 23 || min > 59 || oh > 14 || om > 59 || (oh === 14 && om)) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h, min));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.getTime() - (sign === '+' ? 1 : -1) * (oh * 60 + om) * 60000;
}
export const localIncidentTime = (now = Date.now()) => formatReportTimestamp(now, 'local');
export const emptyIncidentState = () => ({ version: REPORT_SCHEMA, activeId: null, pendingLocation:null, incidents: [], editor: null, worksheets: {} });
export const blankIncident = () => Object.fromEntries(fields.map(key => [key, '']).concat([['resources', []]]));
export const activeIncident = state => state.incidents.find(incident => incident.id === state.activeId) || null;
export const orderedActivities = incident => [...incident.activities].sort((a,b) => parseIncidentTime(a.time) - parseIncidentTime(b.time) || a.enteredAt.localeCompare(b.enteredAt) || a.id.localeCompare(b.id));

export function deviceIncidentReference(position, now = Date.now()) {
  const fix = createDeviceAnnotation(position, now);
  return fix ? { kind: 'device', grid: fix.grid, lat: fix.lat, lon: fix.lon, datum: 'WGS84', source: fix.source,
    fixTimestamp: fix.fixTimestamp, selectedAt: now, accuracyM: fix.accuracy } : null;
}
export function mapIncidentReference(point, now = Date.now()) {
  if (!validToolPoint(point, { mgrs: true })) return null;
  return { kind: 'map', grid: formatMGRS(toMGRS(point.lat, point.lon, 5)), lat: point.lat, lon: point.lon,
    datum: 'WGS84', source: 'map', fixTimestamp: null, selectedAt: now, accuracyM: null };
}
export function manualIncidentReference(grid, now = Date.now()) {
  try {
    const point = parseMGRSToLatLon(grid);
    if (!validToolPoint(point, { mgrs: true })) return null;
    // Preserve the entered precision; this does not create a measured accuracy.
    return { kind: 'manual', grid: grid.trim().toUpperCase(), lat: point.lat, lon: point.lon, datum: 'WGS84',
      source: 'manual', fixTimestamp: null, selectedAt: now, accuracyM: null };
  } catch { return null; }
}
function validReference(value) {
  return value === null || (object(value) && ['device','map','manual'].includes(value.kind) && text(value.grid, 80) &&
    validToolPoint(value, { mgrs: true }) && value.datum === 'WGS84' && text(value.source, 30) &&
    Number.isFinite(value.selectedAt) && value.selectedAt > 0 &&
    (value.accuracyM === null || (Number.isFinite(value.accuracyM) && value.accuracyM >= 0)) &&
    (value.kind === 'device' ? Number.isFinite(value.fixTimestamp) && value.fixTimestamp > 0 : value.fixTimestamp === null && value.accuracyM === null));
}
function validDetails(value, complete = true) {
  if (!object(value) || fields.some(key => !text(value[key], key === 'from' || key === 'to' ? 30 : 160))) return false;
  if (!Array.isArray(value.resources) || value.resources.length > INCIDENT_LIMITS.resources || value.resources.some(r => !object(r) || ['name','position','agency'].some(k => !text(r[k],160)))) return false;
  return !complete || (value.name.trim() && parseIncidentTime(value.from) !== null && parseIncidentTime(value.to) !== null && parseIncidentTime(value.to) > parseIncidentTime(value.from));
}
function validActivity(value, incident) {
  const when = parseIncidentTime(value?.time);
  return object(value) && id(value.id) && when !== null && when >= parseIncidentTime(incident.from) && when <= parseIncidentTime(incident.to) &&
    text(value.text) && value.text.trim().length > 0 && iso(value.enteredAt) && validReference(value.location) &&
    Array.isArray(value.revisions) && value.revisions.length <= INCIDENT_LIMITS.revisions && value.revisions.every(r => object(r) &&
      text(r.reason,400) && r.reason.trim() && iso(r.correctedAt) && object(r.previous) && parseIncidentTime(r.previous.time) !== null &&
      text(r.previous.text) && r.previous.text.trim() && validReference(r.previous.location));
}
export function validateIncident(value) {
  if (!validDetails(value) || !id(value.id) || !Number.isInteger(value.revision) || value.revision < 1 ||
    !iso(value.createdAt) || !iso(value.updatedAt) || typeof value.archived !== 'boolean' ||
    !Array.isArray(value.activities) || value.activities.length > INCIDENT_LIMITS.activities ||
    new Set(value.activities.map(a => a?.id)).size !== value.activities.length || value.activities.some(a => !validActivity(a,value))) fail('INVALID_RECORD');
  if (value.importedFrom != null && (!object(value.importedFrom) || !/^[a-f0-9]{64}$/.test(value.importedFrom.digest) || !iso(value.importedFrom.importedAt))) fail('INVALID_RECORD');
  return value;
}
export function validateWorksheet(value) {
  if (!object(value) || !object(value.values) || !object(value.sources) ||
    Object.keys(value.values).length > 30 || Object.keys(value.sources).length > 30 ||
    Object.entries(value.values).some(([key,v]) => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || !text(v)) ||
    (value.context !== undefined && !['peacetime','wartime'].includes(value.context))) fail('INVALID_RECORD');
  for (const source of Object.values(value.sources)) {
    if (source === null) continue;
    if (!object(source) || !['device','time'].includes(source.kind)) fail('INVALID_RECORD');
    if (source.kind === 'time' ? !Number.isFinite(source.timestamp) : !text(source.grid,80) || !Number.isFinite(source.fixTimestamp)) fail('INVALID_RECORD');
  }
  return value;
}
export function validateIncidentState(value) {
  if (!object(value) || value.version !== REPORT_SCHEMA) fail('UNSUPPORTED_SCHEMA');
  if (!Array.isArray(value.incidents) || value.incidents.length > INCIDENT_LIMITS.incidents ||
    new Set(value.incidents.map(i => i?.id)).size !== value.incidents.length || !object(value.worksheets)) fail('INVALID_RECORD');
  value.incidents.forEach(validateIncident);
  if (!validReference(value.pendingLocation)) fail('INVALID_RECORD');
  if (value.activeId !== null && !value.incidents.some(i => i.id === value.activeId)) fail('INVALID_RECORD');
  for (const [key,draft] of Object.entries(value.worksheets)) { if (!WORKSHEET_IDS.includes(key)) fail('INVALID_RECORD'); validateWorksheet(draft); }
  const editor = value.editor;
  if (editor !== null) {
    if (!object(editor) || !['details','entry'].includes(editor.type) || (editor.incidentId !== null && !value.incidents.some(i => i.id === editor.incidentId))) fail('INVALID_RECORD');
    if (editor.type === 'details' && !validDetails(editor.value, false)) fail('INVALID_RECORD');
    if (editor.type === 'entry' && (editor.incidentId === null || !id(editor.entryId) || !text(editor.time,30) || !text(editor.text) || !text(editor.reason,400) || !text(editor.manualGrid,80) || !validReference(editor.location) ||
      (editor.correctingId !== null && !value.incidents.find(i => i.id === editor.incidentId)?.activities.some(a => a.id === editor.correctingId)))) fail('INVALID_RECORD');
  }
  return value;
}
export function beginIncidentDetails(state, incidentId = null) {
  if (state.editor) fail('DRAFT_OPEN');
  const incident = state.incidents.find(i => i.id === incidentId);
  if (incidentId && !incident) fail('INVALID_RECORD');
  if (incident?.archived) fail('NO_ACTIVE_INCIDENT');
  return { ...state, editor: { type:'details', incidentId, value: incident ? { ...Object.fromEntries(fields.map(key=>[key,incident[key]])), resources: incident.resources.map(r => ({...r})) } : blankIncident() } };
}
export function beginIncidentEntry(state, { location, correctingId = null, now = Date.now() } = {}) {
  if (state.editor) fail('DRAFT_OPEN');
  const incident = activeIncident(state);
  if (!incident || incident.archived) fail('NO_ACTIVE_INCIDENT');
  if (location === undefined) {
    const pending = state.pendingLocation;
    location = pending && now >= pending.selectedAt && now - pending.selectedAt < 30 * 60000 ? pending : null;
  }
  const entry = incident.activities.find(a => a.id === correctingId);
  if (correctingId && !entry) fail('INVALID_RECORD');
  return { ...state, pendingLocation:null, editor: { type:'entry', incidentId:incident.id, entryId:newFieldId(), correctingId,
    time:entry?.time || localIncidentTime(now), text:entry?.text || '', reason:'', manualGrid:'', location:entry ? entry.location : location } };
}
export function keepIncidentEditor(state, now = Date.now()) {
  const editor = state.editor;
  if (!editor) fail('INVALID_RECORD');
  const stamp = new Date(now).toISOString();
  if (editor.type === 'details') {
    if (!validDetails(editor.value)) fail('INVALID_PERIOD');
    const current = state.incidents.find(i => i.id === editor.incidentId);
    if (current?.archived) fail('NO_ACTIVE_INCIDENT');
    if (current?.activities.some(a => parseIncidentTime(a.time) < parseIncidentTime(editor.value.from) || parseIncidentTime(a.time) > parseIncidentTime(editor.value.to))) fail('PERIOD_EXCLUDES_ACTIVITY');
    if (!current && state.incidents.length >= INCIDENT_LIMITS.incidents) fail('RECORD_LIMIT');
    const incident = { ...(current || { id:newFieldId(), createdAt:stamp, activities:[], archived:false }),
      ...Object.fromEntries(fields.map(key => [key, editor.value[key].trim()])), resources:editor.value.resources.map(r => ({...r})),
      revision:(current?.revision || 0)+1, updatedAt:stamp };
    if(!current&&editor.importedFrom)incident.importedFrom=editor.importedFrom;
    return validateIncidentState({ ...state, activeId:incident.id, editor:null,
      incidents:current ? state.incidents.map(i => i.id === current.id ? incident : i) : [...state.incidents,incident] });
  }
  const current = state.incidents.find(i => i.id === editor.incidentId);
  if (!current || current.archived) fail('NO_ACTIVE_INCIDENT');
  const when = parseIncidentTime(editor.time);
  if (when === null || when < parseIncidentTime(current.from) || when > parseIncidentTime(current.to)) fail('INVALID_EVENT_TIME');
  if (!editor.text.trim()) fail('EMPTY_ACTIVITY');
  const reference = editor.manualGrid.trim() ? manualIncidentReference(editor.manualGrid,now) : editor.location;
  if (editor.manualGrid.trim() && !reference) fail('INVALID_LOCATION');
  const original = current.activities.find(a => a.id === editor.correctingId);
  if (original && !editor.reason.trim()) fail('CORRECTION_REASON_REQUIRED');
  if (original?.revisions.length >= INCIDENT_LIMITS.revisions || (!original && current.activities.length >= INCIDENT_LIMITS.activities)) fail('RECORD_LIMIT');
  const entry = original ? { ...original, time:editor.time, text:editor.text.trim(), location:reference,
    revisions:[...original.revisions, { previous:{ time:original.time, text:original.text, location:original.location }, reason:editor.reason.trim(), correctedAt:stamp }] }
    : { id:editor.entryId, time:editor.time, text:editor.text.trim(), location:reference, enteredAt:stamp, revisions:[] };
  const incident = { ...current, revision:current.revision+1, updatedAt:stamp,
    activities:original ? current.activities.map(a => a.id === original.id ? entry : a) : [...current.activities,entry] };
  return validateIncidentState({ ...state, editor:null, incidents:state.incidents.map(i => i.id === incident.id ? incident : i) });
}
export function archiveIncident(state, incidentId, archived, now = Date.now()) {
  if (state.editor?.incidentId === incidentId) fail('DRAFT_OPEN');
  return { ...state, pendingLocation:null, activeId:archived && state.activeId === incidentId ? null : archived ? state.activeId : incidentId,
    incidents:state.incidents.map(i => i.id === incidentId ? {...i, archived, updatedAt:new Date(now).toISOString(), revision:i.revision+1} : i) };
}
export function deleteArchivedIncident(state, incidentId) {
  if (!state.incidents.find(i => i.id === incidentId)?.archived || state.editor?.incidentId === incidentId) fail('INVALID_RECORD');
  return { ...state,activeId:state.activeId === incidentId ? null : state.activeId,incidents:state.incidents.filter(i => i.id !== incidentId) };
}
