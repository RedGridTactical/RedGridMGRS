/**
 * TeamMarkers — renders the team roster onto a react-native-maps MapView.
 *
 * Peers do not vanish when they stop transmitting; they decay. Marker opacity
 * follows the roster's LIVE → STALE → GHOST → LOST stages so the operator can
 * tell "he is there" from "he was there". A ghost with enough track history is
 * drawn at its dead-reckoned position with a dashed ring, which is the visual
 * promise that the dot is an estimate, not a fix.
 *
 * SOS peers always render at full opacity in alert red, on top of everything.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { PEER_STATUS, projectGhostPosition } from '../utils/teamAwareness';
import { formatMGRS, toMGRS, calculateBearing, calculateDistance, formatDistance } from '../utils/mgrs';

const SOS_RED = '#ff3b30';

/** Short age readout for the callout. */
function ageLabel(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'NOW';
  if (min < 60) return `${min}M AGO`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}H AGO` : `${Math.floor(h / 24)}D AGO`;
}

const TeamMarker = React.memo(function TeamMarker({ peer, origin, colors, now, onPress }) {
  if (!Number.isFinite(peer.lat) || !Number.isFinite(peer.lon)) return null;

  // For a decayed peer, prefer a dead-reckoned position when the track
  // supports one. projectGhostPosition refuses to extrapolate past 10 min.
  const decayed = peer.status === PEER_STATUS.GHOST || peer.status === PEER_STATUS.LOST;
  const projected = decayed && peer.prevFix
    ? projectGhostPosition(peer.prevFix, { lat: peer.lat, lon: peer.lon, timestamp: peer.lastHeard }, now)
    : null;

  const lat = projected ? projected.lat : peer.lat;
  const lon = projected ? projected.lon : peer.lon;

  // Callout detail: grid, then bearing/range if we know where we are.
  let desc = '';
  try { desc = formatMGRS(toMGRS(lat, lon, 5)); } catch {}
  if (origin && Number.isFinite(origin.lat)) {
    try {
      const brg = Math.round(calculateBearing(origin.lat, origin.lon, lat, lon));
      const dst = formatDistance(calculateDistance(origin.lat, origin.lon, lat, lon));
      desc += `\nBRG ${String(brg).padStart(3, '0')}° DST ${dst}`;
    } catch {}
  }
  desc += `\n${peer.status.toUpperCase()} · ${ageLabel(peer.ageMs)}`;
  if (projected) desc += '\nESTIMATED POSITION';

  const tone = peer.sos ? SOS_RED : (peer.status === PEER_STATUS.LIVE ? colors.accent : colors.text2);

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lon }}
      title={`${peer.sos ? 'SOS ' : ''}${peer.name}`}
      description={desc}
      // SOS must sit above every other marker on the map.
      zIndex={peer.sos ? 100 : 10}
      opacity={peer.sos ? 1 : peer.opacity}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => onPress && onPress(peer)}
    >
      <View style={styles.wrap} accessible accessibilityRole="image"
        accessibilityLabel={`${peer.name}, ${peer.status}${peer.sos ? ', emergency' : ''}`}>
        <View
          style={[
            styles.dot,
            { backgroundColor: peer.sos ? SOS_RED : colors.card, borderColor: tone },
            projected && styles.dotProjected,
            peer.sos && styles.dotSos,
          ]}
        />
        <Text style={[styles.label, { color: peer.sos ? SOS_RED : colors.text }]} numberOfLines={1}>
          {peer.name}
        </Text>
      </View>
    </Marker>
  );
});

/**
 * @param {Array} roster    from useTeamAwareness
 * @param {object} origin   own position { lat, lon } (optional)
 * @param {object} colors   from useColors()
 * @param {number} now      REQUIRED caller-supplied clock. A Date.now() default
 *                          made every parent render a new value, so React.memo
 *                          could never hold and the whole marker layer redrew.
 *                          The parent ticks it on an interval instead.
 * @param {Function} onSelectPeer
 */
export const TeamMarkers = React.memo(function TeamMarkers({ roster = [], origin, colors, now, onSelectPeer }) {
  if (!roster.length) return null;
  if (!Number.isFinite(now)) return null;
  return (
    <>
      {roster.map(peer => (
        <TeamMarker
          key={`team-${peer.nodeId}`}
          peer={peer}
          origin={origin}
          colors={colors}
          now={now}
          onPress={onSelectPeer}
        />
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  // Dashed ring signals "this is an estimate, not a fix".
  dotProjected: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  dotSos: { width: 20, height: 20, borderRadius: 10, borderWidth: 3 },
  label: {
    fontFamily: 'monospace', fontSize: 9, letterSpacing: 1,
    marginTop: 2, fontWeight: '700', maxWidth: 90, textAlign: 'center',
  },
});
