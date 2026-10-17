/** Workspace layout: size, text scale, insets, fold geometry and RTL decide compact vs expanded. */
const { resolveWorkspaceLayout, resolvePaneContent, arrowSizeFor, gridMinWidth, LAYOUT_LIMITS, separatingFold, localizeFoldingFeatures, readFrame, planWorkspaceSlots } = require('../src/utils/adaptiveLayout');

const phone = { width: 390, height: 844, fontScale: 1, tab: 'grid' };
const tablet = { width: 1024, height: 768, fontScale: 1, tab: 'grid' };
const vFold = (left = 390, right = 410) => [{ bounds: { left, top: 0, right, bottom: 700 }, orientation: 'vertical', state: 'halfOpened', isSeparating: true, occlusion: 'full' }];
const hFold = (top = 380, bottom = 400, height = 800) => [{ bounds: { left: 0, top, right: 800, bottom }, orientation: 'horizontal', state: 'halfOpened', isSeparating: true, occlusion: 'none' }];

describe('compact fallbacks', () => {
  test('a portrait phone stays compact and is not landscape', () => {
    const l = resolveWorkspaceLayout(phone);
    expect(l).toMatchObject({ mode: 'compact', arrangement: 'compact', panes: null, hinge: null, landscape: false, reason: 'width-too-small' });
  });
  test('a landscape phone stays compact but reports landscape; it is never treated as folded', () => {
    const l = resolveWorkspaceLayout({ ...phone, width: 844, height: 390 });
    expect(l.mode).toBe('compact');
    expect(l.landscape).toBe(true);
    expect(l.reason).toBe('height-too-small');
  });
  test('missing or zero dimensions fall back safely', () => {
    expect(resolveWorkspaceLayout({}).reason).toBe('no-dimensions');
    expect(resolveWorkspaceLayout({ width: NaN, height: 800, tab: 'grid' }).mode).toBe('compact');
    expect(resolveWorkspaceLayout({ width: 0, height: 0, tab: 'grid' }).mode).toBe('compact');
  });
  test('tabs without a map pane never expand, even on a tablet', () => {
    for (const tab of ['tools', 'report', 'theme', 'coords', 'mesh']) {
      expect(resolveWorkspaceLayout({ ...tablet, tab }).reason).toBe('tab-single-pane');
    }
  });
});

describe('size-driven expansion', () => {
  test('a tablet expands GRID and MAP into the field desk with both pane minimums met', () => {
    const l = resolveWorkspaceLayout(tablet);
    expect(l).toMatchObject({ mode: 'expanded', arrangement: 'fieldDesk', axis: 'row', reason: 'size' });
    expect(l.panes.primary.width).toBeGreaterThanOrEqual(LAYOUT_LIMITS.gridMinWidth);
    expect(l.panes.map.width).toBeGreaterThanOrEqual(LAYOUT_LIMITS.mapMinWidth);
    expect(l.panes.primary.width + LAYOUT_LIMITS.divider + l.panes.map.width).toBe(1024);
    expect(l.panes.primary.x).toBe(0);
    expect(l.panes.map.x).toBe(l.panes.primary.width + LAYOUT_LIMITS.divider);
    expect(resolveWorkspaceLayout({ ...tablet, tab: 'map' }).arrangement).toBe('fieldDesk');
    expect(resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: true }).arrangement).toBe('routeBook');
    // Pane availability is part of the decision: a Free user's LISTS tab is the single-pane upsell.
    expect(resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: false }).reason).toBe('tab-single-pane');
    expect(resolveWorkspaceLayout({ ...tablet, tab: 'lists' }).reason).toBe('tab-single-pane');
  });
  test('font scale widens the readout requirement and can push a mid-size window back to compact', () => {
    expect(gridMinWidth(1)).toBe(300);
    expect(gridMinWidth(2)).toBe(Math.round(300 * LAYOUT_LIMITS.maxTextScale));
    expect(gridMinWidth(5)).toBe(gridMinWidth(2));
    const mid = { width: 760, height: 720, tab: 'grid' };
    expect(resolveWorkspaceLayout({ ...mid, fontScale: 1 }).mode).toBe('expanded');
    expect(resolveWorkspaceLayout({ ...mid, fontScale: 2 }).reason).toBe('width-too-small');
  });
  test('insets and app chrome reduce the usable area', () => {
    const tight = { width: 660, height: 520, fontScale: 1, tab: 'grid' };
    expect(resolveWorkspaceLayout(tight).mode).toBe('expanded');
    expect(resolveWorkspaceLayout({ ...tight, insets: { left: 30, right: 30, top: 0, bottom: 0 } }).reason).toBe('width-too-small');
    expect(resolveWorkspaceLayout({ ...tight, bottomChrome: 60, topChrome: 80 }).reason).toBe('height-too-small');
    const l = resolveWorkspaceLayout({ ...tight, insets: { top: 20, bottom: 20, left: 0, right: 0 }, bottomChrome: 50 });
    expect(l.usable).toEqual({ width: 660, height: 430 });
    expect(l.panes.primary.height).toBe(430);
  });
  test('RTL mirrors the panes: readout on the trailing right, map on the left', () => {
    const l = resolveWorkspaceLayout({ ...tablet, isRTL: true });
    expect(l.panes.map.x).toBe(0);
    expect(l.panes.primary.x).toBe(1024 - l.panes.primary.width);
  });
});

