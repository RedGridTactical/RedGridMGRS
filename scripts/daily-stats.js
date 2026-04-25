#!/usr/bin/env node
/**
 * daily-stats.js — Pull a daily snapshot of Red Grid MGRS health for review.
 *
 * Designed to be run from cron / scheduled task. Outputs:
 *   1. The day's install + sub deltas vs the prior 7-day average
 *   2. Current ASC review state for the in-flight version
 *   3. New customer reviews since the last run
 *   4. Top countries by installs
 *   5. Apple Search Ads spend + CPA (when ASA creds are configured)
 *   6. Stored in stats/daily/{YYYY-MM-DD}.json so we can diff later
 *
 * Usage:
 *   node scripts/daily-stats.js
 *
 * Adds a markdown summary to stats/daily/{YYYY-MM-DD}.md for easy reading.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const STATS_DIR = path.join(ROOT, 'stats/daily');
fs.mkdirSync(STATS_DIR, { recursive: true });

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
  );
}

const token = makeToken();
const api = axios.create({
  baseURL: 'https://api.appstoreconnect.apple.com/v1',
  headers: { Authorization: `Bearer ${token}` },
  validateStatus: () => true,
});

async function pullSalesDay(dateStr) {
  const r = await axios.get('https://api.appstoreconnect.apple.com/v1/salesReports', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
    params: {
      'filter[frequency]': 'DAILY',
      'filter[reportType]': 'SALES',
      'filter[reportSubType]': 'SUMMARY',
      'filter[vendorNumber]': cfg.vendor_number,
      'filter[reportDate]': dateStr,
    },
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });
  if (r.status !== 200) return null;
  const lines = zlib.gunzipSync(Buffer.from(r.data)).toString('utf8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;
  const h = lines[0].split('\t');
  const skuI = h.indexOf('SKU'), unitsI = h.indexOf('Units'), pTypeI = h.indexOf('Product Type Identifier'), countryI = h.indexOf('Country Code');
  let units = 0, redownloads = 0;
  const territories = {};
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    if (!f[skuI] || !f[skuI].includes('REDGRID')) continue;
    const u = parseInt(f[unitsI], 10) || 0;
    const pt = f[pTypeI] || '';
    if (pt === '1' || pt === '1F') {
      units += u;
      territories[f[countryI]] = (territories[f[countryI]] || 0) + u;
    } else { redownloads += u; }
  }
  return { units, redownloads, territories };
}

async function pullSubsDay(dateStr) {
  const r = await axios.get('https://api.appstoreconnect.apple.com/v1/salesReports', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
    params: {
      'filter[frequency]': 'DAILY',
      'filter[reportType]': 'SUBSCRIPTION',
      'filter[reportSubType]': 'SUMMARY',
      'filter[vendorNumber]': cfg.vendor_number,
      'filter[reportDate]': dateStr,
      'filter[version]': '1_4',
    },
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });
  if (r.status !== 200) return null;
  const lines = zlib.gunzipSync(Buffer.from(r.data)).toString('utf8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { active: 0, trials: 0 };
  const h = lines[0].split('\t');
  const appI = h.indexOf('App Name'), actI = h.indexOf('Active Standard Price Subscriptions'), trialI = h.indexOf('Active Free Trial Introductory Offer Subscriptions');
  let active = 0, trials = 0;
  for (const line of lines.slice(1)) {
    const f = line.split('\t');
    if (!(f[appI] || '').toLowerCase().includes('mgrs')) continue;
    active += parseInt(f[actI], 10) || 0;
    trials += parseInt(f[trialI], 10) || 0;
  }
  return { active, trials };
}

async function getVersionState() {
  const r = await api.get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { limit: 5 } });
  if (r.status !== 200) return null;
  return r.data.data
    .map(v => ({ version: v.attributes.versionString, state: v.attributes.appStoreState, releaseType: v.attributes.releaseType, created: v.attributes.createdDate }))
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
    .slice(0, 3);
}

async function getReviews() {
  const r = await api.get(`/apps/${cfg.app_id}/customerReviews`, { params: { limit: 20, sort: '-createdDate' } });
  if (r.status !== 200) return [];
  return r.data.data.map(rev => ({
    rating: rev.attributes.rating,
    territory: rev.attributes.territory,
    title: rev.attributes.title,
    body: rev.attributes.body,
    nickname: rev.attributes.reviewerNickname,
    createdDate: rev.attributes.createdDate,
  }));
}

async function getPublicMetadata() {
  try {
    const it = await axios.get(`https://itunes.apple.com/lookup?id=${cfg.app_id}`);
    const r = it.data.results[0] || {};
    return {
      version: r.version,
      releaseDate: r.currentVersionReleaseDate,
      ratingAvg: r.averageUserRating,
      ratingCount: r.userRatingCount,
      currentVersionRatingAvg: r.averageUserRatingForCurrentVersion,
      currentVersionRatingCount: r.userRatingCountForCurrentVersion,
      sellerName: r.sellerName,
      artistName: r.artistName,
    };
  } catch (e) { return { error: e.message }; }
}

function fmtTerritories(territories) {
  return Object.entries(territories || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
}

function loadPriorRun() {
  // Find most recent prior daily run for diffing
  const files = fs.existsSync(STATS_DIR) ? fs.readdirSync(STATS_DIR).filter(f => f.endsWith('.json') && f !== `${todayStr}.json`).sort() : [];
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(STATS_DIR, files[files.length - 1]), 'utf8'));
}

async function main() {
  console.log(`Daily stats — ${todayStr}\n`);

  // ── Sales (yesterday is most recent fully-reported day) ──
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  console.log(`Pulling sales for ${yest}...`);
  const sales = await pullSalesDay(yest);
  const subs = await pullSubsDay(yest);

  // 7-day install rolling avg (excludes yesterday)
  let weekTotal = 0, weekDays = 0, weekTerritories = {};
  for (let i = 2; i <= 8; i++) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    const day = await pullSalesDay(d);
    if (!day) continue;
    weekTotal += day.units;
    weekDays++;
    for (const [k, v] of Object.entries(day.territories || {})) weekTerritories[k] = (weekTerritories[k] || 0) + v;
  }
  const weekAvg = weekDays > 0 ? weekTotal / weekDays : 0;

  // ── ASC review state ──
  const versions = await getVersionState();
  const liveOnIossuf = await getPublicMetadata();

  // ── Reviews: anything new vs prior run ──
  const reviews = await getReviews();
  const prior = loadPriorRun();
  const priorReviewIds = prior ? new Set((prior.reviews || []).map(r => r.createdDate + '|' + (r.nickname || ''))) : new Set();
  const newReviews = reviews.filter(r => !priorReviewIds.has(r.createdDate + '|' + (r.nickname || '')));

  // ── Build snapshot ──
  const snap = {
    timestamp: today.toISOString(),
    salesDate: yest,
    yesterdayInstalls: sales?.units ?? null,
    yesterdayRedownloads: sales?.redownloads ?? null,
    yesterdayTerritories: sales?.territories ?? {},
    week7dAvgInstalls: Number(weekAvg.toFixed(2)),
    week7dTotalInstalls: weekTotal,
    week7dDaysReported: weekDays,
    week7dTopTerritories: weekTerritories,
    activeSubs: subs?.active ?? null,
    activeTrials: subs?.trials ?? null,
    versions,
    liveOnAppStore: liveOnIossuf,
    reviewCount: reviews.length,
    reviews,
    newReviewCount: newReviews.length,
    newReviews,
  };

  // Write JSON snapshot (machine-readable)
  fs.writeFileSync(path.join(STATS_DIR, `${todayStr}.json`), JSON.stringify(snap, null, 2));

  // Build markdown summary (human-readable)
  const md = [];
  md.push(`# Daily stats — ${todayStr}`);
  md.push('');
  md.push(`**Live App Store version:** ${liveOnIossuf.version} (released ${(liveOnIossuf.releaseDate || '').slice(0, 10)})`);
  md.push(`**Ratings:** ${liveOnIossuf.ratingCount || 0} @ ${(liveOnIossuf.ratingAvg || 0).toFixed(2)}★ (current ver: ${liveOnIossuf.currentVersionRatingCount || 0} @ ${(liveOnIossuf.currentVersionRatingAvg || 0).toFixed(2)}★)`);
  md.push(`**Seller:** ${liveOnIossuf.sellerName} | **Developer (public):** ${liveOnIossuf.artistName}`);
  md.push('');
  md.push('## Yesterday vs 7-day avg');
  if (sales) {
    const delta = sales.units - weekAvg;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    md.push(`- Installs: **${sales.units}** ${arrow} (7d avg ${weekAvg.toFixed(1)}/day)`);
    md.push(`- Redownloads/updates: ${sales.redownloads}`);
    md.push(`- Top territories yesterday: \`${fmtTerritories(sales.territories)}\``);
  } else {
    md.push('- Sales report not yet available (Apple delays ~1 day)');
  }
  md.push('');
  md.push('## Subscriptions');
  if (subs) {
    md.push(`- Active paid subs: **${subs.active}**`);
    if (subs.trials) md.push(`- Active free trials: ${subs.trials}`);
    if (prior?.activeSubs != null) {
      const subDelta = subs.active - prior.activeSubs;
      if (subDelta !== 0) md.push(`- Change since last run: **${subDelta > 0 ? '+' : ''}${subDelta}**`);
    }
  } else {
    md.push('- Subscription report not yet available');
  }
  md.push('');
  md.push('## ASC version states');
  for (const v of versions || []) {
    md.push(`- v${v.version} → \`${v.state}\` (${v.releaseType})`);
  }
  md.push('');
  md.push(`## Reviews (${reviews.length} total, **${newReviews.length} new since last run**)`);
  for (const r of newReviews) {
    md.push(`- 🆕 [${r.rating}★] ${r.territory} ${(r.createdDate || '').slice(0, 10)} — ${r.title}`);
    md.push(`  > ${(r.body || '').replace(/\n/g, ' ').slice(0, 200)}`);
  }
  if (newReviews.length === 0 && reviews.length > 0) {
    md.push('No new reviews since last run.');
    md.push('');
    md.push('Most recent existing review:');
    const r = reviews[0];
    md.push(`- [${r.rating}★] ${r.territory} ${(r.createdDate || '').slice(0, 10)} — ${r.title}`);
  }
  md.push('');
  md.push('## Action signals');

  // Auto-flag concerning signals
  const flags = [];
  if (newReviews.some(r => r.rating <= 2)) flags.push(`🚨 New negative review (${newReviews.filter(r => r.rating <= 2).length}× ≤2★) — read above + reply on ASC`);
  if (sales && sales.units > weekAvg * 1.5) flags.push(`📈 Install surge: yesterday ${sales.units} vs 7d avg ${weekAvg.toFixed(1)} — what changed?`);
  if (sales && sales.units < weekAvg * 0.5 && weekAvg > 5) flags.push(`📉 Install dip: yesterday ${sales.units} vs 7d avg ${weekAvg.toFixed(1)} — investigate`);
  if (prior?.activeSubs != null && subs && subs.active < prior.activeSubs) flags.push(`💔 Net sub loss: was ${prior.activeSubs}, now ${subs.active}`);
  if (versions && versions[0]?.state === 'WAITING_FOR_REVIEW') {
    const subDate = versions[0].created;
    const ageH = subDate ? ((Date.now() - new Date(subDate).getTime()) / 3600000).toFixed(1) : '?';
    flags.push(`⏳ v${versions[0].version} stuck WAITING_FOR_REVIEW for ${ageH}h — check expedited request status if >36h`);
  }
  if (versions && versions[0]?.state === 'REJECTED' || versions?.[0]?.state === 'METADATA_REJECTED') {
    flags.push(`🚨 v${versions[0].version} REJECTED — check Resolution Center on ASC`);
  }
  if (flags.length === 0) {
    md.push('No alerts. Holding pattern.');
  } else {
    for (const f of flags) md.push(`- ${f}`);
  }
  md.push('');

  fs.writeFileSync(path.join(STATS_DIR, `${todayStr}.md`), md.join('\n'));

  // Print to stdout for the scheduler
  console.log(md.join('\n'));
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(99);
});
