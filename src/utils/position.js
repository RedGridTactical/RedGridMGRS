// A fix is actionable only while its observation time is known and recent.
// Receipt time is used explicitly for BLE receivers that omit an epoch timestamp.
export const POSITION_MAX_AGE_MS = 30000;
export const HEADING_MAX_AGE_MS = 10000;
const MAX_CLOCK_SKEW_MS = 5000;

export function validCoordinates(value) {
  return Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90 &&
    Number.isFinite(value?.lon) && Math.abs(value.lon) <= 180;
}

export function normalizePositionFix(raw, { source = 'internal', now = Date.now() } = {}) {
  const coords = raw?.coords;
  const value = coords ? {
    lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy,
    altitude: coords.altitude, speed: coords.speed, heading: coords.heading,
    timestamp: raw.timestamp,
  } : raw;
  if (!validCoordinates(value)) return null;
  const timestamp = value.timestamp;
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + MAX_CLOCK_SKEW_MS) return null;
  return {
    lat: value.lat, lon: value.lon, timestamp,
    receivedAt: Number.isFinite(value.receivedAt) ? value.receivedAt : now,
    timestampSource: value.timestampSource === 'received' ? 'received' : 'observed',
    source,
    accuracy: Number.isFinite(value.accuracy) && value.accuracy >= 0 ? Math.round(value.accuracy) : null,
    altitude: Number.isFinite(value.altitude) ? Math.round(value.altitude) : null,
    speed: Number.isFinite(value.speed) && value.speed >= 0 ? value.speed : null,
    heading: Number.isFinite(value.heading) && value.heading >= 0 && value.heading < 360 ? value.heading : null,
  };
}

export function positionAgeMs(position, now = Date.now()) {
  if (!validCoordinates(position) || !Number.isFinite(position.timestamp) || position.timestamp <= 0 ||
      position.timestamp > now + MAX_CLOCK_SKEW_MS) return null;
  return Math.max(0, now - position.timestamp);
}

export function isFreshPosition(position, now = Date.now()) {
  const age = positionAgeMs(position, now);
  return age !== null && age <= POSITION_MAX_AGE_MS;
}

export function selectPositionSource(internal, external, now = Date.now()) {
  const connected = external?.connectionState === 'connected';
  const externalFix = connected ? normalizePositionFix(external.externalPosition, { source: 'external', now }) : null;
  const phoneFix = normalizePositionFix(internal, { now });
  const useExternal = isFreshPosition(externalFix, now);
  const fresh = useExternal ? externalFix : isFreshPosition(phoneFix, now) ? phoneFix : null;
  const lastKnownLocation = fresh || [externalFix, phoneFix].filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)[0] || null;
  const age = positionAgeMs(lastKnownLocation, now);
  return {
    location: fresh,
    lastKnownLocation,
    status: fresh ? 'fresh' : lastKnownLocation ? 'stale' : 'unavailable',
    ageSeconds: age === null ? null : Math.floor(age / 1000),
    source: useExternal ? 'external' : 'internal',
    sourceFallback: connected && !useExternal,
    deviceName: useExternal ? external.deviceName : null,
  };
}
