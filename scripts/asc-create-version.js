#!/usr/bin/env node
/**
 * asc-create-version.js — Create a new IOS appStoreVersion record (idempotent).
 *
 * Nothing else in the toolchain creates the version; asc-update-whats-new.js and
 * asc-submit-for-review.js both assume it already exists. ASC auto-inherits the
 * previous version's localizations (description, keywords, etc.) onto the new
 * version, with whatsNew reset (set it via asc-update-whats-new.js).
 *
 * Usage:
 *   node scripts/asc-create-version.js [version] [MANUAL|AFTER_APPROVAL|SCHEDULED]
 *     version defaults to app.json expo.version; releaseType defaults to MANUAL.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const version = process.argv[2] || appJson.expo.version;
const releaseType = (process.argv[3] || 'MANUAL').toUpperCase();

function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
  );
}
const api = () => axios.create({
  baseURL: 'https://api.appstoreconnect.apple.com/v1',
  headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
  validateStatus: () => true,
});

(async () => {
  // Idempotency: skip if the version already exists.
  let a = api();
  const ex = await a.get(`/apps/${cfg.app_id}/appStoreVersions`, {
    params: { 'filter[versionString]': version, 'filter[platform]': 'IOS', limit: 1 },
  });
  if (ex.status < 400 && ex.data.data.length) {
    const v = ex.data.data[0];
    console.log(`v${version} already exists: ${v.id} (state=${v.attributes.appStoreState}, releaseType=${v.attributes.releaseType})`);
    const loc = await api().get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`);
    console.log(`  localizations: ${loc.data?.data?.length ?? '?'}`);
    process.exit(0);
  }

  // Create.
  a = api();
  const res = await a.post('/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString: version, releaseType },
      relationships: { app: { data: { type: 'apps', id: cfg.app_id } } },
    },
  });
  if (res.status >= 400) {
    console.error(`create failed: ${res.status}`, JSON.stringify(res.data, null, 2).slice(0, 800));
    process.exit(1);
  }
  const v = res.data.data;
  console.log(`✓ created v${version}: ${v.id} (state=${v.attributes.appStoreState}, releaseType=${v.attributes.releaseType})`);

  // Verify localizations were auto-inherited.
  const loc = await api().get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`);
  const n = loc.data?.data?.length ?? 0;
  console.log(`  localizations auto-created: ${n}`);
  if (n === 0) console.warn('  ⚠️  no localizations — whatsNew/description scripts will have nothing to patch.');
})().catch((e) => { console.error('FATAL', e.message); process.exit(99); });
