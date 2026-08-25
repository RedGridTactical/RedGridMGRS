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
import it from './it';
import nl from './nl';
import ptBR from './pt-BR';
import ru from './ru';
import zhHans from './zh-Hans';
import zhHant from './zh-Hant';
import tr from './tr';
import pl from './pl';
import arSA from './ar-SA';
import hi from './hi';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  ja: { translation: ja },
  ko: { translation: ko },
  it: { translation: it },
  nl: { translation: nl },
  'pt-BR': { translation: ptBR },
  pt: { translation: ptBR },
  ru: { translation: ru },
  'zh-Hans': { translation: zhHans },
  'zh-CN': { translation: zhHans },
  zh: { translation: zhHans },
  'zh-Hant': { translation: zhHant },
  'zh-TW': { translation: zhHant },
  'zh-HK': { translation: zhHant },
  tr: { translation: tr },
  pl: { translation: pl },
  'ar-SA': { translation: arSA },
  ar: { translation: arSA },
  hi: { translation: hi },
};

/**
 * Resolve a device locale to one of our bundled resource keys.
 *
 * The obvious implementation, `locales[0].languageCode`, is WRONG for Chinese:
 * it returns the bare language ('zh') and discards the script, so every
 * Traditional device (Taiwan, Hong Kong, Macau) resolved to `resources.zh`,
 * which is Simplified. We ship a complete Traditional file and it was never
 * served to anyone. Script and region must be consulted before falling back to
 * the bare language.
 */
export function resolveDeviceLang(locale) {
  if (!locale) return 'en';
  const base = String(locale.languageCode || '').toLowerCase();
  const script = String(locale.languageScriptCode || '').toLowerCase();
  const region = String(locale.regionCode || '').toUpperCase();
  const tag = String(locale.languageTag || '').toLowerCase();

  if (base === 'zh') {
    if (script === 'hant' || tag.includes('hant')) return 'zh-Hant';
    if (script === 'hans' || tag.includes('hans')) return 'zh-Hans';
    // No script subtag: infer from region. Everything else stays Simplified.
    if (region === 'TW' || region === 'HK' || region === 'MO') return 'zh-Hant';
    return 'zh-Hans';
  }

  // Exact tag first (e.g. 'pt-BR'), then the bare language, then English.
  const exact = Object.keys(resources).find((k) => k.toLowerCase() === tag);
  if (exact) return exact;
  return resources[base] ? base : 'en';
}

let deviceLang = 'en';
try {
  const locales = Localization.getLocales?.();
  if (locales && locales.length > 0) {
    deviceLang = resolveDeviceLang(locales[0]);
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
