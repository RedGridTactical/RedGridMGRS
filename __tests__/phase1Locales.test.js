/** Phase 1 strings exist in all 16 locales with the same placeholders, and are translated. */
const LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt-BR', 'nl', 'ru', 'pl', 'tr', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar-SA', 'hi'];
const load = locale => require(`../src/i18n/${locale}.js`).default;
const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, v]) => (typeof v === 'object' ? flatten(v, `${prefix}${key}.`) : [[`${prefix}${key}`, v]]));
const placeholders = text => (text.match(/\{\{\w+\}\}/g) || []).sort().join();
const NAMESPACES = ['routeCoverage', 'fieldPack', 'mapImport'];
const en = load('en');
const reference = NAMESPACES.flatMap(ns => flatten(en[ns], `${ns}.`));

test('English defines the expected number of Phase 1 strings', () => {
  expect(reference).toHaveLength(74);
});

test.each(LOCALES)('%s has every Phase 1 string with matching placeholders', locale => {
  const strings = Object.fromEntries(NAMESPACES.flatMap(ns => flatten(load(locale)[ns] || {}, `${ns}.`)));
  for (const [key, english] of reference) {
    expect(typeof strings[key]).toBe('string');
    expect(strings[key].trim().length).toBeGreaterThan(0);
    expect([key, placeholders(strings[key])]).toEqual([key, placeholders(english)]);
  }
  expect(Object.keys(strings)).toHaveLength(reference.length);
});

test.each(LOCALES.filter(l => l !== 'en'))('%s sentences are translated, not English copies', locale => {
  const strings = Object.fromEntries(NAMESPACES.flatMap(ns => flatten(load(locale)[ns], `${ns}.`)));
  const copies = reference.filter(([key, english]) => english.length > 24 && strings[key] === english);
  expect(copies).toEqual([]);
});

test('English copy makes no safety, bundling or network claims', () => {
  const text = reference.map(([, value]) => value).join('\n');
  expect(text).not.toMatch(/download|guarantee|certif|verified safe|includes? (the )?map files/i);
  expect(en.routeCoverage.disclaimer).toMatch(/does not show whether the route is safe/);
  expect(en.fieldPack.mapsNotIncluded).toBe('Map files are not included.');
  expect(en.fieldPack.mapSame).toMatch(/do not prove the same tiles/);
});
