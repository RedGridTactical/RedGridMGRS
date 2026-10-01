import { parseToolNumber, pinDROrigin, manualDROrigin, calculatePinnedDR, createDeviceAnnotation, photoExportSize, formatWorkflowUTC } from '../src/utils/toolWorkflow';
import { createSessionDraftStore } from '../src/utils/sessionDrafts';
import { copyTextToClipboard } from '../src/utils/clipboard';
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
const clipboard = require('expo-clipboard');
const NOW = 1700000000000;
const fix = { lat: 0, lon: 0, timestamp: NOW - 1000, accuracy: 0, source: 'internal' };

it.each(['', ' ', '12m', '12.3.4', 'Infinity', '-Infinity', 'NaN', '0x10', '1e3', true, null, undefined, NaN, Infinity])('rejects incomplete/nondecimal/nonfinite input %p', value => {
  expect(parseToolNumber(value)).toBeNull();
});
it('accepts full finite decimal values including zero and rejects bounds/whole-number violations', () => {
  expect(parseToolNumber(' 0 ')).toBe(0); expect(parseToolNumber('-.5')).toBe(-0.5);
  expect(parseToolNumber('+360', { min: 0, max: 360 })).toBe(360);
  expect(parseToolNumber('360.1', { min: 0, max: 360 })).toBeNull();
  expect(parseToolNumber('2.1', { integer: true })).toBeNull();
  expect(parseToolNumber('0', { min: 1, max: 999 })).toBeNull();
});
it('retains draft values after all listeners unmount; clear affects only the selected tool', () => {
  const store = createSessionDraftStore(); const listener = jest.fn();
  const unsubscribe = store.subscribe('tool:dr:heading', listener);
  store.write('tool:dr:heading', '90', ''); store.write('report:spot:draft', { what: 'Observation' });
  unsubscribe(); expect(store.read('tool:dr:heading', '')).toBe('90');
  store.write('tool:dr:heading', previous => previous + '.5', '');
  const remount = jest.fn(); store.subscribe('tool:dr:heading', remount);
  expect(store.read('tool:dr:heading', '')).toBe('90.5');
  store.clearPrefix('tool:dr:');
  expect(store.read('tool:dr:heading', '')).toBe(''); expect(remount).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1); expect(store.read('report:spot:draft')).toEqual({ what: 'Observation' });
  expect(createSessionDraftStore().read('report:spot:draft', null)).toBeNull();
});
it('pins an immutable copy of current or explicitly selected stale origin; never silently uses stale current', () => {
  const current = { ...fix }; const pinned = pinDROrigin(current, 'current', NOW);
  current.lat = 45; expect(pinned.lat).toBe(0); expect(pinned.observedAt).toBe(NOW - 1000);
  const stale = { ...fix, timestamp: NOW - 90000 };
  expect(pinDROrigin(stale, 'current', NOW)).toBeNull();
  expect(pinDROrigin(stale, 'last-known', NOW)).toMatchObject({ source: 'last-known', observedAt: NOW - 90000 });
  expect(pinDROrigin({ ...fix, timestamp: null }, 'last-known', NOW)).toBeNull();
});
it('manual decimal/MGRS and saved origins work without a device fix', () => {
  expect(manualDROrigin({ format: 'decimal', latitude: '0', longitude: '0' })).toEqual({ lat: 0, lon: 0 });
  expect(manualDROrigin({ format: 'decimal', latitude: '91', longitude: '0' })).toBeNull();
  expect(manualDROrigin({ format: 'mgrs', grid: '18S UJ 26587 07548' })).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) });
  expect(manualDROrigin({ format: 'mgrs', grid: 'garbage' })).toBeNull();
  const origin = pinDROrigin({ lat: 0, lon: 0, label: 'START' }, 'saved', NOW);
  const result = calculatePinnedDR(origin, '0', '100', NOW + 5);
  expect(result.lat).toBeGreaterThan(0);
  expect(result.provenance).toMatchObject({ kind: 'dead-reckoning', origin: { source: 'saved', pinnedAt: NOW, label: 'START' }, gridBearing: 0, distanceMeters: 100, calculatedAt: NOW + 5 });
});
it.each([['', '100'], ['Infinity', '100'], ['361', '100'], ['90', '0'], ['90', '-1'], ['90', '10000001'], ['90', '12m']])('refuses invalid DR inputs %p / %p', (heading, distance) => {
  expect(calculatePinnedDR(pinDROrigin(fix, 'manual', NOW), heading, distance)).toBeNull();
});
it('annotation copies one coherent fix/time snapshot, keeping unknown accuracy unknown', () => {
  const position = { ...fix, accuracy: null };
  const annotation = createDeviceAnnotation(position, NOW);
  position.lat = 1; position.timestamp = NOW + 1000;
  expect(annotation).toMatchObject({ lat: 0, lon: 0, fixTimestamp: NOW - 1000, annotatedAt: NOW, accuracy: null });
  expect(createDeviceAnnotation({ ...fix, timestamp: NOW - 30001 }, NOW)).toBeNull();
  expect(createDeviceAnnotation(null, NOW)).toBeNull();
});
it('chooses useful bounded photo dimensions without upscaling a small original', () => {
  expect(photoExportSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  expect(photoExportSize(4000, 2000)).toEqual({ width: 2048, height: 1024 });
  expect(photoExportSize(800, 600)).toEqual({ width: 800, height: 600 });
  expect(photoExportSize(NaN, 600)).toBeNull(); expect(photoExportSize(800, 0)).toBeNull();
  expect(formatWorkflowUTC(NOW)).toBe('2023-11-14 22:13:20Z');
});
it('does not resolve clipboard success until the native write confirms true', async () => {
  let resolve; clipboard.setStringAsync.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const done = jest.fn(); const action = copyTextToClipboard('0').then(done);
  await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  resolve(true); await action; expect(done).toHaveBeenCalledWith(true);
});
it.each([false, undefined, null])('rejects unconfirmed clipboard result %p', async result => {
  clipboard.setStringAsync.mockResolvedValueOnce(result); await expect(copyTextToClipboard('grid')).rejects.toThrow('COPY_FAILED');
});
it('rejects unavailable/failed clipboard writes', async () => {
  clipboard.setStringAsync.mockRejectedValueOnce(new Error('bridge unavailable'));
  await expect(copyTextToClipboard('grid')).rejects.toThrow('bridge unavailable');
  await expect(copyTextToClipboard('')).rejects.toThrow('COPY_EMPTY');
  const method = clipboard.setStringAsync; clipboard.setStringAsync = undefined;
  await expect(copyTextToClipboard('grid')).rejects.toThrow('COPY_UNAVAILABLE'); clipboard.setStringAsync = method;
});
