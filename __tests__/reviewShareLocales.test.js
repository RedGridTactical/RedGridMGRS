const locales = ['en', 'fr', 'de', 'es', 'it', 'pt-BR', 'nl', 'ru', 'pl', 'tr', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar-SA', 'hi'];
const keys = ['supportRedGrid', 'writeReview', 'reviewDescription', 'shareApp', 'shareAppDescription', 'shareAppMessage'];
test.each(locales)('%s review/share actions are bundled, localized and preserve the URL placeholder', locale => {
  const support = require(`../src/i18n/${locale}.js`).default.support;
  for (const key of keys) expect(typeof support[key] === 'string' && support[key].trim().length > 0).toBe(true);
  expect(support.shareAppMessage.match(/\{\{url\}\}/g)).toHaveLength(1);
  if (locale !== 'en') expect(support.reviewDescription).not.toBe(require('../src/i18n/en.js').default.support.reviewDescription);
});
