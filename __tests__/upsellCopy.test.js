/**
 * Locked-tab upsell copy: every locale states, in its own language, what the
 * tab does, what Free includes and what Pro adds, and the Pro gates open on a
 * localized capability name rather than a raw tab label or English literal.
 */

const LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt-BR', 'nl', 'ru', 'pl', 'tr', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar-SA', 'hi'];
const TABS = ['lists', 'coords', 'mesh'];
const FIELDS = ['title', 'body', 'note'];
const load = locale => require(`../src/i18n/${locale}.js`).default;
const en = load('en');

describe('upsell copy per locale', () => {
  test.each(LOCALES)('%s has a CTA and title/body/note for LISTS, COORDS and MESH', locale => {
    const upsell = load(locale).upsell;
    expect(typeof upsell.button).toBe('string');
    expect(upsell.button.trim().length).toBeGreaterThan(0);
    for (const tab of TABS) {
      for (const field of FIELDS) {
        expect(typeof upsell[tab][field]).toBe('string');
        expect(upsell[tab][field].trim().length).toBeGreaterThan(0);
      }
    }
  });

  test.each(LOCALES.filter(l => l !== 'en'))('%s is translated, not an English copy', locale => {
    const upsell = load(locale).upsell;
    expect(upsell.button).not.toBe(en.upsell.button);
    for (const tab of TABS) {
      for (const field of FIELDS) expect(upsell[tab][field]).not.toBe(en.upsell[tab][field]);
    }
  });

  test.each(LOCALES)('%s supplies every capability label used by upgrade entry points', locale => {
    const gate = load(locale).proGate;
    for (const key of ['waypointsRoutes', 'coordFormats', 'offlineMaps', 'meshAwareness', 'meshAwarenessSub', 'allTools', 'allToolsSub', 'reportsThemes']) {
      expect(typeof gate[key]).toBe('string');
      expect(gate[key].trim().length).toBeGreaterThan(0);
    }
  });
});
