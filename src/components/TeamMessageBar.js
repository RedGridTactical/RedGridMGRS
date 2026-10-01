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

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Alert } from '../utils/fieldAlert';
import { Modal } from './FieldModal';
import { TextInput } from './FieldInput';
import { useColors } from '../utils/ThemeContext';
import { TYPE } from '../utils/typography';
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

export function TeamMessageBar({ onSend, disabled = false, lastInbound, onDismissInbound, draft: sharedDraft, onDraftChange, status }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [composerOpen, setComposerOpen] = useState(false);
  const [localDraft, setLocalDraft] = useState('');
  const [localStatus, setLocalStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const draft = sharedDraft ?? localDraft;
  const setDraft = onDraftChange || setLocalDraft;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const send = useCallback(async payload => {
    if (disabled || !onSend || busy.current) return false;
    busy.current = true; setSending(true); setLocalStatus('writing');
    let ok = false;
    try { ok = await onSend(payload) === true; } catch {}
    finally { busy.current = false; setSending(false); }
    setLocalStatus(ok ? 'radioAccepted' : 'failed');
    return ok;
  }, [disabled, onSend]);
  const sendCanned = useCallback(type => send({ type }), [send]);
  const sendFree = useCallback(async () => {
    const snapshot = draftRef.current;
    const body = snapshot.trim();
    if (!body) return;
    if (await send({ text: body })) {
      if (draftRef.current === snapshot) setDraft('');
      setComposerOpen(false);
    }
  }, [send, setDraft]);
  const discard = () => Alert.alert(t('workflow.radio.discardTitle'), t('workflow.radio.discardBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('workflow.radio.discard'), style: 'destructive', onPress: () => { setDraft(''); setComposerOpen(false); } },
  ]);
  const sendStatus = localStatus || status?.status;
  const blocked = disabled || sending || sendStatus === 'writing';

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Inbound banner */}
      {lastInbound && (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.accent }]}
          onPress={onDismissInbound}
          accessibilityRole="button"
          accessibilityLabel={t('workflow.radio.inbound', { from: lastInbound.from, text: lastInbound.text })}
        >
          <Text style={[styles.bannerFrom, { color: colors.accentText }]} numberOfLines={1}>
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
            style={[styles.chip, { borderColor: colors.border }, blocked && styles.chipDisabled]}
            onPress={() => sendCanned(q.type)}
            disabled={blocked}
            accessibilityRole="button"
            accessibilityLabel={t(q.key, q.fallback)}
          >
            <Text style={[styles.chipText, { color: blocked ? colors.text4 : colors.text2 }]}>
              {t(q.key, q.fallback)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.border }, blocked && styles.chipDisabled]}
          onPress={() => setComposerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('team.msgCustom', 'Custom message')}
        >
          <Text style={[styles.chipIcon, { color: blocked ? colors.text4 : colors.text2 }]}>+</Text>
        </TouchableOpacity>
      </View>

      {sendStatus && <Text style={[styles.counter, { color: colors.text }]} accessibilityLiveRegion="polite">{t(`workflow.radio.${sendStatus}`)}</Text>}
      {disabled && <Text style={[styles.counter, { color: colors.text3 }]}>{t('workflow.radio.disconnected')}</Text>}
      {/* Free-text composer */}
      <Modal visible={composerOpen} transparent animationType="fade" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.composerTitle, { color: colors.text }]}>
              {t('team.msgCustom', 'CUSTOM MESSAGE')}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              accessibilityLabel={t('team.msgCustom')}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_FREE_TEXT}
              multiline
              autoFocus
              placeholder={t('team.msgPlaceholder', 'Keep it short, radio bandwidth is shared')}
              placeholderTextColor={colors.text3}
            />
            <Text style={[styles.counter, { color: colors.text3 }]}>
              {draft.length}/{MAX_FREE_TEXT}
            </Text>
            {sendStatus && <Text style={[styles.counter, { color: colors.text }]} accessibilityLiveRegion="polite">{t(`workflow.radio.${sendStatus}`)}</Text>}
            {disabled && <Text style={[styles.counter, { color: colors.text3 }]}>{t('workflow.radio.disconnected')}</Text>}
            <TouchableOpacity onPress={discard} style={styles.action} accessibilityRole="button"><Text style={[styles.actionText, { color: colors.text3 }]}>{t('workflow.radio.discard')}</Text></TouchableOpacity>
            <View style={styles.composerActions}>
              <TouchableOpacity
                style={[styles.action, { borderColor: colors.border }]}
                onPress={() => setComposerOpen(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, { color: colors.text3 }]}>
                  {t('workflow.radio.keepDraft')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.action, { borderColor: colors.accent }]}
                onPress={sendFree}
                disabled={!draft.trim() || blocked}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, { color: draft.trim() ? colors.accentText : colors.text3 }]}>
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
  bannerFrom: {
    ...TYPE.heading, fontSize: 12, letterSpacing: 0.8 },
  bannerText: { ...TYPE.body, letterSpacing: 0.3, fontSize: 14, marginTop: 2, lineHeight: 20 },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderWidth: 1 },
  chip: {
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
    minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center',
  },
  chipDisabled: { opacity: 0.4 },
  chipIcon: { ...TYPE.data, fontSize: 10, letterSpacing: 2 },
  chipText: {
    ...TYPE.heading, fontSize: 12, letterSpacing: 0.8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  composer: { borderWidth: 1, padding: 16 },
  composerTitle: {
    ...TYPE.heading, fontSize: 16, letterSpacing: 1, marginBottom: 12 },
  input: { ...TYPE.body, letterSpacing: 0.3, borderWidth: 1, minHeight: 88, padding: 10, fontSize: 16, textAlignVertical: 'top' },
  counter: {
    ...TYPE.data, letterSpacing: 0.5, fontSize: 11, textAlign: 'right', marginTop: 4 },
  composerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  action: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  actionText: {
    ...TYPE.heading, fontSize: 13, letterSpacing: 0.8 },
});
