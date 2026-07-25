/**
 * teamIntegration.test.js — end-to-end simulation of two devices on a mesh.
 *
 * This is NOT a substitute for testing against two real Meshtastic radios. It
 * cannot prove BLE works, that the radios pair, or that airtime holds up. What
 * it DOES prove is that the layers agree with each other: whatever device A
 * encodes, device B decodes into the state change device A intended.
 *
 * That is precisely the class of defect that hid in this feature — the codec
 * was write-only for several commits because every layer was individually
 * correct and nothing joined them up. These tests join them up.
 */
import {
  encodeSosPacket, encodeMessagePacket, encodeIdentPacket,
  serializeTeamPayload, parseTeamPayload, decodeTeamPacket,
  TEAM_PACKET, MAX_TEAM_PAYLOAD_BYTES, utf8ByteLength,
} from '../src/utils/teamPackets';
import {
  buildRoster, reduceSosState, classifyPeerAge, normalizeRole,
  PEER_STATUS, FRESH_MS, STALE_MS, GHOST_MS,
  MESSAGE_TYPES, syncIntervalFor, SYNC_INTERVALS,
  shouldRetransmitSos, SOS_RETRANSMIT_MS,
} from '../src/utils/teamAwareness';

const T0 = 1_700_000_000_000;

/** The radio hop: everything that survives is bytes. */
function overTheAir(payload) {
  const bytes = serializeTeamPayload(payload);
  if (!bytes) return null;                       // refused: over budget
  expect(bytes.length).toBeLessThanOrEqual(MAX_TEAM_PAYLOAD_BYTES);
  // Round-trip through a fresh Uint8Array, as the BLE layer would deliver it.
  return parseTeamPayload(new Uint8Array(bytes));
}

describe('two devices: SOS', () => {
  it('A raises SOS, B shows it on the map', () => {
    // Device A
    const out = encodeSosPacket({ lat: 34.05223, lon: -118.24368, seq: 1 });
    // Air
    const wire = overTheAir(out);
    // Device B
    const pkt = decodeTeamPacket(wire, 'A');
    expect(pkt.kind).toBe(TEAM_PACKET.SOS);

    let sos = reduceSosState({}, pkt, T0);
    expect(sos.A).toBeDefined();

    // B's roster must surface A at the top, full opacity, flagged.
    const roster = buildRoster(
      [{ nodeId: 'A', lat: pkt.lat, lon: pkt.lon, timestamp: T0 },
       { nodeId: 'C', lat: 1, lon: 1, timestamp: T0 }],
      { sos, now: T0 }
    );
    expect(roster[0].nodeId).toBe('A');
    expect(roster[0].sos).toBe(true);
  });

  it('A retransmits every 30s and B does not stack duplicates', () => {
    const pkt = decodeTeamPacket(overTheAir(encodeSosPacket({ lat: 1, lon: 2, seq: 7 })), 'A');
    let sos = reduceSosState({}, pkt, T0);

    // A's beacon repeats with the SAME seq — that is what the retransmit does.
    let now = T0;
    for (let i = 0; i < 5; i++) {
      now += SOS_RETRANSMIT_MS;
      expect(shouldRetransmitSos({ active: true, lastSentMs: now - SOS_RETRANSMIT_MS }, now)).toBe(true);
      sos = reduceSosState(sos, pkt, now);
    }
    expect(Object.keys(sos)).toHaveLength(1);
    // ...and the repeats keep it from expiring.
    expect(sos.A.receivedMs).toBe(now);
  });

  it('A cancels and B clears the emergency', () => {
    const raise = decodeTeamPacket(overTheAir(encodeSosPacket({ lat: 1, lon: 2, seq: 1 })), 'A');
    let sos = reduceSosState({}, raise, T0);
    const cancel = decodeTeamPacket(overTheAir(encodeSosPacket({ lat: 1, lon: 2, seq: 2, cancel: true })), 'A');
    sos = reduceSosState(sos, cancel, T0 + 1000);
    expect(sos.A).toBeUndefined();
  });
});

describe('two devices: identity', () => {
  it('A announces itself and B labels the roster without being told', () => {
    const pkt = decodeTeamPacket(overTheAir(encodeIdentPacket({ name: 'ALPHA-1', role: 'medic' })), 'A');
    expect(pkt.kind).toBe(TEAM_PACKET.IDENT);

    // B applies it the way the hook does.
    const names = { A: pkt.name };
    const roles = { A: normalizeRole(pkt.role) };
    const roster = buildRoster([{ nodeId: 'A', lat: 1, lon: 1, timestamp: T0 }], { names, roles, now: T0 });
    expect(roster[0].name).toBe('ALPHA-1');
    expect(roster[0].role).toBe('medic');
  });

  it('an operator-set name outranks the broadcast one', () => {
    // This mirrors the hook's rule: never clobber a hand-set label.
    const operatorNames = { A: 'POINT' };
    const pkt = decodeTeamPacket(overTheAir(encodeIdentPacket({ name: 'ALPHA-1', role: 'scout' })), 'A');
    const merged = operatorNames.A ? operatorNames : { ...operatorNames, A: pkt.name };
    const roster = buildRoster([{ nodeId: 'A', lat: 1, lon: 1, timestamp: T0 }], { names: merged, now: T0 });
    expect(roster[0].name).toBe('POINT');
  });
});

