/**
 * TeamMessageBar — send a canned tactical message to the mesh in one tap.
 *
 * Canned messages exist because typing is slow, gloved hands are clumsy, and
 * LoRa airtime is shared: a one-letter type code is a couple of bytes on the
 * wire where free text is up to 160. Free text stays available behind a
 * secondary control for the cases the canned set does not cover.
 *
 * Also renders the most recent inbound message as a transient banner so a call
 * does not require opening a separate screen.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal } from 'react-native';
import { useColors } from '../utils/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { MESSAGE_TYPES, MAX_FREE_TEXT } from '../utils/teamAwareness';

// Order matters: most-used first, since this row is thumb-reachable.
const QUICK = [
  { type: MESSAGE_TYPES.ROGER, key: 'team.msgRoger', fallback: 'ROGER' },
  { type: MESSAGE_TYPES.MOVING, key: 'team.msgMoving', fallback: 'MOVING' },
  { type: MESSAGE_TYPES.HOLDING, key: 'team.msgHolding', fallback: 'HOLDING' },
  { type: MESSAGE_TYPES.CONTACT, key: 'team.msgContact', fallback: 'CONTACT' },
  { type: MESSAGE_TYPES.NEED_ASSIST, key: 'team.msgAssist', fallback: 'ASSIST' },
  { type: MESSAGE_TYPES.RALLY_ON_ME, key: 'team.msgRally', fallback: 'RALLY' },
];

export function TeamMessageBar({ onSend, disabled = false, lastInbound, onDismissInbound }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const sendCanned = useCallback((type) => {
    if (disabled || !onSend) return;
    onSend({ type });
  }, [disabled, onSend]);

  const sendFree = useCallback(() => {
    const body = draft.trim();
    if (!body || !onSend) return;
    onSend({ text: body });
    setDraft('');
    setComposerOpen(false);
  }, [draft, onSend]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Inbound banner */}
      {lastInbound && (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.accent }]}
          onPress={onDismissInbound}
          accessibilityRole="button"
          accessibilityLabel={`Message from ${lastInbound.from}: ${lastInbound.text}`}
        >
          <Text style={[styles.bannerFrom, { color: colors.accent }]} numberOfLines={1}>
            {lastInbound.from}
          </Text>
          <Text style={[styles.bannerText, { color: colors.text }]} numberOfLines={2}>
            {lastInbound.text}
          </Text>
        </TouchableOpacity>
      )}

      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {QUICK.map(q => (
          <TouchableOpacity
            key={q.type}
            style={[styles.chip, { borderColor: colors.border }, disabled && styles.chipDisabled]}
            onPress={() => sendCanned(q.type)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t(q.key, q.fallback)}
          >
            <Text style={[styles.chipText, { color: disabled ? colors.text4 : colors.text2 }]}>
              {t(q.key, q.fallback)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.border }, disabled && styles.chipDisabled]}
          onPress={() => setComposerOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('team.msgCustom', 'Custom message')}
        >
          <Text style={[styles.chipText, { color: disabled ? colors.text4 : colors.text2 }]}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Free-text composer */}
      <Modal visible={composerOpen} transparent animationType="fade" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.composerTitle, { color: colors.text }]}>
              {t('team.msgCustom', 'CUSTOM MESSAGE')}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_FREE_TEXT}
              multiline
              autoFocus
              placeholder={t('team.msgPlaceholder', 'Keep it short, radio bandwidth is shared')}
              placeholderTextColor={colors.text4}
            />
            <Text style={[styles.counter, { color: colors.text4 }]}>
              {draft.length}/{MAX_FREE_TEXT}
            </Text>
            <View style={styles.composerActions}>
              <TouchableOpacity
                style={[styles.action, { borderColor: colors.border }]}
                onPress={() => { setComposerOpen(false); setDraft(''); }}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, { color: colors.text3 }]}>
                  {t('common.cancel', 'CANCEL')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.action, { borderColor: colors.accent }]}
                onPress={sendFree}
                disabled={!draft.trim()}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, { color: draft.trim() ? colors.accent : colors.text4 }]}>
                  {t('team.msgSend', 'SEND')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  banner: { borderWidth: 1, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  bannerFrom: { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  bannerText: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderWidth: 1 },
  chip: {
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
    minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center',
  },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  composer: { borderWidth: 1, padding: 16 },
  composerTitle: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, minHeight: 88, padding: 10, fontSize: 14, textAlignVertical: 'top' },
  counter: { fontFamily: 'monospace', fontSize: 10, textAlign: 'right', marginTop: 4 },
  composerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  action: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  actionText: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
});
