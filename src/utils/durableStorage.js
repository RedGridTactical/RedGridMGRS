/** Ordered local records. A timeout does not release the native operation queue. */
import AsyncStorage from '@react-native-async-storage/async-storage';

export function fieldDataError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const queues = new Map();
function deadline(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(fieldDataError('STORAGE_TIMEOUT', 'Local storage did not confirm completion')), 5000);
  })]).finally(() => clearTimeout(timer));
}
function ordered(key, operation) {
  const native = (queues.get(key) || Promise.resolve()).then(operation);
  queues.set(key, native.catch(() => {}));
  return deadline(native);
}
function requireStorage(method) {
  if (typeof AsyncStorage?.[method] !== 'function') throw fieldDataError('STORAGE_UNAVAILABLE', 'Local storage unavailable');
}
function decode(raw, normalize, empty) {
  if (raw == null) return empty();
  try { return normalize(JSON.parse(raw)); }
  catch { throw fieldDataError('STORAGE_CORRUPT', 'Saved field data could not be read; original data preserved'); }
}

export function readLocalRecord(key, normalize, empty) {
  return ordered(key, async () => {
    requireStorage('getItem');
    return decode(await AsyncStorage.getItem(key), normalize, empty);
  });
}

export function writeLocalRecord(key, value, normalize, empty) {
  // Snapshot before queuing so later edits cannot mutate an in-flight write.
  let json;
  try { json = JSON.stringify(normalize(value)); }
  catch (error) { return Promise.reject(error); }
  return ordered(key, async () => {
    requireStorage('getItem');
    requireStorage('setItem');
    // Never replace an unreadable record with a caller's apparently empty state.
    decode(await AsyncStorage.getItem(key), normalize, empty);
    await AsyncStorage.setItem(key, json);
  });
}
