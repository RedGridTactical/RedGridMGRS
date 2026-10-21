/** Exercise the production module with real catalogs and i18next, mocking only native boundaries. */
const fs = require('fs');
const path = require('path');

const mockGetLocales = jest.fn();
const mockAppState = { addEventListener: jest.fn() };
jest.mock('expo-localization', () => ({ getLocales: mockGetLocales }));
jest.mock('react-native', () => ({ AppState: mockAppState }));
jest.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: jest.fn() } }));

let moduleUnderTest;
let onAppStateChange;

function loadWithLocales(locales) {
  jest.resetModules();
  mockGetLocales.mockReset().mockReturnValue(locales);
  mockAppState.addEventListener.mockReset().mockImplementation((event, listener) => {
    expect(event).toBe('change');
    onAppStateChange = listener;
    return { remove: jest.fn() };
  });
  moduleUnderTest = require('../src/i18n');
  return moduleUnderTest;
}

beforeEach(() => loadWithLocales([{ languageCode: 'en', languageTag: 'en-US' }]));

describe('bundled locale resolution', () => {
  test.each([
    ['da-DK', 'da'], ['da-GL', 'da'], ['hr-HR', 'hr'], ['hr-BA', 'hr'],
    ['id-ID', 'id'], ['in-ID', 'id'], ['nb-NO', 'nb'], ['nb-SJ', 'nb'],
    ['no-NO', 'nb'], ['no', 'nb'], ['sk-SK', 'sk'], ['sv-SE', 'sv'],
    ['sv-FI', 'sv'], ['th-TH', 'th'], ['vi-VN', 'vi'],
    ['en-US', 'en'], ['fr-CA', 'fr'], ['de-DE', 'de'], ['ja-JP', 'ja'],
    ['ar-EG', 'ar'], ['pt-BR', 'pt-BR'], ['pt-PT', 'pt'],
    ['nb_NO', 'nb'], ['ID-id', 'id'],
  ])('%s selects the bundled %s catalog', (languageTag, expected) => {
    const languageCode = languageTag.split(/[-_]/)[0];
    expect(moduleUnderTest.resolveDeviceLang({ languageTag, languageCode })).toBe(expected);
    expect(moduleUnderTest.default.hasResourceBundle(expected, 'translation')).toBe(true);
  });

  test.each(['da', 'hr', 'id', 'nb', 'sk', 'sv', 'th', 'vi'])('%s initializes using its actual catalog', (languageCode) => {
    const { default: i18n } = loadWithLocales([{ languageCode, languageTag: languageCode }]);
    const catalog = require(`../src/i18n/${languageCode}`).default;
    expect(i18n.language).toBe(languageCode);
    expect(i18n.t('tabs.grid')).toBe(catalog.tabs.grid);
    expect(i18n.t('incident.saveFailed')).toBe(catalog.incident.saveFailed);
    expect(i18n.getResourceBundle(languageCode, 'translation')).toEqual(catalog);
  });

  test.each([null, undefined, {}, { languageTag: 'sw-KE' }, { languageTag: 'nn-NO' }])('missing or unsupported %o uses English', (locale) => {
    expect(moduleUnderTest.resolveDeviceLang(locale)).toBe('en');
  });

  test('accepts tag-only native locales without losing language or region', () => {
    expect(moduleUnderTest.resolveDeviceLang({ languageTag: 'vi-VN' })).toBe('vi');
    expect(moduleUnderTest.resolveDeviceLang({ languageTag: 'zh-TW' })).toBe('zh-Hant');
  });

  test('skips unsupported preferences but respects English when explicitly preferred', () => {
    const { resolvePreferredDeviceLang } = moduleUnderTest;
    expect(resolvePreferredDeviceLang([{ languageTag: 'nn-NO' }, { languageTag: 'nb-NO' }])).toBe('nb');
    expect(resolvePreferredDeviceLang([{ languageTag: 'sw-KE' }, { languageTag: 'hr-HR' }])).toBe('hr');
    expect(resolvePreferredDeviceLang([{ languageTag: 'en-GB' }, { languageTag: 'th-TH' }])).toBe('en');
    expect(resolvePreferredDeviceLang([])).toBe('en');
    expect(resolvePreferredDeviceLang(null)).toBe('en');
  });
});

