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
const asa = require('./lib/asa-client');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const STATS_DIR = path.join(ROOT, 'stats/daily');
fs.mkdirSync(STATS_DIR, { recursive: true });

const today = new Date();
// Use local date (not UTC) so the daily file is named for the day the
// script ran from the operator's perspective. Previously the script used
// .toISOString() which drifts past midnight UTC and dates files one day
// forward when run in EDT/PDT evenings.
const todayStr = (() => {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
})();

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

// Pull Apple Search Ads campaign-level performance for yesterday.
// Returns null when ASA creds aren't configured (one-time UI setup at
// app.searchads.apple.com → Account → API). Aggregates metrics across
// all running campaigns into a single per-day snapshot.
async function pullAsaYesterday(yesterdayStr) {
  if (!asa.isConfigured()) return null;
  const report = await asa.getCampaignsReport(yesterdayStr, yesterdayStr);
  if (!report || report.error) return report;

  // ASA report shape: { reportingDataResponse: { row: [{metadata, granularity, total}], grandTotals: {...}}}
  const rows = report?.reportingDataResponse?.row || [];
  const grandTotals = report?.reportingDataResponse?.grandTotals?.total || {};

  const perCampaign = rows.map(r => ({
    id: r.metadata?.campaignId,
    name: r.metadata?.campaignName,
    status: r.metadata?.campaignStatus,
    countries: r.metadata?.countriesOrRegions,
    dailyBudget: r.metadata?.dailyBudget?.amount,
    spend: parseFloat(r.total?.localSpend?.amount || 0),
    impressions: r.total?.impressions || 0,
    taps: r.total?.taps || 0,
    installs: r.total?.installs || 0,
    avgCPA: parseFloat(r.total?.avgCPA?.amount || 0),
    avgCPT: parseFloat(r.total?.avgCPT?.amount || 0),
    ttr: r.total?.ttr || 0,
    cr: r.total?.conversionRate || 0,
  }));

  return {
    perCampaign,
    grandTotals: {
      spend: parseFloat(grandTotals?.localSpend?.amount || 0),
      impressions: grandTotals?.impressions || 0,
      taps: grandTotals?.taps || 0,
      installs: grandTotals?.installs || 0,
      avgCPA: parseFloat(grandTotals?.avgCPA?.amount || 0),
      avgCPT: parseFloat(grandTotals?.avgCPT?.amount || 0),
    },
  };
}

// Look back across the last N daily snapshots to enforce kill-criteria
// (CPA > $8 for 5 consecutive days; spend > $50 with 0 paid subs).
function asaKillCriteriaFlags(todayAsa, todaySubs, priorRuns) {
  const flags = [];
  if (!todayAsa || !todayAsa.grandTotals) return flags;
  const t = todayAsa.grandTotals;

  // Hot CR check
  if (t.impressions >= 200 && t.cr !== undefined && t.cr < 0.10) {
    flags.push(`📉 ASA CR ${(t.cr * 100).toFixed(1)}% under 10% with ${t.impressions} impressions — investigate keyword/creative`);
  }

  // 5-day rolling CPA > $8
  const cpas = [t.avgCPA, ...priorRuns.slice(0, 4).map(r => r?.asa?.grandTotals?.avgCPA).filter(x => typeof x === 'number' && x > 0)];
  if (cpas.length >= 5 && cpas.every(c => c > 8)) {
    flags.push(`💸 ASA CPA over $8 for 5 consecutive days (${cpas.map(c => `$${c.toFixed(2)}`).join(', ')}) — pause/rebid`);
  }

  // Cumulative spend > $50 with 0 paid subs delta
  const spendCum = [t.spend, ...priorRuns.slice(0, 13).map(r => r?.asa?.grandTotals?.spend || 0)].reduce((a, b) => a + b, 0);
  const subsStart = priorRuns.length >= 14 ? priorRuns[13]?.activeSubs : null;
  if (spendCum > 50 && subsStart != null && todaySubs != null && todaySubs <= subsStart) {
    flags.push(`💀 ASA spent $${spendCum.toFixed(2)} over 14 days with no net sub gain (${subsStart} → ${todaySubs}) — pause campaign`);
  }

  return flags;
}

