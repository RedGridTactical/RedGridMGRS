#!/usr/bin/env node
/**
 * asc-update-promo-text.js — Push localized `promotionalText` to every ASC
 * locale on the LIVE App Store listing.
 *
 * Why this script exists:
 *   Previously `promotionalText` was unset across all 26 live locales — a clear
 *   discoverability miss (promotional text shows below the app title in App
 *   Store search results for many layouts). This script fills native copy in
 *   every locale where we have an ASC localization record.
 *
 * The promotional text applies to the LIVE version, not to any in-review
 * version. It can be updated without pushing a build. Limit: 170 chars.
 *
 * Usage:
 *   node scripts/asc-update-promo-text.js              # targets LIVE version
 *   node scripts/asc-update-promo-text.js 3.3.4        # targets specific version
 *
 * Prereqs: jsonwebtoken + axios (already installed).
 */
const fs = require('fs');
const path = require('path');

function requireOrHint(mod) {
  try { return require(mod); }
  catch { console.error(`Missing dep "${mod}". Install with: npm install ${mod}`); process.exit(1); }
}

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));

// 170-char max per Apple. Each native translation focuses on the three
// strongest anchors: instant MARK POSITION / offline maps / zero network.
// Military/tactical terms (MGRS, DAGR, Meshtastic) stay in English.
const PROMO_TEXT = {
  'en-US':  'One-tap MARK POSITION. Offline tactical maps, Meshtastic mesh, 10 tactical tools. DAGR-class navigation — zero network, zero tracking, zero accounts.',
  'fr-FR':  'MARQUER POSITION en un toucher. Cartes tactiques hors ligne, mesh Meshtastic, 10 outils tactiques. Navigation classe DAGR — zéro réseau, zéro suivi.',
  'de-DE':  'POSITION MARKIEREN per Antippen. Offline-Taktikkarten, Meshtastic Mesh, 10 taktische Werkzeuge. DAGR-Klasse Navigation — null Netzwerk, null Tracking.',
  'es-ES':  'MARCAR POSICIÓN con un toque. Mapas tácticos sin conexión, red Meshtastic, 10 herramientas tácticas. Navegación clase DAGR — sin red, sin seguimiento.',
  'es-MX':  'MARCA POSICIÓN con un toque. Mapas tácticos sin conexión, red Meshtastic, 10 herramientas tácticas. Navegación clase DAGR — sin red, sin rastreo.',
  'ja':     'ワンタップで位置マーク。オフラインタクティカルマップ、Meshtasticメッシュ、10種の戦術ツール。DAGRクラスのナビゲーション — ネットワーク不要。',
  'ko':     '원 탭 위치 표시. 오프라인 전술 지도, Meshtastic 메시, 10가지 전술 도구. DAGR 등급 내비게이션 — 네트워크 불필요, 추적 없음.',
  'it':     'MARK POSITION con un tocco. Mappe tattiche offline, mesh Meshtastic, 10 strumenti tattici. Navigazione classe DAGR — zero rete, zero tracciamento.',
  'nl-NL':  'MARK POSITION met één tik. Offline tactische kaarten, Meshtastic mesh, 10 tactische tools. DAGR-klasse navigatie — geen netwerk, geen tracking.',
  'pt-BR':  'MARK POSITION com um toque. Mapas táticos offline, mesh Meshtastic, 10 ferramentas táticas. Navegação classe DAGR — sem rede, sem rastreamento.',
  'pt-PT':  'MARK POSITION com um toque. Mapas táticos offline, mesh Meshtastic, 10 ferramentas táticas. Navegação de classe DAGR — sem rede, sem rastreio.',
  'ru':     'MARK POSITION одним касанием. Офлайн-тактические карты, Meshtastic mesh, 10 тактических инструментов. Навигация класса DAGR — без сети и трекинга.',
  'uk':     'MARK POSITION одним дотиком. Офлайн-тактичні карти, Meshtastic mesh, 10 тактичних інструментів. Навігація класу DAGR — без мережі та трекінгу.',
  'pl':     'MARK POSITION jednym dotknięciem. Mapy taktyczne offline, mesh Meshtastic, 10 narzędzi taktycznych. Nawigacja klasy DAGR — bez sieci, bez śledzenia.',
  'cs':     'MARK POSITION jedním dotykem. Offline taktické mapy, Meshtastic mesh, 10 taktických nástrojů. Navigace třídy DAGR — bez sítě, bez sledování.',
  'sk':     'MARK POSITION jedným ťuknutím. Offline taktické mapy, Meshtastic mesh, 10 taktických nástrojov. Navigácia triedy DAGR — bez siete, bez sledovania.',
  'hr':     'MARK POSITION jednim dodirom. Offline taktičke karte, Meshtastic mesh, 10 taktičkih alata. Navigacija DAGR klase — bez mreže, bez praćenja.',
  'hu':     'MARK POSITION egy érintéssel. Offline taktikai térképek, Meshtastic mesh, 10 taktikai eszköz. DAGR-osztályú navigáció — nincs hálózat, nincs követés.',
  'ro':     'MARK POSITION cu o atingere. Hărți tactice offline, mesh Meshtastic, 10 instrumente tactice. Navigație clasa DAGR — fără rețea, fără urmărire.',
  'tr':     'Tek dokunuşla MARK POSITION. Çevrimdışı taktik haritalar, Meshtastic mesh, 10 taktik araç. DAGR sınıfı navigasyon — ağsız, takipsiz.',
  'sv':     'MARK POSITION med ett tryck. Offline taktiska kartor, Meshtastic mesh, 10 taktiska verktyg. DAGR-klass navigering — utan nätverk eller spårning.',
  'no':     'MARK POSITION med ett trykk. Offline taktiske kart, Meshtastic mesh, 10 taktiske verktøy. DAGR-klasse navigering — uten nettverk eller sporing.',
  'da':     'MARK POSITION med ét tryk. Offline taktiske kort, Meshtastic mesh, 10 taktiske værktøjer. DAGR-klasse navigation — uden netværk eller sporing.',
  'fi':     'MARK POSITION yhdellä napautuksella. Offline-taktiset kartat, Meshtastic-mesh, 10 taktista työkalua. DAGR-luokan navigointi — ei verkkoa, ei seurantaa.',
  'el':     'MARK POSITION με ένα άγγιγμα. Offline τακτικοί χάρτες, Meshtastic mesh, 10 τακτικά εργαλεία. Πλοήγηση κλάσης DAGR — χωρίς δίκτυο ή παρακολούθηση.',
  'zh-Hans':'一键 MARK POSITION。离线战术地图、Meshtastic 网状网络、10 种战术工具。DAGR 级导航 — 零网络、零追踪、零账户。',
  'zh-Hant':'一鍵 MARK POSITION。離線戰術地圖、Meshtastic 網狀網路、10 種戰術工具。DAGR 級導航 — 零網路、零追蹤、零帳戶。',
  'vi':     'Một chạm MARK POSITION. Bản đồ tác chiến ngoại tuyến, mesh Meshtastic, 10 công cụ tác chiến. Dẫn đường cấp DAGR — không mạng, không theo dõi.',
  'th':     'แตะครั้งเดียว MARK POSITION แผนที่ยุทธวิธีออฟไลน์ เมช Meshtastic เครื่องมือยุทธวิธี 10 รายการ การนำทางระดับ DAGR — ไม่ต้องเครือข่าย',
  'id':     'Sekali ketuk MARK POSITION. Peta taktis offline, mesh Meshtastic, 10 alat taktis. Navigasi kelas DAGR — tanpa jaringan, tanpa pelacakan.',
  'ms':     'Satu sentuhan MARK POSITION. Peta taktikal luar talian, mesh Meshtastic, 10 alat taktikal. Navigasi kelas DAGR — tiada rangkaian, tiada penjejakan.',
  'hi':     'एक टैप में MARK POSITION। ऑफ़लाइन सामरिक नक्शे, Meshtastic मेश, 10 सामरिक उपकरण। DAGR श्रेणी नेविगेशन — कोई नेटवर्क नहीं, कोई ट्रैकिंग नहीं।',
  'he':     'לחיצה אחת ל-MARK POSITION. מפות טקטיות לא מקוונות, רשת Meshtastic, 10 כלים טקטיים. ניווט ברמת DAGR — ללא רשת, ללא מעקב.',
  'ar-SA':  'تحديد MARK POSITION بلمسة واحدة. خرائط تكتيكية دون إنترنت، شبكة Meshtastic، 10 أدوات تكتيكية. ملاحة من فئة DAGR — بدون شبكة أو تتبع.',
  'ca':     'MARK POSITION amb un toc. Mapes tàctics sense connexió, mesh Meshtastic, 10 eines tàctiques. Navegació classe DAGR — sense xarxa, sense seguiment.',
};

