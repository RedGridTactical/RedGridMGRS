#!/usr/bin/env node
/**
 * asc-update-whats-new.js — Push v3.3.1 "What's New" text to all ASC locales.
 *
 * Uses App Store Connect API with the .p8 key at secrets/AuthKey_77HSQA4SZD.p8
 * to update the "releaseNotes" field on the v3.3.1 app version across every
 * locale in one run.
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
  'en-US': `v3.3.1 — Faster in the Field

- MARK POSITION: one-tap waypoint save from the main screen. No menus, no delay. Drop a mark the instant you need it — CCP, contact, cache, rally point.
- OFFLINE MAP PROMPT: Red Grid now prompts you to download map tiles for your area on your first map visit, so you're field-ready before you lose signal.
- SHARE A FREE TRIAL: give a friend 30 days of Red Grid Pro. One gift per device, no strings, zero tracking. Receive one, give one.
- In-app What's New screen so returning users discover every new feature.
- Performance and stability improvements.`,

  'fr-FR': `v3.3.1 — Plus rapide sur le terrain

- MARQUAGE POSITION: enregistrement du point de passage en un seul toucher depuis l'écran principal. Plus de menus, plus de délai.
- CARTES HORS LIGNE: Red Grid propose de télécharger les tuiles de carte de votre zone dès votre première visite.
- PARTAGER UN ESSAI: offrez à un ami 30 jours de Red Grid Pro. Un cadeau par appareil, zéro tracking.
- Écran « Nouveautés » intégré pour les utilisateurs récurrents.
- Améliorations des performances et de la stabilité.`,

  'de-DE': `v3.3.1 — Schneller im Einsatz

- POSITION MARKIEREN: Ein-Tipp-Wegpunkt direkt vom Hauptbildschirm. Keine Menüs, keine Verzögerung.
- OFFLINE-KARTE: Red Grid fragt beim ersten Kartenbesuch, ob Kacheln für Ihr Gebiet heruntergeladen werden sollen.
- TESTVERSION TEILEN: Schenken Sie einem Freund 30 Tage Red Grid Pro. Ein Geschenk pro Gerät, kein Tracking.
- „Neu in dieser Version"-Bildschirm für wiederkehrende Benutzer.
- Leistungs- und Stabilitätsverbesserungen.`,

  'es-ES': `v3.3.1 — Más rápido en el campo

- MARCAR POSICIÓN: guardado de punto de ruta con un solo toque desde la pantalla principal. Sin menús, sin demoras.
- MAPAS OFFLINE: Red Grid ahora te pide descargar las teselas del mapa de tu área en la primera visita.
- COMPARTIR PRUEBA: regala a un amigo 30 días de Red Grid Pro. Un regalo por dispositivo, sin seguimiento.
- Pantalla "Novedades" integrada para usuarios recurrentes.
- Mejoras de rendimiento y estabilidad.`,

  'ja': `v3.3.1 — 現場でより迅速に

- 位置マーク: メイン画面からワンタップでウェイポイント保存。メニュー不要、即座に記録。
- オフラインマップ: 初回マップ表示時にエリアのタイルダウンロードを提案。
- 無料トライアル共有: 友人にRed Grid Proを30日間プレゼント。デバイスごとに1回、追跡なし。
- アプリ内の「新機能」画面でリピートユーザーに新機能を案内。
- パフォーマンスと安定性の改善。`,

  'ko': `v3.3.1 — 현장에서 더 빠르게

- 위치 표시: 메인 화면에서 원 탭으로 웨이포인트 저장. 메뉴 없이 즉시.
- 오프라인 지도: 첫 지도 방문 시 해당 지역의 타일 다운로드를 제안합니다.
- 무료 체험 공유: 친구에게 Red Grid Pro 30일을 선물하세요. 기기당 한 번, 추적 없음.
- 재방문 사용자를 위한 '새로운 기능' 화면.
- 성능 및 안정성 개선.`,
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
