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
import { onTeamPacketReceived, sendTeamPacket } from '../utils/meshtastic';
import { encodeMessagePacket, encodeSosPacket, TEAM_PACKET } from '../utils/teamPackets';

const NAMES_KEY = 'rg_team_names_v1';
const ROLES_KEY = 'rg_team_roles_v1';

// The roster is time-dependent (peers decay as they go unheard), so re-derive
// on a slow tick rather than only when a packet lands. 15s is well under the
// 5-minute LIVE→STALE boundary and cheap enough to be invisible.
const DECAY_TICK_MS = 15000;

export function useTeamAwareness(meshPositions) {
  const [names, setNames] = useState({});
  const [roles, setRoles] = useState({});
  const [sos, setSos] = useState({});
  const [tick, setTick] = useState(0);
  const [lastInbound, setLastInbound] = useState(null);
  const seqRef = useRef(0);
  const mounted = useRef(true);

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
      if (mounted.current) setTick(t => (t + 1) % 1000000);
    }, DECAY_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Subscribe to inbound TEAM packets from the radio. Without this the
  // codec is write-only: SOS beacons and messages from peers are dropped.
  useEffect(() => {
    const unsubscribe = onTeamPacketReceived((pkt) => {
      if (!pkt || !mounted.current) return;
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
  };
}
