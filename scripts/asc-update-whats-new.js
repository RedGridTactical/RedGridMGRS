#!/usr/bin/env node
/**
 * asc-update-whats-new.js — Push "What's New" text to all ASC locales.
 *
 * Uses App Store Connect API with the .p8 key at secrets/AuthKey_77HSQA4SZD.p8
 * to update the "releaseNotes" field on the target app version across every
 * locale in one run. Defaults to app.json version if no arg is passed.
 *
 * Prereqs: run `npm install jsonwebtoken axios` once.
 *
 * Usage:
 *   node scripts/asc-update-whats-new.js [version]
 *
 * Default version is read from app.json.
 */

const fs = require('fs');
const path = require('path');

// Lazy-require so running --help without deps still works
function requireOrHint(mod) {
  try { return require(mod); }
  catch {
    console.error(`Missing dep "${mod}". Install with: npm install ${mod}`);
    process.exit(1);
  }
}

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD';
const ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f';
const APP_ID = '6759629554'; // Red Grid MGRS

// Release notes per locale. Copy the English version for locales we don't
// have a translation for — ASC requires ALL localizations to be populated.
const RELEASE_NOTES = {
  'en-US': `v3.3.4 — Tap-to-Delete Waypoints

- Tap any waypoint pin on the map to see its details and remove it. No more stuck markers after you plot them. Works on free and Pro plans.
- Minor stability and readability tweaks across the map and grid screens.`,

  'fr-FR': `v3.3.4 — Toucher pour supprimer

- Touchez n'importe quelle épingle sur la carte pour voir ses détails et la supprimer. Plus de marqueurs bloqués après les avoir placés. Fonctionne sur les plans gratuit et Pro.
- Petites améliorations de stabilité et de lisibilité sur les écrans de carte et de grille.`,

  'de-DE': `v3.3.4 — Antippen zum Löschen

- Tippen Sie auf eine beliebige Wegpunkt-Markierung auf der Karte, um deren Details zu sehen und sie zu entfernen. Keine festsitzenden Marker mehr nach dem Setzen. Funktioniert auf dem kostenlosen und Pro-Tarif.
- Kleinere Stabilitäts- und Lesbarkeitsverbesserungen auf den Karten- und Grid-Bildschirmen.`,

  'es-ES': `v3.3.4 — Tocar para eliminar

- Toca cualquier punto de referencia en el mapa para ver sus detalles y eliminarlo. Ya no hay marcadores atascados después de colocarlos. Funciona en los planes gratuito y Pro.
- Pequeños ajustes de estabilidad y legibilidad en las pantallas de mapa y cuadrícula.`,

  'ja': `v3.3.4 — タップで削除

- 地図上のウェイポイントピンをタップして詳細を表示し、削除できます。プロットした後にマーカーが動かなくなることはありません。無料プランとProプランの両方で動作します。
- 地図とグリッド画面全体にわたる小さな安定性と可読性の改善。`,

  'ko': `v3.3.4 — 탭하여 삭제

- 지도의 웨이포인트 핀을 탭하여 세부 정보를 확인하고 제거하세요. 배치한 후 고정되는 마커가 더 이상 없습니다. 무료 및 Pro 요금제에서 작동합니다.
- 지도 및 그리드 화면 전반에 걸친 소소한 안정성 및 가독성 개선.`,
};

// Additional locales that share English text (fallback for all remaining
// locales ASC requires). Add specific translations above over time.
const ENGLISH_FALLBACK_LOCALES = [
  'en-GB', 'en-AU', 'en-CA', 'en-SG',
  'it', 'nl-NL', 'pt-PT', 'pt-BR', 'ru', 'sv', 'no', 'fi', 'da',
  'tr', 'pl', 'cs', 'el', 'he', 'hi', 'id', 'ms', 'th', 'vi',
  'zh-Hans', 'zh-Hant', 'es-MX', 'ar-SA', 'ca', 'hr', 'hu', 'ro', 'sk', 'uk',
];

async function main() {
  const jwt = requireOrHint('jsonwebtoken');
  const axios = requireOrHint('axios');

  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Missing ASC .p8 key at ${KEY_PATH}`);
    process.exit(1);
  }

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const targetVersion = process.argv[2] || appJson.expo.version;
  console.log(`Target version: ${targetVersion}`);

  const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '20m',
    audience: 'appstoreconnect-v1',
    issuer: ISSUER_ID,
    header: { kid: KEY_ID, typ: 'JWT' },
  });

  const api = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
  });

  // 1. Find the app version matching our target
  console.log('Fetching app versions...');
  const versionsRes = await api.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=${targetVersion}&filter[platform]=IOS&limit=5`);
  const versions = versionsRes.data.data || [];
  if (!versions.length) {
    console.error(`No app version ${targetVersion} found. Create it in App Store Connect first.`);
    process.exit(2);
  }
  const versionId = versions[0].id;
  console.log(`Found version ${targetVersion} → id ${versionId}`);

  // 2. Fetch all localizations
  const locRes = await api.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=200`);
  const locs = locRes.data.data || [];
  console.log(`Version has ${locs.length} localizations`);

  // 3. Build the full set of release notes (English + translated + fallbacks)
  const allNotes = { ...RELEASE_NOTES };
  for (const loc of ENGLISH_FALLBACK_LOCALES) allNotes[loc] = RELEASE_NOTES['en-US'];

  // 4. Update each
  let updated = 0, skipped = 0, failed = 0;
  for (const loc of locs) {
    const locale = loc.attributes.locale;
    const text = allNotes[locale];
    if (!text) {
      console.warn(`  ? Skipping ${locale} (no translation defined)`);
      skipped++;
      continue;
    }
    try {
      await api.patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          id: loc.id,
          type: 'appStoreVersionLocalizations',
          attributes: { whatsNew: text },
        },
      });
      console.log(`  ✓ ${locale}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${locale}: ${err.response?.status} ${err.response?.data?.errors?.[0]?.detail || err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  process.exit(failed ? 3 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(99);
});
