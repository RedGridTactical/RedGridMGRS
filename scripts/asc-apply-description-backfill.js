#!/usr/bin/env node
/**
 * asc-apply-description-backfill.js — PATCH the locale-specific App Store
 * description rewrites from `asc-description-backfill.json` onto whichever
 * appStoreVersion is currently editable.
 *
 * Why this exists:
 *   On 2026-05-14, daily-stats flagged stale pricing + missing paragraphs in
 *   fr-FR / uk / hr / da on v3.3.6. v3.3.6 was `READY_FOR_SALE`, which locks
 *   the `description` attribute — every PATCH returns
 *   `Attribute 'description' cannot be edited at this time`. The rewrites
 *   were drafted and stashed in `scripts/asc-description-backfill.json` to
 *   ship the moment a future version (e.g. v3.3.7) reaches
 *   `PREPARE_FOR_SUBMISSION`. This script is the one-shot applier.
 *
 * Behaviour:
 *   1. Picks the most recent appStoreVersion in an editable state:
 *      PREPARE_FOR_SUBMISSION or DEVELOPER_REJECTED.
 *   2. Lists its appStoreVersionLocalizations.
 *   3. For each locale present in the JSON, PATCHes the description.
 *   4. Dry-run by default; pass --apply to write.
 *
 * Refuses to run when the target version is in any of:
 *   READY_FOR_SALE, PENDING_DEVELOPER_RELEASE, IN_REVIEW, WAITING_FOR_REVIEW,
 *   REJECTED, METADATA_REJECTED, REMOVED_FROM_SALE, REPLACED_WITH_NEW_VERSION.
 *
 * Usage:
 *   node scripts/asc-apply-description-backfill.js           # dry run
 *   node scripts/asc-apply-description-backfill.js --apply   # write to ASC
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const privateKey = fs.readFileSync(path.join(ROOT, `secrets/AuthKey_${cfg.key_id}.p8`), 'utf8');

const backfillPath = path.join(__dirname, 'asc-description-backfill.json');
const backfill = JSON.parse(fs.readFileSync(backfillPath, 'utf8'));
// Strip the _meta key — only real locale entries remain.
const locales = Object.fromEntries(Object.entries(backfill).filter(([k]) => !k.startsWith('_')));

const token = jwt.sign(
  { iss: cfg.issuer_id, exp: Math.floor(Date.now() / 1000) + 15 * 60, aud: 'appstoreconnect-v1' },
  privateKey,
  { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
);

const api = axios.create({
  baseURL: 'https://api.appstoreconnect.apple.com/v1',
  headers: { Authorization: `Bearer ${token}` },
});

const EDITABLE_STATES = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED']);

(async () => {
  // 1. Find an editable version. Prefer PREPARE_FOR_SUBMISSION over DEVELOPER_REJECTED.
  const vs = (await api.get(`/apps/${cfg.app_id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data.data || [];
  const order = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED'];
  vs.sort((a, b) => {
    const ra = order.indexOf(a.attributes.appStoreState);
    const rb = order.indexOf(b.attributes.appStoreState);
    if (ra === -1 && rb === -1) return 0;
    if (ra === -1) return 1;
    if (rb === -1) return -1;
    return ra - rb;
  });

  const editable = vs.find(v => EDITABLE_STATES.has(v.attributes.appStoreState));
  if (!editable) {
    console.error('No editable appStoreVersion found.');
    console.error('Recent versions:');
    for (const v of vs.slice(0, 5)) {
      console.error(`  ${v.attributes.versionString.padEnd(8)} | ${v.attributes.appStoreState}`);
    }
    console.error('');
    console.error('Description edits require a version in PREPARE_FOR_SUBMISSION or DEVELOPER_REJECTED.');
    console.error('Create a new appStoreVersion record (typically by submitting a new build) and re-run.');
    process.exit(1);
  }

  console.log(`Target: v${editable.attributes.versionString} [${editable.attributes.appStoreState}] ${editable.id}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Locales staged for backfill: ${Object.keys(locales).join(', ')}`);
  console.log('');

  // 2. List localizations and match against the JSON.
  const locs = (await api.get(`/appStoreVersions/${editable.id}/appStoreVersionLocalizations?limit=200`)).data.data || [];

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const loc of locs) {
    const code = loc.attributes.locale;
    if (!(code in locales)) {
      continue;
    }
    const newDesc = locales[code];
    const currentDesc = loc.attributes.description || '';
    if (currentDesc === newDesc) {
      console.log(`  ${code.padEnd(8)} clean (already matches backfill)`);
      skipped++;
      continue;
    }
    const oldParas = currentDesc.split(/\n\n+/).filter(p => p.trim()).length;
    const newParas = newDesc.split(/\n\n+/).filter(p => p.trim()).length;
    console.log(`  ${code.padEnd(8)} ${APPLY ? 'PATCH' : 'WOULD PATCH'} ¶ ${oldParas}→${newParas}, chars ${currentDesc.length}→${newDesc.length}`);

    if (!APPLY) continue;

    try {
      await api.patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          type: 'appStoreVersionLocalizations',
          id: loc.id,
          attributes: { description: newDesc },
        },
      });
      applied++;
    } catch (e) {
      const detail = e.response?.data?.errors?.[0]?.detail || e.message;
      console.log(`    ✗ ${code}: ${detail}`);
      failed++;
    }
  }

  console.log('');
  if (APPLY) {
    console.log(`Done: ${applied} patched, ${skipped} already clean, ${failed} failed.`);
  } else {
    console.log(`Dry-run summary: would patch ${Object.keys(locales).length - skipped} locale(s). Re-run with --apply to write to ASC.`);
  }
})().catch(e => {
  console.error('Fatal:', e.response?.data?.errors || e.message);
  process.exit(1);
});
