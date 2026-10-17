/** Native folding features are normalized defensively; silence means no fold. */
const { normalizeFoldingFeatures, NO_FOLDING_FEATURES } = require('../src/utils/foldGeometry');

const native = { features: [
  { bounds: { left: 390, top: 0, right: 410, bottom: 700 }, orientation: 'VERTICAL', state: 'HALF_OPENED', isSeparating: true, occlusionType: 'FULL' },
  { bounds: { left: 0, top: 350, right: 800, bottom: 350 }, orientation: 'HORIZONTAL', state: 'FLAT', isSeparating: false, occlusionType: 'NONE' },
] };

test('maps the native enum names to the layout vocabulary', () => {
  const [v, h] = normalizeFoldingFeatures(native, { width: 800, height: 700 });
  expect(v).toEqual({ bounds: { left: 390, top: 0, right: 410, bottom: 700 }, orientation: 'vertical', state: 'halfOpened', isSeparating: true, occlusion: 'full' });
  expect(h).toEqual({ bounds: { left: 0, top: 350, right: 800, bottom: 350 }, orientation: 'horizontal', state: 'flat', isSeparating: false, occlusion: 'none' });
});

test('accepts a bare array and already-normalized values', () => {
  const out = normalizeFoldingFeatures([{ bounds: { left: 1, top: 2, right: 3, bottom: 4 }, orientation: 'vertical', state: 'halfOpened', occlusion: 'full' }]);
  expect(out).toHaveLength(1);
  expect(out[0].occlusion).toBe('full');
});

test('drops malformed, inverted, out-of-window and unknown-orientation features', () => {
  const junk = [null, 'x', { bounds: null, orientation: 'vertical' }, { bounds: { left: 10, top: 0, right: 5, bottom: 1 }, orientation: 'vertical' },
    { bounds: { left: 0, top: 0, right: 900, bottom: 10 }, orientation: 'horizontal' }, { bounds: { left: 0, top: 0, right: 1, bottom: 1 }, orientation: 'DIAGONAL' },
    { bounds: { left: '1', top: '2', right: '3', bottom: '4' }, orientation: 'vertical' }];
  const out = normalizeFoldingFeatures(junk, { width: 800, height: 700 });
  expect(out).toEqual([{ bounds: { left: 1, top: 2, right: 3, bottom: 4 }, orientation: 'vertical', state: 'flat', isSeparating: false, occlusion: 'none' }]);
});

test('silence from the platform is an empty list, never an invented fold', () => {
  expect(normalizeFoldingFeatures(undefined)).toEqual([]);
  expect(normalizeFoldingFeatures({})).toEqual([]);
  expect(normalizeFoldingFeatures({ features: 'none' })).toEqual([]);
  expect(NO_FOLDING_FEATURES).toEqual([]);
  expect(Object.isFrozen(NO_FOLDING_FEATURES)).toBe(true);
});