describe('two devices: messages', () => {
  it('round-trips every canned call', () => {
    for (const type of Object.values(MESSAGE_TYPES)) {
      const pkt = decodeTeamPacket(overTheAir(encodeMessagePacket({ type, seq: 1 })), 'A');
      expect(pkt.type).toBe(type);
      expect(pkt.nodeId).toBe('A');
    }
  });

  it('delivers free text and survives a long multibyte message', () => {
    const long = '敵と接触、north ridge、支援を要請する'.repeat(20);
    const encoded = encodeMessagePacket({ text: long, seq: 2 });
    const pkt = decodeTeamPacket(overTheAir(encoded), 'A');
    expect(pkt.type).toBe('f');
    expect(pkt.text.length).toBeGreaterThan(0);
    expect(utf8ByteLength(JSON.stringify(encoded))).toBeLessThanOrEqual(MAX_TEAM_PAYLOAD_BYTES);
  });
});

describe('two devices: the picture decays correctly over an hour', () => {
  it('walks A through LIVE -> STALE -> GHOST -> LOST on B', () => {
    const heard = T0;
    const stages = [
      [heard + 1000, PEER_STATUS.LIVE],
      [heard + FRESH_MS + 1, PEER_STATUS.STALE],
      [heard + STALE_MS + 1, PEER_STATUS.GHOST],
      [heard + GHOST_MS + 1, PEER_STATUS.LOST],
    ];
    let lastOpacity = Infinity;
    for (const [now, expected] of stages) {
      const roster = buildRoster([{ nodeId: 'A', lat: 1, lon: 1, timestamp: heard }], { now });
      expect(roster[0].status).toBe(expected);
      expect(roster[0].opacity).toBeLessThan(lastOpacity);   // monotonic fade
      lastOpacity = roster[0].opacity;
    }
  });

  it('keeps a re-heard peer LIVE', () => {
    let positions = [{ nodeId: 'A', lat: 1, lon: 1, timestamp: T0 }];
    // A goes quiet almost to the boundary, then transmits again.
    positions.push({ nodeId: 'A', lat: 1.1, lon: 1.1, timestamp: T0 + FRESH_MS - 1000 });
    const roster = buildRoster(positions, { now: T0 + FRESH_MS });
    expect(roster[0].status).toBe(PEER_STATUS.LIVE);
    expect(roster[0].lat).toBe(1.1);                          // newest fix wins
    expect(roster[0].prevFix.lat).toBe(1);                    // history retained
  });
});

describe('a realistic four-person patrol', () => {
  it('produces the ordering an operator needs at a glance', () => {
    const now = T0;
    const positions = [
      { nodeId: 'lead',  lat: 34.0, lon: -118.0, timestamp: now - 10_000 },
      { nodeId: 'scout', lat: 34.1, lon: -118.1, timestamp: now - 20 * 60_000 }, // ghost
      { nodeId: 'medic', lat: 34.2, lon: -118.2, timestamp: now - 60_000 },
      { nodeId: 'comms', lat: 34.3, lon: -118.3, timestamp: now - 2000 },
    ];
    const names = { lead: 'ONE', scout: 'TWO', medic: 'DOC', comms: 'RTO' };
    const roles = { lead: 'lead', scout: 'scout', medic: 'medic', comms: 'comms' };

    // The medic calls for help.
    const sosPkt = decodeTeamPacket(overTheAir(encodeSosPacket({ lat: 34.2, lon: -118.2, seq: 1 })), 'medic');
    const sos = reduceSosState({}, sosPkt, now);

    const roster = buildRoster(positions, { names, roles, sos, now });

    expect(roster).toHaveLength(4);
    expect(roster[0].name).toBe('DOC');            // emergency first, regardless of age
    expect(roster[0].sos).toBe(true);
    expect(roster[1].name).toBe('RTO');            // then freshest
    expect(roster.map(p => p.name)).toEqual(['DOC', 'RTO', 'ONE', 'TWO']);
    expect(roster[3].status).toBe(PEER_STATUS.GHOST);
    expect(roster.every(p => p.role !== 'member')).toBe(true);
  });

  it('paces transmissions down as the phone drains, unless someone is in trouble', () => {
    expect(syncIntervalFor(0.8)).toBe(SYNC_INTERVALS.NORMAL);
    expect(syncIntervalFor(0.25)).toBe(SYNC_INTERVALS.SAVER);
    expect(syncIntervalFor(0.05)).toBe(SYNC_INTERVALS.CRITICAL);
    expect(syncIntervalFor(0.05, { sosActive: true })).toBe(SYNC_INTERVALS.NORMAL);
  });
});

describe('hostile / malformed traffic never corrupts the picture', () => {
  it('ignores garbage frames', () => {
    for (const junk of [new Uint8Array([0, 1, 2, 3]), new Uint8Array([0xff]), new Uint8Array(0)]) {
      expect(decodeTeamPacket(parseTeamPayload(junk), 'X')).toBeNull();
    }
  });

  it('cannot be made to impersonate another node', () => {
    // Attacker crafts a payload claiming to be 'lead'.
    const forged = { k: 's', n: 99, a: 0, o: 0, nodeId: 'lead', s: 'lead' };
    const pkt = decodeTeamPacket(forged, 'attacker');
    expect(pkt.nodeId).toBe('attacker');
    const sos = reduceSosState({}, pkt, T0);
    expect(sos.lead).toBeUndefined();
    expect(sos.attacker).toBeDefined();
  });

  it('survives a flood without unbounded growth', () => {
    let sos = {};
    for (let i = 0; i < 500; i++) {
      const pkt = decodeTeamPacket(overTheAir(encodeSosPacket({ lat: 1, lon: 2, seq: i })), 'A');
      sos = reduceSosState(sos, pkt, T0 + i * 1000);
    }
    expect(Object.keys(sos)).toHaveLength(1);   // one node, one entry
  });
});
