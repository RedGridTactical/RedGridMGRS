/**
 * TeamKeyPanel — team key management for the MESH screen.
 *
 * The mesh itself cannot bootstrap trust: anyone with a radio can join it and
 * anyone listening can hear it. So the key is exchanged out of band — one
 * operator creates it and shows a pairing code, the others type or paste it in.
 * Proximity is the authentication.
 *
 * No camera and no QR dependency: the code is shown as grouped monospace text
 * that reads cleanly off one screen onto another, with copy and share for when
 * the team is not standing together.
 *
 * ZERO NETWORK: everything here is local. The share sheet hands the code to
 * whatever the operator chooses; this component opens nothing itself.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Share, Alert,
} from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { tapLight, tapMedium } from '../utils/haptics';
import { useTeamKey } from '../hooks/useTeamAwareness';
import { formatPairingCode } from '../utils/teamCrypto';
import { getSealedUndecryptableCount } from '../utils/meshtastic';

const DROP_POLL_MS = 5000;

let ExpoClipboard = null;
try {
  // eslint-disable-next-line global-require
  ExpoClipboard = require('expo-clipboard');
} catch {
  // Clipboard is a convenience — the code is still readable and shareable.
}

export function TeamKeyPanel({ sealedUndecryptable = 0 }) {
  const colors = useColors();
  // The drop counter lives in the transport. Poll it here rather than threading
  // it down from the app root — the caller may pass it in too, and the larger
  // of the two wins.
  const [dropped, setDropped] = useState(() => getSealedUndecryptableCount());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const id = setInterval(() => {
      if (mounted.current) setDropped(getSealedUndecryptableCount());
    }, DROP_POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, []);

  const dropCount = Math.max(dropped, sealedUndecryptable);
  const { t } = useTranslation();
  const {
    hasTeamKey, fingerprint, pairingPayload,
    createTeamKey, joinTeam, leaveTeam,
  } = useTeamKey();

  const [showCode, setShowCode] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [joinError, setJoinError] = useState(false);

  const onCreate = useCallback(async () => {
    tapMedium();
    await createTeamKey();
    setShowCode(true);
  }, [createTeamKey]);

  const onCopy = useCallback(() => {
    tapLight();
    if (ExpoClipboard && typeof ExpoClipboard.setStringAsync === 'function' && pairingPayload) {
      ExpoClipboard.setStringAsync(pairingPayload).catch(() => {});
    }
  }, [pairingPayload]);

  const onShare = useCallback(() => {
    tapLight();
    if (!pairingPayload) return;
    Share.share({ message: pairingPayload }).catch(() => {});
  }, [pairingPayload]);

  const onJoin = useCallback(async () => {
    tapMedium();
    const ok = await joinTeam(joinText);
    if (ok) {
      setJoinText('');
      setJoinError(false);
      setShowJoin(false);
    } else {
      setJoinError(true);
    }
  }, [joinTeam, joinText]);

  const onLeave = useCallback(() => {
    tapMedium();
    Alert.alert(
      t('mesh.pairing.leaveConfirmTitle', 'LEAVE TEAM?'),
      t('mesh.pairing.leaveConfirmBody', 'The team key will be erased from this device. Your messages will go out unencrypted until you join a team again.'),
      [
        { text: t('common.cancel', 'CANCEL'), style: 'cancel' },
        {
          text: t('mesh.pairing.leave', 'LEAVE TEAM'),
          style: 'destructive',
          onPress: () => {
            leaveTeam();
            setShowCode(false);
          },
        },
      ]
    );
  }, [leaveTeam, t]);

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {t('mesh.pairing.title', 'TEAM KEY')}
        </Text>
        <Text style={[styles.state, { color: hasTeamKey ? colors.text : colors.text3 }]}>
          {hasTeamKey
            ? t('mesh.pairing.stateActive', 'ACTIVE')
            : t('mesh.pairing.stateNone', 'NO KEY')}
        </Text>
      </View>

      <Text style={[styles.cardSub, { color: colors.text3 }]}>
        {hasTeamKey
          ? t('mesh.pairing.subActive', 'Team traffic is sealed end to end.')
          : t('mesh.pairing.subNone', 'Team traffic is sent unencrypted. Create a team key or join one.')}
      </Text>

      {hasTeamKey && !!fingerprint && (
        <Text style={[styles.fingerprint, { color: colors.text2 }]}>
          {t('mesh.pairing.fingerprint', 'KEY')} {fingerprint}
        </Text>
      )}

      {dropCount > 0 && (
        <Text style={[styles.warn, { color: colors.text2 }]}>
          {t('mesh.pairing.undecryptable', 'Sealed packets dropped (wrong or missing key):')} {dropCount}
        </Text>
      )}

      {/* Actions */}
      {!hasTeamKey && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.text2 }]}
            onPress={onCreate}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.pairing.create', 'CREATE TEAM KEY')}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>
              {t('mesh.pairing.create', 'CREATE TEAM KEY')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.border }]}
            onPress={() => { tapLight(); setShowJoin(v => !v); setJoinError(false); }}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.pairing.join', 'JOIN TEAM')}
          >
            <Text style={[styles.btnText, { color: colors.text2 }]}>
              {t('mesh.pairing.join', 'JOIN TEAM')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {hasTeamKey && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.text2 }]}
            onPress={() => { tapLight(); setShowCode(v => !v); }}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.pairing.showCode', 'SHOW PAIRING CODE')}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>
              {showCode
                ? t('mesh.pairing.hideCode', 'HIDE PAIRING CODE')
                : t('mesh.pairing.showCode', 'SHOW PAIRING CODE')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.border }]}
            onPress={onLeave}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.pairing.leave', 'LEAVE TEAM')}
          >
            <Text style={[styles.btnText, { color: colors.text2 }]}>
              {t('mesh.pairing.leave', 'LEAVE TEAM')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pairing code */}
      {hasTeamKey && showCode && !!pairingPayload && (
        <View style={[styles.codeBox, { borderColor: colors.border }]}>
          <Text style={[styles.codeHint, { color: colors.text4 }]}>
            {t('mesh.pairing.codeHint', 'Read this to your team, or share it. Anyone with this code can read your team traffic.')}
          </Text>
          <Text
            style={[styles.code, { color: colors.text }]}
            selectable
            accessibilityLabel={t('mesh.pairing.codeLabel', 'Pairing code')}
          >
            {formatPairingCode(pairingPayload)}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { borderColor: colors.border }]}
              onPress={onCopy}
              accessibilityRole="button"
              accessibilityLabel={t('mesh.pairing.copy', 'COPY')}
            >
              <Text style={[styles.btnText, { color: colors.text2 }]}>
                {t('mesh.pairing.copy', 'COPY')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { borderColor: colors.border }]}
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel={t('mesh.pairing.share', 'SHARE')}
            >
              <Text style={[styles.btnText, { color: colors.text2 }]}>
                {t('mesh.pairing.share', 'SHARE')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Join form */}
      {!hasTeamKey && showJoin && (
        <View style={[styles.codeBox, { borderColor: colors.border }]}>
          <Text style={[styles.codeHint, { color: colors.text4 }]}>
            {t('mesh.pairing.joinHint', 'Enter the pairing code from your team lead.')}
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: joinError ? '#ff3b30' : colors.border }]}
            value={joinText}
            onChangeText={(v) => { setJoinText(v); setJoinError(false); }}
            placeholder={t('mesh.pairing.joinPlaceholder', 'redgrid://team?...')}
            placeholderTextColor={colors.text4}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            accessibilityLabel={t('mesh.pairing.joinPlaceholder', 'redgrid://team?...')}
          />
          {joinError && (
            <Text style={[styles.warn, { color: '#ff3b30' }]}>
              {t('mesh.pairing.joinError', 'That code is not valid.')}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.text2 }]}
            onPress={onJoin}
            disabled={!joinText.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('mesh.pairing.joinConfirm', 'JOIN')}
          >
            <Text style={[styles.btnText, { color: joinText.trim() ? colors.text : colors.text4 }]}>
              {t('mesh.pairing.joinConfirm', 'JOIN')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, marginBottom: 8, padding: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  state: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  cardSub: { fontSize: 9, letterSpacing: 2, marginTop: 4, lineHeight: 14 },
  fingerprint: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, marginTop: 8 },
  warn: { fontSize: 10, letterSpacing: 1, marginTop: 8, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  btnText: { fontSize: 10, letterSpacing: 2, fontWeight: '700', textAlign: 'center' },
  codeBox: { borderWidth: 1, padding: 12, marginTop: 10 },
  codeHint: { fontSize: 9, letterSpacing: 1, lineHeight: 14, marginBottom: 8 },
  code: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 1, lineHeight: 20 },
  input: {
    borderWidth: 1, padding: 10, minHeight: 66, fontFamily: 'monospace',
    fontSize: 12, textAlignVertical: 'top',
  },
});
