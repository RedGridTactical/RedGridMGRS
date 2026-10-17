/**
 * foldGeometry — normalizes platform-reported folding features into the shape
 * adaptiveLayout understands. The native side (Android Jetpack WindowManager
 * via the app's own WindowLayout module) reports bounds in window dp. iOS has
 * no equivalent in the selected toolchain, so it reports nothing and the
 * layout falls back to size-only decisions. Nothing is invented when the
 * platform is silent.
 */

const ORIENTATIONS = { HORIZONTAL: 'horizontal', VERTICAL: 'vertical', horizontal: 'horizontal', vertical: 'vertical' };
const STATES = { FLAT: 'flat', HALF_OPENED: 'halfOpened', flat: 'flat', halfOpened: 'halfOpened' };
const OCCLUSION = { NONE: 'none', FULL: 'full', none: 'none', full: 'full' };

function readBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const b = { left: Number(bounds.left), top: Number(bounds.top), right: Number(bounds.right), bottom: Number(bounds.bottom) };
  if (![b.left, b.top, b.right, b.bottom].every(Number.isFinite)) return null;
  if (b.right < b.left || b.bottom < b.top) return null;
  return b;
}

/**
 * @param {object} payload `{ features: [...] }` or a bare array from the native module
 * @param {{width:number,height:number}} [window] used to drop features outside the window
 */
export function normalizeFoldingFeatures(payload, window) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.features) ? payload.features : [];
  const out = [];
  for (const feature of list) {
    if (!feature || typeof feature !== 'object') continue;
    const bounds = readBounds(feature.bounds);
    const orientation = ORIENTATIONS[feature.orientation];
    if (!bounds || !orientation) continue;
    if (window && Number.isFinite(window.width) && Number.isFinite(window.height)) {
      if (bounds.left < 0 || bounds.top < 0 || bounds.right > window.width || bounds.bottom > window.height) continue;
    }
    out.push({
      bounds,
      orientation,
      state: STATES[feature.state] || 'flat',
      isSeparating: feature.isSeparating === true,
      occlusion: OCCLUSION[feature.occlusionType ?? feature.occlusion] || 'none',
    });
  }
  return out;
}

export const NO_FOLDING_FEATURES = Object.freeze([]);
