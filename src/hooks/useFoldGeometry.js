/**
 * useFoldGeometry — folding features reported by the platform, normalized
 * for adaptiveLayout. Android: the app's own WindowLayout native module
 * (Jetpack WindowManager) emits the current features and changes. iOS with
 * the selected toolchain has no fold API, so this hook returns an empty list
 * there; no fold is ever invented from device names or orientation.
 */
import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform, useWindowDimensions } from 'react-native';
import { normalizeFoldingFeatures, NO_FOLDING_FEATURES } from '../utils/foldGeometry';

const nativeModule = Platform.OS === 'android' ? NativeModules.RedGridWindowLayout : null;
export const FOLD_EVENT = 'RedGridWindowLayoutChanged';

export function useFoldGeometry() {
  const { width, height } = useWindowDimensions();
  const [raw, setRaw] = useState(null);

  useEffect(() => {
    if (!nativeModule || typeof nativeModule.getCurrent !== 'function') return undefined;
    let active = true;
    let subscription = null;
    // Events are newer than the initial snapshot by definition: once one has
    // arrived, a late-resolving getCurrent() must not overwrite it.
    let eventSeen = false;
    try {
      const emitter = new NativeEventEmitter(nativeModule);
      subscription = emitter.addListener(FOLD_EVENT, payload => { if (!active) return; eventSeen = true; setRaw(payload); });
      Promise.resolve(nativeModule.getCurrent()).then(payload => { if (active && !eventSeen) setRaw(payload); }).catch(() => {});
    } catch {
      // A missing or broken native side means "no fold information", nothing more.
    }
    return () => { active = false; try { subscription?.remove?.(); } catch {} };
  }, []);

  if (!raw) return NO_FOLDING_FEATURES;
  const features = normalizeFoldingFeatures(raw, { width, height });
  return features.length ? features : NO_FOLDING_FEATURES;
}
