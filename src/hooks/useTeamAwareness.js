/**
 * useTeamAwareness.js — turns raw mesh positions into a live team picture.
 *
 * Consumes `meshPositions` from useMeshtastic and layers on the pure logic in
 * utils/teamAwareness: named + role-tagged peers, ghost decay, and SOS state.
 *
 * Peer names and roles are LOCAL LABELS. They are stored on this device only
 * (AsyncStorage) and never transmitted or uploaded — consistent with the
 * zero-network guarantee. Nothing in this hook touches the network.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildRoster,
  reduceSosState,
  normalizeRole,
  PEER_STATUS,
} from '../utils/teamAwareness';
import {
  onTeamPacketReceived,
  sendTeamPacket,
  getSealedUndecryptableCount,
  resetSealedCounters,
} from '../utils/meshtastic';
import { encodeMessagePacket, encodeSosPacket, TEAM_PACKET } from '../utils/teamPackets';
import {
  generateSessionKey,
  buildPairingPayload,
  parsePairingPayload,
  setActiveTeamKey,
  clearActiveTeamKey,
  getActiveTeamKey,
  onTeamKeyChange,
  keyFingerprint,
  bytesToBase64Url,
  base64UrlToBytes,
  KEY_BYTES,
} from '../utils/teamCrypto';

const NAMES_KEY = 'rg_team_names_v1';
const ROLES_KEY = 'rg_team_roles_v1';
const TEAM_KEY_KEY = 'rg_team_key_v1';

// The roster is time-dependent (peers decay as they go unheard), so re-derive
// on a slow tick rather than only when a packet lands. 15s is well under the
// 5-minute LIVE→STALE boundary and cheap enough to be invisible.
const DECAY_TICK_MS = 15000;

/**
 * useTeamKey — the team's shared symmetric key: create it, share it, join with
 * it, drop it.
 *
 * MODEL: one key per team. Whoever starts the team generates it; everyone else
 * receives it out of band as a pairing code (shown on screen, read aloud, or
 * shared through the OS share sheet) and joins. There is no key agreement over
 * the radio — a mesh with no authentication cannot bootstrap trust, so trust
 * comes from physical proximity instead.
 *
 * The key is persisted so a team survives an app restart in the field, which is
 * the difference between a usable feature and a party trick. That is a
 * deliberate trade: a seized unlocked device gives up the key and can decrypt
 * captured traffic. Leaving the team wipes it.
 *
 * Module state in teamCrypto is the single source of truth, so several
 * instances of this hook (App and the MESH screen) always agree.
 */
export function useTeamKey() {
  const [active, setActive] = useState(() => getActiveTeamKey());
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Mirror the registry so every hook instance re-renders together.
  useEffect(() => onTeamKeyChange((snapshot) => {
    if (mounted.current) setActive(snapshot);
  }), []);

  // Restore a persisted key on first mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TEAM_KEY_KEY);
        if (raw && !getActiveTeamKey()) {
          const saved = JSON.parse(raw);
          const bytes = base64UrlToBytes(saved?.k || '');
          if (bytes.length === KEY_BYTES) setActiveTeamKey(bytes, saved?.s || null);
        }
      } catch {
        // Corrupt storage just means "no team key" — never fatal.
      }
      if (mounted.current) setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (key, sessionId) => {
    try {
      if (!key) {
        await AsyncStorage.removeItem(TEAM_KEY_KEY);
        return;
      }
      await AsyncStorage.setItem(
        TEAM_KEY_KEY,
        JSON.stringify({ k: bytesToBase64Url(key), s: sessionId || null })
      );
    } catch {}
  }, []);

  /** Start a team: fresh random key + a session id to label it. */
  const createTeamKey = useCallback(async () => {
    try {
      const key = generateSessionKey();
      const sessionId = `T${Date.now().toString(36).toUpperCase()}`;
      if (!setActiveTeamKey(key, sessionId)) return false;
      resetSealedCounters();
      await persist(key, sessionId);
      return true;
    } catch {
      return false;
    }
  }, [persist]);

  /** Join an existing team from a pairing code. Returns false on a bad code. */
  const joinTeam = useCallback(async (payloadString) => {
    try {
      const parsed = parsePairingPayload(payloadString);
      if (!parsed) return false;
      if (!setActiveTeamKey(parsed.key, parsed.sessionId)) return false;
      resetSealedCounters();
      await persist(parsed.key, parsed.sessionId);
      return true;
    } catch {
      return false;
    }
  }, [persist]);

  /** Leave the team: wipe the key here and on disk. Sends revert to plaintext. */
  const leaveTeam = useCallback(async () => {
    clearActiveTeamKey();
    resetSealedCounters();
    await persist(null);
    return true;
  }, [persist]);

  const pairingPayload = useMemo(
    () => (active ? buildPairingPayload({ sessionId: active.sessionId || 'TEAM', key: active.key }) : null),
    [active]
  );

  const fingerprint = useMemo(
    () => (active ? keyFingerprint(active.key) : null),
    [active]
  );

  return {
    hasTeamKey: !!active,
    keyLoaded: loaded,
    sessionId: active?.sessionId || null,
    fingerprint,
    pairingPayload,
    createTeamKey,
    joinTeam,
    leaveTeam,
    clearTeamKey: leaveTeam,
  };
}

