/**
 * useSafeInsets — react-native-safe-area-context's insets, or zeros when the
 * provider is absent (unit tests, a component rendered outside the app
 * shell). Keeps screen components free of a hard dependency on the native
 * module while still letting them clear the home indicator / nav bar.
 */
const ZERO = Object.freeze({ top: 0, bottom: 0, left: 0, right: 0 });
let useInsets = () => ZERO;
try {
  const safeArea = require('react-native-safe-area-context');
  if (typeof safeArea.useSafeAreaInsets === 'function') useInsets = safeArea.useSafeAreaInsets;
} catch {
  // No native safe-area module in this environment; zeros are the safe answer.
}

export function useSafeInsets() {
  try { return useInsets() || ZERO; } catch { return ZERO; }
}
