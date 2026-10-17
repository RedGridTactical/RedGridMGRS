/**
 * adaptiveLayout — pure decision for the GRID / MAP workspace.
 *
 * The app used to pick its layout from orientation alone. This resolver takes
 * the actual window size, system insets, the user's font scale and, when the
 * platform reports them, folding features, and answers one question: can two
 * panes (the readout and the single map instance) both be useful, or does the
 * familiar single-pane layout stay?
 *
 * Nothing here reads sensors, device names or hinge angles. Fold-dependent
 * arrangements (tabletop, hinge-split desk) only happen when a folding feature
 * with real bounds is supplied; an ordinary landscape phone is never treated
 * as folded. All sizes are in layout points (dp).
 */

export const LAYOUT_LIMITS = Object.freeze({
  // Minimum pane sizes at font scale 1. The readout grows with text size, the
  // map does not (its chrome is small and fixed), so the two scale differently.
  gridMinWidth: 300,
  mapMinWidth: 320,
  // A landscape phone (about 390 dp tall) must stay single-pane; tablets and open foldables clear this.
  paneMinHeight: 420,
  // Tabletop: readout above the fold, map/controls below.
  tabletopTopMin: 230,
  tabletopBottomMin: 300,
  // Largest font scale that widens the readout requirement.
  maxTextScale: 1.6,
  // Above this text scale two panes are never offered: 2.5-3x content overflows
  // any pane we can give it, so the familiar single scrolling screen stays.
  maxExpandFontScale: 2.0,
  // Smallest single region worth constraining content to beside a physical hinge.
  regionMinWidth: 200,
  regionMinHeight: 200,
  // Share of the usable width given to the readout when no fold dictates it.
  primaryShare: 0.42,
  divider: 1,
});

const ZERO_INSETS = Object.freeze({ top: 0, bottom: 0, left: 0, right: 0 });
const FOLD_TABS = Object.freeze(['grid', 'map']);
const EXPAND_TABS = Object.freeze(['grid', 'map', 'lists']);

const finite = value => Number.isFinite(value) && value >= 0;
const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

function readInsets(insets) {
  const source = insets || ZERO_INSETS;
  return {
    top: Math.max(0, num(source.top)),
    bottom: Math.max(0, num(source.bottom)),
    left: Math.max(0, num(source.left)),
    right: Math.max(0, num(source.right)),
  };
}

/** Text scale that affects pane minimums: clamped so huge settings cannot push every layout to compact forever. */
export function textScale(fontScale) {
  if (!Number.isFinite(fontScale) || fontScale <= 1) return 1;
  return Math.min(fontScale, LAYOUT_LIMITS.maxTextScale);
}

export function gridMinWidth(fontScale) {
  return Math.round(LAYOUT_LIMITS.gridMinWidth * textScale(fontScale));
}

/**
 * The arrangement a tab can expand into, or null when it stays single-pane.
 * Pane availability is part of the decision: LISTS can only become the route
 * book when the lists screen itself is available (Pro); for a Free user the
 * tab shows the single-pane upsell, so no split may be chosen for it.
 */
export function arrangementForTab(tab, isPro = false) {
  if (tab === 'grid' || tab === 'map') return 'fieldDesk';
  if (tab === 'lists') return isPro ? 'routeBook' : null;
  return null;
}

function compact(input, reason, extra) {
  return {
    mode: 'compact',
    arrangement: 'compact',
    axis: null,
    panes: null,
    hinge: null,
    region: null,
    contentInsets: null,
    usable: input.usable,
    origin: input.origin,
    measured: !!input.measured,
    landscape: input.landscape,
    reason,
    ...(extra || {}),
  };
}

/** A measured workspace frame in window coordinates, or null when unusable. Malformed frames are ignored, never "repaired". */
export function readFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const { x, y, width, height } = frame;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Translate window-coordinate folding features into workspace coordinates and clip them to the usable area. */
export function localizeFoldingFeatures(foldingFeatures, origin, usable) {
  if (!Array.isArray(foldingFeatures)) return [];
  const out = [];
  for (const feature of foldingFeatures) {
    if (!feature || !feature.bounds) continue;
    const { left, top, right, bottom } = feature.bounds;
    if (![left, top, right, bottom].every(Number.isFinite) || right < left || bottom < top) continue;
    const l = Math.max(0, left - origin.x), t = Math.max(0, top - origin.y);
    const r = Math.min(usable.width, right - origin.x), b = Math.min(usable.height, bottom - origin.y);
    // A feature entirely above, below or beside the workspace (e.g. under the
    // top chrome) does not touch the workspace at all.
    if (r < l || b < t) continue;
    if (feature.orientation === 'vertical' && (r < 0 || l > usable.width)) continue;
    if (feature.orientation === 'horizontal' && (b < 0 || t > usable.height)) continue;
    out.push({ ...feature, bounds: { left: l, top: t, right: r, bottom: b } });
  }
  return out;
}

