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
  'en-US': `v3.3.3 — Smoother in the Field

- REVIEW PROMPT POLISH: if you like Red Grid, the in-app review ask now appears at natural moments (right after a successful MARK POSITION) instead of at random launches.
- Background tuning and stability improvements across the grid, map, and tools.`,

  'fr-FR': `v3.3.3 — Plus fluide sur le terrain

- INVITATION D'AVIS AFFINÉE: si vous aimez Red Grid, la demande d'avis intégrée apparaît maintenant à des moments naturels (juste après un MARQUAGE POSITION réussi) au lieu de lancements aléatoires.
- Améliorations des performances et de la stabilité sur la grille, la carte et les outils.`,

  'de-DE': `v3.3.3 — Geschmeidiger im Einsatz

- BEWERTUNGSAUFFORDERUNG VERFEINERT: Wenn Sie Red Grid mögen, erscheint die In-App-Bewertungsanfrage jetzt in natürlichen Momenten (direkt nach einer erfolgreichen POSITION MARKIEREN) statt bei zufälligen Starts.
- Hintergrund-Tuning und Stabilitätsverbesserungen in Grid, Karte und Werkzeugen.`,

  'es-ES': `v3.3.3 — Más fluido en el campo

- INVITACIÓN DE RESEÑA REFINADA: si te gusta Red Grid, la solicitud de reseña en la app aparece ahora en momentos naturales (justo después de un MARCAR POSICIÓN exitoso) en vez de lanzamientos aleatorios.
- Ajustes de rendimiento y mejoras de estabilidad en la cuadrícula, el mapa y las herramientas.`,

  'ja': `v3.3.3 — 現場でよりスムーズに

- レビュー依頼の最適化: Red Gridを気に入った場合、アプリ内レビューの依頼がランダムな起動時ではなく、自然なタイミング（位置マーク成功直後）に表示されるようになりました。
- グリッド、マップ、ツール全体のバックグラウンドチューニングと安定性の改善。`,

  'ko': `v3.3.3 — 현장에서 더 부드럽게

- 리뷰 요청 개선: Red Grid가 마음에 드신다면, 앱 내 리뷰 요청이 임의의 실행 시점이 아닌 자연스러운 순간(위치 표시 성공 직후)에 나타납니다.
- 그리드, 지도, 도구 전반의 백그라운드 조정 및 안정성 개선.`,
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