// Pull current ASC localized descriptions across all locales and flag any
// containing outdated/inconsistent pricing claims. Catches the kind of bug
// where the EN-US source got updated but translations weren't regenerated
// (e.g. fr-FR kept "$9,99 lifetime, no subscription" after the 3-tier
// rollout). Returns { staleLocales: [...], unknownPricing: [...] }.
async function checkLocalePricingDrift() {
  try {
    // 1. Find the most recently editable iOS version (READY_FOR_SALE preferred
    //    so we audit what users see today, not just the in-flight version).
    const vs = (await api.get(`/apps/${cfg.app_id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data.data || [];
    const order = ['READY_FOR_SALE', 'PENDING_DEVELOPER_RELEASE', 'IN_REVIEW', 'WAITING_FOR_REVIEW', 'PREPARE_FOR_SUBMISSION'];
    vs.sort((a, b) => order.indexOf(a.attributes.appStoreState) - order.indexOf(b.attributes.appStoreState));
    const v = vs.find(x => order.includes(x.attributes.appStoreState)) || vs[0];
    if (!v) return { staleLocales: [], unknownPricing: [], note: 'no version found' };

    const locs = (await api.get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`)).data.data || [];

    // 2. Bug markers — strings that indicate stale pricing copy.
    //    Tight set: explicit stale price OR "no subscription" claim that
    //    contradicts the current 3-tier IAP catalog.
    const STALE_MARKERS = [
      '9,99', '9.99',
      'achat unique', 'aucun abonnement', 'aucun frais récurrent',
      'einmaliger in-app',
      'compra única intégrée', 'sem assinatura',
    ];

    const staleLocales = [];
    for (const loc of locs) {
      const desc = (loc.attributes.description || '').toLowerCase();
      const hits = STALE_MARKERS.filter(m => desc.includes(m.toLowerCase()));
      if (hits.length) {
        staleLocales.push({ locale: loc.attributes.locale, markers: hits });
      }
    }

    // 3. Cross-reference: pull live IAP product list to confirm pricing
    //    structure matches what descriptions claim. Currently we expect
    //    Monthly + Annual + Lifetime. Anything claiming "no subscription"
    //    is a contradiction.
    const groups = (await api.get(`/apps/${cfg.app_id}/subscriptionGroups`)).data.data || [];
    const subs = [];
    for (const g of groups) {
      const ss = (await api.get(`/subscriptionGroups/${g.id}/subscriptions`)).data.data || [];
      subs.push(...ss.map(s => s.attributes.productId));
    }
    const iaps = (await api.get(`/apps/${cfg.app_id}/inAppPurchasesV2`)).data.data || [];
    const iapIds = iaps.map(i => i.attributes.productId);
    const hasSubscriptions = subs.length > 0;

    // If we have subscriptions live but any locale description claims
    // "no subscription", flag it as a contradiction.
    const noSubMarkers = ['aucun abonnement', 'no subscription', 'kein abonnement', 'sin suscripción', 'nessun abbonamento'];
    const contradictions = [];
    if (hasSubscriptions) {
      for (const loc of locs) {
        const desc = (loc.attributes.description || '').toLowerCase();
        const found = noSubMarkers.find(m => desc.includes(m.toLowerCase()));
        if (found) contradictions.push({ locale: loc.attributes.locale, text: found });
      }
    }

    return {
      staleLocales,
      contradictions,
      version: v.attributes.versionString,
      versionState: v.attributes.appStoreState,
      iapCatalog: { subs, iaps: iapIds },
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Compare each translated description against EN-US for structural drift —
// paragraph count and presence of key sections. Catches when EN gets a new
// section or restructuring but translations stay at older format.
async function checkEnTranslationParity() {
  try {
    const vs = (await api.get(`/apps/${cfg.app_id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data.data || [];
    const order = ['READY_FOR_SALE', 'PENDING_DEVELOPER_RELEASE', 'IN_REVIEW'];
    vs.sort((a, b) => order.indexOf(a.attributes.appStoreState) - order.indexOf(b.attributes.appStoreState));
    const v = vs.find(x => order.includes(x.attributes.appStoreState)) || vs[0];
    if (!v) return { drift: [] };

    const locs = (await api.get(`/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=200`)).data.data || [];
    const enUS = locs.find(l => l.attributes.locale === 'en-US');
    if (!enUS) return { drift: [], note: 'no en-US baseline' };

    const enParas = (enUS.attributes.description || '').split(/\n\n/).filter(Boolean).length;
    const drift = [];
    for (const loc of locs) {
      if (loc.attributes.locale === 'en-US') continue;
      const paras = (loc.attributes.description || '').split(/\n\n/).filter(Boolean).length;
      // Allow ±20% paragraph delta — beyond that suggests structural drift.
      if (Math.abs(paras - enParas) > Math.ceil(enParas * 0.2)) {
        drift.push({ locale: loc.attributes.locale, paragraphs: paras, enParagraphs: enParas });
      }
    }
    return { drift, enParagraphs: enParas };
  } catch (e) {
    return { error: e.message };
  }
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

  // ── Apple Search Ads performance (when configured) ──
  const asaYesterday = await pullAsaYesterday(yest);

  // ── Locale pricing/parity sanity checks ──
  const pricingDrift = await checkLocalePricingDrift();
  const parityDrift = await checkEnTranslationParity();

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
    localePricingDrift: pricingDrift,
    parityDrift,
    asa: asaYesterday,
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
  md.push('## Apple Search Ads (yesterday)');
  if (!asa.isConfigured()) {
    md.push('- ASA API not configured. To enable: secrets/asa-creds.json + secrets/asa-private-key.pem (one-time setup at app.searchads.apple.com → Account → API)');
  } else if (!asaYesterday) {
    md.push('- No ASA report data for yesterday (Apple delays ~1-3h)');
  } else if (asaYesterday.error) {
    md.push(`- ASA report failed: \`${asaYesterday.error}\``);
  } else {
    const t = asaYesterday.grandTotals;
    md.push(`- Spend: **$${t.spend.toFixed(2)}** · Installs: **${t.installs}** · CPA: **$${(t.avgCPA || 0).toFixed(2)}**`);
    md.push(`- Impressions: ${t.impressions} · Taps: ${t.taps} · CPT: $${(t.avgCPT || 0).toFixed(2)}`);
    for (const c of asaYesterday.perCampaign || []) {
      const cn = (c.name || '').slice(0, 38);
      md.push(`  - ${cn} [${c.status}] — $${c.spend.toFixed(2)} / ${c.installs} installs / CPA $${c.avgCPA.toFixed(2)}`);
    }
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
  if (pricingDrift.staleLocales?.length) {
    flags.push(`💸 Stale pricing in ${pricingDrift.staleLocales.length} ASC locale(s) [v${pricingDrift.version}]: ${pricingDrift.staleLocales.map(s => s.locale).join(', ')} — run scripts/asc-fix-pricing-v3.js when version is editable`);
  }
  if (pricingDrift.contradictions?.length) {
    flags.push(`⚠️  IAP/copy contradiction: ${pricingDrift.contradictions.length} locale(s) claim "no subscription" but ${pricingDrift.iapCatalog?.subs?.length || 0} sub product(s) exist on ASC: ${pricingDrift.contradictions.map(c => c.locale).join(', ')}`);
  }
  if (parityDrift.drift?.length) {
    flags.push(`🌐 EN/translation paragraph-count drift in ${parityDrift.drift.length} locale(s): ${parityDrift.drift.map(d => `${d.locale}(${d.paragraphs}vs${d.enParagraphs})`).join(', ')}`);
  }

  // ASA kill-criteria — needs prior runs for trailing windows
  const priorRuns = [];
  if (fs.existsSync(STATS_DIR)) {
    const files = fs.readdirSync(STATS_DIR).filter(f => f.endsWith('.json') && f !== `${todayStr}.json`).sort().reverse().slice(0, 14);
    for (const f of files) {
      try { priorRuns.push(JSON.parse(fs.readFileSync(path.join(STATS_DIR, f), 'utf8'))); } catch {}
    }
  }
  const asaFlags = asaKillCriteriaFlags(asaYesterday, subs?.active ?? null, priorRuns);
  for (const f of asaFlags) flags.push(f);
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