/** When two panes cannot be offered beside a physical hinge, pick the larger region so nothing sits under the hinge. */
function singleRegion(fold, usable, reason, input) {
  const regions = fold.axis === 'vertical'
    ? [rect(0, 0, fold.start, usable.height), rect(fold.end, 0, usable.width - fold.end, usable.height)]
    : [rect(0, 0, usable.width, fold.start), rect(0, fold.end, usable.width, usable.height - fold.end)];
  // Content is ALWAYS kept off the hinge: the larger clear region with a
  // positive area wins (leading region on ties). A region under the preferred
  // minimum is still used (the screens scroll); only a hinge that leaves no
  // clear area at all yields no region, and that is reported explicitly.
  const clear = regions.filter(r => r.width > 0 && r.height > 0);
  if (!clear.length) return compact(input, reason, { hinge: fold, region: null, contentInsets: null, regionUnusable: true });
  const region = clear.reduce((best, r) => (r.width * r.height > best.width * best.height ? r : best), clear[0]);
  const belowPreferred = region.width < LAYOUT_LIMITS.regionMinWidth || region.height < LAYOUT_LIMITS.regionMinHeight;
  const contentInsets = { top: region.y, left: region.x, right: usable.width - region.x - region.width, bottom: usable.height - region.y - region.height };
  return compact(input, reason, { hinge: fold, region, contentInsets, regionUnusable: false, regionBelowPreferred: belowPreferred });
}

