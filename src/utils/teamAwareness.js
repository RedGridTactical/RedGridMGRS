/**
 * teamAwareness.js — Team Layer v1 (Workstream B, v3.6).
 *
 * Pure logic for turning raw Meshtastic position packets into a usable team
 * picture: named peers with roles, staleness/ghost decay, an SOS beacon state
 * machine, compact tactical messages, and battery-aware transmit pacing.
 *
 * Design constraints (see STANDOUT_ROADMAP "P1 / v3.6 BUILD SPEC"):
 *   - ZERO NETWORK. Everything here is local computation over packets that
 *     arrived by radio. No fetch, no analytics, no crash reporting.
 *   - LoRa payloads are tiny. Wire objects use single-letter keys and are
 *     budgeted well under 200 bytes; prefer dropping a field over truncating.
 *   - Storage is AsyncStorage only in v1 (SQLite arrives with session history).
 *   - Pure functions: no timers, no I/O. Callers own the clock and pass `now`,
 *     which is what makes all of this testable without a radio.
 */

// ─── Roles ──────────────────────────────────────────────────────────────────
// Kept deliberately short: role travels on every NODEINFO-style broadcast.
export const TEAM_ROLES = {
  LEAD: 'lead',
  SCOUT: 'scout',
  MEDIC: 'medic',
  COMMS: 'comms',
  MEMBER: 'member',
};

const ROLE_SET = new Set(Object.values(TEAM_ROLES));

/** Normalize any inbound role string; unknown/absent falls back to MEMBER. */
export function normalizeRole(role) {
  if (typeof role !== 'string') return TEAM_ROLES.MEMBER;
  const r = role.trim().toLowerCase();
  return ROLE_SET.has(r) ? r : TEAM_ROLES.MEMBER;
}

// ─── Staleness / ghost decay ────────────────────────────────────────────────
// A peer that stops transmitting does not vanish: it decays through four
// stages so the operator can tell "he's right there" from "he was there".
export const PEER_STATUS = {
  LIVE: 'live',      // heard within FRESH_MS
  STALE: 'stale',    // heard within STALE_MS
  GHOST: 'ghost',    // heard within GHOST_MS
  LOST: 'lost',      // older than GHOST_MS
};

export const FRESH_MS = 5 * 60 * 1000;    // 5 min
export const STALE_MS = 15 * 60 * 1000;   // 15 min
export const GHOST_MS = 30 * 60 * 1000;   // 30 min

/**
 * Classify a peer by how long ago it was last heard.
 * Returns { status, opacity, ageMs }. Opacity is for the map marker.
 */
export function classifyPeerAge(lastHeardMs, now) {
  const age = Math.max(0, Number(now) - Number(lastHeardMs));
  if (!Number.isFinite(age)) return { status: PEER_STATUS.LOST, opacity: 0.15, ageMs: 0 };
  if (age < FRESH_MS) return { status: PEER_STATUS.LIVE, opacity: 1.0, ageMs: age };
  if (age < STALE_MS) return { status: PEER_STATUS.STALE, opacity: 0.7, ageMs: age };
  if (age < GHOST_MS) return { status: PEER_STATUS.GHOST, opacity: 0.4, ageMs: age };
  return { status: PEER_STATUS.LOST, opacity: 0.15, ageMs: age };
}

/**
 * Dead-reckon a ghost forward from its last two fixes so the marker shows a
 * plausible search area rather than a stale dot. Returns null when there is
 * not enough history, when the peer is still LIVE (use the real fix), or when
 * the projection would be longer than the honest limit below.
 *
 * MAX_PROJECTION_MS caps extrapolation at 10 min: past that the error cone is
 * wide enough that drawing a position would imply confidence we do not have.
 */
export const MAX_PROJECTION_MS = 10 * 60 * 1000;

