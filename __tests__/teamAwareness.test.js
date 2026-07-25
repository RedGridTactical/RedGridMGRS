/**
 * teamAwareness.test.js — Team Layer v1 logic.
 * All pure functions: the caller owns the clock, so none of this needs a radio.
 */
import {
  TEAM_ROLES, normalizeRole,
  PEER_STATUS, FRESH_MS, STALE_MS, GHOST_MS, classifyPeerAge,
  MAX_PROJECTION_MS, projectGhostPosition,
  buildRoster,
  MESSAGE_TYPES, MAX_FREE_TEXT, encodeMessage, decodeMessage,
  SOS_RETRANSMIT_MS, SOS_AUTO_EXPIRE_MS, shouldRetransmitSos, reduceSosState,
  SYNC_INTERVALS, syncIntervalFor,
} from '../src/utils/teamAwareness';

const T0 = 1_700_000_000_000; // fixed epoch; no Date.now() anywhere

describe('roles', () => {
  it('accepts every known role', () => {
    for (const r of Object.values(TEAM_ROLES)) expect(normalizeRole(r)).toBe(r);
  });
  it('is case- and whitespace-insensitive', () => {
    expect(normalizeRole('  MEDIC ')).toBe(TEAM_ROLES.MEDIC);
  });
  it('falls back to MEMBER for junk', () => {
    for (const junk of [undefined, null, 42, '', 'sniper', {}]) {
      expect(normalizeRole(junk)).toBe(TEAM_ROLES.MEMBER);
    }
  });
});

describe('classifyPeerAge', () => {
  it('classifies each decay stage', () => {
    expect(classifyPeerAge(T0, T0).status).toBe(PEER_STATUS.LIVE);
    expect(classifyPeerAge(T0 - (FRESH_MS - 1), T0).status).toBe(PEER_STATUS.LIVE);
    expect(classifyPeerAge(T0 - FRESH_MS, T0).status).toBe(PEER_STATUS.STALE);
    expect(classifyPeerAge(T0 - STALE_MS, T0).status).toBe(PEER_STATUS.GHOST);
    expect(classifyPeerAge(T0 - GHOST_MS, T0).status).toBe(PEER_STATUS.LOST);
  });

  it('decays opacity monotonically', () => {
    const stages = [0, FRESH_MS, STALE_MS, GHOST_MS].map(a => classifyPeerAge(T0 - a, T0).opacity);
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeLessThan(stages[i - 1]);
  });

  it('treats a future timestamp as age 0 rather than going negative', () => {
    const r = classifyPeerAge(T0 + 60_000, T0);
    expect(r.ageMs).toBe(0);
    expect(r.status).toBe(PEER_STATUS.LIVE);
  });
});

describe('projectGhostPosition', () => {
  const prev = { lat: 10.0, lon: 20.0, timestamp: T0 - 120_000 };
  const last = { lat: 10.1, lon: 20.1, timestamp: T0 - 60_000 };

  it('extrapolates along the last known track', () => {
    // Same velocity, same elapsed as the sample gap -> one more step.
    const p = projectGhostPosition(prev, last, T0);
    expect(p.projected).toBe(true);
    expect(p.lat).toBeCloseTo(10.2, 6);
    expect(p.lon).toBeCloseTo(20.2, 6);
  });

  it('refuses to project past the honest limit', () => {
    expect(projectGhostPosition(prev, last, last.timestamp + MAX_PROJECTION_MS + 1)).toBeNull();
  });

  it('returns null without enough history or motion', () => {
    expect(projectGhostPosition(null, last, T0)).toBeNull();
    expect(projectGhostPosition(prev, null, T0)).toBeNull();
    // Stationary peer: nothing to project.
    expect(projectGhostPosition({ ...prev, lat: last.lat, lon: last.lon }, last, T0)).toBeNull();
    // Non-monotonic timestamps.
    expect(projectGhostPosition(last, prev, T0)).toBeNull();
  });
});

describe('buildRoster', () => {
  const positions = [
    { nodeId: 1, lat: 1, lon: 1, timestamp: T0 - 1000 },
    { nodeId: 1, lat: 2, lon: 2, timestamp: T0 - 500 },   // newer wins
    { nodeId: 2, lat: 3, lon: 3, timestamp: T0 - STALE_MS - 1000 },
  ];

  it('keeps only the newest fix per node and retains the prior one', () => {
    const r = buildRoster(positions, { now: T0 });
    const n1 = r.find(p => p.nodeId === '1');
    expect(r).toHaveLength(2);
    expect(n1.lat).toBe(2);
    expect(n1.prevFix).toEqual({ lat: 1, lon: 1, timestamp: T0 - 1000 });
  });

  it('applies local names and roles, with sane defaults', () => {
    const r = buildRoster(positions, { now: T0, names: { 1: 'ALPHA' }, roles: { 1: 'MEDIC' } });
    const n1 = r.find(p => p.nodeId === '1');
    const n2 = r.find(p => p.nodeId === '2');
    expect(n1.name).toBe('ALPHA');
    expect(n1.role).toBe(TEAM_ROLES.MEDIC);
    expect(n2.name).toMatch(/NODE/);
    expect(n2.role).toBe(TEAM_ROLES.MEMBER);
  });

  it('sorts SOS to the top, then by most recently heard', () => {
    const r = buildRoster(positions, { now: T0, sos: { 2: true } });
    expect(r[0].nodeId).toBe('2');   // older, but in distress
    expect(r[0].sos).toBe(true);
    expect(r[1].nodeId).toBe('1');
  });

  it('marks a long-silent peer as a ghost', () => {
    const r = buildRoster(positions, { now: T0 });
    expect(r.find(p => p.nodeId === '2').status).toBe(PEER_STATUS.GHOST);
  });

  it('survives malformed input', () => {
    expect(buildRoster(null)).toEqual([]);
    expect(buildRoster([null, undefined, {}, { nodeId: null }])).toEqual([]);
  });
});

