/**
 * i18n configuration — Red Grid MGRS.
 * Detects device locale via expo-localization, falls back to English.
 * Zero network: all translations are bundled locally.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './en';
import fr from './fr';
import de from './de';
import es from './es';
import ja from './ja';
import ko from './ko';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  ja: { translation: ja },
  ko: { translation: ko },
};

// Get device locale (e.g. 'en-US' -> 'en')
let deviceLang = 'en';
try {
  const locales = Localization.getLocales?.();
  if (locales && locales.length > 0) {
    deviceLang = locales[0].languageCode || 'en';
  }
} catch {
  // Fall back to English
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    // No backend — all strings are bundled
    react: {
      useSuspense: false,
    },
  });

export default i18n;
