import { createInstance } from 'i18next';
import { locationErrorMessage } from '../src/utils/locationErrorMessage';
import en from '../src/i18n/en';

const examples = [
  ['Location module unavailable', 'moduleUnavailable'],
  ['Permission request failed. Grant location access in device settings.', 'permissionRequestFailed'],
  ['Location permission denied. Grant location access in device settings.', 'permissionDenied'],
  ['GPS Error: Position timeout', 'timeout'],
  ['GPS Error: Invalid position observation', 'invalidObservation'],
  ['GPS Error: Native provider could not get position', 'positionFailed'],
  ['GPS Error: Unknown error', 'positionFailed'],
  ['Watch Error: Native provider cannot start watcher', 'watchFailed'],
];

test.each(['da','hr','id','nb','sk','sv','th','vi'])('%s presents all location failures without an English provider fallback', async locale => {
  const translation = require(`../src/i18n/${locale}`).default;
  const i18n = createInstance();
  await i18n.init({ lng: locale, fallbackLng: 'en', resources: { en: { translation: en }, [locale]: { translation } } });
  for (const [nativeMessage, key] of examples) {
    const message = locationErrorMessage(nativeMessage, i18n.t.bind(i18n));
    expect(message).toBe(translation.locationErrors[key]);
    expect(message).not.toBe(en.locationErrors[key]);
    expect(message).not.toContain('Native provider');
    expect(message).not.toContain('locationErrors.');
  }
});

test('existing languages retain clear English defaults and unknown diagnostics are not reclassified', async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: {}, fallbackLng: false });
  for (const [nativeMessage, key] of examples) {
    expect(locationErrorMessage(nativeMessage, i18n.t.bind(i18n))).toBe(en.locationErrors[key]);
  }
  expect(locationErrorMessage(null, i18n.t.bind(i18n))).toBeNull();
  expect(locationErrorMessage('Other component failure', i18n.t.bind(i18n))).toBe('Other component failure');
});