async function main() {
  const jwt = requireOrHint('jsonwebtoken');
  const axios = requireOrHint('axios');

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
  );

  const api = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
  });

  const targetVersion = process.argv[2];
  let vId;
  if (targetVersion) {
    const r = await api.get(`/apps/${cfg.app_id}/appStoreVersions`, {
      params: { 'filter[versionString]': targetVersion, 'filter[platform]': 'IOS', limit: 1 },
    });
    if (!r.data.data.length) { console.error(`No v${targetVersion} found.`); process.exit(2); }
    vId = r.data.data[0].id;
    console.log(`Targeting v${targetVersion} (id ${vId})`);
  } else {
    // Most-recent READY_FOR_SALE or WAITING_FOR_REVIEW
    const r = await api.get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { limit: 10 } });
    const sorted = r.data.data.slice().sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''));
    const eligible = sorted.find(v => ['READY_FOR_SALE','WAITING_FOR_REVIEW','PREPARE_FOR_SUBMISSION'].includes(v.attributes.appStoreState));
    if (!eligible) { console.error('No eligible version found.'); process.exit(2); }
    vId = eligible.id;
    console.log(`Targeting v${eligible.attributes.versionString} (id ${vId}, state ${eligible.attributes.appStoreState})`);
  }

  const locRes = await api.get(`/appStoreVersions/${vId}/appStoreVersionLocalizations`, { params: { limit: 200 } });
  const locs = locRes.data.data || [];
  console.log(`Version has ${locs.length} localizations\n`);

  let updated = 0, skipped = 0, failed = 0;
  for (const loc of locs) {
    const locale = loc.attributes.locale;
    const promo = PROMO_TEXT[locale] || PROMO_TEXT['en-US'];
    if (!promo) { console.warn(`  ? no promo for ${locale}`); skipped++; continue; }
    if (promo.length > 170) console.warn(`  ! promo ${locale} is ${promo.length} chars > 170`);
    try {
      await api.patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          id: loc.id,
          type: 'appStoreVersionLocalizations',
          attributes: { promotionalText: promo },
        },
      });
      console.log(`  ✓ ${locale}  (${promo.length} chars)`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${locale}: ${err.response?.status} ${err.response?.data?.errors?.[0]?.detail || err.message}`);
      failed++;
    }
  }
  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  process.exit(failed ? 3 : 0);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(99); });