describe('fold geometry', () => {
  test('a separating vertical hinge splits the desk exactly at the hinge and nothing is laid under it', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 700, fontScale: 1, tab: 'map', foldingFeatures: vFold() });
    expect(l).toMatchObject({ mode: 'expanded', arrangement: 'fieldDesk', axis: 'row', reason: 'vertical-fold' });
    expect(l.hinge).toEqual({ axis: 'vertical', start: 390, end: 410, occludes: true });
    expect(l.panes.primary).toEqual({ x: 0, y: 0, width: 390, height: 700 });
    expect(l.panes.map).toEqual({ x: 410, y: 0, width: 390, height: 700 });
  });
  test('a vertical hinge in RTL puts the readout on the right panel', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 700, tab: 'grid', foldingFeatures: vFold(), isRTL: true });
    expect(l.panes.primary.x).toBe(410);
    expect(l.panes.map.x).toBe(0);
  });
  test('a hinge that leaves one panel too small falls back to a single clear region, never to content across the hinge', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 700, fontScale: 1.6, tab: 'grid', foldingFeatures: vFold() });
    expect(l.mode).toBe('compact');
    expect(l.reason).toBe('fold-pane-too-small');
    expect(l.hinge).toEqual({ axis: 'vertical', start: 390, end: 410, occludes: true });
    // Equal regions: the leading one (where the readout would sit) wins deterministically.
    expect(l.region).toEqual({ x: 0, y: 0, width: 390, height: 700 });
    expect(l.contentInsets).toEqual({ top: 0, left: 0, right: 410, bottom: 0 });
    const narrow = resolveWorkspaceLayout({ width: 800, height: 700, tab: 'grid', foldingFeatures: vFold(200, 220) });
    expect(narrow.reason).toBe('fold-pane-too-small');
    expect(narrow.region).toEqual({ x: 220, y: 0, width: 580, height: 700 });
    expect(narrow.contentInsets.left).toBe(220);
  });
  test('a non-separating flat fold is ignored and size rules apply', () => {
    const flat = [{ bounds: { left: 390, top: 0, right: 390, bottom: 700 }, orientation: 'vertical', state: 'flat', isSeparating: false, occlusion: 'none' }];
    const l = resolveWorkspaceLayout({ width: 800, height: 700, tab: 'grid', foldingFeatures: flat });
    expect(l.reason).toBe('size');
    expect(separatingFold(flat, { width: 800, height: 700 })).toBeNull();
  });
  test('a horizontal hinge gives the tabletop arrangement only to readout tabs', () => {
    const base = { width: 800, height: 800, fontScale: 1, foldingFeatures: hFold() };
    const l = resolveWorkspaceLayout({ ...base, tab: 'grid' });
    expect(l).toMatchObject({ mode: 'expanded', arrangement: 'tabletop', axis: 'column', reason: 'horizontal-fold' });
    expect(l.panes.primary).toEqual({ x: 0, y: 0, width: 800, height: 380 });
    expect(l.panes.map).toEqual({ x: 0, y: 400, width: 800, height: 400 });
    const lists = resolveWorkspaceLayout({ ...base, tab: 'lists', isPro: true });
    expect(lists.reason).toBe('tabletop-tab-single-pane');
    expect(lists.region).toEqual({ x: 0, y: 400, width: 800, height: 400 });
    expect(lists.contentInsets).toEqual({ top: 400, left: 0, right: 0, bottom: 0 });
    const tools = resolveWorkspaceLayout({ ...base, tab: 'tools' });
    expect(tools.reason).toBe('fold-single-region');
    expect(tools.region.y).toBe(400);
  });
  test('a horizontal hinge with too little room below or above falls back to the larger clear region', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 600, tab: 'grid', foldingFeatures: hFold(380, 400, 600) });
    expect(l.reason).toBe('tabletop-pane-too-small');
    expect(l.region).toEqual({ x: 0, y: 0, width: 800, height: 380 });
    expect(l.contentInsets).toEqual({ top: 0, left: 0, right: 0, bottom: 220 });
    expect(resolveWorkspaceLayout({ width: 800, height: 800, fontScale: 2, tab: 'grid', foldingFeatures: hFold(300, 320) }).reason).toBe('tabletop-pane-too-small');
  });
  test('a hinge whose clear regions are under the preferred size still constrains content to the larger one', () => {
    const l = resolveWorkspaceLayout({ width: 300, height: 300, tab: 'tools', foldingFeatures: [{ bounds: { left: 140, top: 0, right: 160, bottom: 300 }, orientation: 'vertical', isSeparating: true, occlusion: 'full' }] });
    expect(l.mode).toBe('compact');
    expect(l.region).toEqual({ x: 0, y: 0, width: 140, height: 300 });
    expect(l.contentInsets).toEqual({ top: 0, left: 0, right: 160, bottom: 0 });
    expect(l.regionUnusable).toBe(false);
    expect(l.regionBelowPreferred).toBe(true);
    expect(planWorkspaceSlots({ layout: l, panes: resolvePaneContent({ layout: l, tab: 'tools', isPro: false }) }).padding).toEqual({ paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 160 });
  });
  test('only a hinge that leaves no clear area at all yields no region, and says so', () => {
    const l = resolveWorkspaceLayout({ width: 300, height: 300, tab: 'tools', foldingFeatures: [{ bounds: { left: 0, top: 0, right: 300, bottom: 300 }, orientation: 'vertical', isSeparating: true, occlusion: 'full' }] });
    expect(l.region).toBeNull();
    expect(l.regionUnusable).toBe(true);
  });
  test('Free user on LISTS with a real vertical or horizontal hinge: single clear region, never the upsell across the hinge', () => {
    for (const [features, insets] of [[vFold(), { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 410 }], [hFold(), { paddingTop: 400, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }] /* bottom region (400) is larger than the top (380) */]) {
      const layout = resolveWorkspaceLayout({ width: 800, height: 800, fontScale: 1, tab: 'lists', isPro: false, foldingFeatures: features });
      expect(layout.mode).toBe('compact');
      expect(layout.reason).toBe('fold-single-region');
      expect(layout.region).not.toBeNull();
      const panes = resolvePaneContent({ layout, tab: 'lists', isPro: false });
      expect(panes).toEqual({ primary: 'lists', mapMounted: false, primaryVisible: true, arrangement: 'compact' });
      expect(planWorkspaceSlots({ layout, panes }).padding).toEqual(insets);
    }
    const pro = resolveWorkspaceLayout({ width: 800, height: 800, fontScale: 1, tab: 'lists', isPro: true, foldingFeatures: vFold() });
    expect(pro.mode).toBe('expanded'); expect(pro.arrangement).toBe('routeBook');
  });
  test('malformed fold features never throw and never expand on their own', () => {
    const junk = [null, {}, { bounds: { left: 'a' }, orientation: 'vertical' }, { bounds: { left: 10, top: 0, right: 5, bottom: 1 }, orientation: 'vertical', isSeparating: true }];
    expect(resolveWorkspaceLayout({ ...phone, foldingFeatures: junk }).mode).toBe('compact');
    expect(resolveWorkspaceLayout({ ...phone, foldingFeatures: 'nope' }).mode).toBe('compact');
  });
});

