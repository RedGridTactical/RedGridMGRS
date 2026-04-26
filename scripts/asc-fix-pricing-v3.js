#!/usr/bin/env node
/**
 * asc-fix-pricing-v3.js — replace the outdated "$9.99 lifetime, no subscription"
 * closing paragraph with current 3-tier pricing copy across every ASC locale.
 *
 * The previous translation pass (scripts/asc-update-descriptions.js) was done
 * before the 3-tier subscription model rolled out. EN-US got updated separately
 * via ASC web UI; the 21 translations kept the stale "Pro 9,99 $ single purchase"
 * closing paragraph. This script finds the last paragraph of each locale's
 * description and — if it matches the bug-markers — replaces it with native
 * 3-tier copy.
 *
 * The pull strategy:
 *   1. GET /apps/{id}/appStoreVersions → pick the editable version
 *   2. GET /appStoreVersions/{id}/appStoreVersionLocalizations
 *   3. For each locale: split description on \n\n, inspect last paragraph,
 *      if it contains pricing-bug markers, replace with NEW_TAILS[locale],
 *      PATCH back to ASC.
 *
 * Usage:
 *   node scripts/asc-fix-pricing-v3.js               # dry run (default)
 *   node scripts/asc-fix-pricing-v3.js --apply       # write changes to ASC
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const APPLY = process.argv.includes('--apply');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const privateKey = fs.readFileSync(path.join(ROOT, `secrets/AuthKey_${cfg.key_id}.p8`), 'utf8');

// Markers that identify the OUTDATED closing paragraph.
// Tight set — only triggers when the paragraph mentions the stale $9.99
// price OR the false "no subscription / no recurring charges" claim.
// "Monthly/Annual/Lifetime" alone is NOT a bug marker because the new copy
// also mentions lifetime as one of three options.
const BUG_MARKERS = [
  '9,99', '9.99',
  'achat unique', 'aucun abonnement', 'aucun frais récurrent',
];

// New closing paragraphs — current 3-tier pricing, in each locale.
// Stays generic about prices ("Monthly, annual, or lifetime options available")
// so it doesn't go stale on the next price change.
const NEW_TAILS = {
  'en-US': "Download free — includes live MGRS display, 1 theme, basic tools, and 3 report templates. Upgrade to Red Grid Pro for all 10 tools, offline maps, mesh networking, all themes, unlimited waypoints, and all 6 reports. Monthly, annual, or lifetime options available.",
  'fr-FR': "Téléchargez gratuitement — affichage MGRS en direct, 1 thème, outils de base et 3 modèles de rapports inclus. Passez à Red Grid Pro pour les 10 outils, cartes hors ligne, mesh Meshtastic, tous les thèmes, waypoints illimités et les 6 modèles de rapports. Options mensuelle, annuelle ou à vie disponibles.",
  'de-DE': "Kostenloser Download — Live-MGRS-Anzeige, 1 Theme, Basis-Tools und 3 Berichtsvorlagen enthalten. Upgrade auf Red Grid Pro für alle 10 Tools, Offline-Karten, Meshtastic-Mesh, alle Themes, unbegrenzte Wegpunkte und alle 6 Berichtsvorlagen. Monats-, Jahres- oder Lifetime-Optionen verfügbar.",
  'es-ES': "Descarga gratuita — pantalla MGRS en vivo, 1 tema, herramientas básicas y 3 plantillas de informes incluidos. Actualiza a Red Grid Pro para las 10 herramientas, mapas sin conexión, mesh Meshtastic, todos los temas, waypoints ilimitados y las 6 plantillas de informes. Opciones mensual, anual o de por vida disponibles.",
  'es-MX': "Descarga gratis — pantalla MGRS en vivo, 1 tema, herramientas básicas y 3 plantillas de reporte incluidas. Actualiza a Red Grid Pro para las 10 herramientas, mapas sin conexión, mesh Meshtastic, todos los temas, waypoints ilimitados y las 6 plantillas de reporte. Opciones mensual, anual o vitalicia disponibles.",
  'it':    "Download gratuito — visualizzazione MGRS in tempo reale, 1 tema, strumenti base e 3 modelli di rapporto inclusi. Passa a Red Grid Pro per tutti i 10 strumenti, mappe offline, mesh Meshtastic, tutti i temi, waypoint illimitati e tutti i 6 modelli di rapporto. Disponibili opzioni mensile, annuale o a vita.",
  'nl-NL': "Gratis downloaden — live MGRS-weergave, 1 thema, basistools en 3 rapportsjablonen inbegrepen. Upgrade naar Red Grid Pro voor alle 10 tools, offline kaarten, Meshtastic-mesh, alle thema's, onbeperkte waypoints en alle 6 rapportsjablonen. Maandelijkse, jaarlijkse of levenslange opties beschikbaar.",
  'pt-BR': "Download gratuito — exibição MGRS ao vivo, 1 tema, ferramentas básicas e 3 modelos de relatório inclusos. Atualize para Red Grid Pro para todas as 10 ferramentas, mapas offline, mesh Meshtastic, todos os temas, waypoints ilimitados e todos os 6 modelos de relatório. Opções mensal, anual ou vitalícia disponíveis.",
  'pt-PT': "Download gratuito — visualização MGRS ao vivo, 1 tema, ferramentas básicas e 3 modelos de relatório incluídos. Atualize para Red Grid Pro para todas as 10 ferramentas, mapas offline, mesh Meshtastic, todos os temas, waypoints ilimitados e todos os 6 modelos de relatório. Opções mensal, anual ou vitalícia disponíveis.",
  'ru':    "Бесплатная загрузка — отображение MGRS в реальном времени, 1 тема, базовые инструменты и 3 шаблона отчётов в комплекте. Обновитесь до Red Grid Pro для всех 10 инструментов, офлайн-карт, Meshtastic mesh, всех тем, неограниченных путевых точек и всех 6 шаблонов отчётов. Доступны месячный, годовой и пожизненный варианты.",
  'uk':    "Безкоштовне завантаження — відображення MGRS у реальному часі, 1 тема, базові інструменти та 3 шаблони звітів у комплекті. Оновіть до Red Grid Pro для всіх 10 інструментів, офлайн-карт, Meshtastic mesh, усіх тем, необмежених путніх точок та всіх 6 шаблонів звітів. Доступні місячний, річний та довічний варіанти.",
  'pl':    "Bezpłatne pobranie — bieżący odczyt MGRS, 1 motyw, podstawowe narzędzia i 3 szablony raportów w zestawie. Przejdź na Red Grid Pro, aby uzyskać wszystkie 10 narzędzi, mapy offline, Meshtastic mesh, wszystkie motywy, nieograniczone punkty trasy i wszystkie 6 szablonów raportów. Dostępne opcje miesięczna, roczna lub dożywotnia.",
  'tr':    "Ücretsiz indirme — canlı MGRS göstergesi, 1 tema, temel araçlar ve 3 rapor şablonu dahildir. Red Grid Pro'ya yükselterek 10 aracın tamamı, çevrimdışı haritalar, Meshtastic mesh, tüm temalar, sınırsız ara noktalar ve 6 raporun tamamına erişin. Aylık, yıllık veya ömür boyu seçenekler mevcut.",
  'sv':    "Gratis nedladdning — live MGRS-visning, 1 tema, grundverktyg och 3 rapportmallar ingår. Uppgradera till Red Grid Pro för alla 10 verktyg, offlinekartor, Meshtastic-mesh, alla teman, obegränsade waypoints och alla 6 rapportmallar. Månads-, års- eller livstidsalternativ tillgängliga.",
  'no':    "Gratis nedlasting — live MGRS-visning, 1 tema, grunnverktøy og 3 rapportmaler inkludert. Oppgrader til Red Grid Pro for alle 10 verktøy, offlinekart, Meshtastic-mesh, alle temaer, ubegrensede veipunkter og alle 6 rapportmaler. Tilgjengelig som måneds-, års- eller livstidsalternativ.",
  'sk':    "Bezplatné stiahnutie — živé zobrazenie MGRS, 1 motív, základné nástroje a 3 šablóny správ v balíku. Inovujte na Red Grid Pro pre všetkých 10 nástrojov, offline mapy, Meshtastic mesh, všetky motívy, neobmedzené trasové body a všetkých 6 šablón správ. K dispozícii mesačné, ročné alebo doživotné možnosti.",
  'da':    "Gratis download — live MGRS-visning, 1 tema, grundlæggende værktøjer og 3 rapportskabeloner inkluderet. Opgrader til Red Grid Pro for alle 10 værktøjer, offline-kort, Meshtastic-mesh, alle temaer, ubegrænsede waypoints og alle 6 rapportskabeloner. Tilgængelig som månedlig, årlig eller livstidsmulighed.",
  'hr':    "Besplatno preuzimanje — prikaz MGRS uživo, 1 tema, osnovni alati i 3 predloška izvješća uključeni. Nadogradite na Red Grid Pro za svih 10 alata, offline karte, Meshtastic mesh, sve teme, neograničene točke puta i svih 6 predložaka izvješća. Dostupne su mjesečne, godišnje ili doživotne opcije.",
  'ja':    "無料ダウンロード — ライブ MGRS 表示、1 テーマ、基本ツール、3 つのレポートテンプレートを含みます。Red Grid Pro にアップグレードすると、10 種類すべてのツール、オフラインマップ、Meshtastic メッシュ、全テーマ、無制限のウェイポイント、6 つの全レポートテンプレートが利用可能。月額、年額、または買い切りプランをご用意。",
  'ko':    "무료 다운로드 — 실시간 MGRS 표시, 테마 1개, 기본 도구, 보고서 템플릿 3개 포함. Red Grid Pro로 업그레이드하면 도구 10가지 전체, 오프라인 지도, Meshtastic 메시, 모든 테마, 무제한 웨이포인트, 보고서 템플릿 6가지 전체를 이용할 수 있습니다. 월간, 연간 또는 평생 옵션 제공.",
  'zh-Hans':"免费下载——实时 MGRS 显示、1 个主题、基础工具及 3 个报告模板。升级到 Red Grid Pro 即可使用全部 10 种工具、离线地图、Meshtastic 网络、所有主题、无限航点和全部 6 个报告模板。可选月度、年度或终身订阅。",
  'zh-Hant':"免費下載——即時 MGRS 顯示、1 個主題、基礎工具及 3 個報告範本。升級到 Red Grid Pro 即可使用全部 10 種工具、離線地圖、Meshtastic 網路、所有主題、無限航點和全部 6 個報告範本。可選月費、年費或終身方案。",
  'th':    "ดาวน์โหลดฟรี — รวมการแสดงผล MGRS แบบเรียลไทม์ 1 ธีม เครื่องมือพื้นฐาน และเทมเพลตรายงาน 3 แบบ อัปเกรดเป็น Red Grid Pro เพื่อรับเครื่องมือทั้ง 10 อย่าง แผนที่ออฟไลน์ Meshtastic mesh ทุกธีม จุดอ้างอิงไม่จำกัด และรายงานครบทั้ง 6 แบบ มีตัวเลือกรายเดือน รายปี หรือตลอดชีพ",
  'vi':    "Tải xuống miễn phí — hiển thị MGRS trực tiếp, 1 chủ đề, công cụ cơ bản và 3 mẫu báo cáo đi kèm. Nâng cấp lên Red Grid Pro để có cả 10 công cụ, bản đồ ngoại tuyến, Meshtastic mesh, tất cả chủ đề, điểm tham chiếu không giới hạn và cả 6 mẫu báo cáo. Có các tùy chọn hàng tháng, hàng năm hoặc trọn đời.",
  'id':    "Unduh gratis — tampilan MGRS langsung, 1 tema, alat dasar, dan 3 templat laporan disertakan. Tingkatkan ke Red Grid Pro untuk seluruh 10 alat, peta offline, Meshtastic mesh, semua tema, waypoint tak terbatas, dan keenam templat laporan. Tersedia opsi bulanan, tahunan, atau seumur hidup.",
  'hi':    "मुफ्त डाउनलोड — लाइव MGRS डिस्प्ले, 1 थीम, बेसिक टूल्स और 3 रिपोर्ट टेम्पलेट शामिल। Red Grid Pro में अपग्रेड करें: सभी 10 टूल्स, ऑफ़लाइन मानचित्र, Meshtastic mesh, सभी थीम, असीमित वेपॉइंट्स और सभी 6 रिपोर्ट टेम्पलेट। मासिक, वार्षिक या आजीवन विकल्प उपलब्ध।",
  'ar-SA': "تحميل مجاني — عرض MGRS مباشر، سمة واحدة، أدوات أساسية، و3 قوالب تقارير مضمنة. ترقَّ إلى Red Grid Pro للحصول على الأدوات العشر كاملة، الخرائط دون اتصال، شبكة Meshtastic، جميع السمات، نقاط الطريق غير المحدودة، والتقارير الستة كاملة. تتوفر خيارات شهرية أو سنوية أو مدى الحياة.",
};

function makeToken() {
  return jwt.sign({
    iss: cfg.issuer_id,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    aud: 'appstoreconnect-v1',
  }, privateKey, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
}

function paragraphLooksOutdated(paragraph) {
  if (!paragraph) return false;
  const lower = paragraph.toLowerCase();
  return BUG_MARKERS.some(m => lower.includes(m.toLowerCase()));
}

async function findEditableVersion(http) {
  // Prefer editable states. READY_FOR_SALE allows description edits in
  // a "ready for sale, draft changes" mode that pushes on next manual update.
  const versions = (await http.get(`/apps/${cfg.app_id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data.data;
  const order = ['PREPARE_FOR_SUBMISSION', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE', 'DEVELOPER_REJECTED'];
  versions.sort((a,b) => order.indexOf(a.attributes.appStoreState) - order.indexOf(b.attributes.appStoreState));
  return versions.find(v => order.includes(v.attributes.appStoreState)) || versions[0];
}

async function main() {
  const token = makeToken();
  const http = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  const v = await findEditableVersion(http);
  console.log(`Working on ASC version ${v.attributes.versionString} [${v.attributes.appStoreState}]`);
  console.log(`Mode: ${APPLY ? 'APPLY (write to ASC)' : 'DRY RUN'}\n`);

  const locsRes = await http.get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`);
  const locs = locsRes.data.data;

  const stats = { ok: 0, fixed: 0, skipped_clean: 0, skipped_no_translation: 0, errors: [] };

  for (const loc of locs) {
    const locale = loc.attributes.locale;
    const description = loc.attributes.description || '';
    if (!description) {
      console.log(`  ${locale}: empty description, skip`);
      continue;
    }
    const paragraphs = description.split(/\n\n/);
    const last = paragraphs[paragraphs.length - 1];

    if (!paragraphLooksOutdated(last)) {
      console.log(`  ${locale}: clean (last paragraph already current pricing)`);
      stats.skipped_clean++;
      continue;
    }

    const newTail = NEW_TAILS[locale];
    if (!newTail) {
      console.log(`  ${locale}: ⚠️  outdated tail but NO TRANSLATION DEFINED — manual fix required`);
      stats.skipped_no_translation++;
      stats.errors.push(`${locale}: missing NEW_TAILS entry`);
      continue;
    }

    const newDescription = [...paragraphs.slice(0, -1), newTail].join('\n\n');
    if (newDescription.length > 4000) {
      console.log(`  ${locale}: ⚠️  new description ${newDescription.length} chars > 4000 limit — skip`);
      stats.errors.push(`${locale}: result too long ${newDescription.length}/4000`);
      continue;
    }

    console.log(`  ${locale}: REPLACE (was ${description.length}, now ${newDescription.length} chars)`);
    if (APPLY) {
      try {
        await http.patch(`/appStoreVersionLocalizations/${loc.id}`, {
          data: {
            id: loc.id,
            type: 'appStoreVersionLocalizations',
            attributes: { description: newDescription },
          },
        });
        stats.fixed++;
      } catch (e) {
        const err = e.response?.data?.errors?.[0]?.detail || e.message;
        console.log(`     PATCH failed: ${err}`);
        stats.errors.push(`${locale}: ${err}`);
      }
    } else {
      stats.fixed++;  // count as "would-fix"
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${stats.fixed} locales fixed, ${stats.skipped_clean} already-clean, ${stats.skipped_no_translation} missing translations.`);
  if (stats.errors.length) {
    console.log(`\nIssues:\n  ${stats.errors.join('\n  ')}`);
  }
  if (!APPLY) {
    console.log(`\nRun with --apply to write changes to ASC.`);
  }
}

main().catch(e => {
  console.error('FAIL:', e.response?.data?.errors || e.message);
  process.exit(1);
});
