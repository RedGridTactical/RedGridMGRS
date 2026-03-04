/**
 * haptics.js — Safe haptic feedback wrapper.
 * Gracefully degrades when expo-haptics is unavailable.
 */

let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch (e) {
  // expo-haptics not available
}

/** Light tap — tab switches, toggles */
export function tapLight() {
  try {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

/** Medium tap — button presses, card expand */
export function tapMedium() {
  try {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

/** Heavy tap — waypoint set, important actions */
export function tapHeavy() {
  try {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

/** Success — copy complete, waypoint saved */
export function notifySuccess() {
  try {
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

/** Warning — error, invalid input */
export function notifyWarning() {
  try {
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
  } catch {}
}

/** Error — critical failure */
export function notifyError() {
  try {
    Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Error);
  } catch {}
}

/** Selection tick — scrolling through options */
export function selectionTick() {
  try {
    Haptics?.selectionAsync?.();
  } catch {}
}