function rect(x, y, width, height) {
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Choose the first folding feature that actually separates the window (hinge-split), if any. */
export function separatingFold(foldingFeatures, usable) {
  if (!Array.isArray(foldingFeatures)) return null;
  for (const feature of foldingFeatures) {
    if (!feature || !feature.bounds) continue;
    const { left, top, right, bottom } = feature.bounds;
    if (![left, top, right, bottom].every(Number.isFinite)) continue;
    if (right < left || bottom < top) continue;
    // Workspace coordinates by now (see localizeFoldingFeatures).
    const separating = feature.isSeparating === true || feature.state === 'halfOpened' || feature.occlusion === 'full';
    if (!separating) continue;
    if (feature.orientation === 'vertical' && right <= usable.width && left >= 0) {
      return { axis: 'vertical', start: left, end: right, occludes: feature.occlusion === 'full' || right > left };
    }
    if (feature.orientation === 'horizontal' && bottom <= usable.height && top >= 0) {
      return { axis: 'horizontal', start: top, end: bottom, occludes: feature.occlusion === 'full' || bottom > top };
    }
  }
  return null;
}

/**
 * @param {object} input
 * @param {number} input.width window width in dp
 * @param {number} input.height window height in dp
 * @param {number} [input.fontScale]
 * @param {{top:number,bottom:number,left:number,right:number}} [input.insets] system insets already applied by SafeAreaView
 * @param {number} [input.bottomChrome] height of the app's own bottom chrome (tab bar)
 * @param {number} [input.topChrome] height of app chrome above the workspace (display switch, nav bar)
 * @param {Array} [input.foldingFeatures] normalized folding features in WINDOW dp (see foldGeometry.js)
 * @param {{x:number,y:number,width:number,height:number}} [input.frame] the workspace container's measured frame in window dp.
 *        When present it is the single source of truth for the usable area and the coordinate origin; insets and chrome
 *        are then already accounted for by the native layout and are not subtracted again.

 * @param {string} [input.tab] active tab id
 * @param {boolean} [input.isPro] whether the Pro-only pane content (LISTS) is available
 * @param {boolean} [input.isRTL]
 */
export function resolveWorkspaceLayout(input = {}) {
  const width = num(input.width), height = num(input.height);
  const insets = readInsets(input.insets);
  const bottomChrome = Math.max(0, num(input.bottomChrome));
  const topChrome = Math.max(0, num(input.topChrome));
  const frame = readFrame(input.frame);
  // Measured frame first; otherwise an estimate from the window with insets and chrome removed once.
  const usable = frame
    ? { width: frame.width, height: frame.height }
    : { width: Math.max(0, width - insets.left - insets.right), height: Math.max(0, height - insets.top - insets.bottom - bottomChrome - topChrome) };
  const origin = frame ? { x: frame.x, y: frame.y } : { x: insets.left, y: insets.top + topChrome };
  const base = { usable, origin, measured: !!frame, landscape: finite(width) && finite(height) && width > height };
  if (!finite(width) || !finite(height) || width === 0 || height === 0) return compact(base, 'no-dimensions');
  if (usable.width <= 0 || usable.height <= 0) return compact(base, 'no-usable-area');

  const scale = input.fontScale;
  const textTooLarge = Number.isFinite(scale) && scale > LAYOUT_LIMITS.maxExpandFontScale;
  const localFeatures = localizeFoldingFeatures(input.foldingFeatures, origin, usable);
  const fold = separatingFold(localFeatures, usable);
  const isRTL = input.isRTL === true;

  const arrangement = arrangementForTab(input.tab, input.isPro === true);
  // A physical, separating hinge is respected even on single-pane tabs or when
  // two panes cannot fit: content is constrained to the larger clear region.
  if (!arrangement) return fold ? singleRegion(fold, usable, 'fold-single-region', base) : compact(base, 'tab-single-pane');
  if (textTooLarge) return fold ? singleRegion(fold, usable, 'text-too-large', base) : compact(base, 'text-too-large');

  const gridMin = gridMinWidth(scale);
  const mapMin = LAYOUT_LIMITS.mapMinWidth;

  // 1. A real vertical hinge splits the desk exactly at the hinge; nothing is laid under it.
  if (fold && fold.axis === 'vertical') {
    const leftWidth = fold.start, rightWidth = usable.width - fold.end;
    // The readout sits on the leading side (left in LTR, right in RTL); the map takes the other side.
    const primaryWidth = isRTL ? rightWidth : leftWidth;
    const mapWidth = isRTL ? leftWidth : rightWidth;
    if (primaryWidth < gridMin || mapWidth < mapMin || usable.height < LAYOUT_LIMITS.paneMinHeight) {
      return singleRegion(fold, usable, 'fold-pane-too-small', base);
    }
    const primary = isRTL ? rect(fold.end, 0, rightWidth, usable.height) : rect(0, 0, leftWidth, usable.height);
    const map = isRTL ? rect(0, 0, leftWidth, usable.height) : rect(fold.end, 0, rightWidth, usable.height);
    return { mode: 'expanded', arrangement, axis: 'row', panes: { primary, map }, hinge: fold, region: null, contentInsets: null, usable, origin, measured: !!frame, landscape: base.landscape, reason: 'vertical-fold' };
  }

  // 2. A horizontal hinge: readout above, map below. This is the tabletop
  //    FOUNDATION only (whole readout screen above, whole map below), not the
  //    upper-readout / lower-controls arrangement illustrated in the concepts.
  if (fold && fold.axis === 'horizontal') {
    if (!FOLD_TABS.includes(input.tab)) return singleRegion(fold, usable, 'tabletop-tab-single-pane', base);
    const topHeight = fold.start, bottomHeight = usable.height - fold.end;
    if (topHeight < LAYOUT_LIMITS.tabletopTopMin * textScale(scale) || bottomHeight < LAYOUT_LIMITS.tabletopBottomMin || usable.width < mapMin) {
      return singleRegion(fold, usable, 'tabletop-pane-too-small', base);
    }
    return {
      mode: 'expanded', arrangement: 'tabletop', axis: 'column',
      panes: { primary: rect(0, 0, usable.width, topHeight), map: rect(0, fold.end, usable.width, bottomHeight) },
      hinge: fold, region: null, contentInsets: null, usable, origin, measured: !!frame, landscape: base.landscape, reason: 'horizontal-fold',
    };
  }

  // 3. No fold: expand only when both panes fit at this text size.
  if (usable.width < gridMin + mapMin + LAYOUT_LIMITS.divider) return compact(base, 'width-too-small');
  if (usable.height < LAYOUT_LIMITS.paneMinHeight) return compact(base, 'height-too-small');
  const primaryWidth = Math.min(Math.max(Math.round(usable.width * LAYOUT_LIMITS.primaryShare), gridMin), usable.width - mapMin - LAYOUT_LIMITS.divider);
  const mapWidth = usable.width - primaryWidth - LAYOUT_LIMITS.divider;
  const primary = isRTL ? rect(usable.width - primaryWidth, 0, primaryWidth, usable.height) : rect(0, 0, primaryWidth, usable.height);
  const map = isRTL ? rect(0, 0, mapWidth, usable.height) : rect(primaryWidth + LAYOUT_LIMITS.divider, 0, mapWidth, usable.height);
  return { mode: 'expanded', arrangement, axis: 'row', panes: { primary, map }, hinge: null, region: null, contentInsets: null, usable, origin, measured: !!frame, landscape: base.landscape, reason: 'size' };
}

function insetsFromHinge(hinge, usable) {
  if (!hinge || !usable) return null;
  const total = hinge.axis === 'vertical' ? usable.width : usable.height;
  const before = hinge.start, after = total - hinge.end;
  if (before <= 0 && after <= 0) return null;
  const keepBefore = before >= after;
  if (hinge.axis === 'vertical') return keepBefore ? { top: 0, left: 0, right: total - hinge.start, bottom: 0 } : { top: 0, left: hinge.end, right: 0, bottom: 0 };
  return keepBefore ? { top: 0, left: 0, right: 0, bottom: total - hinge.start } : { top: hinge.end, left: 0, right: 0, bottom: 0 };
}

/**
 * The render plan for the workspace: an ordered list of slots with stable keys.
 * The map slot is always the last entry and is present at most once, so the
 * element's tree position never changes between compact and expanded, which
 * is the precondition for React to keep the native map mounted across a
 * resize. (Native confirmation of no-remount still needs a device test.)
 */
export function planWorkspaceSlots({ layout, panes, isRTL = false }) {
  const expanded = layout.mode === 'expanded' && panes.mapMounted && panes.primaryVisible;
  const axis = expanded ? layout.axis : null;
  const paneStyle = pane => (axis === 'column' ? { flex: 0, height: pane.height } : { flex: 0, width: pane.width });
  const hingeSize = layout.hinge ? layout.hinge.end - layout.hinge.start : LAYOUT_LIMITS.divider;
  const slots = [];
  slots.push({ key: 'primary', mounted: !!panes.primaryVisible, style: expanded ? paneStyle(layout.panes.primary) : { flex: 1 } });
  slots.push({ key: 'hinge', mounted: expanded, style: axis === 'column' ? { height: hingeSize } : { width: hingeSize }, physical: !!layout.hinge });
  slots.push({ key: 'map', mounted: !!panes.mapMounted, style: expanded ? paneStyle(layout.panes.map) : { flex: 1 } });
  // Padding that keeps single-region content clear of a physical hinge. RN
  // swaps left/right under RTL, so physical values are pre-swapped here.
  // Safety net: if a hinge is known but no region was resolved for a
  // single-pane render (e.g. an expanded layout whose panes are unavailable),
  // derive the larger clear side of the hinge here rather than span it.
  const c = layout.contentInsets || (!expanded && layout.hinge ? insetsFromHinge(layout.hinge, layout.usable) : null);
  const padding = c ? { paddingTop: c.top, paddingBottom: c.bottom, paddingLeft: isRTL ? c.right : c.left, paddingRight: isRTL ? c.left : c.right } : null;
  return { expanded, axis, slots, padding, direction: axis === 'row' ? 'row' : 'column' };
}

/**
 * Which content the two workspace slots carry for a tab. Pure so the lifecycle
 * invariant (one map instance, mounted only while visible, never hidden in
 * the background) can be tested without React.
 */
export function resolvePaneContent({ layout, tab, isPro }) {
  const expanded = layout && layout.mode === 'expanded' && EXPAND_TABS.includes(tab);
  if (!expanded) {
    return { primary: tab === 'map' ? null : tab, mapMounted: tab === 'map', primaryVisible: tab !== 'map', arrangement: 'compact' };
  }
  if (tab === 'lists') {
    if (!isPro) return { primary: 'lists', mapMounted: false, primaryVisible: true, arrangement: 'compact' };
    return { primary: 'lists', mapMounted: true, primaryVisible: true, arrangement: 'routeBook' };
  }
  return { primary: 'grid', mapMounted: true, primaryVisible: true, arrangement: layout.arrangement };
}

/** Arrow diameter for the readout given the pane it lives in. */
export function arrowSizeFor({ mode, landscape, pane, height }) {
  if (mode === 'expanded' && pane) return Math.max(120, Math.min(Math.round(pane.width * 0.55), 200));
  if (landscape) return Math.min(Math.round(num(height) * 0.52), 190);
  return 200;
}
