#!/usr/bin/env node
/**
 * asc-create-free-trial.js — Create a 7-day FREE_TRIAL Introductory Offer
 * on the annual Pro subscription (redgrid_mgrs_pro_annual), ALL territories.
 *
 * Per stats/free-trial-spec.md:
 *   - Type: Free (offerMode FREE_TRIAL), Duration 1 week (ONE_WEEK), 1 period
 *   - Territories: all, Start now / no end
 *   - Annual ONLY. Do NOT trial monthly or lifetime.
 *
 * NOTE: The ASC API requires a `territory` relationship per introductory offer
 * (there is no single "all territories" call — the ASC web UI fans out for you).
 * So this creates one offer per territory the annual sub is priced in.
 *
 * Safe by design:
 *   - Resolves the subscription id from the product id (no hardcoded id).
 *   - Derives target territories from the sub's own price schedule.
 *   - Per-territory idempotent: skips territories that already have an active
 *     free-trial offer (safe to re-run after a partial run).
 *   - Aborts if the FIRST create fails (systemic), tolerates later per-territory
 *     failures (territory-specific) and tallies them.
 *   - --dry-run inspects + lists territories without mutating.
 *   - --only=USA[,GBR] restricts to specific territories (for a single test).
 *
 * Usage:
 *   node scripts/asc-create-free-trial.js --dry-run
 *   node scripts/asc-create-free-trial.js --only=USA      # create just USA first
 *   node scripts/asc-create-free-trial.js                 # create all territories
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD';
const ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f';
const APP_ID = '6759629554';
const BASE = 'https://api.appstoreconnect.apple.com';

const TARGET_PRODUCT_ID = 'redgrid_mgrs_pro_annual';
const OFFER = { duration: 'ONE_WEEK', offerMode: 'FREE_TRIAL', numberOfPeriods: 1 };

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_ARG = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const ONLY = ONLY_ARG ? ONLY_ARG.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;

function makeToken() {
  const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } }
  );
}

async function get(token, url, params = {}) {
  const res = await axios.get(url.startsWith('http') ? url : BASE + url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    console.error(`  ! GET ${url} → ${res.status}`, JSON.stringify(res.data).slice(0, 400));
    return null;
  }
  return res.data;
}

// Paginate a collection endpoint, following links.next. Returns combined data[].
async function getAll(token, url, params = {}) {
  let out = [];
  let next = url;
  let first = true;
  while (next) {
    const page = await get(token, next, first ? params : {});
    first = false;
    if (!page) break;
    out = out.concat(page.data || []);
    next = page.links && page.links.next ? page.links.next : null;
  }
  return out;
}

async function post(token, url, body) {
  return axios.post(BASE + url, body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
}

function territoryOf(resource) {
  try { return resource.relationships.territory.data.id; } catch { return null; }
}

async function main() {
  const token = makeToken();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Red Grid MGRS — Create 7-day Free Trial (ASC API)');
  console.log(' Target:', TARGET_PRODUCT_ID, '| mode:', DRY_RUN ? 'DRY RUN' : 'LIVE', ONLY ? `| only=${ONLY.join(',')}` : '');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Resolve subscription id from product id.
  console.log('1. Resolving subscription id for', TARGET_PRODUCT_ID, '...');
  const groups = await get(token, `/v1/apps/${APP_ID}/subscriptionGroups`);
  if (!groups) { console.error('   FATAL: could not list subscription groups'); process.exit(1); }
  let sub = null, groupName = null;
  for (const g of groups.data) {
    const subs = await get(token, `/v1/subscriptionGroups/${g.id}/subscriptions`);
    if (!subs) continue;
    for (const s of subs.data) {
      if (s.attributes.productId === TARGET_PRODUCT_ID) { sub = s; groupName = g.attributes.referenceName; }
    }
  }
  if (!sub) { console.error(`   FATAL: ${TARGET_PRODUCT_ID} not found`); process.exit(1); }
  console.log(`   ✓ ${sub.attributes.name} (group "${groupName}") id=${sub.id} state=${sub.attributes.state}`);

  // 2. Territories where the annual sub is priced (authoritative "where it's sold").
  console.log('\n2. Deriving target territories from the sub price schedule ...');
  const prices = await getAll(token, `/v1/subscriptions/${sub.id}/prices`, { include: 'territory', limit: 200 });
  let territories = [...new Set(prices.map(territoryOf).filter(Boolean))].sort();
  if (territories.length === 0) {
    console.log('   (no priced territories returned; falling back to full Apple territory list)');
    const all = await getAll(token, '/v1/territories', { limit: 200 });
    territories = all.map((t) => t.id).sort();
  }
  if (ONLY) territories = territories.filter((t) => ONLY.includes(t));
  console.log(`   ${territories.length} target territor${territories.length === 1 ? 'y' : 'ies'}: ${territories.slice(0, 12).join(', ')}${territories.length > 12 ? ' …' : ''}`);

  // 3. Existing intro offers → per-territory idempotency set.
  console.log('\n3. Reading existing introductory offers ...');
  const existing = await getAll(token, `/v1/subscriptions/${sub.id}/introductoryOffers`, { include: 'territory', limit: 200 });
  const covered = new Set(
    existing
      .filter((o) => o.attributes && o.attributes.offerMode === 'FREE_TRIAL' && !o.attributes.endDate)
      .map(territoryOf)
      .filter(Boolean)
  );
  console.log(`   ${existing.length} existing offer(s); ${covered.size} territor${covered.size === 1 ? 'y' : 'ies'} already have an active free trial.`);

  const todo = territories.filter((t) => !covered.has(t));
  console.log(`   → ${todo.length} territor${todo.length === 1 ? 'y' : 'ies'} to create, ${territories.length - todo.length} skipped (already covered).`);

  if (DRY_RUN) {
    console.log('\n   (dry run — no POST sent)');
    console.log('   Would create:', JSON.stringify(OFFER), '× ' + todo.length + ' territories (start now / no end).');
    process.exit(0);
  }
  if (todo.length === 0) { console.log('\n   ↺ Nothing to do — all target territories already covered.'); process.exit(0); }

  // 4. Create per territory.
  console.log('\n4. Creating offers ...');
  let created = 0, failed = 0;
  const failures = [];
  for (let i = 0; i < todo.length; i++) {
    const terr = todo[i];
    const body = {
      data: {
        type: 'subscriptionIntroductoryOffers',
        attributes: { ...OFFER },
        relationships: {
          subscription: { data: { type: 'subscriptions', id: sub.id } },
          territory: { data: { type: 'territories', id: terr } },
          // No subscriptionPricePoint — not required for FREE_TRIAL.
        },
      },
    };
    const res = await post(token, '/v1/subscriptionIntroductoryOffers', body);
    if (res.status >= 400) {
      const detail = (res.data && res.data.errors && res.data.errors[0]) || {};
      // First create failing => systemic problem (bad payload). Abort loudly.
      if (created === 0 && i === 0) {
        console.error(`   ! FIRST create (${terr}) failed: ${res.status} ${detail.code || ''} — ${detail.detail || ''}`);
        console.error('     Aborting (looks systemic, not territory-specific).');
        console.error('     ', JSON.stringify(res.data).slice(0, 600));
        process.exit(1);
      }
      failed++;
      failures.push(`${terr}:${res.status} ${detail.code || ''}`);
      process.stdout.write(`✗`);
    } else {
      created++;
      process.stdout.write(created % 50 === 0 ? `✓(${created})\n   ` : `✓`);
    }
  }
  console.log('');
  console.log(`\n   Created ${created}, failed ${failed}.`);
  if (failures.length) console.log('   Failures:', failures.slice(0, 30).join('  '), failures.length > 30 ? `(+${failures.length - 30} more)` : '');

  // 5. Verify.
  console.log('\n5. Verifying ...');
  const after = await getAll(token, `/v1/subscriptions/${sub.id}/introductoryOffers`, { include: 'territory', limit: 200 });
  const activeFT = after.filter((o) => o.attributes && o.attributes.offerMode === 'FREE_TRIAL' && !o.attributes.endDate);
  const sample = activeFT[0] && activeFT[0].attributes;
  console.log(`   ${activeFT.length} active FREE_TRIAL offer(s) now on ${TARGET_PRODUCT_ID}.`);
  if (sample) console.log(`   sample: ${sample.offerMode} ${sample.duration} x${sample.numberOfPeriods} start=${sample.startDate || 'now'} end=${sample.endDate || 'none'}`);
  console.log('\n✓ Done.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
