import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { speakMGRS, stopSpeaking, onSpeechStateChange } from '../utils/voice';
import { useShakeToSpeak } from './useShakeToSpeak';

export function useFieldVoice(mgrs, { enabled, shakeEnabled, tacticalMode, tacticalSound }) {
  const [speaking, setSpeaking] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const foregroundRef = useRef(foreground);
  const soundBlocked = tacticalMode && !tacticalSound;
  const allowed = enabled && foreground && !soundBlocked;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  useEffect(() => onSpeechStateChange(setSpeaking), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      foregroundRef.current = active;
      if (!active) stopSpeaking();
      setForeground(active);
    });
    return () => { subscription.remove(); stopSpeaking(); };
  }, []);
  useEffect(() => { if (!allowed || !mgrs) stopSpeaking(); }, [allowed, mgrs]);
  const toggleSpeech = useCallback(() => {
    if (speaking) return stopSpeaking();
    if (!allowedRef.current || !foregroundRef.current || !mgrs) return Promise.resolve(false);
    return speakMGRS(mgrs);
  }, [speaking, mgrs]);
  useShakeToSpeak(mgrs, allowed && shakeEnabled && !speaking, toggleSpeech);
  return { speaking, toggleSpeech, soundBlocked, foreground };
}