describe('pane content and lifecycle invariant', () => {
  const expanded = resolveWorkspaceLayout(tablet);
  const compactL = resolveWorkspaceLayout(phone);
  test('compact: the map is mounted only on the MAP tab and nothing else is visible beside it', () => {
    expect(resolvePaneContent({ layout: compactL, tab: 'map', isPro: false })).toEqual({ primary: null, mapMounted: true, primaryVisible: false, arrangement: 'compact' });
    expect(resolvePaneContent({ layout: compactL, tab: 'grid', isPro: false })).toEqual({ primary: 'grid', mapMounted: false, primaryVisible: true, arrangement: 'compact' });
    expect(resolvePaneContent({ layout: compactL, tab: 'tools', isPro: true }).mapMounted).toBe(false);
  });
  test('expanded: GRID and MAP tabs share one desk with one map; other tabs keep the map unmounted', () => {
    expect(resolvePaneContent({ layout: expanded, tab: 'grid', isPro: false })).toEqual({ primary: 'grid', mapMounted: true, primaryVisible: true, arrangement: 'fieldDesk' });
    expect(resolvePaneContent({ layout: expanded, tab: 'map', isPro: false })).toEqual({ primary: 'grid', mapMounted: true, primaryVisible: true, arrangement: 'fieldDesk' });
    for (const tab of ['tools', 'report', 'theme', 'coords', 'mesh']) {
      expect(resolvePaneContent({ layout: resolveWorkspaceLayout({ ...tablet, tab }), tab, isPro: true }).mapMounted).toBe(false);
    }
  });
  test('route book needs the LISTS entitlement; without Pro the lists tab stays single-pane', () => {
    expect(resolvePaneContent({ layout: resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: true }), tab: 'lists', isPro: true })).toEqual({ primary: 'lists', mapMounted: true, primaryVisible: true, arrangement: 'routeBook' });
    expect(resolvePaneContent({ layout: resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: false }), tab: 'lists', isPro: false })).toEqual({ primary: 'lists', mapMounted: false, primaryVisible: true, arrangement: 'compact' });
    // Belt and braces: even an expanded layout handed to a Free LISTS render keeps the map unmounted.
    expect(resolvePaneContent({ layout: resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: true }), tab: 'lists', isPro: false }).mapMounted).toBe(false);
  });
  test('the map is never mounted twice: every content answer has a single boolean slot', () => {
    for (const tab of ['grid', 'map', 'lists', 'tools']) {
      for (const layout of [expanded, compactL]) {
        const content = resolvePaneContent({ layout, tab, isPro: true });
        expect(typeof content.mapMounted).toBe('boolean');
      }
    }
  });
});

