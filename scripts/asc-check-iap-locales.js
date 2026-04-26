#!/usr/bin/env node
/**
 * asc-check-iap-locales.js — surface which subscription + IAP localizations are
 * present on App Store Connect. Helps verify that the translation pass also
 * covered IAP products (subscription display name + description), not just
 * the app metadata.
 *
 * Usage:
 *   node scripts/asc-check-iap-locales.js
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const privateKey = fs.readFileSync(path.join(ROOT, `secrets/AuthKey_${cfg.key_id}.p8`), 'utf8');

const token = jwt.sign({
  iss: cfg.issuer_id,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  aud: 'appstoreconnect-v1',
}, privateKey, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });

const http = axios.create({
  baseURL: 'https://api.appstoreconnect.apple.com/v1',
  headers: { Authorization: `Bearer ${token}` },
  timeout: 30000,
});

(async () => {
  console.log('═══════ ASC IAP Locale Audit ═══════\n');

  // 1) Subscriptions
  const groups = await http.get(`/apps/${cfg.app_id}/subscriptionGroups`);
  for (const g of groups.data.data) {
    console.log(`Subscription Group: ${g.attributes.name} (${g.id})`);
    const subs = await http.get(`/subscriptionGroups/${g.id}/subscriptions`);
    for (const s of subs.data.data) {
      console.log(`  → ${s.attributes.productId} [${s.attributes.subscriptionPeriod}]`);
      try {
        const locs = await http.get(`/subscriptions/${s.id}/appStoreReviewScreenshot,subscriptionLocalizations?include=subscriptionLocalizations`);
        const subLocs = (locs.data.included || []).filter(x => x.type === 'subscriptionLocalizations');
        const localeList = subLocs.map(l => l.attributes.locale);
        console.log(`     locales (${localeList.length}): ${localeList.join(', ') || '(none)'}`);
      } catch {
        // fall back to direct endpoint
        const direct = await http.get(`/subscriptions/${s.id}/subscriptionLocalizations`);
        const localeList = direct.data.data.map(l => l.attributes.locale);
        console.log(`     locales (${localeList.length}): ${localeList.join(', ') || '(none)'}`);
      }
    }
  }

  console.log('\n');

  // 2) Non-subscription IAPs (e.g., lifetime)
  const iaps = await http.get(`/apps/${cfg.app_id}/inAppPurchasesV2?limit=200`);
  for (const iap of iaps.data.data) {
    console.log(`IAP (${iap.attributes.inAppPurchaseType}): ${iap.attributes.productId}`);
    try {
      const locs = await http.get(`/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`);
      const localeList = locs.data.data.map(l => l.attributes.locale);
      console.log(`     locales (${localeList.length}): ${localeList.join(', ') || '(none)'}`);
    } catch (e) {
      console.log(`     (locale fetch failed: ${e.response?.status || e.message})`);
    }
  }
})().catch(e => {
  console.error('FAIL:', e.response?.data?.errors || e.message);
  process.exit(1);
});
