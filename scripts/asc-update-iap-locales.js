#!/usr/bin/env node
/**
 * asc-update-iap-locales.js — push native localizations for the 3 IAP products
 * (Pro Monthly subscription, Pro Annual subscription, Pro Lifetime non-sub) into
 * ASC across ~24 locales.
 *
 * Apple field limits:
 *   - subscriptionLocalization.name: 30 chars
 *   - subscriptionLocalization.description: 45 chars
 *   - inAppPurchaseLocalization.name: 30 chars
 *   - inAppPurchaseLocalization.description: 45 chars
 *
 * Endpoints:
 *   GET  /v1/apps/{id}/subscriptionGroups
 *   GET  /v1/subscriptionGroups/{id}/subscriptions
 *   GET  /v1/subscriptions/{id}/subscriptionLocalizations
 *   POST /v1/subscriptionLocalizations
 *   PATCH /v1/subscriptionLocalizations/{id}
 *
 *   GET  /v2/inAppPurchases/{id} (with include=iapPriceSchedule etc.)
 *   GET  /v2/inAppPurchases/{id}/relationships/inAppPurchaseLocalizations
 *   POST /v2/inAppPurchaseLocalizations
 *   PATCH /v2/inAppPurchaseLocalizations/{id}
 *
 * Usage:
 *   node scripts/asc-update-iap-locales.js          # dry run (default)
 *   node scripts/asc-update-iap-locales.js --apply  # write to ASC
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const APPLY = process.argv.includes('--apply');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const privateKey = fs.readFileSync(path.join(ROOT, `secrets/AuthKey_${cfg.key_id}.p8`), 'utf8');

// Per-locale localized {name, description} for each product.
// Names fit Apple's 30-char limit, descriptions fit 45-char limit.
//   M = Monthly subscription
//   A = Annual subscription
//   L = Lifetime IAP
const LOCALES = {
  'en-US':   { M:{n:'Red Grid Pro Monthly',d:'All tools, themes, reports, and formats'}, A:{n:'Red Grid Pro Annual',d:'All tools, themes, reports, and formats'}, L:{n:'Red Grid Pro Lifetime',d:'All tools, themes, reports, and formats'} },
  'fr-FR':   { M:{n:'Red Grid Pro Mensuel',d:'Tous outils, thèmes, rapports, formats'}, A:{n:'Red Grid Pro Annuel',d:'Tous outils, thèmes, rapports, formats'}, L:{n:'Red Grid Pro à Vie',d:'Tous outils, thèmes, rapports, formats'} },
  'de-DE':   { M:{n:'Red Grid Pro Monatlich',d:'Alle Tools, Themes, Berichte, Formate'}, A:{n:'Red Grid Pro Jährlich',d:'Alle Tools, Themes, Berichte, Formate'}, L:{n:'Red Grid Pro Lebenslang',d:'Alle Tools, Themes, Berichte, Formate'} },
  'es-ES':   { M:{n:'Red Grid Pro Mensual',d:'Herramientas, temas, informes, formatos'}, A:{n:'Red Grid Pro Anual',d:'Herramientas, temas, informes, formatos'}, L:{n:'Red Grid Pro De Por Vida',d:'Herramientas, temas, informes, formatos'} },
  'es-MX':   { M:{n:'Red Grid Pro Mensual',d:'Herramientas, temas, reportes, formatos'}, A:{n:'Red Grid Pro Anual',d:'Herramientas, temas, reportes, formatos'}, L:{n:'Red Grid Pro Vitalicio',d:'Herramientas, temas, reportes, formatos'} },
  'it':      { M:{n:'Red Grid Pro Mensile',d:'Strumenti, temi, rapporti, formati'}, A:{n:'Red Grid Pro Annuale',d:'Strumenti, temi, rapporti, formati'}, L:{n:'Red Grid Pro a Vita',d:'Strumenti, temi, rapporti, formati'} },
  'ja':      { M:{n:'Red Grid Pro 月額',d:'全ツール、テーマ、レポート、フォーマット'}, A:{n:'Red Grid Pro 年額',d:'全ツール、テーマ、レポート、フォーマット'}, L:{n:'Red Grid Pro 買い切り',d:'全ツール、テーマ、レポート、フォーマット'} },
  'ko':      { M:{n:'Red Grid Pro 월간',d:'모든 도구, 테마, 보고서, 형식'}, A:{n:'Red Grid Pro 연간',d:'모든 도구, 테마, 보고서, 형식'}, L:{n:'Red Grid Pro 평생',d:'모든 도구, 테마, 보고서, 형식'} },
  'nl-NL':   { M:{n:'Red Grid Pro Maandelijks',d:'Alle tools, thema\'s, rapporten, formaten'}, A:{n:'Red Grid Pro Jaarlijks',d:'Alle tools, thema\'s, rapporten, formaten'}, L:{n:'Red Grid Pro Levenslang',d:'Alle tools, thema\'s, rapporten, formaten'} },
  'pt-BR':   { M:{n:'Red Grid Pro Mensal',d:'Ferramentas, temas, relatórios, formatos'}, A:{n:'Red Grid Pro Anual',d:'Ferramentas, temas, relatórios, formatos'}, L:{n:'Red Grid Pro Vitalício',d:'Ferramentas, temas, relatórios, formatos'} },
  'ru':      { M:{n:'Red Grid Pro месячный',d:'Инструменты, темы, отчёты, форматы'}, A:{n:'Red Grid Pro годовой',d:'Инструменты, темы, отчёты, форматы'}, L:{n:'Red Grid Pro навсегда',d:'Инструменты, темы, отчёты, форматы'} },
  'uk':      { M:{n:'Red Grid Pro місячний',d:'Інструменти, теми, звіти, формати'}, A:{n:'Red Grid Pro річний',d:'Інструменти, теми, звіти, формати'}, L:{n:'Red Grid Pro назавжди',d:'Інструменти, теми, звіти, формати'} },
  'pl':      { M:{n:'Red Grid Pro Miesięczny',d:'Narzędzia, motywy, raporty, formaty'}, A:{n:'Red Grid Pro Roczny',d:'Narzędzia, motywy, raporty, formaty'}, L:{n:'Red Grid Pro Dożywotni',d:'Narzędzia, motywy, raporty, formaty'} },
  'tr':      { M:{n:'Red Grid Pro Aylık',d:'Araçlar, temalar, raporlar, formatlar'}, A:{n:'Red Grid Pro Yıllık',d:'Araçlar, temalar, raporlar, formatlar'}, L:{n:'Red Grid Pro Ömür Boyu',d:'Araçlar, temalar, raporlar, formatlar'} },
  'zh-Hans': { M:{n:'Red Grid Pro 月度',d:'全部工具、主题、报告和格式'}, A:{n:'Red Grid Pro 年度',d:'全部工具、主题、报告和格式'}, L:{n:'Red Grid Pro 终身',d:'全部工具、主题、报告和格式'} },
  'zh-Hant': { M:{n:'Red Grid Pro 月費',d:'全部工具、主題、報告和格式'}, A:{n:'Red Grid Pro 年費',d:'全部工具、主題、報告和格式'}, L:{n:'Red Grid Pro 終身',d:'全部工具、主題、報告和格式'} },
  'ar-SA':   { M:{n:'Red Grid Pro شهري',d:'الأدوات، السمات، التقارير، التنسيقات'}, A:{n:'Red Grid Pro سنوي',d:'الأدوات، السمات، التقارير، التنسيقات'}, L:{n:'Red Grid Pro مدى الحياة',d:'الأدوات، السمات، التقارير، التنسيقات'} },
  'hi':      { M:{n:'Red Grid Pro मासिक',d:'सभी टूल, थीम, रिपोर्ट, प्रारूप'}, A:{n:'Red Grid Pro वार्षिक',d:'सभी टूल, थीम, रिपोर्ट, प्रारूप'}, L:{n:'Red Grid Pro आजीवन',d:'सभी टूल, थीम, रिपोर्ट, प्रारूप'} },
  'sv':      { M:{n:'Red Grid Pro Månadsvis',d:'Verktyg, teman, rapporter, format'}, A:{n:'Red Grid Pro Årligen',d:'Verktyg, teman, rapporter, format'}, L:{n:'Red Grid Pro Livstid',d:'Verktyg, teman, rapporter, format'} },
  'no':      { M:{n:'Red Grid Pro Månedlig',d:'Verktøy, temaer, rapporter, formater'}, A:{n:'Red Grid Pro Årlig',d:'Verktøy, temaer, rapporter, formater'}, L:{n:'Red Grid Pro Livstid',d:'Verktøy, temaer, rapporter, formater'} },
  'sk':      { M:{n:'Red Grid Pro Mesačné',d:'Nástroje, motívy, správy, formáty'}, A:{n:'Red Grid Pro Ročné',d:'Nástroje, motívy, správy, formáty'}, L:{n:'Red Grid Pro Doživotné',d:'Nástroje, motívy, správy, formáty'} },
  'da':      { M:{n:'Red Grid Pro Månedlig',d:'Værktøjer, temaer, rapporter, formater'}, A:{n:'Red Grid Pro Årlig',d:'Værktøjer, temaer, rapporter, formater'}, L:{n:'Red Grid Pro Livstid',d:'Værktøjer, temaer, rapporter, formater'} },
  'th':      { M:{n:'Red Grid Pro รายเดือน',d:'เครื่องมือ ธีม รายงาน รูปแบบ'}, A:{n:'Red Grid Pro รายปี',d:'เครื่องมือ ธีม รายงาน รูปแบบ'}, L:{n:'Red Grid Pro ตลอดชีพ',d:'เครื่องมือ ธีม รายงาน รูปแบบ'} },
  'vi':      { M:{n:'Red Grid Pro Hàng Tháng',d:'Công cụ, chủ đề, báo cáo, định dạng'}, A:{n:'Red Grid Pro Hàng Năm',d:'Công cụ, chủ đề, báo cáo, định dạng'}, L:{n:'Red Grid Pro Trọn Đời',d:'Công cụ, chủ đề, báo cáo, định dạng'} },
  'id':      { M:{n:'Red Grid Pro Bulanan',d:'Alat, tema, laporan, format'}, A:{n:'Red Grid Pro Tahunan',d:'Alat, tema, laporan, format'}, L:{n:'Red Grid Pro Seumur Hidup',d:'Alat, tema, laporan, format'} },
};

const PRODUCT_IDS = {
  M: 'redgrid_mgrs_pro_monthly',
  A: 'redgrid_mgrs_pro_annual',
  L: 'redgrid_pro_lifetime',
};

function makeToken() {
  return jwt.sign({
    iss: cfg.issuer_id,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    aud: 'appstoreconnect-v1',
  }, privateKey, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
}

function validateLengths() {
  let bad = 0;
  for (const [locale, products] of Object.entries(LOCALES)) {
    for (const k of ['M', 'A', 'L']) {
      const { n, d } = products[k];
      if (n.length > 30) { console.warn(`  ${locale} ${k}.name=${n.length}/30 — "${n}"`); bad++; }
      if (d.length > 45) { console.warn(`  ${locale} ${k}.desc=${d.length}/45 — "${d}"`); bad++; }
    }
  }
  return bad;
}

async function pushSubscriptionLocalizations(http, subId, productKey) {
  const existing = (await http.get(`/subscriptions/${subId}/subscriptionLocalizations`)).data.data;
  const byLocale = Object.fromEntries(existing.map(l => [l.attributes.locale, l]));

  let created = 0, updated = 0, errors = [];
  for (const [locale, products] of Object.entries(LOCALES)) {
    const target = products[productKey];
    if (!target) continue;
    const cur = byLocale[locale];

    if (cur) {
      if (cur.attributes.name === target.n && cur.attributes.description === target.d) continue;
      console.log(`    ${locale}: PATCH "${cur.attributes.name}" → "${target.n}"`);
      if (APPLY) {
        try {
          await http.patch(`/subscriptionLocalizations/${cur.id}`, {
            data: { id: cur.id, type: 'subscriptionLocalizations', attributes: { name: target.n, description: target.d } },
          });
          updated++;
        } catch (e) { errors.push(`${locale}: ${e.response?.data?.errors?.[0]?.detail || e.message}`); }
      } else updated++;
    } else {
      console.log(`    ${locale}: POST "${target.n}"`);
      if (APPLY) {
        try {
          await http.post('/subscriptionLocalizations', {
            data: {
              type: 'subscriptionLocalizations',
              attributes: { name: target.n, description: target.d, locale },
              relationships: { subscription: { data: { type: 'subscriptions', id: subId } } },
            },
          });
          created++;
        } catch (e) { errors.push(`${locale}: ${e.response?.data?.errors?.[0]?.detail || e.message}`); }
      } else created++;
    }
  }
  console.log(`    → ${APPLY ? 'created' : 'would create'}: ${created}, ${APPLY ? 'updated' : 'would update'}: ${updated}, errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log(`      ! ${e}`));
}

async function pushIAPLocalizations(http, iapId, productKey) {
  // GET uses v2 endpoint, POST/PATCH uses v1.
  const httpV2 = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v2',
    headers: http.defaults.headers,
    timeout: 30000,
  });
  let existing;
  try {
    existing = (await httpV2.get(`/inAppPurchases/${iapId}/inAppPurchaseLocalizations`)).data.data;
  } catch (e) {
    console.log(`    Could not fetch existing IAP localizations: ${e.response?.status || e.message}`);
    return;
  }
  const byLocale = Object.fromEntries(existing.map(l => [l.attributes.locale, l]));

  let created = 0, updated = 0, errors = [];
  for (const [locale, products] of Object.entries(LOCALES)) {
    const target = products[productKey];
    if (!target) continue;
    const cur = byLocale[locale];

    if (cur) {
      if (cur.attributes.name === target.n && cur.attributes.description === target.d) continue;
      console.log(`    ${locale}: PATCH "${cur.attributes.name}" → "${target.n}"`);
      if (APPLY) {
        try {
          await http.patch(`/inAppPurchaseLocalizations/${cur.id}`, {
            data: { id: cur.id, type: 'inAppPurchaseLocalizations', attributes: { name: target.n, description: target.d } },
          });
          updated++;
        } catch (e) { errors.push(`${locale}: ${e.response?.data?.errors?.[0]?.detail || e.message}`); }
      } else updated++;
    } else {
      console.log(`    ${locale}: POST "${target.n}"`);
      if (APPLY) {
        try {
          await http.post('/inAppPurchaseLocalizations', {
            data: {
              type: 'inAppPurchaseLocalizations',
              attributes: { name: target.n, description: target.d, locale, state: 'PREPARE_FOR_SUBMISSION' },
              relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iapId } } },
            },
          });
          created++;
        } catch (e) {
          errors.push(`${locale}: ${e.response?.data?.errors?.[0]?.detail || e.message}`);
        }
      } else created++;
    }
  }
  console.log(`    → ${APPLY ? 'created' : 'would create'}: ${created}, ${APPLY ? 'updated' : 'would update'}: ${updated}, errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log(`      ! ${e}`));
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to ASC)' : 'DRY RUN'}\n`);

  // Validate string lengths up front
  console.log('Validating string lengths...');
  const bad = validateLengths();
  if (bad > 0) { console.error(`  ${bad} string(s) over limit. Fix before --apply.`); process.exit(1); }
  console.log('  ✓ all strings within Apple limits\n');

  const token = makeToken();
  const http = axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });

  // Subscriptions
  const groups = (await http.get(`/apps/${cfg.app_id}/subscriptionGroups`)).data.data;
  for (const g of groups) {
    const subs = (await http.get(`/subscriptionGroups/${g.id}/subscriptions`)).data.data;
    for (const s of subs) {
      const productKey = s.attributes.productId.includes('monthly') ? 'M' : (s.attributes.productId.includes('annual') ? 'A' : null);
      if (!productKey) { console.log(`  Skip ${s.attributes.productId} (no map)`); continue; }
      console.log(`Subscription ${s.attributes.productId} (${productKey}):`);
      await pushSubscriptionLocalizations(http, s.id, productKey);
    }
  }

  // Non-sub IAP (lifetime)
  const iaps = (await http.get(`/apps/${cfg.app_id}/inAppPurchasesV2`)).data.data;
  for (const iap of iaps) {
    if (!iap.attributes.productId.includes('lifetime')) continue;
    console.log(`IAP ${iap.attributes.productId} (L):`);
    await pushIAPLocalizations(http, iap.id, 'L');
  }
}

main().catch(e => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