describe('arrow size', () => {
  test('follows the pane in expanded layouts and the old rules in compact ones', () => {
    expect(arrowSizeFor({ mode: 'compact', landscape: false })).toBe(200);
    expect(arrowSizeFor({ mode: 'compact', landscape: true, height: 390 })).toBe(Math.min(Math.round(390 * 0.52), 190));
    expect(arrowSizeFor({ mode: 'expanded', pane: { width: 300 } })).toBe(165);
    expect(arrowSizeFor({ mode: 'expanded', pane: { width: 600 } })).toBe(200);
    expect(arrowSizeFor({ mode: 'expanded', pane: { width: 100 } })).toBe(120);
  });
});

describe('coordinate space: measured frame, insets and top chrome', () => {
  const windowFold = [{ bounds: { left: 390, top: 0, right: 410, bottom: 900 }, orientation: 'vertical', state: 'halfOpened', isSeparating: true, occlusion: 'full' }];
  test('a measured frame is the single source of usable size and origin; insets and chrome are not subtracted twice', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 900, tab: 'grid', insets: { top: 40, bottom: 20, left: 0, right: 0 }, bottomChrome: 50, topChrome: 120, frame: { x: 0, y: 180, width: 800, height: 650 } });
    expect(l.measured).toBe(true);
    expect(l.usable).toEqual({ width: 800, height: 650 });
    expect(l.origin).toEqual({ x: 0, y: 180 });
    expect(l.panes.primary.height).toBe(650);
    expect(l.panes.primary.height + 0).toBeLessThanOrEqual(650);
  });
  test('a vertical hinge in window coordinates is translated into the frame and panes never exceed the frame', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 900, tab: 'map', foldingFeatures: windowFold, frame: { x: 0, y: 180, width: 800, height: 650 } });
    expect(l.reason).toBe('vertical-fold');
    expect(l.hinge).toEqual({ axis: 'vertical', start: 390, end: 410, occludes: true });
    expect(l.panes.primary).toEqual({ x: 0, y: 0, width: 390, height: 650 });
    expect(l.panes.map).toEqual({ x: 410, y: 0, width: 390, height: 650 });
  });
  test('a horizontal hinge is placed relative to the measured frame, not the window', () => {
    const fold = [{ bounds: { left: 0, top: 580, right: 800, bottom: 600 }, orientation: 'horizontal', state: 'halfOpened', isSeparating: true, occlusion: 'none' }];
    const l = resolveWorkspaceLayout({ width: 800, height: 1100, tab: 'grid', foldingFeatures: fold, frame: { x: 0, y: 200, width: 800, height: 850 } });
    expect(l.reason).toBe('horizontal-fold');
    expect(l.hinge).toEqual({ axis: 'horizontal', start: 380, end: 400, occludes: true });
    expect(l.panes.primary).toEqual({ x: 0, y: 0, width: 800, height: 380 });
    expect(l.panes.map).toEqual({ x: 0, y: 400, width: 800, height: 450 });
    expect(l.panes.primary.height + (l.hinge.end - l.hinge.start) + l.panes.map.height).toBe(850);
  });
  test('a frame with a horizontal x offset (split screen, RTL) translates a vertical hinge by that offset', () => {
    const fold = [{ bounds: { left: 690, top: 0, right: 710, bottom: 900 }, orientation: 'vertical', state: 'halfOpened', isSeparating: true, occlusion: 'full' }];
    const l = resolveWorkspaceLayout({ width: 1400, height: 900, tab: 'grid', foldingFeatures: fold, frame: { x: 300, y: 100, width: 800, height: 700 } });
    expect(l.hinge.start).toBe(390);
    expect(l.panes.map.x).toBe(410);
  });
  test('a hinge that lies entirely under the top chrome does not touch the workspace', () => {
    const fold = [{ bounds: { left: 0, top: 100, right: 800, bottom: 120 }, orientation: 'horizontal', state: 'halfOpened', isSeparating: true, occlusion: 'full' }];
    const l = resolveWorkspaceLayout({ width: 800, height: 900, tab: 'grid', foldingFeatures: fold, frame: { x: 0, y: 180, width: 800, height: 650 } });
    expect(l.hinge).toBeNull();
    expect(l.reason).toBe('size');
    expect(localizeFoldingFeatures(fold, { x: 0, y: 180 }, { width: 800, height: 650 })).toEqual([]);
  });
  test('before measurement, the estimate subtracts insets and chrome once and uses them as the origin', () => {
    const l = resolveWorkspaceLayout({ width: 800, height: 900, tab: 'grid', insets: { top: 40, bottom: 20, left: 10, right: 10 }, bottomChrome: 50, topChrome: 120 });
    expect(l.measured).toBe(false);
    expect(l.usable).toEqual({ width: 780, height: 670 });
    expect(l.origin).toEqual({ x: 10, y: 160 });
    const hinge = [{ bounds: { left: 0, top: 540, right: 800, bottom: 560 }, orientation: 'horizontal', state: 'halfOpened', isSeparating: true }];
    expect(resolveWorkspaceLayout({ width: 800, height: 1000, tab: 'grid', insets: { top: 40, bottom: 20, left: 10, right: 10 }, bottomChrome: 50, topChrome: 120, foldingFeatures: hinge }).hinge).toEqual({ axis: 'horizontal', start: 380, end: 400, occludes: true });
  });
  test('malformed frames are ignored rather than repaired', () => {
    expect(readFrame({ x: NaN, y: 0, width: 800, height: 600 })).toBeNull();
    expect(readFrame({ x: 0, y: 0, width: 0, height: 600 })).toBeNull();
    expect(readFrame({ x: -5, y: 0, width: 800, height: 600 })).toBeNull();
    expect(readFrame('frame')).toBeNull();
    const l = resolveWorkspaceLayout({ ...tablet, frame: { x: 0, y: 0, width: Infinity, height: 600 } });
    expect(l.measured).toBe(false);
    expect(l.usable.width).toBe(1024);
    expect(resolveWorkspaceLayout({ width: Infinity, height: 800, tab: 'grid' }).reason).toBe('no-dimensions');
    expect(resolveWorkspaceLayout({ width: 800, height: 800, tab: 'grid', insets: { left: 400, right: 400 } }).reason).toBe('no-usable-area');
  });
});