describe('tactical messages', () => {
  it('round-trips every canned type', () => {
    for (const t of Object.values(MESSAGE_TYPES)) {
      const wire = encodeMessage({ type: t, sender: 'n1', seq: 3 });
      expect(decodeMessage(wire)).toEqual({ type: t, sender: 'n1', seq: 3 });
    }
  });

  it('round-trips free text', () => {
    const wire = encodeMessage({ text: 'moving to rally point', sender: 'n1', seq: 1 });
    expect(wire.t).toBe('f');
    expect(decodeMessage(wire)).toEqual({ type: 'free', text: 'moving to rally point', sender: 'n1', seq: 1 });
  });

  it('truncates free text to the LoRa budget', () => {
    const wire = encodeMessage({ text: 'x'.repeat(500), sender: 'n1', seq: 1 });
    expect(wire.d).toHaveLength(MAX_FREE_TEXT);
  });

  it('uses compact single-letter keys so frames stay small', () => {
    const wire = encodeMessage({ type: MESSAGE_TYPES.ROGER, sender: 'n1', seq: 2 });
    expect(Object.keys(wire).sort()).toEqual(['n', 's', 't']);
    expect(JSON.stringify(wire).length).toBeLessThan(40);
  });

  it('rejects empty and malformed messages', () => {
    expect(encodeMessage({ text: '', sender: 'n1', seq: 1 })).toBeNull();
    expect(decodeMessage(null)).toBeNull();
    expect(decodeMessage({})).toBeNull();
    expect(decodeMessage({ t: 'zzz', s: 'n1' })).toBeNull();
    expect(decodeMessage({ t: 'f', d: '', s: 'n1' })).toBeNull();
  });
});

describe('SOS beacon', () => {
  it('retransmits only after the interval elapses', () => {
    const st = { active: true, lastSentMs: T0 };
    expect(shouldRetransmitSos(st, T0 + SOS_RETRANSMIT_MS - 1)).toBe(false);
    expect(shouldRetransmitSos(st, T0 + SOS_RETRANSMIT_MS)).toBe(true);
    expect(shouldRetransmitSos({ active: false, lastSentMs: 0 }, T0)).toBe(false);
    expect(shouldRetransmitSos(null, T0)).toBe(false);
  });

  it('records a new emergency', () => {
    const s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    expect(s['7']).toMatchObject({ nodeId: '7', seq: 1, lat: 5, lon: 6 });
  });

  it('dedupes the 30s repeats but keeps the beacon alive', () => {
    let s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    s = reduceSosState(s, { nodeId: 7, seq: 1, lat: 9, lon: 9 }, T0 + SOS_RETRANSMIT_MS);
    expect(s['7'].lat).toBe(5);                                  // replay ignored
    expect(s['7'].receivedMs).toBe(T0 + SOS_RETRANSMIT_MS);      // but refreshed
  });

  it('accepts a newer sequence as an update', () => {
    let s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    s = reduceSosState(s, { nodeId: 7, seq: 2, lat: 9, lon: 9 }, T0 + 1000);
    expect(s['7'].lat).toBe(9);
    expect(s['7'].seq).toBe(2);
  });

  it('honours an explicit cancel', () => {
    let s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    s = reduceSosState(s, { nodeId: 7, cancel: true }, T0 + 1000);
    expect(s['7']).toBeUndefined();
  });

  it('expires a beacon that has gone silent', () => {
    let s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    s = reduceSosState(s, null, T0 + SOS_AUTO_EXPIRE_MS + 1);
    expect(s['7']).toBeUndefined();
  });

  it('does not expire a beacon that keeps transmitting', () => {
    let s = reduceSosState({}, { nodeId: 7, seq: 1, lat: 5, lon: 6 }, T0);
    // Refresh well inside the window, then step past the original expiry.
    s = reduceSosState(s, { nodeId: 7, seq: 1 }, T0 + SOS_AUTO_EXPIRE_MS - 1000);
    s = reduceSosState(s, null, T0 + SOS_AUTO_EXPIRE_MS + 1);
    expect(s['7']).toBeDefined();
  });
});

describe('battery-aware pacing', () => {
  it('backs off as the battery drains', () => {
    expect(syncIntervalFor(1.0)).toBe(SYNC_INTERVALS.NORMAL);
    expect(syncIntervalFor(0.5)).toBe(SYNC_INTERVALS.NORMAL);
    expect(syncIntervalFor(0.30)).toBe(SYNC_INTERVALS.SAVER);
    expect(syncIntervalFor(0.10)).toBe(SYNC_INTERVALS.CRITICAL);
    expect(syncIntervalFor(0.02)).toBe(SYNC_INTERVALS.CRITICAL);
  });

  it('never degrades while charging or on unknown battery', () => {
    expect(syncIntervalFor(0.05, { charging: true })).toBe(SYNC_INTERVALS.NORMAL);
    expect(syncIntervalFor(null)).toBe(SYNC_INTERVALS.NORMAL);
    expect(syncIntervalFor(undefined)).toBe(SYNC_INTERVALS.NORMAL);
  });

  it('an active SOS overrides battery saving', () => {
    expect(syncIntervalFor(0.02, { sosActive: true })).toBe(SYNC_INTERVALS.NORMAL);
  });
});