export function projectGhostPosition(prev, last, now) {
  if (!prev || !last) return null;
  const dt = Number(last.timestamp) - Number(prev.timestamp);
  if (!Number.isFinite(dt) || dt <= 0) return null;
  const elapsed = Number(now) - Number(last.timestamp);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null;
  if (elapsed > MAX_PROJECTION_MS) return null;

  // Degrees per ms, held constant. Good enough over single-digit minutes.
  const vLat = (last.lat - prev.lat) / dt;
  const vLon = (last.lon - prev.lon) / dt;
  if (vLat === 0 && vLon === 0) return null;

  return {
    lat: last.lat + vLat * elapsed,
    lon: last.lon + vLon * elapsed,
    projected: true,
    projectedFromMs: elapsed,
  };
}

// ─── Roster ─────────────────────────────────────────────────────────────────
/**
 * Fold raw position packets into a stable, sorted roster.
 *
 * `positions` are the packets from useMeshtastic (newest wins per nodeId).
 * `names`/`roles` are local lookups keyed by nodeId — the operator labels
 * peers on their own device; nothing is uploaded anywhere.
 *
 * Sort order is operational, not alphabetical: SOS first, then freshest.
 */
export function buildRoster(positions, { names = {}, roles = {}, sos = {}, now = 0 } = {}) {
  if (!Array.isArray(positions)) return [];

  // Keep the newest fix per node, plus the one before it so callers can
  // dead-reckon a ghost forward (see projectGhostPosition).
  const byNode = new Map();
  for (const p of positions) {
    if (!p || p.nodeId == null) continue;
    const key = String(p.nodeId);
    const ts = Number(p.timestamp) || 0;
    const prev = byNode.get(key);
    if (!prev) {
      byNode.set(key, { ...p, timestamp: ts, prevFix: null });
    } else if (ts >= prev.timestamp) {
      byNode.set(key, {
        ...p,
        timestamp: ts,
        prevFix: { lat: prev.lat, lon: prev.lon, timestamp: prev.timestamp },
      });
    }
  }

  const roster = [];
  for (const [nodeId, fix] of byNode) {
    const age = classifyPeerAge(fix.timestamp, now);
    roster.push({
      nodeId,
      name: names[nodeId] || `NODE ${String(nodeId).slice(-4)}`,
      role: normalizeRole(roles[nodeId]),
      lat: fix.lat,
      lon: fix.lon,
      altitude: fix.altitude,
      lastHeard: fix.timestamp,
      status: age.status,
      opacity: age.opacity,
      ageMs: age.ageMs,
      sos: !!sos[nodeId],
      prevFix: fix.prevFix,
    });
  }

  roster.sort((a, b) => {
    if (a.sos !== b.sos) return a.sos ? -1 : 1;      // emergencies to the top
    return b.lastHeard - a.lastHeard;                 // then most recently heard
  });
  return roster;
}

// ─── Tactical messages ──────────────────────────────────────────────────────
// Canned types keep the common calls to a couple of bytes on the wire.
export const MESSAGE_TYPES = {
  ROGER: 'r',
  NEGATIVE: 'n',
  MOVING: 'm',
  HOLDING: 'h',
  CONTACT: 'c',
  NEED_ASSIST: 'a',
  RALLY_ON_ME: 'y',
};

// 136, not 160: every frame is sealed with AES-256-GCM, which costs a fixed 29
// bytes (magic + IV + tag). 136 ASCII characters is the longest message that
// still lands inside the 200-byte LoRa budget once encrypted (199 bytes sealed,
// measured). Keeping the old 160 would have let the composer promise a length
// the radio silently truncates.
//
// CAVEAT: this is a CHARACTER cap but the budget is in BYTES, so multibyte text
// (CJK, Cyrillic) still hits the byte ceiling well before 136 characters. The
// packet encoder's shrink-to-fit loop truncates safely in that case; the
// composer's counter is optimistic for those scripts. Pre-existing, not new.
export const MAX_FREE_TEXT = 136;

const CANNED = new Set(Object.values(MESSAGE_TYPES));

/**
 * Build a compact wire message. Single-letter keys:
 *   t = type ('f' for free text), s = sender, n = sequence, d = data
 * Free text is hard-truncated to MAX_FREE_TEXT so a long message can never
 * blow the LoRa frame budget.
 */
