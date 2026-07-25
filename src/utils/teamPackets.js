/**
 * teamPackets.js — wire codec for Team Layer traffic over Meshtastic.
 *
 * Team data (SOS beacons, tactical messages, identity broadcasts) rides
 * PORTNUM_PRIVATE_APP so it never collides with standard Meshtastic position
 * or nodeinfo traffic, and so other Meshtastic clients on the same mesh simply
 * ignore it rather than mis-rendering it.
 *
 * Payloads are compact JSON with single-letter keys. LoRa frames are small and
 * unforgiving: a Meshtastic Data payload tops out around 237 bytes, and long
 * frames cost airtime the whole mesh shares. Every encoder here refuses to
 * emit an over-budget frame rather than letting the radio silently truncate.
 *
 * ZERO NETWORK: this is radio framing only. Nothing here opens a socket.
 */

// Meshtastic's reserved range for application-specific traffic.
export const PORTNUM_PRIVATE_APP = 256;

// Conservative ceiling. Real limit is ~237 bytes; we leave headroom for the
// enclosing Data/MeshPacket protobuf wrappers.
export const MAX_TEAM_PAYLOAD_BYTES = 200;

// Packet kinds. One letter each — this key is on every frame.
export const TEAM_PACKET = {
  SOS: 's',
  MESSAGE: 'm',
  IDENT: 'i',
};

/** Byte length of a string once UTF-8 encoded (multibyte-safe). */
export function utf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  // TextEncoder is available in RN's Hermes runtime; fall back for safety.
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

/** Does this payload fit in a single LoRa frame? */
export function fitsLoRaFrame(obj) {
  try {
    return utf8ByteLength(JSON.stringify(obj)) <= MAX_TEAM_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

/**
 * Encode an SOS beacon.
 * Coordinates are rounded to 5 decimals (~1 m) — more precision than that is
 * noise on a mesh and costs bytes we do not have.
 */
export function encodeSosPacket({ lat, lon, seq, cancel = false }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = {
    k: TEAM_PACKET.SOS,
    n: Number(seq) || 0,
    a: Math.round(lat * 1e5) / 1e5,
    o: Math.round(lon * 1e5) / 1e5,
  };
  if (cancel) p.c = 1;
  return fitsLoRaFrame(p) ? p : null;
}

/**
 * Encode a tactical message. `type` is a canned single letter (see
 * teamAwareness.MESSAGE_TYPES) or 'f' with `text` for free text.
 * Free text is trimmed down until the frame fits rather than rejected, so a
 * slightly-too-long message still gets through.
 */
export function encodeMessagePacket({ type, text, seq }) {
  const base = { k: TEAM_PACKET.MESSAGE, n: Number(seq) || 0, t: type || 'f' };
  if (type && type !== 'f') return fitsLoRaFrame(base) ? base : null;

  let body = String(text ?? '').trim();
  if (!body) return null;
  let p = { ...base, t: 'f', d: body };
  while (body.length > 0 && !fitsLoRaFrame(p)) {
    body = body.slice(0, -8);
    p = { ...base, t: 'f', d: body };
  }
  return body.length > 0 ? p : null;
}

/**
 * Encode an identity broadcast (callsign + role) so peers can label each other
 * without anyone typing names in manually.
 */
export function encodeIdentPacket({ name, role }) {
  let cs = String(name ?? '').trim().slice(0, 16);
  if (!cs) return null;
  let p = { k: TEAM_PACKET.IDENT, c: cs, r: String(role ?? 'member') };
  while (cs.length > 0 && !fitsLoRaFrame(p)) {
    cs = cs.slice(0, -1);
    p = { k: TEAM_PACKET.IDENT, c: cs, r: String(role ?? 'member') };
  }
  return cs.length > 0 ? p : null;
}

/**
 * Decode any team packet into a normalized shape, or null if it is not ours /
 * is malformed. `nodeId` comes from the enclosing MeshPacket, not the payload,
 * so a peer cannot spoof another node's id inside the JSON body.
 */
export function decodeTeamPacket(payload, nodeId) {
  if (!payload || typeof payload !== 'object') return null;
  const kind = payload.k;
  if (!kind) return null;

  if (kind === TEAM_PACKET.SOS) {
    const lat = Number(payload.a);
    const lon = Number(payload.o);
    const cancel = payload.c === 1;
    if (!cancel && (!Number.isFinite(lat) || !Number.isFinite(lon))) return null;
    return { kind, nodeId, seq: Number(payload.n) || 0, lat, lon, cancel };
  }

  if (kind === TEAM_PACKET.MESSAGE) {
    const t = payload.t;
    if (!t) return null;
    if (t === 'f') {
      const text = String(payload.d ?? '');
      return text ? { kind, nodeId, seq: Number(payload.n) || 0, type: 'f', text } : null;
    }
    return { kind, nodeId, seq: Number(payload.n) || 0, type: t };
  }

  if (kind === TEAM_PACKET.IDENT) {
    const name = String(payload.c ?? '').trim();
    return name ? { kind, nodeId, name, role: String(payload.r ?? 'member') } : null;
  }

  return null;
}

/** Serialize a team payload to bytes for the radio. Null if over budget. */
export function serializeTeamPayload(obj) {
  if (!obj || !fitsLoRaFrame(obj)) return null;
  const json = JSON.stringify(obj);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json);
  const out = new Uint8Array(json.length);
  for (let i = 0; i < json.length; i++) out[i] = json.charCodeAt(i) & 0xff;
  return out;
}

/** Inverse of serializeTeamPayload. Never throws on garbage input. */
export function parseTeamPayload(bytes) {
  try {
    if (!bytes || !bytes.length) return null;
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const json = typeof TextDecoder !== 'undefined'
      ? new TextDecoder().decode(arr)
      : String.fromCharCode.apply(null, Array.from(arr));
    const obj = JSON.parse(json);
    return (obj && typeof obj === 'object') ? obj : null;
  } catch {
    return null;
  }
}
