import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { validateIncident, validateIncidentState, emptyIncidentState, orderedActivities, incidentError, INCIDENT_LIMITS } from './incident';
import { newFieldId } from './waypoints';

export const INCIDENT_BACKUP_SCHEMA = 'redgrid.incident';
export const ICS214_REFERENCE = 'FEMA ICS 214 · Activity Log · v3.1';
function validateBackupParts(incident,editor) {
  validateIncidentState({...emptyIncidentState(),activeId:incident?.id||null,incidents:incident?[incident]:[],editor});
  if(!incident&&!editor)throw incidentError('INVALID_RECORD');
}
export function incidentBackup(incident, now = Date.now(), editor = null) {
  validateBackupParts(incident,editor);
  return JSON.stringify({ schema:INCIDENT_BACKUP_SCHEMA, version:1, exportedAt:new Date(now).toISOString(), incident, editor },null,2);
}
export function readIncidentBackup(raw) {
  if (typeof raw !== 'string' || utf8ToBytes(raw).length > INCIDENT_LIMITS.bytes) throw incidentError('INVALID_RECORD');
  let value;try { value=JSON.parse(raw); } catch { throw incidentError('INVALID_RECORD'); }
  if (value?.schema !== INCIDENT_BACKUP_SCHEMA || value.version !== 1) throw incidentError('UNSUPPORTED_SCHEMA');
  const editor=value.editor??null;
  validateBackupParts(value.incident,editor);
  return { incident:value.incident,editor,digest:bytesToHex(sha256(utf8ToBytes(JSON.stringify({incident:value.incident,editor})))) };
}
export function importIncidentCopy(state, parsed, now = Date.now()) {
  validateBackupParts(parsed.incident,parsed.editor??null);
  if(state.editor)throw incidentError('DRAFT_OPEN');
  const existing=state.incidents.find(i => i.importedFrom?.digest === parsed.digest);
  if (existing) return { ...state,activeId:existing.id,pendingLocation:null };
  if (parsed.incident&&state.incidents.length >= INCIDENT_LIMITS.incidents) throw incidentError('RECORD_LIMIT');
  const importedFrom={digest:parsed.digest,originalId:parsed.incident?.id||null,importedAt:new Date(now).toISOString()};
  const incident=parsed.incident?{...JSON.parse(JSON.stringify(parsed.incident)),id:newFieldId(),archived:false,importedFrom}:null;
  const editor=parsed.editor?{...JSON.parse(JSON.stringify(parsed.editor)),incidentId:incident?.id||null,importedFrom}:null;
  return validateIncidentState({...state,pendingLocation:null,activeId:incident?.id||state.activeId,editor,incidents:incident?[...state.incidents,incident]:state.incidents});
}
const filled = value => value?.trim() || 'NOT ENTERED';
const formTime = value => `${value.slice(5,7)}/${value.slice(8,10)}/${value.slice(0,4)} ${value.slice(11,16)} UTC${value.slice(-6)}`;
export function incidentReferenceText(location) {
  if (!location) return 'No location recorded';
  return [location.kind === 'device' ? `Device reference (${location.source})` : location.kind === 'map' ? 'Selected map point' : 'Manual reference',
    `MGRS / WGS 84: ${location.grid}`,`Latitude/longitude: ${location.lat}, ${location.lon}`,
    location.fixTimestamp ? `Fix: ${new Date(location.fixTimestamp).toISOString()}` : 'Not a measured device fix',
    location.accuracyM === null ? 'Accuracy unverified' : `Reported horizontal accuracy: ±${location.accuracyM} m`,
    `Reference selected: ${new Date(location.selectedAt).toISOString()}`].join('\n');
}
export function ics214Text(incident, now = Date.now()) {
  validateIncident(incident);
  return ['DRAFT — UNSIGNED / RED GRID WORKSHEET',ICS214_REFERENCE,
    'Based on the FEMA form. Follow agency procedures for signatures, approval and routing. No report has been transmitted or filed.',
    `1. INCIDENT NAME\n${filled(incident.name)}`,
    `2. OPERATIONAL PERIOD\nFrom: ${formTime(incident.from)}\nTo: ${formTime(incident.to)}`,
    `3. NAME / RESOURCE DESIGNATOR\n${filled(incident.resource)}`,
    `4. ICS POSITION\n${filled(incident.person)} · ${filled(incident.position)}`,
    `5. HOME AGENCY (AND UNIT)\n${filled(incident.agency)}`,
    `6. RESOURCES ASSIGNED\n${incident.resources.length ? incident.resources.map(r => `${filled(r.name)} | ${filled(r.position)} | ${filled(r.agency)}`).join('\n') : 'NOT ENTERED'}`,
    `7. ACTIVITY LOG\n${orderedActivities(incident).map(a => `${formTime(a.time)}\n${a.text}`).join('\n\n') || 'NOT ENTERED'}`,
    `8. PREPARED BY\nName: ${filled(incident.preparer)}\nPosition/title: ${filled(incident.preparerPosition)}\nSignature: ____________________\nPreparation date/time: ____________________`,
    `RED GRID ANNEX — APP METADATA, NOT ADDITIONAL FEMA FORM BLOCKS\nLocal incident reference: ${filled(incident.number)}\nRecord: ${incident.id} · revision ${incident.revision}\nExport generated: ${new Date(now).toISOString()} (not the preparer signing time)\nCorrection history is local documentation, not a certified evidence record.`,
    ...orderedActivities(incident).map(a => [`Activity ${a.id} · ${formTime(a.time)}`,`Entered: ${a.enteredAt}`,incidentReferenceText(a.location),
      ...a.revisions.map((r,index) => `Previous version ${index+1}\n${formTime(r.previous.time)}\n${r.previous.text}\n${incidentReferenceText(r.previous.location)}\nReason: ${r.reason}\nCorrected: ${r.correctedAt}`)].join('\n')),
  ].join('\n\n');
}
export const escapeIncidentHTML = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ics214HTML(incident, now = Date.now()) {
  const output=ics214Text(incident,now);
  if (incident.activities.length > 300 || output.length > 100000) throw incidentError('PDF_LIMIT');
  const e=escapeIncidentHTML;
  const section=(label,body) => `<section><div class="label">${label}</div>${body}</section>`;
  const p=value => `<p dir="auto">${e(filled(value))}</p>`;
  const rows=orderedActivities(incident).map(a => `<tr><td class="time">${e(formTime(a.time))}</td><td dir="auto">${e(a.text)}</td></tr>`).join('');
  const resources=incident.resources.map(r => `<tr><td dir="auto">${e(filled(r.name))}</td><td dir="auto">${e(filled(r.position))}</td><td dir="auto">${e(filled(r.agency))}</td></tr>`).join('');
  const annex=orderedActivities(incident).map(a => `<section><div class="label">Activity ${e(a.id)} · ${e(formTime(a.time))}</div><p dir="auto">Entered: ${e(a.enteredAt)}</p><p dir="auto">${e(incidentReferenceText(a.location))}</p>${a.revisions.map((r,index) => `<div class="previous"><b>Previous version ${index+1}</b><p dir="auto">${e(formTime(r.previous.time))}\n${e(r.previous.text)}</p><p dir="auto">${e(incidentReferenceText(r.previous.location))}</p><p dir="auto">Reason: ${e(r.reason)}\nCorrected: ${e(r.correctedAt)}</p></div>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    @page{size:letter;margin:30px}*{box-sizing:border-box}body{font:11px/1.4 Arial,sans-serif;color:#000;background:#fff;margin:0}h1{font-size:19px;margin:0 0 6px}h2{font-size:15px}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}section{border:1px solid #333;padding:7px;margin:0;break-inside:avoid}.label{font-size:10px;font-weight:bold;margin-bottom:4px}.notice{font-size:10px;margin-bottom:12px}.meta{font-size:9px}.previous{border-left:2px solid #777;padding-left:8px;margin-top:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}td,th{border:1px solid #333;padding:6px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}th{font-size:10px;background:#eee}tr{break-inside:avoid}.time{width:25%;font-size:10px}.annex{break-before:page}.annex section{margin-bottom:9px}.signature{min-height:65px}
    </style></head><body><h1>ACTIVITY LOG (ICS 214)</h1><p class="notice"><b>DRAFT — UNSIGNED / RED GRID WORKSHEET</b>\n${e(ICS214_REFERENCE)}. Follow agency procedures for signatures, approval and routing. This app does not transmit, sign or file the report.</p>
    ${section('1. INCIDENT NAME',p(incident.name))}${section('2. OPERATIONAL PERIOD',p(`From: ${formTime(incident.from)}\nTo: ${formTime(incident.to)}`))}
    ${section('3. NAME / RESOURCE DESIGNATOR',p(incident.resource))}${section('4. ICS POSITION',p(`${filled(incident.person)} · ${filled(incident.position)}`))}${section('5. HOME AGENCY (AND UNIT)',p(incident.agency))}
    <h2>6. RESOURCES ASSIGNED</h2><table><thead><tr><th>Name</th><th>ICS Position</th><th>Home Agency (and Unit)</th></tr></thead><tbody>${resources || '<tr><td colspan="3">NOT ENTERED</td></tr>'}</tbody></table>
    <h2>7. ACTIVITY LOG</h2><table><thead><tr><th class="time">Date / Time (24-hour, with UTC offset)</th><th>Notable Activities</th></tr></thead><tbody>${rows || '<tr><td colspan="2">NOT ENTERED</td></tr>'}</tbody></table>
    ${section('8. PREPARED BY',p(`Name: ${filled(incident.preparer)}\nPosition/title: ${filled(incident.preparerPosition)}`)+'<p class="signature">Signature: ____________________\n\nPreparation date/time: ____________________</p>')}
    <div class="annex"><h1>RED GRID ANNEX</h1><p class="notice">App metadata, location provenance and correction history; not additional FEMA form blocks or a certified evidence record.</p><p class="meta">Local reference: ${e(filled(incident.number))}\nRecord: ${e(incident.id)} · revision ${incident.revision}\nExport generated: ${e(new Date(now).toISOString())} (not preparer signing time)</p>${annex}</div></body></html>`;
}