export function useTeamAwareness(meshPositions) {
  const [names, setNames] = useState({});
  const [roles, setRoles] = useState({});
  const [sos, setSos] = useState({});
  const [tick, setTick] = useState(0);
  const [lastInbound, setLastInbound] = useState(null);
  const [peerEncrypted, setPeerEncrypted] = useState({});
  const [sealedUndecryptable, setSealedUndecryptable] = useState(0);
  const seqRef = useRef(0);
  const mounted = useRef(true);
  const teamKey = useTeamKey();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Load persisted local labels.
  useEffect(() => {
    (async () => {
      try {
        const [n, r] = await Promise.all([
          AsyncStorage.getItem(NAMES_KEY),
          AsyncStorage.getItem(ROLES_KEY),
        ]);
        if (!mounted.current) return;
        if (n) setNames(JSON.parse(n) || {});
        if (r) setRoles(JSON.parse(r) || {});
      } catch {
        // Corrupt or absent storage just means "no labels yet" — never fatal.
      }
    })();
  }, []);

  // Re-derive periodically so decay advances without new packets.
  useEffect(() => {
    const id = setInterval(() => {
      if (!mounted.current) return;
      setTick(t => (t + 1) % 1000000);
      // Cheap poll rather than a second listener: the counter only matters as
      // an at-a-glance number on the MESH screen.
      setSealedUndecryptable(getSealedUndecryptableCount());
    }, DECAY_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Subscribe to inbound TEAM packets from the radio. Without this the
  // codec is write-only: SOS beacons and messages from peers are dropped.
  useEffect(() => {
    const unsubscribe = onTeamPacketReceived((pkt) => {
      if (!pkt || !mounted.current) return;
      // Per-peer encryption state, so the roster can flag anyone still in the
      // clear rather than implying the whole team is sealed.
      if (pkt.nodeId != null) {
        const key = String(pkt.nodeId);
        const enc = pkt.encrypted === true;
        setPeerEncrypted(prev => (prev[key] === enc ? prev : { ...prev, [key]: enc }));
      }
      if (pkt.kind === TEAM_PACKET.SOS) {
        setSos(prev => reduceSosState(prev, pkt, Date.now()));
        return;
      }
      if (pkt.kind === TEAM_PACKET.IDENT) {
        // A peer broadcasting its own callsign/role beats our local guess,
        // but never overwrites a name the operator set by hand.
        const key = String(pkt.nodeId);
        setNames(prev => (prev[key] ? prev : { ...prev, [key]: pkt.name }));
        setRoles(prev => ({ ...prev, [key]: normalizeRole(pkt.role) }));
        return;
      }
      if (pkt.kind === TEAM_PACKET.MESSAGE) {
        setLastInbound({ from: String(pkt.nodeId), type: pkt.type, text: pkt.text || '', at: Date.now() });
      }
    });
    return unsubscribe;
  }, []);

  const roster = useMemo(
    // `tick` is intentionally read so decay recomputes on the timer.
    () => buildRoster(meshPositions, { names, roles, sos, now: Date.now() }),
    [meshPositions, names, roles, sos, tick]
  );

  const namePeer = useCallback(async (nodeId, name) => {
    const key = String(nodeId);
    const next = { ...names };
    if (name && String(name).trim()) next[key] = String(name).trim().slice(0, 24);
    else delete next[key];
    setNames(next);
    try { await AsyncStorage.setItem(NAMES_KEY, JSON.stringify(next)); } catch {}
  }, [names]);

  const assignRole = useCallback(async (nodeId, role) => {
    const key = String(nodeId);
    const next = { ...roles, [key]: normalizeRole(role) };
    setRoles(next);
    try { await AsyncStorage.setItem(ROLES_KEY, JSON.stringify(next)); } catch {}
  }, [roles]);

  /** Fold an inbound SOS packet (or a null tick) into emergency state. */
  const ingestSos = useCallback((packet) => {
    setSos(prev => reduceSosState(prev, packet, Date.now()));
  }, []);

  /** Send a tactical message. Returns false if the radio refused it. */
  const sendMessage = useCallback(async ({ type, text }) => {
    seqRef.current = (seqRef.current + 1) & 0xffff;
    const pkt = encodeMessagePacket({ type, text, seq: seqRef.current });
    if (!pkt) return false;
    return sendTeamPacket(pkt);
  }, []);

  /** Broadcast (or cancel) an SOS beacon at the given position. */
  const sendSos = useCallback(async (lat, lon, cancel = false) => {
    seqRef.current = (seqRef.current + 1) & 0xffff;
    const pkt = encodeSosPacket({ lat, lon, seq: seqRef.current, cancel });
    if (!pkt) return false;
    return sendTeamPacket(pkt);
  }, []);

  const activeCount = useMemo(
    () => roster.filter(p => p.status === PEER_STATUS.LIVE).length,
    [roster]
  );
  const sosPeers = useMemo(() => roster.filter(p => p.sos), [roster]);

  return {
    roster,
    activeCount,
    sosPeers,
    hasTeam: roster.length > 0,
    namePeer,
    assignRole,
    ingestSos,
    sendMessage,
    sendSos,
    lastInbound,
    dismissInbound: () => setLastInbound(null),
    peerEncrypted,
    sealedUndecryptable,
    ...teamKey,
  };
}
