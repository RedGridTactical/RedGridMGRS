// Process-local presentation safety only. No usage data or identifiers leave the device.
const blockers = new Set();
let lastChange = 0;
export const REVIEW_SETTLE_MS = 2000;

export function setReviewBlocker(key, visible) {
  if (visible === blockers.has(key)) return;
  if (visible) blockers.add(key);
  else blockers.delete(key);
  lastChange = Date.now();
}

export function noteReviewDismissal() { lastChange = Date.now(); }

// Android has no native Modal onDismiss callback; allow its closing animation
// to settle too. iOS also resets the grace period on actual native dismissal.
export function isReviewPresentationIdle() {
  return blockers.size === 0 && Date.now() - lastChange >= REVIEW_SETTLE_MS;
}
