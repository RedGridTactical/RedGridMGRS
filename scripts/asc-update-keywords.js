#!/usr/bin/env node
/**
 * asc-update-keywords.js — Push the optimized keyword field to the latest EDITABLE
 * iOS appStoreVersion (all locales). Reads the keyword string from STORE_LISTING.md
 * (## Keywords section) so that doc stays the single source of truth.
 *
 * SAFETY: refuses to run unless an EDITABLE version exists
 * (PREPARE_FOR_SUBMISSION / *REJECTED). It will NOT touch a version that is
 * WAITING_FOR_REVIEW / IN_REVIEW / READY_FOR_SALE — so it can never disturb a
 * submission that's mid-review (e.g. v3.4.1's free-trial review).
 *
 * iOS keyword changes require a NEW build+version (no metadata-only express lane),
 * so create v3.4.2 first (asc-create-version.js), then run this.
 *
 * Usage:
 *   node scripts/asc-update-keywords.js            # dry-run (default; shows the diff)
 *   node scripts/asc-update-keywords.js --apply    # write
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));

// Single source of truth: the line under "## Keywords" in STORE_LISTING.md.
function readKeywords() {
  const md = fs.readFileSync(path.join(ROOT, 'STORE_LISTING.md'), 'utf8');
  const m = md.match(/##\s*Keywords\s*\r?\n([^\r\n<]+)/);
  if (!m) throw new Error('Could not find a "## Keywords" section in STORE_LISTING.md');
  const kw = m[1].trim();
  if (kw.length > 100) throw new Error(`Keyword field is ${kw.length}/100 chars — too long for Apple`);
  return kw;
}

const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);

function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } });
}
const api = () => axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, validateStatus: () => true });

(async () => {
  const keywords = readKeywords();
  console.log(`Keyword field (${keywords.length}/100): "${keywords}"`);
  console.log(APPLY ? '\nMODE: --apply (writing)\n' : '\nMODE: dry-run (no writes; pass --apply to write)\n');

  const v = await api().get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { 'filter[platform]': 'IOS', limit: 10 } });
  const versions = (v.data.data || []).slice().sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''));
  const editable = versions.find((ver) => EDITABLE.has(ver.attributes.appStoreState));
  if (!editable) {
    console.error('REFUSING: no EDITABLE iOS version found (need PREPARE_FOR_SUBMISSION / *REJECTED).');
    console.error('Latest versions:');
    versions.slice(0, 3).forEach((ver) => console.error(`  v${ver.attributes.versionString} [${ver.attributes.appStoreState}]`));
    console.error('\niOS keyword changes require a new build+version. Create v3.4.2 (asc-create-version.js), then re-run.');
    process.exit(2);
  }
  console.log(`Editable version: v${editable.attributes.versionString} [${editable.attributes.appStoreState}] (${editable.id})\n`);

  const locs = await api().get(`/appStoreVersions/${editable.id}/appStoreVersionLocalizations`, { params: { limit: 60 } });
  let changed = 0;
  for (const loc of (locs.data.data || [])) {
    const cur = loc.attributes.keywords || '';
    if (cur === keywords) { console.log(`  ${loc.attributes.locale}: already up to date`); continue; }
    console.log(`  ${loc.attributes.locale}: "${cur}" → "${keywords}"`);
    changed++;
    if (APPLY) {
      const res = await api().patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { keywords } },
      });
      if (res.status >= 400) console.error(`    ✗ ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
      else console.log('    ✓ updated');
    }
  }
  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${changed} locale(s).`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