describe('true maximum text scale', () => {
  test.each([2.01, 2.5, 3.12, 5])('font scale %s never yields two panes, even on a tablet', fontScale => {
    const l = resolveWorkspaceLayout({ ...tablet, fontScale });
    expect(l.mode).toBe('compact');
    expect(l.reason).toBe('text-too-large');
  });
  test('at maximum text a physical hinge still constrains content to one clear region instead of two panes', () => {
    const l = resolveWorkspaceLayout({ width: 1200, height: 900, fontScale: 3.12, tab: 'grid', foldingFeatures: vFold(590, 610) });
    expect(l.mode).toBe('compact');
    expect(l.reason).toBe('text-too-large');
    expect(l.region).toEqual({ x: 0, y: 0, width: 590, height: 900 });
  });
  test('exactly 2.0 still allows a wide window to expand', () => {
    expect(resolveWorkspaceLayout({ width: 1200, height: 900, fontScale: 2, tab: 'grid' }).mode).toBe('expanded');
  });
});

describe('workspace slot plan (stable tree positions for the single map)', () => {
  const tabletLayout = resolveWorkspaceLayout(tablet);
  const phoneLayout = resolveWorkspaceLayout(phone);
  const plan = (layout, tab, isPro = true, isRTL = false) => planWorkspaceSlots({ layout, panes: resolvePaneContent({ layout, tab, isPro }), isRTL });
  test('slot order and keys are identical in compact and expanded, so the map element keeps its position', () => {
    const keys = p => p.slots.map(s => s.key);
    expect(keys(plan(tabletLayout, 'grid'))).toEqual(['primary', 'hinge', 'map']);
    expect(keys(plan(phoneLayout, 'map'))).toEqual(['primary', 'hinge', 'map']);
    expect(keys(plan(phoneLayout, 'tools'))).toEqual(['primary', 'hinge', 'map']);
  });
  test('the map slot is mounted at most once and only when visible across a tab and layout walk', () => {
    const walk = [[phoneLayout, 'grid'], [phoneLayout, 'map'], [tabletLayout, 'map'], [tabletLayout, 'grid'], [tabletLayout, 'tools'], [phoneLayout, 'map'], [resolveWorkspaceLayout({ ...tablet, tab: 'lists', isPro: true }), 'lists']];
    for (const [layout, tab] of walk) {
      const p = plan(layout, tab);
      expect(p.slots.filter(s => s.key === 'map' && s.mounted).length).toBeLessThanOrEqual(1);
      expect(p.slots[2].mounted).toBe(resolvePaneContent({ layout, tab, isPro: true }).mapMounted);
    }
  });
  test('expanded panes get absolute sizes from the layout; compact slots flex', () => {
    const p = plan(tabletLayout, 'map');
    expect(p.expanded).toBe(true);
    expect(p.direction).toBe('row');
    expect(p.slots[0].style).toEqual({ flex: 0, width: tabletLayout.panes.primary.width });
    expect(p.slots[1]).toMatchObject({ mounted: true, physical: false, style: { width: 1 } });
    expect(p.slots[2].style).toEqual({ flex: 0, width: tabletLayout.panes.map.width });
    const c = plan(phoneLayout, 'map');
    expect(c.expanded).toBe(false);
    expect(c.slots[0].mounted).toBe(false);
    expect(c.slots[1].mounted).toBe(false);
    expect(c.slots[2]).toMatchObject({ mounted: true, style: { flex: 1 } });
    expect(c.padding).toBeNull();
  });
  test('a physical hinge becomes an empty strip of its real size, and single-region fallbacks become padding (pre-swapped for RTL)', () => {
    const folded = resolveWorkspaceLayout({ width: 800, height: 700, tab: 'map', foldingFeatures: vFold() });
    expect(plan(folded, 'map').slots[1]).toMatchObject({ mounted: true, physical: true, style: { width: 20 } });
    const single = resolveWorkspaceLayout({ width: 800, height: 700, fontScale: 1.6, tab: 'tools', foldingFeatures: vFold() });
    expect(plan(single, 'tools').padding).toEqual({ paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 410 });
    expect(plan(single, 'tools', true, true).padding).toEqual({ paddingTop: 0, paddingBottom: 0, paddingLeft: 410, paddingRight: 0 });
  });
});

describe('plan safety net', () => {
  test('an expanded hinge layout whose panes turn out unavailable is still kept off the hinge', () => {
    const layout = resolveWorkspaceLayout({ width: 800, height: 700, tab: 'map', foldingFeatures: vFold(300, 320) });
    expect(layout.mode).toBe('expanded'); expect(layout.contentInsets).toBeNull();
    // Simulate a render where the map pane cannot be mounted (single-pane content only).
    const plan = planWorkspaceSlots({ layout, panes: { primary: 'lists', mapMounted: false, primaryVisible: true, arrangement: 'compact' } });
    expect(plan.expanded).toBe(false);
    expect(plan.padding).toEqual({ paddingTop: 0, paddingBottom: 0, paddingLeft: 320, paddingRight: 0 });
    const horizontal = resolveWorkspaceLayout({ width: 800, height: 800, tab: 'grid', foldingFeatures: hFold(300, 320) });
    expect(planWorkspaceSlots({ layout: horizontal, panes: { primary: 'tools', mapMounted: false, primaryVisible: true, arrangement: 'compact' } }).padding).toEqual({ paddingTop: 320, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 });
  });
});
