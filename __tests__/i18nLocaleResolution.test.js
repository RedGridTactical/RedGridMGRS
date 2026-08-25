/**
 * Device-locale resolution guard.
 *
 * WHY THIS EXISTS: language detection used `locales[0].languageCode`, which
 * returns the bare language and discards the script. For Chinese that means
 * 'zh', which mapped to `resources.zh` = Simplified. Every Traditional device
 * (Taiwan, Hong Kong, Macau) was served Simplified Chinese, even though the app
 * ships a complete, correct Traditional file. Verified on an Android emulator
 * set to zh-TW: the UI rendered 网格 / 地图 / 报告 (Simplified) instead of
 * 網格 / 地圖 / 報告 (Traditional).
 *
 * These fixtures mirror what expo-localization's getLocales() actually returns.
 */

const path = require('path');
const fs = require('fs');

// Import the resolver without pulling in expo-localization / react-native by
// evaluating just the exported function against a stub resources map. The real
// module is ESM with native deps, so we assert on behaviour via a re-implement
// check plus a source pin, the same approach used by the IAP guards.
const src = fs.readFileSync(path.join(__dirname, '..', 'src/i18n/index.js'), 'utf8');

// Resource keys the app actually bundles.
const RESOURCE_KEYS = [
  'en', 'fr', 'de', 'es', 'ja', 'ko', 'it', 'nl', 'pt-BR', 'pt', 'ru',
  'zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK', 'tr', 'pl',
  'ar-SA', 'ar', 'hi',
];
const resources = Object.fromEntries(RESOURCE_KEYS.map((k) => [k, {}]));

// Mirror of resolveDeviceLang in src/i18n/index.js.
function resolveDeviceLang(locale) {
  if (!locale) return 'en';
  const base = String(locale.languageCode || '').toLowerCase();
  const script = String(locale.languageScriptCode || '').toLowerCase();
  const region = String(locale.regionCode || '').toUpperCase();
  const tag = String(locale.languageTag || '').toLowerCase();

  if (base === 'zh') {
    if (script === 'hant' || tag.includes('hant')) return 'zh-Hant';
    if (script === 'hans' || tag.includes('hans')) return 'zh-Hans';
    if (region === 'TW' || region === 'HK' || region === 'MO') return 'zh-Hant';
    return 'zh-Hans';
  }
  const exact = Object.keys(resources).find((k) => k.toLowerCase() === tag);
  if (exact) return exact;
  return resources[base] ? base : 'en';
}

describe('Chinese script resolution (the bug)', () => {
  test('Taiwan gets Traditional', () => {
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-Hant-TW',
      languageScriptCode: 'Hant', regionCode: 'TW',
    })).toBe('zh-Hant');
  });

  test('Hong Kong gets Traditional', () => {
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-Hant-HK',
      languageScriptCode: 'Hant', regionCode: 'HK',
    })).toBe('zh-Hant');
  });

  test('Macau gets Traditional', () => {
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-MO', regionCode: 'MO',
    })).toBe('zh-Hant');
  });

  test('Traditional is inferred from region when no script subtag is present', () => {
    // Android often reports zh-TW with no script code at all.
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-TW', regionCode: 'TW',
    })).toBe('zh-Hant');
  });

  test('mainland China gets Simplified', () => {
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-Hans-CN',
      languageScriptCode: 'Hans', regionCode: 'CN',
    })).toBe('zh-Hans');
  });

  test('Singapore Chinese gets Simplified', () => {
    expect(resolveDeviceLang({
      languageCode: 'zh', languageTag: 'zh-SG', regionCode: 'SG',
    })).toBe('zh-Hans');
  });

  test('bare zh with no region defaults to Simplified', () => {
    expect(resolveDeviceLang({ languageCode: 'zh', languageTag: 'zh' })).toBe('zh-Hans');
  });

  test('the OLD implementation would have sent Taiwan to Simplified', () => {
    // Documents the defect so nobody reverts to languageCode.
    const legacy = { languageCode: 'zh', languageTag: 'zh-Hant-TW', regionCode: 'TW' }.languageCode;
    expect(legacy).toBe('zh');
    expect(resources[legacy]).toBeDefined(); // resources.zh === Simplified
  });
});

describe('other languages still resolve', () => {
  test.each([
    [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }, 'en'],
    [{ languageCode: 'de', languageTag: 'de-DE', regionCode: 'DE' }, 'de'],
    [{ languageCode: 'fr', languageTag: 'fr-CA', regionCode: 'CA' }, 'fr'],
    [{ languageCode: 'ja', languageTag: 'ja-JP', regionCode: 'JP' }, 'ja'],
    [{ languageCode: 'ar', languageTag: 'ar-EG', regionCode: 'EG' }, 'ar'],
    [{ languageCode: 'pt', languageTag: 'pt-BR', regionCode: 'BR' }, 'pt-BR'],
  ])('%o resolves to %s', (locale, expected) => {
    expect(resolveDeviceLang(locale)).toBe(expected);
  });

  test('an unsupported language falls back to English', () => {
    expect(resolveDeviceLang({ languageCode: 'sw', languageTag: 'sw-KE' })).toBe('en');
    expect(resolveDeviceLang({ languageCode: 'is', languageTag: 'is-IS' })).toBe('en');
  });

  test('missing or malformed locale falls back to English', () => {
    expect(resolveDeviceLang(null)).toBe('en');
    expect(resolveDeviceLang(undefined)).toBe('en');
    expect(resolveDeviceLang({})).toBe('en');
  });
});

describe('source no longer uses bare languageCode', () => {
  test('resolveDeviceLang is exported and used for detection', () => {
    expect(src).toMatch(/export function resolveDeviceLang/);
    expect(src).toMatch(/deviceLang = resolveDeviceLang\(locales\[0\]\)/);
  });

  test('the bare languageCode assignment is gone', () => {
    expect(src).not.toMatch(/deviceLang\s*=\s*locales\[0\]\.languageCode/);
  });

  test('both Chinese scripts are bundled', () => {
    expect(src).toMatch(/from '\.\/zh-Hans'/);
    expect(src).toMatch(/from '\.\/zh-Hant'/);
  });
});
