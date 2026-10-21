const locales = ['en', 'fr', 'de', 'es', 'it', 'pt-BR', 'nl', 'ru', 'pl', 'tr', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar-SA', 'hi'];
const keys = ['supportRedGrid', 'writeReview', 'reviewDescription', 'shareApp', 'shareAppDescription', 'shareAppMessage'];
test.each(locales)('%s review/share actions are bundled, localized and preserve the URL placeholder', locale => {
  const support = require(`../src/i18n/${locale}.js`).default.support;
  for (const key of keys) expect(typeof support[key] === 'string' && support[key].trim().length > 0).toBe(true);
  expect(support.shareAppMessage.match(/\{\{url\}\}/g)).toHaveLength(1);
  if (locale !== 'en') expect(support.reviewDescription).not.toBe(require('../src/i18n/en.js').default.support.reviewDescription);
});

test('restore FAQ avoids a stale button position and retains purchase recovery guidance', () => {
  const answer = require('../src/i18n/en.js').default.support.faqRestoreA;
  expect(answer).not.toMatch(/\b(?:below|above)\b/i);
  expect(answer).toContain('Use Restore Previous Purchase');
  expect(answer).toContain('same Apple or Google store account');
  expect(answer).toContain('An internet connection may be needed');
});


test.each(locales)('%s current release notes are complete and translated', locale => {
  const current = require(`../src/i18n/${locale}.js`).default.whatsNew.current;
  expect(Object.keys(current)).toEqual(['f1', 'f2', 'f3']);
  for (const feature of Object.values(current)) {
    expect(feature.title.trim().length).toBeGreaterThan(0);
    expect(feature.body.trim().length).toBeGreaterThan(0);
  }
  if (locale !== 'en') expect(current.f1.body).not.toBe(require('../src/i18n/en.js').default.whatsNew.current.f1.body);
});

test('current in-app notes target this release and store notes cover every listing language', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const version = require('../app.json').expo.version;
  const modal = fs.readFileSync(path.join(root, 'src/components/WhatsNewModal.js'), 'utf8');
  expect(modal.match(/const LOCALIZED_VERSION = '([^']+)'/)[1]).toBe(version);
  expect(modal).toContain(`'${version}': [`);
  const notes = require(`../scripts/release-notes-${version}.json`);
  const asc = ['no', 'ar-SA', 'pt-BR', 'it', 'en-US', 'sv', 'hi', 'fr-FR', 'pl', 'uk', 'nl-NL', 'hr', 'vi', 'es-ES', 'zh-Hant', 'ru', 'es-MX', 'tr', 'th', 'sk', 'ja', 'ko', 'zh-Hans', 'de-DE', 'da', 'id'];
  for (const locale of asc) expect(notes[locale].trim().length).toBeGreaterThan(0);
  for (const [locale, text] of Object.entries(notes)) {
    expect(text.length).toBeLessThanOrEqual(500);
    if (locale !== 'en-US') expect(text).not.toBe(notes['en-US']);
  }
});
