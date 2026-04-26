#!/usr/bin/env node
/**
 * pull-asc-for-play.js — pull native localized App Store metadata so we can
 * paste the same native copy into Google Play Console without retranslating.
 *
 * Output: _data/play-localizations.json keyed by Play locale code, with
 *   { title, short_description, full_description, whats_new }
 *
 * The pull strategy per Play locale:
 *   1. Take title + short_description + whats_new (release notes) from
 *      store.config.json google.info[<play_locale>] — these were translated
 *      natively by the same pass that did ASC.
 *   2. Take full_description from the App Store appStoreVersionLocalizations
 *      endpoint, mapping Play locale → ASC locale (see PLAY_TO_ASC).
 *
 * Usage:
 *   node scripts/pull-asc-for-play.js
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const privateKey = fs.readFileSync(path.join(ROOT, `secrets/AuthKey_${cfg.key_id}.p8`), 'utf8');

// Play locale → ASC locale (Apple uses different codes for some).
// Fallback chain: PLAY_TO_ASC[locale] → ASC_FALLBACK[locale] → en-US.
const PLAY_TO_ASC = {
  'en-US': 'en-US',
  'fr-FR': 'fr-FR',
  'de-DE': 'de-DE',
  'es-ES': 'es-ES',
  'es-419': 'es-MX',     // Apple's Latin American Spanish
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'it-IT': 'it',
  'nl-NL': 'nl-NL',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-BR',      // Apple has no pt-PT; pt-BR is closer than en-US
  'ru-RU': 'ru',
  'uk': 'uk',
  'pl-PL': 'pl',
  'tr-TR': 'tr',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'ar': 'ar-SA',
  'hi-IN': 'hi',
};

// Play caps short_description at 80 chars. Apple's subtitle is 30 and the
// staged store.config.json values are tuned for Apple's longer subtitle, so
// we override here with hand-written 80-char versions per locale.
const PLAY_SHORT_DESCRIPTIONS = {
  'en-US':   'DAGR-Class MGRS Navigator — offline maps, Meshtastic mesh, 10 tactical tools',
  'fr-FR':   'Navigateur MGRS DAGR — cartes hors ligne, Meshtastic, 10 outils tactiques',
  'de-DE':   'DAGR-Navigator MGRS — Offline-Karten, Meshtastic, 10 Taktik-Werkzeuge',
  'es-ES':   'Navegador MGRS DAGR — mapas offline, Meshtastic, 10 herramientas tácticas',
  'es-419':  'Navegador MGRS DAGR — mapas offline, Meshtastic, 10 herramientas tácticas',
  'ja-JP':   'DAGRクラスMGRSナビ — オフラインマップ、Meshtasticメッシュ、戦術ツール10種',
  'ko-KR':   'DAGR급 MGRS 내비 — 오프라인 지도, Meshtastic 메시, 전술 도구 10종',
  'it-IT':   'Navigatore MGRS DAGR — mappe offline, Meshtastic, 10 strumenti tattici',
  'nl-NL':   'DAGR-MGRS-navigator — offline kaarten, Meshtastic, 10 tactische tools',
  'pt-BR':   'Navegador MGRS DAGR — mapas offline, Meshtastic, 10 ferramentas táticas',
  'pt-PT':   'Navegador MGRS DAGR — mapas offline, Meshtastic, 10 ferramentas táticas',
  'ru-RU':   'MGRS-навигатор DAGR — офлайн-карты, Meshtastic, 10 тактических инструментов',
  'uk':      'MGRS-навігатор DAGR — офлайн-карти, Meshtastic, 10 тактичних інструментів',
  'pl-PL':   'Nawigator MGRS DAGR — mapy offline, Meshtastic, 10 narzędzi taktycznych',
  'tr-TR':   'DAGR sınıfı MGRS — çevrimdışı haritalar, Meshtastic, 10 taktik araç',
  'zh-CN':   'DAGR 级 MGRS 导航器 — 离线地图、Meshtastic 网络、10 种战术工具',
  'zh-TW':   'DAGR 級 MGRS 導航器 — 離線地圖、Meshtastic 網路、10 種戰術工具',
  'ar':      'ملاح MGRS فئة DAGR — خرائط بدون اتصال، شبكة Meshtastic، 10 أدوات تكتيكية',
  'hi-IN':   'DAGR-क्लास MGRS नेविगेटर — ऑफ़लाइन मैप, Meshtastic, 10 सामरिक टूल',
};

function makeToken() {
  return jwt.sign({
    iss: cfg.issuer_id,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    aud: 'appstoreconnect-v1',
  }, privateKey, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
}

async function main() {
  const token = makeToken();
  const http = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  // Pull the latest live or in-review iOS version's localizations.
  const versionsRes = await http.get(`/apps/${cfg.app_id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const versions = versionsRes.data.data;
  // Prefer states that have full localization populated: PREPARE_FOR_SUBMISSION,
  // WAITING_FOR_REVIEW, IN_REVIEW, READY_FOR_SALE.
  const order = ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PREPARE_FOR_SUBMISSION', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE', 'PROCESSING_FOR_APP_STORE'];
  versions.sort((a, b) => order.indexOf(a.attributes.appStoreState) - order.indexOf(b.attributes.appStoreState));
  const v = versions.find(x => order.includes(x.attributes.appStoreState)) || versions[0];
  console.log(`Using ASC version ${v.attributes.versionString} [${v.attributes.appStoreState}]`);

  const locsRes = await http.get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`);
  const ascLocs = {};
  for (const l of locsRes.data.data) {
    ascLocs[l.attributes.locale] = l.attributes;
  }
  console.log(`ASC locales available: ${Object.keys(ascLocs).join(', ')}`);

  // Pull store.config.json for title + short + release notes.
  const storeConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'store.config.json'), 'utf8'));
  const playInfo = storeConfig.google.info;

  // Build merged data
  const out = {};
  for (const [playLocale, ascLocale] of Object.entries(PLAY_TO_ASC)) {
    const stagedPlay = playInfo[playLocale] || {};
    const ascData = ascLocs[ascLocale] || ascLocs['en-US'];
    const enUS = playInfo['en-US'] || {};

    let fullDesc = ascData?.description || '';
    // store.config.json 'fullDescription' for en-US says "<<same as apple ...>>" placeholder
    if (playLocale === 'en-US') {
      fullDesc = ascLocs['en-US']?.description || '';
    }

    out[playLocale] = {
      title: stagedPlay.title || enUS.title || 'Red Grid MGRS',
      short_description: PLAY_SHORT_DESCRIPTIONS[playLocale] || stagedPlay.shortDescription || enUS.shortDescription || '',
      full_description: fullDesc,
      whats_new: stagedPlay.releaseNotes || enUS.releaseNotes || '',
      _asc_locale_used: ascLocale,
      _asc_locale_found: !!ascLocs[ascLocale],
    };

    // Lengths
    const lens = {
      t: out[playLocale].title.length,
      s: out[playLocale].short_description.length,
      f: out[playLocale].full_description.length,
      w: out[playLocale].whats_new.length,
    };
    const flag = !out[playLocale]._asc_locale_found ? ' (FALLBACK to en-US)' : '';
    console.log(`  ${playLocale}: title=${lens.t}/30 short=${lens.s}/80 full=${lens.f}/4000 whatsNew=${lens.w}/500${flag}`);
  }

  fs.mkdirSync(path.join(ROOT, '_data'), { recursive: true });
  const outPath = path.join(ROOT, '_data/play-localizations.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✓ wrote ${outPath}`);
}

main().catch(e => {
  console.error('FAIL:', e.response?.data?.errors || e.message);
  process.exit(1);
});
