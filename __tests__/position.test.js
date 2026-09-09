const { normalizePositionFix, isFreshPosition, selectPositionSource } = require('../src/utils/position');
const { nmeaToDecimal, parseGGA } = require('../src/utils/externalGPS');
const now = 1800000000000;
const fix = { lat: 0, lon: 0, timestamp: now, accuracy: null };

test('unknown accuracy stays unknown and zero coordinates are valid', () => {
  expect(normalizePositionFix(fix, { now })).toMatchObject({ lat: 0, lon: 0, accuracy: null });
  for (const accuracy of [-1, NaN, Infinity, '3']) {
    expect(normalizePositionFix({ ...fix, accuracy }, { now }).accuracy).toBeNull();
  }
});

test.each([
  { lat: 91 }, { lon: -181 }, { lat: NaN }, { lat: '38' },
  { timestamp: undefined }, { timestamp: now + 6000 },
])('rejects an untrustworthy observation: %j', change => {
  expect(normalizePositionFix({ ...fix, ...change }, { now })).toBeNull();
});

test('freshness expires without needing another GPS callback', () => {
  expect(isFreshPosition(fix, now + 30000)).toBe(true);
  expect(isFreshPosition(fix, now + 30001)).toBe(false);
  expect(selectPositionSource(fix, null, now + 30001)).toMatchObject({
    location: null, status: 'stale', ageSeconds: 30, lastKnownLocation: fix,
  });
});

test('a stale or invalid receiver falls back to a fresh phone fix', () => {
  const receiver = { connectionState: 'connected', deviceName: 'Receiver', externalPosition: { ...fix, lat: 40, timestampSource: 'received' } };
  expect(selectPositionSource(fix, receiver, now)).toMatchObject({ source: 'external', sourceFallback: false, location: { timestampSource: 'received', lat: 40 } });
  expect(selectPositionSource({ ...fix, timestamp: now + 31000 }, receiver, now + 31000)).toMatchObject({ source: 'internal', sourceFallback: true, location: { lat: 0 } });
  expect(selectPositionSource(null, receiver, now + 31000)).toMatchObject({ location: null, status: 'stale' });
  receiver.externalPosition.lon = Infinity;
  expect(selectPositionSource(fix, receiver, now)).toMatchObject({ source: 'internal', sourceFallback: true });
});

test.each([['4807.038', 'X'], ['4861.038', 'N'], ['9100.000', 'N'], ['18100.000', 'E'], ['4807.038junk', 'N']])('rejects malformed NMEA %s %s', (raw, dir) => {
  expect(nmeaToDecimal(raw, dir)).toBeNull();
});

test('missing GGA quality cannot produce a usable fix', () => {
  expect(parseGGA('$GPGGA,123456.00,4807.038,N,01131.000,E,,08,0.9,545.4,M,47.0,M,,*47')).toBeNull();
});
