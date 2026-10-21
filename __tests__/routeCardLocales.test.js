/** Route Card strings exist in all 16 locales; no locale silently falls back to English. */
const LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt-BR', 'nl', 'ru', 'pl', 'tr', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar-SA', 'hi'];
const load = locale => require(`../src/i18n/${locale}.js`).default;
const en = load('en');
const KEYS = Object.keys(en.routeCard);

test('English defines the Route Card namespace', () => {
  expect(KEYS).toEqual(expect.arrayContaining(['title', 'share', 'save', 'close', 'start', 'legs', 'total', 'footer', 'shareTitle', 'shareFailed', 'saveFailed', 'saveUnavailable', 'savePermission', 'saved', 'savedMsg']));
});

test.each(LOCALES)('%s has every Route Card string', locale => {
  const strings = load(locale).routeCard || {};
  for (const key of KEYS) {
    expect([locale, key, typeof strings[key]]).toEqual([locale, key, 'string']);
    expect(strings[key].trim().length).toBeGreaterThan(0);
  }
  expect(Object.keys(strings).sort()).toEqual([...KEYS].sort());
});

test.each(LOCALES.filter(l => l !== 'en'))('%s Route Card sentences are translated, not English copies', locale => {
  const strings = load(locale).routeCard;
  const copies = KEYS.filter(key => en.routeCard[key].length > 20 && strings[key] === en.routeCard[key]);
  expect(copies).toEqual([]);
});