export function encodeMessage({ type, text, sender, seq }) {
  const base = { s: String(sender ?? ''), n: Number(seq) || 0 };
  if (type && CANNED.has(type)) return { ...base, t: type };
  const body = String(text ?? '').slice(0, MAX_FREE_TEXT);
  if (!body) return null;
  return { ...base, t: 'f', d: body };
}

/** Inverse of encodeMessage. Returns null on anything malformed. */
export function decodeMessage(wire) {
  if (!wire || typeof wire !== 'object') return null;
  const type = wire.t;
  if (!type) return null;
  const sender = String(wire.s ?? '');
  const seq = Number(wire.n) || 0;
  if (type === 'f') {
    const text = String(wire.d ?? '').slice(0, MAX_FREE_TEXT);
    return text ? { type: 'free', text, sender, seq } : null;
  }
  if (!CANNED.has(type)) return null;
  return { type, sender, seq };
}

// ─── SOS beacon ─────────────────────────────────────────────────────────────
export const SOS_RETRANSMIT_MS = 30 * 1000;
export const SOS_AUTO_EXPIRE_MS = 60 * 60 * 1000; // stop believing a beacon after 1h of silence

/**
 * Should this device retransmit its SOS right now?
 * A beacon repeats every SOS_RETRANSMIT_MS so late-joining peers still hear it.
 */
export function shouldRetransmitSos(state, now) {
  if (!state || !state.active) return false;
  const last = Number(state.lastSentMs) || 0;
  return (Number(now) - last) >= SOS_RETRANSMIT_MS;
}

/**
 * Fold an inbound SOS packet into the local map of active emergencies.
 * Dedupes on (nodeId, seq) so the 30s repeats do not stack up, and drops
 * beacons that have gone quiet past SOS_AUTO_EXPIRE_MS.
 */
export function reduceSosState(current, packet, now) {
  const next = { ...(current || {}) };

  // Expire anything stale first so the map never shows a day-old emergency.
  for (const key of Object.keys(next)) {
    if ((Number(now) - (Number(next[key].receivedMs) || 0)) > SOS_AUTO_EXPIRE_MS) delete next[key];
  }

  if (!packet || packet.nodeId == null) return next;
  const id = String(packet.nodeId);

  if (packet.cancel) { delete next[id]; return next; }

  const existing = next[id];
  const seq = Number(packet.seq) || 0;
  // Ignore replays/out-of-order repeats, but refresh the heard-time so an
  // ongoing emergency does not expire while it is still transmitting.
  if (existing && seq <= (Number(existing.seq) || 0)) {
    next[id] = { ...existing, receivedMs: Number(now) };
    return next;
  }

  next[id] = {
    nodeId: id,
    seq,
    lat: packet.lat,
    lon: packet.lon,
    receivedMs: Number(now),
  };
  return next;
}

// ─── Battery-aware pacing ───────────────────────────────────────────────────
// Transmitting position is the main battery cost of the team layer, so back
// off as the phone drains. Returns milliseconds between broadcasts.
export const SYNC_INTERVALS = {
  NORMAL: 30 * 1000,
  SAVER: 60 * 1000,
  CRITICAL: 5 * 60 * 1000,
};

/**
 * batteryLevel is 0..1 (as reported by expo-battery) or null when unknown.
 * An active SOS always overrides pacing: a person in trouble is worth the
 * battery, so it stays at NORMAL regardless of charge.
 */
export function syncIntervalFor(batteryLevel, { charging = false, sosActive = false } = {}) {
  if (sosActive) return SYNC_INTERVALS.NORMAL;
  if (charging) return SYNC_INTERVALS.NORMAL;
  // Unknown battery must NOT degrade pacing. Check for null/undefined before
  // coercing: Number(null) is 0, which would otherwise read as a dead phone
  // and silently drop the team to 5-minute updates.
  if (batteryLevel == null) return SYNC_INTERVALS.NORMAL;
  const lvl = Number(batteryLevel);
  if (!Number.isFinite(lvl) || lvl < 0) return SYNC_INTERVALS.NORMAL;
  if (lvl <= 0.10) return SYNC_INTERVALS.CRITICAL;
  if (lvl <= 0.30) return SYNC_INTERVALS.SAVER;
  return SYNC_INTERVALS.NORMAL;
}
