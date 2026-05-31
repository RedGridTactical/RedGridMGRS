#!/usr/bin/env node
/**
 * asc-show-metadata.js — Read-only dump of the live ASO surface:
 *   - app name + subtitle (appInfoLocalizations, en-US)
 *   - keywords + promotional text per recent version (appStoreVersionLocalizations, en-US)
 * Helps see what's actually live vs. what STORE_LISTING.md intends.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const token = () => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
};
const api = () => axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token()}` }, validateStatus: () => true });

(async () => {
  // App name + subtitle (app-info level)
  const ai = await api().get(`/apps/${cfg.app_id}/appInfos`, { params: { limit: 5 } });
  console.log('=== App name / subtitle (appInfoLocalizations, en-US) ===');
  for (const info of (ai.data.data || [])) {
    const st = info.attributes.appStoreState || info.attributes.state || '?';
    const loc = await api().get(`/appInfos/${info.id}/appInfoLocalizations`, { params: { limit: 60 } });
    const en = (loc.data.data || []).find((l) => l.attributes.locale === 'en-US');
    if (en) console.log(`  appInfo ${info.id} [${st}]: name="${en.attributes.name}" | subtitle="${en.attributes.subtitle}"`);
  }

  // Keywords + promo per recent version (client-side sort by createdDate desc)
  console.log('\n=== Keywords / promo (appStoreVersionLocalizations, en-US) ===');
  const v = await api().get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { 'filter[platform]': 'IOS', limit: 10 } });
  const versions = (v.data.data || []).slice().sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || '')).slice(0, 3);
  for (const ver of versions) {
    const vs = ver.attributes.versionString, vstate = ver.attributes.appStoreState;
    const loc = await api().get(`/appStoreVersions/${ver.id}/appStoreVersionLocalizations`, { params: { limit: 60 } });
    const en = (loc.data.data || []).find((l) => l.attributes.locale === 'en-US');
    const kw = (en && en.attributes.keywords) || '';
    const promo = (en && en.attributes.promotionalText) || '';
    console.log(`  v${vs} [${vstate}]: keywords (${kw.length}/100) = "${kw}"`);
    console.log(`           promo = "${promo.slice(0, 80)}${promo.length > 80 ? '…' : ''}"`);
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
