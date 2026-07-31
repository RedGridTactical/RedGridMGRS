import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { ToolRow, ToolDivider, ToolHint } from './ToolShared';
import { useColors } from '../../utils/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import {
  sosSchedule, groundToAirSchedule, scheduleDurationMs, estimateDutyCycle, DEFAULT_DIT_MS,
} from '../../utils/signalling';
import { tapHeavy } from '../../utils/haptics';

/** Gap between repeats of the SOS prosign, so the pattern reads as deliberate. */
const SOS_LOOP_GAP_MS = 7 * DEFAULT_DIT_MS;

const MODES = {
  SOS: 'sos',
  GROUND_TO_AIR: 'gta',
};

/**
 * Emergency light signalling. Deliberately NOT a Pro feature: gating a distress
 * signal behind a paywall is indefensible.
 *
 * The strobe drives a full-screen white/black Modal rather than the torch —
 * no extra permission, works on every device, and the screen is a large,
 * diffuse source that is easier to spot than a phone LED at distance.
 */
export function SignalTool() {
  const colors = useColors();
  const { t } = useTranslation();
  const [mode, setMode] = useState(MODES.SOS);
  const [running, setRunning] = useState(false);
  const [lit, setLit] = useState(false);

  const timerRef = useRef(null);
  const stepRef = useRef(0);

  const schedule = mode === MODES.SOS ? sosSchedule() : groundToAirSchedule();
  const loopGap = mode === MODES.SOS ? SOS_LOOP_GAP_MS : 0;
  const cycleMs = scheduleDurationMs(schedule) + loopGap;
  const duty = estimateDutyCycle(schedule, loopGap);

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    stepRef.current = 0;
    setRunning(false);
    setLit(false);
  }, []);

  // Drive the pattern with a self-rescheduling timeout rather than setInterval:
  // step durations differ, and setInterval would drift against them.
  useEffect(() => {
    if (!running) return undefined;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const steps = schedule;
      if (!steps.length) return;
      const idx = stepRef.current % steps.length;
      const step = steps[idx];
      setLit(step.on);
      const isLast = idx === steps.length - 1;
      const wait = step.ms + (isLast ? loopGap : 0);
      stepRef.current = idx + 1;
      timerRef.current = setTimeout(tick, wait);
    };
    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [running, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Never leave a timer alive if the tool unmounts mid-signal.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const start = () => { tapHeavy(); stepRef.current = 0; setRunning(true); };

  return (
    <View>
      <View style={styles.modeRow}>
        {[
          { id: MODES.SOS, label: t('signal.modeSos') },
          { id: MODES.GROUND_TO_AIR, label: t('signal.modeGroundAir') },
        ].map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.modeBtn, { borderColor: colors.border }, mode === m.id && { borderColor: colors.text, backgroundColor: colors.card2 }]}
            onPress={() => { if (!running) setMode(m.id); }}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.id }}
            accessibilityLabel={m.label}
          >
            <Text style={[styles.modeText, { color: mode === m.id ? colors.text : colors.text3 }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ToolHint text={mode === MODES.SOS ? t('signal.sosExplain') : t('signal.groundAirExplain')} />

      <ToolDivider />
      <ToolRow label={t('signal.cycle')} value={`${(cycleMs / 1000).toFixed(1)} s`} />
      <ToolRow label={t('signal.dutyCycle')} value={`${Math.round(duty * 100)}%`} />
      <ToolHint text={t('signal.batteryNote')} />

      <TouchableOpacity
        style={[styles.startBtn, { borderColor: colors.text }]}
        onPress={start}
        accessibilityRole="button"
        accessibilityLabel={t('signal.start')}
      >
        <Text style={[styles.startText, { color: colors.text }]}>{t('signal.start')}</Text>
      </TouchableOpacity>

      <Modal visible={running} animationType="fade" onRequestClose={stop} supportedOrientations={['portrait', 'landscape']}>
        <Pressable
          style={[styles.strobe, { backgroundColor: lit ? '#FFFFFF' : '#000000' }]}
          onPress={stop}
          accessibilityRole="button"
          accessibilityLabel={t('signal.stop')}
        >
          <Text style={[styles.stopHint, { color: lit ? '#000000' : '#FFFFFF' }]}>{t('signal.stop')}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeBtn: { flex: 1, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  modeText: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  startBtn: { borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  startText: { fontSize: 12, letterSpacing: 4, fontWeight: '700' },
  strobe: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48 },
  stopHint: { fontSize: 11, letterSpacing: 3, opacity: 0.7 },
});
