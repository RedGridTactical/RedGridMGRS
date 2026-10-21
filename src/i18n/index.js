/**
 * i18n configuration — Red Grid MGRS.
 * Detects device locale via expo-localization, falls back to English.
 * Zero network: all translations are bundled locally.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { AppState } from 'react-native';

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
import da from './da';
import hr from './hr';
import id from './id';
import nb from './nb';
import sk from './sk';
import sv from './sv';
import th from './th';
import vi from './vi';

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
  da: { translation: da },
  hr: { translation: hr },
  id: { translation: id },
  nb: { translation: nb },
  sk: { translation: sk },
  sv: { translation: sv },
  th: { translation: th },
  vi: { translation: vi },
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
function supportedDeviceLang(locale) {
  if (!locale) return undefined;
  const tag = String(locale.languageTag || '').replace(/_/g, '-').toLowerCase();
  // Ignore extensions when extracting script/region (for example, -u-ca-gregory).
  const subtags = tag.split('-');
  const extension = subtags.findIndex((part, index) => index > 0 && part.length === 1);
  const languageSubtags = extension < 0 ? subtags.slice(1) : subtags.slice(1, extension);
  const base = String(locale.languageCode || subtags[0] || '').toLowerCase();
  const script = String(locale.languageScriptCode || languageSubtags.find((part) => /^[a-z]{4}$/.test(part)) || '').toLowerCase();
  // iOS regionCode is the user's formatting region, not necessarily the language's.
  const region = String(locale.languageRegionCode || languageSubtags.find((part) => /^([a-z]{2}|\d{3})$/.test(part)) || locale.regionCode || '').toUpperCase();

  if (base === 'no' || base === 'nb') return 'nb';
  if (base === 'in') return 'id';

  if (base === 'zh') {
    if (script === 'hant') return 'zh-Hant';
    if (script === 'hans') return 'zh-Hans';
    // No script subtag: infer from region. Everything else stays Simplified.
    if (region === 'TW' || region === 'HK' || region === 'MO') return 'zh-Hant';
    return 'zh-Hans';
  }

  // Exact tag first (e.g. 'pt-BR'), then the bare language.
  const exact = Object.keys(resources).find((k) => k.toLowerCase() === tag);
  if (exact) return exact;
  return Object.prototype.hasOwnProperty.call(resources, base) ? base : undefined;
}

export function resolveDeviceLang(locale) {
  return supportedDeviceLang(locale) || 'en';
}

export function resolvePreferredDeviceLang(locales) {
  for (const locale of Array.isArray(locales) ? locales : []) {
    const language = supportedDeviceLang(locale);
    if (language) return language;
  }
  return 'en';
}

function readDeviceLang() {
  try {
    const locales = Localization.getLocales?.();
    return Array.isArray(locales) && locales.length > 0 ? resolvePreferredDeviceLang(locales) : null;
  } catch {
    return null;
  }
}

const deviceLang = readDeviceLang() || 'en';

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

// Android can change its app language without restarting this JS process.
// Recheck on return from Settings; a failed native read must not reset the UI.
const localeSubscription = AppState.addEventListener('change', (state) => {
  if (state !== 'active') return;
  const language = readDeviceLang();
  if (language && language !== i18n.language) {
    i18n.changeLanguage(language);
  }
});

// The listener belongs to this module only; preserve other AppState listeners.
if (module.hot) module.hot.dispose(() => localeSubscription.remove());

export default i18n;
