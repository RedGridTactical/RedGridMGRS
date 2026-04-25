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

  'es-MX': `v3.3.4 — Toca para eliminar

- Toca cualquier marcador de waypoint en el mapa para ver sus detalles y eliminarlo. Ya no hay marcadores atorados después de colocarlos. Funciona en los planes gratis y Pro.
- Ajustes menores de estabilidad y legibilidad en las pantallas de mapa y cuadrícula.`,

  'ja': `v3.3.4 — タップで削除

- 地図上のウェイポイントピンをタップして詳細を表示し、削除できます。プロットした後にマーカーが動かなくなることはありません。無料プランとProプランの両方で動作します。
- 地図とグリッド画面全体にわたる小さな安定性と可読性の改善。`,

  'ko': `v3.3.4 — 탭하여 삭제

- 지도의 웨이포인트 핀을 탭하여 세부 정보를 확인하고 제거하세요. 배치한 후 고정되는 마커가 더 이상 없습니다. 무료 및 Pro 요금제에서 작동합니다.
- 지도 및 그리드 화면 전반에 걸친 소소한 안정성 및 가독성 개선.`,

  'it': `v3.3.4 — Tocca per eliminare

- Tocca qualsiasi segnalino waypoint sulla mappa per vederne i dettagli e rimuoverlo. Basta con i marcatori bloccati dopo averli piazzati. Funziona sui piani gratuito e Pro.
- Piccoli miglioramenti di stabilità e leggibilità nelle schermate mappa e griglia.`,

  'nl-NL': `v3.3.4 — Tikken om te verwijderen

- Tik op een waypoint-speld op de kaart om de details te bekijken en deze te verwijderen. Geen vastzittende markers meer nadat je ze hebt geplaatst. Werkt op gratis en Pro plannen.
- Kleine verbeteringen aan stabiliteit en leesbaarheid in de kaart- en rasterschermen.`,

  'pt-BR': `v3.3.4 — Toque para excluir

- Toque em qualquer pino de waypoint no mapa para ver seus detalhes e removê-lo. Chega de marcadores presos depois de colocá-los. Funciona nos planos gratuito e Pro.
- Pequenos ajustes de estabilidade e legibilidade nas telas de mapa e grade.`,

  'pt-PT': `v3.3.4 — Tocar para eliminar

- Toque em qualquer pino de waypoint no mapa para ver os seus detalhes e removê-lo. Fim dos marcadores presos depois de colocados. Funciona nos planos gratuito e Pro.
- Pequenos ajustes de estabilidade e legibilidade nos ecrãs de mapa e grelha.`,

  'ru': `v3.3.4 — Касание для удаления

- Коснитесь любой метки путевой точки на карте, чтобы увидеть её данные и удалить. Больше никаких застрявших маркеров после установки. Работает на бесплатном и Pro тарифе.
- Небольшие улучшения стабильности и читаемости на экранах карты и сетки.`,

  'uk': `v3.3.4 — Торкніться, щоб видалити

- Торкніться будь-якої позначки путньої точки на карті, щоб переглянути її деталі та видалити. Більше жодних застряглих маркерів після розміщення. Працює на безкоштовному та Pro-тарифах.
- Незначні покращення стабільності та читабельності на екранах карти й сітки.`,

  'pl': `v3.3.4 — Dotknij, aby usunąć

- Dotknij dowolnej pinezki punktu trasy na mapie, aby zobaczyć jej szczegóły i ją usunąć. Koniec z zatrzymanymi znacznikami po ich ustawieniu. Działa w planach darmowym i Pro.
- Drobne usprawnienia stabilności i czytelności na ekranach mapy i siatki.`,

  'cs': `v3.3.4 — Klepnutím smažete

- Klepněte na libovolný kolík trasového bodu na mapě, abyste viděli jeho podrobnosti a odstranili ho. Žádné zaseknuté značky po jejich umístění. Funguje v bezplatném i Pro tarifu.
- Drobné úpravy stability a čitelnosti na obrazovkách mapy a mřížky.`,

  'sk': `v3.3.4 — Ťuknutím odstránite

- Ťuknite na ktorýkoľvek kolík trasového bodu na mape, aby ste videli jeho podrobnosti a odstránili ho. Už žiadne zaseknuté značky po ich umiestnení. Funguje v bezplatnom aj Pro pláne.
- Drobné úpravy stability a čitateľnosti na obrazovkách mapy a mriežky.`,

  'hr': `v3.3.4 — Dodir za brisanje

- Dodirnite bilo koji pin točke puta na karti kako biste vidjeli njezine detalje i uklonili je. Nema više zaglavljenih oznaka nakon postavljanja. Radi na besplatnom i Pro planu.
- Sitne poboljšanja stabilnosti i čitljivosti na zaslonima karte i mreže.`,

  'hu': `v3.3.4 — Érintsd meg a törléshez

- Érintsd meg bármelyik útpont-tűt a térképen, hogy megnézd a részleteit és eltávolítsd. Nincs többé beragadt jelölő az elhelyezés után. Működik ingyenes és Pro előfizetéssel.
- Apró stabilitási és olvashatósági finomítások a térkép és a rács képernyőkön.`,

  'ro': `v3.3.4 — Atinge pentru a șterge

- Atinge orice pin de waypoint de pe hartă pentru a-i vedea detaliile și a-l elimina. Gata cu marcajele blocate după plasare. Funcționează pe planurile gratuit și Pro.
- Mici îmbunătățiri de stabilitate și lizibilitate pe ecranele de hartă și grilă.`,

  'tr': `v3.3.4 — Silmek için dokun

- Haritadaki herhangi bir ara nokta iğnesine dokunarak ayrıntılarını görüp kaldırabilirsin. Yerleştirdikten sonra takılı kalan işaretçi yok. Ücretsiz ve Pro planlarında çalışır.
- Harita ve grid ekranlarında küçük kararlılık ve okunabilirlik iyileştirmeleri.`,

  'sv': `v3.3.4 — Tryck för att radera

- Tryck på vilken waypoint-nål som helst på kartan för att se dess detaljer och ta bort den. Inga fler fastna markörer efter att du placerat dem. Fungerar på gratis- och Pro-abonnemang.
- Mindre stabilitets- och läsbarhetsförbättringar på kart- och rutnätsskärmarna.`,

  'no': `v3.3.4 — Trykk for å slette

- Trykk på en hvilken som helst veipunktnål på kartet for å se detaljene og fjerne den. Ingen fastlåste markører etter at du har plassert dem. Fungerer på gratis- og Pro-abonnementer.
- Mindre stabilitets- og lesbarhetsforbedringer på kart- og rutenettskjermene.`,

  'da': `v3.3.4 — Tryk for at slette

- Tryk på en vilkårlig waypoint-pin på kortet for at se dens detaljer og fjerne den. Ikke flere fastlåste markører efter placering. Fungerer på gratis- og Pro-abonnementer.
- Mindre stabilitets- og læsbarhedsforbedringer på kort- og gitterskærmene.`,

  'fi': `v3.3.4 — Poista napauttamalla

- Napauta mitä tahansa reittipisteen nuppineulaa kartalla nähdäksesi sen tiedot ja poistaaksesi sen. Ei enää jumiutuneita merkkejä sijoittamisen jälkeen. Toimii ilmaisella ja Pro-tilauksella.
- Pieniä vakautta ja luettavuutta parantavia säätöjä kartta- ja ruudukkonäytöillä.`,

  'el': `v3.3.4 — Πατήστε για διαγραφή

- Πατήστε οποιαδήποτε καρφίτσα σημείου αναφοράς στον χάρτη για να δείτε τις λεπτομέρειές της και να την αφαιρέσετε. Τέλος στους κολλημένους δείκτες μετά την τοποθέτησή τους. Λειτουργεί σε δωρεάν και Pro πρόγραμμα.
- Μικρές βελτιώσεις σταθερότητας και αναγνωσιμότητας στις οθόνες χάρτη και πλέγματος.`,

  'zh-Hans': `v3.3.4 — 轻触删除航点

- 轻触地图上任何航点标记即可查看其详细信息并将其移除。放置后不再有卡住的标记。在免费版和 Pro 版中均可使用。
- 地图和网格屏幕的细微稳定性与可读性优化。`,

  'zh-Hant': `v3.3.4 — 輕觸以刪除航點

- 輕觸地圖上任何航點標記即可查看其詳細資訊並將其移除。放置後不再有卡住的標記。在免費方案與 Pro 方案中均可使用。
- 地圖與網格畫面的細微穩定性與可讀性優化。`,

  'vi': `v3.3.4 — Chạm để xóa điểm

- Chạm vào bất kỳ ghim điểm tham chiếu nào trên bản đồ để xem chi tiết và xóa. Không còn dấu bị kẹt sau khi đặt. Hoạt động trên gói miễn phí và Pro.
- Cải tiến nhỏ về độ ổn định và khả năng đọc trên màn hình bản đồ và lưới.`,

  'th': `v3.3.4 — แตะเพื่อลบ

- แตะหมุดจุดอ้างอิงใดก็ได้บนแผนที่เพื่อดูรายละเอียดและลบออก ไม่มีหมุดค้างหลังจากวางอีกต่อไป ใช้ได้ทั้งแผนฟรีและ Pro
- การปรับปรุงความเสถียรและการอ่านเล็กน้อยในหน้าจอแผนที่และกริด`,

  'id': `v3.3.4 — Ketuk untuk menghapus

- Ketuk pin titik jalur mana pun di peta untuk melihat detailnya dan menghapusnya. Tidak ada lagi penanda yang tersangkut setelah ditempatkan. Bekerja pada paket gratis dan Pro.
- Penyempurnaan stabilitas dan keterbacaan kecil di layar peta dan grid.`,

  'ms': `v3.3.4 — Ketik untuk padam

- Ketik mana-mana pin titik laluan pada peta untuk melihat butirannya dan membuangnya. Tiada lagi penanda tersangkut selepas ditempatkan. Berfungsi pada pelan percuma dan Pro.
- Penambahbaikan kecil kestabilan dan kebolehbacaan pada skrin peta dan grid.`,

  'hi': `v3.3.4 — हटाने के लिए टैप करें

- मानचित्र पर किसी भी वेपॉइंट पिन पर टैप करके उसका विवरण देखें और उसे हटाएँ। रखने के बाद अटके हुए मार्कर अब नहीं। मुफ़्त और Pro प्लान दोनों पर काम करता है।
- मानचित्र और ग्रिड स्क्रीन में छोटे-छोटे स्थिरता और पठनीयता सुधार।`,

  'he': `v3.3.4 — הקישו למחיקה

- הקישו על סיכת נקודת ציון כלשהי במפה כדי לראות את פרטיה ולהסיר אותה. אין יותר סמנים תקועים לאחר שמים אותם. פועל בתוכניות חינמית ו-Pro.
- שיפורי יציבות וקריאות קטנים במסכי המפה והרשת.`,

  'ar-SA': `v3.3.4 — انقر للحذف

- انقر على أي دبوس نقطة طريق على الخريطة لعرض تفاصيلها وإزالتها. لا مزيد من العلامات العالقة بعد وضعها. يعمل على الخطتين المجانية وPro.
- تحسينات طفيفة في الاستقرار وإمكانية القراءة في شاشتي الخريطة والشبكة.`,

  'ca': `v3.3.4 — Toqueu per eliminar

- Toqueu qualsevol marcador de waypoint al mapa per veure'n els detalls i eliminar-lo. No més marcadors encallats després de col·locar-los. Funciona en els plans gratuït i Pro.
- Petites millores d'estabilitat i llegibilitat a les pantalles de mapa i graella.`,
};

// Any ASC-required locales not listed in RELEASE_NOTES fall back to English.
// With v3.3.4+ we carry native translations for all 26 ASC locales currently
// live on our listing, so this list is short — kept only for regional English
// variants Apple may request.
const ENGLISH_FALLBACK_LOCALES = [
  'en-GB', 'en-AU', 'en-CA', 'en-SG',
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
