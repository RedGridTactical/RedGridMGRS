import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { PEER_STATUS, TEAM_ROLES } from '../utils/teamAwareness';
import { calculateBearing, calculateDistance, formatDistance } from '../utils/mgrs';

/**
 * TeamRosterSheet — who is on the mesh, where, and how fresh.
 *
 * Reads the roster produced by useTeamAwareness. Peers decay rather than
 * disappear, so the list distinguishes "he is there" from "he was there":
 * status drives both the label and the row opacity.
 */

const ROLE_LABEL = {
  [TEAM_ROLES.LEAD]: 'LEAD',
  [TEAM_ROLES.SCOUT]: 'SCOUT',
  [TEAM_ROLES.MEDIC]: 'MEDIC',
  [TEAM_ROLES.COMMS]: 'COMMS',
  [TEAM_ROLES.MEMBER]: '',
};

/** Compact age readout: seconds are noise in the field, minutes are not. */
function formatAge(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'NOW';
  if (min < 60) return `${min}M`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}H` : `${Math.floor(h / 24)}D`;
}

function statusColor(status, colors) {
  switch (status) {
    case PEER_STATUS.LIVE: return colors.accent;
    case PEER_STATUS.STALE: return colors.text2;
    case PEER_STATUS.GHOST: return colors.text3;
    default: return colors.text4;
  }
}

const PeerRow = React.memo(function PeerRow({ peer, origin, colors, onPress }) {
  // Bearing/range are only meaningful if we know where WE are.
  const rel = useMemo(() => {
    if (!origin || !Number.isFinite(peer.lat) || !Number.isFinite(peer.lon)) return null;
    try {
      return {
        bearing: Math.round(calculateBearing(origin.lat, origin.lon, peer.lat, peer.lon)),
        distance: calculateDistance(origin.lat, origin.lon, peer.lat, peer.lon),
      };
    } catch { return null; }
  }, [origin, peer.lat, peer.lon]);

  const tone = statusColor(peer.status, colors);

  return (
    <TouchableOpacity
      style={[styles.row, { borderColor: colors.border, opacity: peer.sos ? 1 : peer.opacity }]}
      onPress={() => onPress && onPress(peer)}
      accessibilityRole="button"
      accessibilityLabel={`${peer.name}, ${peer.status}${peer.sos ? ', emergency' : ''}${rel ? `, bearing ${rel.bearing} degrees, ${formatDistance(rel.distance)}` : ''}`}
    >
      <View style={styles.rowMain}>
        <View style={styles.nameLine}>
          {peer.sos && <Text style={[styles.sosTag, { color: '#ff3b30' }]}>SOS </Text>}
          <Text style={[styles.name, { color: peer.sos ? '#ff3b30' : colors.text }]} numberOfLines={1}>
            {peer.name}
          </Text>
          {!!ROLE_LABEL[peer.role] && (
            <Text style={[styles.role, { color: colors.text3 }]}> {ROLE_LABEL[peer.role]}</Text>
          )}
        </View>
        {rel && (
          <Text style={[styles.rel, { color: colors.text2 }]}>
            {String(rel.bearing).padStart(3, '0')}° · {formatDistance(rel.distance)}
          </Text>
        )}
      </View>
      <View style={styles.rowMeta}>
        <Text style={[styles.status, { color: tone }]}>{peer.status.toUpperCase()}</Text>
        <Text style={[styles.age, { color: colors.text4 }]}>{formatAge(peer.ageMs)}</Text>
      </View>
    </TouchableOpacity>
  );
});

export function TeamRosterSheet({ visible, onClose, roster = [], origin, onSelectPeer }) {
  const colors = useColors();
  const { t } = useTranslation();

  const liveCount = roster.filter(p => p.status === PEER_STATUS.LIVE).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.header, { borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('team.rosterTitle', 'TEAM')}
            </Text>
            <Text style={[styles.count, { color: colors.text3 }]}>
              {liveCount}/{roster.length}
            </Text>
          </View>

          {roster.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text2 }]}>
                {t('team.emptyTitle', 'NO PEERS ON MESH')}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.text3 }]}>
                {t('team.emptyBody', 'Connect a Meshtastic radio and teammates running Red Grid will appear here automatically.')}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {roster.map(peer => (
                <PeerRow
                  key={peer.nodeId}
                  peer={peer}
                  origin={origin}
                  colors={colors}
                  onPress={onSelectPeer}
                />
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
          >
            <Text style={[styles.closeText, { color: colors.text2 }]}>
              {t('common.close', 'CLOSE')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { borderTopWidth: 1, maxHeight: '75%', paddingBottom: 8 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontFamily: 'monospace', fontSize: 13, letterSpacing: 4, fontWeight: '700' },
  count: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 2 },
  list: { flexGrow: 0 },
  listContent: { paddingVertical: 4 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  rowMain: { flex: 1, paddingRight: 12 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  sosTag: { fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  name: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 1, flexShrink: 1 },
  role: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
  rel: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 1, marginTop: 3 },
  rowMeta: { alignItems: 'flex-end' },
  status: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  age: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, marginTop: 3 },
  empty: { padding: 32, alignItems: 'center', gap: 10 },
  emptyTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  emptyBody: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  closeBtn: {
    marginHorizontal: 16, marginTop: 10, borderWidth: 1,
    paddingVertical: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center',
  },
  closeText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
});