describe('Chinese script selection', () => {
  test.each([
    [{ languageCode: 'zh', languageTag: 'zh-Hant-TW', languageScriptCode: 'Hant', regionCode: 'TW' }, 'zh-Hant'],
    [{ languageCode: 'zh', languageTag: 'zh-Hant-HK', regionCode: 'HK' }, 'zh-Hant'],
    [{ languageCode: 'zh', languageTag: 'zh-MO', regionCode: 'MO' }, 'zh-Hant'],
    [{ languageCode: 'zh', languageTag: 'zh-TW', regionCode: 'US' }, 'zh-Hant'],
    [{ languageCode: 'zh', languageTag: 'zh', languageRegionCode: 'TW', regionCode: 'US' }, 'zh-Hant'],
    [{ languageCode: 'zh', languageTag: 'zh-Hans-TW', regionCode: 'TW' }, 'zh-Hans'],
    [{ languageCode: 'zh', languageTag: 'zh-Hans-CN', languageScriptCode: 'Hans', regionCode: 'CN' }, 'zh-Hans'],
    [{ languageCode: 'zh', languageTag: 'zh-SG', regionCode: 'SG' }, 'zh-Hans'],
    [{ languageCode: 'zh', languageTag: 'zh' }, 'zh-Hans'],
    [{ languageTag: 'zh-TW-u-ca-chinese', regionCode: 'US' }, 'zh-Hant'],
  ])('%o resolves to %s', (locale, expected) => {
    expect(moduleUnderTest.resolveDeviceLang(locale)).toBe(expected);
  });
});

describe('native language changes', () => {
  test('returning from Settings applies the new language without a process restart', () => {
    const { default: i18n } = moduleUnderTest;
    const change = jest.spyOn(i18n, 'changeLanguage');
    mockGetLocales.mockReturnValue([{ languageTag: 'th-TH' }]);
    onAppStateChange('background');
    expect(change).not.toHaveBeenCalled();
    onAppStateChange('active');
    expect(change).toHaveBeenCalledTimes(1);
    expect(i18n.language).toBe('th');
    expect(i18n.t('tabs.grid')).toBe(require('../src/i18n/th').default.tabs.grid);
    onAppStateChange('active');
    expect(change).toHaveBeenCalledTimes(1);
  });

  test('native read failure or empty preferences preserve the current language', () => {
    const { default: i18n } = loadWithLocales([{ languageTag: 'sv-SE' }]);
    mockGetLocales.mockImplementation(() => { throw new Error('native unavailable'); });
    expect(() => onAppStateChange('active')).not.toThrow();
    expect(i18n.language).toBe('sv');
    mockGetLocales.mockReturnValue([]);
    onAppStateChange('active');
    expect(i18n.language).toBe('sv');
  });

  test('empty startup preferences safely initialize English', () => {
    expect(loadWithLocales([]).default.language).toBe('en');
  });
});

describe('OS app-language declarations', () => {
  const declared = ['en', 'fr', 'de', 'es', 'ja', 'ko', 'it', 'nl', 'pt-BR', 'ru', 'zh-Hans', 'zh-Hant', 'tr', 'pl', 'ar-SA', 'hi', 'da', 'hr', 'id', 'nb', 'sk', 'sv', 'th', 'vi'];
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  test('Expo config, actual iOS plist and Android locale config declare exactly 24 bundled languages', () => {
    const config = JSON.parse(read('app.json'));
    expect(config.expo.ios.infoPlist.CFBundleLocalizations).toEqual(declared);
    const plist = read('ios/RedGridMGRS/Info.plist');
    const section = plist.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
    expect([...section.matchAll(/<string>(.*?)<\/string>/g)].map((match) => match[1])).toEqual(declared);
    const xml = read('android/app/src/main/res/xml/locale_config.xml');
    expect([...xml.matchAll(/<locale android:name="([^"]+)"/g)].map((match) => match[1])).toEqual(declared);
    expect(read('android/app/src/main/AndroidManifest.xml')).toContain('android:localeConfig="@xml/locale_config"');
    for (const locale of declared) expect(moduleUnderTest.default.hasResourceBundle(locale, 'translation')).toBe(true);
  });
});
