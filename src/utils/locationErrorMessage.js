// Keep native diagnostics in the location hook. Present known failures through
// local strings instead of exposing platform-specific English in the GRID UI.
const ERROR_MESSAGES = {
  moduleUnavailable: 'Location is unavailable on this device.',
  permissionRequestFailed: 'Could not request location access. Enable it in device settings, then retry.',
  permissionDenied: 'Location access is denied. Enable it in device settings, then retry.',
  timeout: 'No GPS fix yet. Move to open sky or retry.',
  invalidObservation: 'The GPS returned an invalid position. Wait for another fix or retry.',
  positionFailed: 'Could not obtain a GPS position. Retry.',
  watchFailed: 'Could not receive GPS updates. Retry.',
};

export function locationErrorMessage(error, t) {
  if (!error) return error;
  const message = String(error);
  let key;
  if (message === 'Location module unavailable') key = 'moduleUnavailable';
  else if (message === 'Permission request failed. Grant location access in device settings.') key = 'permissionRequestFailed';
  else if (message === 'Location permission denied. Grant location access in device settings.') key = 'permissionDenied';
  else if (message === 'GPS Error: Position timeout') key = 'timeout';
  else if (message === 'GPS Error: Invalid position observation') key = 'invalidObservation';
  else if (message.startsWith('Watch Error: ')) key = 'watchFailed';
  else if (message.startsWith('GPS Error: ')) key = 'positionFailed';
  return key ? t(`locationErrors.${key}`, { defaultValue: ERROR_MESSAGES[key] }) : message;
}
