/** Transactional, on-device report storage. No remote services or silent empty fallbacks. */
import * as SQLite from 'expo-sqlite';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { emptyIncidentState, validateIncidentState, incidentError, INCIDENT_LIMITS } from './incident';

const digest = value => bytesToHex(sha256(utf8ToBytes(value)));
export const REPORT_DATABASE = 'redgrid_reports_v1.db';
const fail = code => { throw incidentError(code); };
function split(state) {
  validateIncidentState(state);
  const records = new Map([['meta', JSON.stringify({ version:state.version, activeId:state.activeId, pendingLocation:state.pendingLocation })], ['editor', JSON.stringify(state.editor)]]);
  state.incidents.forEach(i => records.set(`incident:${i.id}`,JSON.stringify(i)));
  Object.entries(state.worksheets).forEach(([id,draft]) => records.set(`worksheet:${id}`,JSON.stringify(draft)));
  if ([...records.values()].reduce((n,s) => n + utf8ToBytes(s).length,0) > INCIDENT_LIMITS.bytes) fail('RECORD_LIMIT');
  return records;
}
function assemble(rows) {
  if (!rows.length) return emptyIncidentState();
  const state = emptyIncidentState();
  if (!rows.some(r => r.key === 'meta')) fail('INVALID_RECORD');
  for (const row of rows) {
    if (typeof row.payload !== 'string' || digest(row.payload) !== row.checksum) fail('INVALID_RECORD');
    const value = JSON.parse(row.payload);
    if (row.key === 'meta') { state.version = value.version; state.activeId = value.activeId; state.pendingLocation=value.pendingLocation ?? null; }
    else if (row.key === 'editor') state.editor = value;
    else if (row.key.startsWith('incident:') && value?.id === row.key.slice(9)) state.incidents.push(value);
    else if (row.key.startsWith('worksheet:')) state.worksheets[row.key.slice(10)] = value;
    else fail('UNSUPPORTED_SCHEMA');
  }
  return validateIncidentState(state);
}
const revisionOf = rows => rows.find(row => row.key === 'meta')?.revision || 0;

/** Injectable database adapter lets regression tests exercise real SQLite transactions. */
export function createReportDraftStorage(open = () => SQLite.openDatabaseAsync(REPORT_DATABASE)) {
  let opening;
  const database = () => {
    if (!opening) opening = (async () => {
      const db = await open();
      const version = await db.getFirstAsync('PRAGMA user_version');
      if (version.user_version > 1) fail('UNSUPPORTED_SCHEMA');
      await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      await db.execAsync(`CREATE TABLE IF NOT EXISTS report_records (
        key TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, checksum TEXT NOT NULL,
        previous_payload TEXT, previous_checksum TEXT);
        CREATE TABLE IF NOT EXISTS report_quarantine (
        id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, revision INTEGER NOT NULL,
        payload TEXT NOT NULL, checksum TEXT NOT NULL, recovered_at TEXT NOT NULL);
        PRAGMA user_version=1;`);
      return db;
    })().catch(error => { opening = null; throw error; });
    return opening;
  };
  function decode(rows) {
    try { return assemble(rows); }
    catch (cause) {
      if (cause.code === 'UNSUPPORTED_SCHEMA') throw cause;
      const error = incidentError('STORAGE_CORRUPT');
      // Only offer recovery when every damaged document has a valid previous
      // copy and the reconstructed collection still satisfies all invariants.
      const candidates = rows.map(row => {
        try { if (digest(row.payload) !== row.checksum) throw Error(); JSON.parse(row.payload); return row; }
        catch { return { ...row, payload:row.previous_payload, checksum:row.previous_checksum }; }
      });
      try { assemble(candidates); error.canRecover = candidates.some((r,i) => r.payload !== rows[i].payload); }
      catch { error.canRecover = false; }
      throw error;
    }
  }
  return {
    async load() {
      const db = await database();
      const rows = await db.getAllAsync('SELECT * FROM report_records ORDER BY key');
      return { data:decode(rows), revision:revisionOf(rows) };
    },
    async save(data, expectedRevision, { removedIncidentIds = [] } = {}) {
      const values = split(data); // immutable serialized snapshot before awaiting native work
      const db = await database();
      let revision;
      await db.withExclusiveTransactionAsync(async tx => {
        const durability = await tx.getFirstAsync('PRAGMA synchronous');
        if (durability.synchronous < 2) fail('STORAGE_UNAVAILABLE');
        const rows = await tx.getAllAsync('SELECT * FROM report_records ORDER BY key');
        decode(rows); // Never overwrite an unreadable collection with apparent defaults.
        if (revisionOf(rows) !== expectedRevision) fail('STORAGE_CONFLICT');
        revision = expectedRevision + 1;
        const current = new Map(rows.map(row => [row.key,row]));
        // Only the explicit, confirmed archived-incident deletion may remove a
        // record. A missing row from a partial/default state is never a delete.
        for (const row of rows.filter(row => !values.has(row.key))) {
          if (!removedIncidentIds.some(id => row.key === `incident:${id}`) || !JSON.parse(row.payload).archived) fail('INVALID_RECORD');
          await tx.runAsync('DELETE FROM report_records WHERE key=?',row.key);
          await tx.runAsync('DELETE FROM report_quarantine WHERE key=?',row.key);
        }
        for (const [key,payload] of values) {
          if (key !== 'meta' && current.get(key)?.payload === payload) continue;
          await tx.runAsync(`INSERT INTO report_records (key,revision,payload,checksum,previous_payload,previous_checksum)
            VALUES (?,?,?,?,NULL,NULL) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,
            previous_payload=report_records.payload,previous_checksum=report_records.checksum,
            payload=excluded.payload,checksum=excluded.checksum`,key,revision,payload,digest(payload));
        }
      });
      return revision; // withExclusiveTransactionAsync resolves only after COMMIT.
    },
    async recoverPrevious() {
      const db = await database();
      await db.withExclusiveTransactionAsync(async tx => {
        const rows = await tx.getAllAsync('SELECT * FROM report_records ORDER BY key');
        try { decode(rows); return; } catch (error) { if (!error.canRecover) throw error; }
        const restored = rows.map(row => {
          try { if (digest(row.payload) !== row.checksum) throw Error(); JSON.parse(row.payload); return row; }
          catch { return { ...row, payload:row.previous_payload, checksum:row.previous_checksum }; }
        });
        assemble(restored);
        for (let i=0;i<rows.length;i++) {
          if (rows[i].payload === restored[i].payload) continue;
          await tx.runAsync('INSERT INTO report_quarantine (key,revision,payload,checksum,recovered_at) VALUES (?,?,?,?,?)',rows[i].key,rows[i].revision,rows[i].payload,rows[i].checksum,new Date().toISOString());
          await tx.runAsync('UPDATE report_records SET payload=?,checksum=?,previous_payload=NULL,previous_checksum=NULL WHERE key=?',restored[i].payload,restored[i].checksum,rows[i].key);
        }
      });
      return this.load();
    },
  };
}
