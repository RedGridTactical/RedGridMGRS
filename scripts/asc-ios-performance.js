#!/usr/bin/env node
/**
 * asc-ios-performance.js — Pull iOS business-health snapshot from ASC API.
 *
 * Output-only. Does not write, update, or submit anything.
 *
 * Endpoints used (all synchronous):
 *  - GET /v1/apps/{id}
 *  - GET /v1/apps/{id}/appStoreVersions
 *  - GET /v1/apps/{id}/customerReviews
 *  - GET /v1/apps/{id}/subscriptionGroups → subscriptions
 *  - POST/GET /v1/analyticsReportRequests (lists existing report requests)
 *
 * Usage:
 *   node scripts/asc-ios-performance.js
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
    console.error(`  ! ${url} → ${res.status}`, JSON.stringify(res.data).slice(0, 300));
    return null;
  }
  return res.data;
}

function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number') return n.toLocaleString();
  return String(n);
}

async function main() {
  const token = makeToken();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Red Grid MGRS — iOS Business Snapshot (ASC API)');
  console.log(' Timestamp:', new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. App metadata
  console.log('## App metadata');
  const app = await get(token, `/v1/apps/${APP_ID}`);
  if (app) {
    const a = app.data.attributes;
    console.log(`   Name: ${a.name}`);
    console.log(`   Bundle ID: ${a.bundleId}`);
    console.log(`   SKU: ${a.sku}`);
    console.log(`   Primary locale: ${a.primaryLocale}`);
  }

  // 2. Current live version
  console.log('\n## App Store versions (most recent 10)');
  const versions = await get(token, `/v1/apps/${APP_ID}/appStoreVersions`, {
    'limit': 10,
  });
  if (versions) {
    // Sort client-side by createdDate desc
    const sorted = versions.data.slice().sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''));
    for (const v of sorted) {
      const a = v.attributes;
      console.log(`   v${a.versionString} | ${a.appStoreState} | ${a.platform} | created ${a.createdDate} | released ${a.earliestReleaseDate || '—'}`);
    }
  }

  // 2b. Recent builds (TestFlight / review queue visibility)
  console.log('\n## Recent builds');
  const builds = await get(token, `/v1/builds`, {
    'filter[app]': APP_ID,
    'limit': 5,
    'sort': '-uploadedDate',
    'fields[builds]': 'version,uploadedDate,expirationDate,processingState,usesNonExemptEncryption',
  });
  if (builds) {
    for (const b of builds.data) {
      const a = b.attributes;
      console.log(`   build ${a.version} | ${a.processingState} | uploaded ${a.uploadedDate ? a.uploadedDate.slice(0,10) : '?'} | expires ${a.expirationDate ? a.expirationDate.slice(0,10) : '?'}`);
    }
  }

  // 3. Subscriptions — active group
  console.log('\n## Subscriptions');
  const subGroups = await get(token, `/v1/apps/${APP_ID}/subscriptionGroups`);
  if (subGroups && subGroups.data.length > 0) {
    for (const g of subGroups.data) {
      console.log(`   Group: ${g.id} (${g.attributes.referenceName})`);
      const subs = await get(token, `/v1/subscriptionGroups/${g.id}/subscriptions`);
      if (subs) {
        for (const s of subs.data) {
          const a = s.attributes;
          console.log(`     - ${a.productId} | ${a.name} | ${a.subscriptionPeriod} | state=${a.state}`);
        }
      }
    }
  }

  // 4. Customer reviews (recent 20)
  console.log('\n## Customer reviews (ASC-internal, most recent 20)');
  const reviews = await get(token, `/v1/apps/${APP_ID}/customerReviews`, {
    'limit': 20,
    'sort': '-createdDate',
  });
  if (reviews) {
    const byRating = { 1:0, 2:0, 3:0, 4:0, 5:0 };
    let totalRev = 0;
    for (const r of reviews.data) {
      const a = r.attributes;
      byRating[a.rating] = (byRating[a.rating] || 0) + 1;
      totalRev++;
    }
    console.log(`   ${totalRev} reviews surfaced (ASC returns max 200 across all territories)`);
    console.log(`   Distribution: 5★=${byRating[5]}  4★=${byRating[4]}  3★=${byRating[3]}  2★=${byRating[2]}  1★=${byRating[1]}`);
    console.log('\n   Most recent:');
    for (const r of reviews.data.slice(0, 5)) {
      const a = r.attributes;
      const date = a.createdDate ? a.createdDate.slice(0, 10) : '?';
      const body = (a.body || '').replace(/\s+/g, ' ').slice(0, 120);
      console.log(`     [${a.rating}★] ${date} ${a.territory} — "${a.title}"`);
      console.log(`         ${body}`);
    }
  }

  // 5. In-app purchases (non-subscription) — Lifetime
  console.log('\n## In-app purchases (non-subscription)');
  const iaps = await get(token, `/v1/apps/${APP_ID}/inAppPurchasesV2`, { limit: 20 });
  if (iaps) {
    for (const i of iaps.data) {
      const a = i.attributes;
      console.log(`   - ${a.productId} | ${a.name} | ${a.inAppPurchaseType} | state=${a.state}`);
    }
  }

  // 6. Analytics report requests (so we can see what's queryable)
  console.log('\n## Analytics report requests available');
  const anReq = await get(token, `/v1/apps/${APP_ID}/analyticsReportRequests`, { limit: 5 });
  if (anReq) {
    console.log(`   ${anReq.data.length} existing report request(s)`);
    for (const r of anReq.data.slice(0, 5)) {
      console.log(`     ${r.id} | access=${r.attributes.accessType}`);
    }
    if (anReq.data.length === 0) {
      // Create an ONGOING report request so future metrics become available
      console.log('   → Creating ONGOING analytics report request to start daily metric pipeline...');
      const cr = await axios.post(BASE + '/v1/analyticsReportRequests', {
        data: {
          type: 'analyticsReportRequests',
          attributes: { accessType: 'ONGOING' },
          relationships: { app: { data: { type: 'apps', id: APP_ID } } },
        },
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });
      if (cr.status >= 400) {
        console.log(`     ! create failed: ${cr.status}`, JSON.stringify(cr.data).slice(0, 300));
      } else {
        console.log(`     ✓ created: ${cr.data.data.id}`);
      }
    }
  }

  // 7. Public iTunes lookup (cross-check)
  console.log('\n## Public iTunes lookup (cross-check — no auth)');
  try {
    const it = await axios.get(`https://itunes.apple.com/lookup?id=${APP_ID}`);
    const r = it.data.results[0] || {};
    console.log(`   Live version: v${r.version} (released ${r.currentVersionReleaseDate})`);
    console.log(`   All-time rating: ${r.averageUserRating} across ${fmt(r.userRatingCount)} ratings`);
    console.log(`   Current version rating: ${r.averageUserRatingForCurrentVersion} across ${fmt(r.userRatingCountForCurrentVersion)} ratings`);
    console.log(`   Min iOS: ${r.minimumOsVersion} | Price: ${r.formattedPrice} | Genre: ${(r.genres || []).join(', ')}`);
    console.log(`   Supported devices: ${(r.supportedDevices || []).length}`);
  } catch (e) {
    console.log('   ! lookup failed:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
