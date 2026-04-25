#!/usr/bin/env node
/**
 * asa-campaigns.js — Apple Search Ads campaign management via the Apple Search
 * Ads Campaign Management API.
 *
 * Auth path is DIFFERENT from the App Store Connect API:
 *
 *   Step 1 (one-time, in the Apple Search Ads UI):
 *     - Sign in to app.searchads.apple.com
 *     - Account Settings → API → "Create API User"
 *     - Set role: API Account Manager
 *     - Generate a private key (ECDSA P-256, will download a .pem)
 *     - Copy the Client ID, Team ID, Key ID
 *
 *   Step 2 (machine-side, store creds in secrets/):
 *     - secrets/asa-private-key.pem  (the .pem you downloaded)
 *     - secrets/asa-creds.json:
 *         {
 *           "client_id":   "SEARCHADS.<uuid>",
 *           "team_id":     "SEARCHADS.<uuid>",
 *           "key_id":      "<uuid>",
 *           "org_id":      "<your-orgId-from-Apple-Search-Ads-account>"
 *         }
 *
 *   Auth flow at runtime:
 *     - Sign a JWT with the private key (ES256, exp ≤ 60min)
 *     - POST to https://appleid.apple.com/auth/oauth2/token to exchange the JWT
 *       for an OAuth2 access_token (1h TTL)
 *     - All API calls use Authorization: Bearer <access_token>
 *                       + X-AP-Context: orgId=<org_id>
 *     - Base URL: https://api.searchads.apple.com/api/v5
 *
 * Available subcommands (this script):
 *   list                     # list all campaigns + budgets + spend
 *   pause <campaignId>       # pause a campaign
 *   resume <campaignId>      # resume a paused campaign
 *   budget <campaignId> <usd># update daily budget cap
 *   create-search <country> <budget> <bid>   # one-shot brand-search campaign
 *
 * Usage:
 *   node scripts/asa-campaigns.js list
 *   node scripts/asa-campaigns.js pause 12345
 *   node scripts/asa-campaigns.js budget 12345 8     # set $8/day cap
 *
 * STATUS: scaffolded for the day credentials are generated.
 * Until secrets/asa-creds.json + secrets/asa-private-key.pem exist this script
 * exits cleanly with a setup walkthrough.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/asa-private-key.pem');
const CREDS_PATH = path.join(ROOT, 'secrets/asa-creds.json');
const BASE_URL = 'https://api.searchads.apple.com/api/v5';
const TOKEN_URL = 'https://appleid.apple.com/auth/oauth2/token';

function requireOrHint(mod) {
  try { return require(mod); }
  catch { console.error(`Missing dep "${mod}". Install with: npm install ${mod}`); process.exit(1); }
}

function setupHelp() {
  console.error(`
Apple Search Ads API not configured yet.

To enable:
  1. Sign in to https://app.searchads.apple.com
  2. Account → API → Create API User → role "API Account Manager"
  3. Generate ECDSA P-256 private key, download the .pem
  4. Save as: ${KEY_PATH}
  5. Save the credentials JSON at: ${CREDS_PATH}
       {
         "client_id":   "SEARCHADS.<uuid-shown-in-UI>",
         "team_id":     "SEARCHADS.<uuid-shown-in-UI>",
         "key_id":      "<uuid-shown-in-UI>",
         "org_id":      "<orgId from Account Settings>"
       }
  6. Re-run: node scripts/asa-campaigns.js list

Both files are gitignored under secrets/.
Once configured, all subcommands work without further setup.
`.trim());
}

if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CREDS_PATH)) {
  setupHelp();
  process.exit(1);
}

const jwt = requireOrHint('jsonwebtoken');
const axios = requireOrHint('axios');
const cfg = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
const privateKey = fs.readFileSync(KEY_PATH, 'utf8');

let cachedAccessToken = null;
let cachedAccessTokenExp = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExp - 30_000) return cachedAccessToken;

  // Sign client-assertion JWT
  const now = Math.floor(Date.now() / 1000);
  const clientAssertion = jwt.sign(
    {
      iss: cfg.team_id,
      sub: cfg.client_id,
      aud: 'https://appleid.apple.com',
      iat: now,
      exp: now + 60 * 60,           // 60 min — Apple max
    },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id } }
  );

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', cfg.client_id);
  params.append('client_secret', clientAssertion);
  params.append('scope', 'searchadsorg');

  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  cachedAccessToken = res.data.access_token;
  cachedAccessTokenExp = Date.now() + (res.data.expires_in * 1000);
  return cachedAccessToken;
}

async function api(pathPart, opts = {}) {
  const token = await getAccessToken();
  const res = await axios({
    method: opts.method || 'GET',
    url: BASE_URL + pathPart,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-AP-Context': `orgId=${cfg.org_id}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    data: opts.data,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    console.error(`API ${pathPart} → ${res.status}`, JSON.stringify(res.data).slice(0, 600));
    throw new Error(`ASA API error ${res.status}`);
  }
  return res.data;
}

// ═══════════════════════════════════════════════════════════════════
// Subcommands
// ═══════════════════════════════════════════════════════════════════

async function listCampaigns() {
  const data = await api('/campaigns?limit=200');
  const campaigns = data.data || [];
  console.log(`\n${campaigns.length} campaign(s):\n`);
  console.log('ID         | Name                                    | Status | Country | Daily$| LTD Spend');
  console.log('-----------+-----------------------------------------+--------+---------+-------+-----------');
  for (const c of campaigns) {
    console.log(
      String(c.id).padEnd(10), '|',
      (c.name || '').slice(0, 39).padEnd(39), '|',
      (c.status || '').padEnd(6), '|',
      (c.countriesOrRegions?.join(',') || '').padEnd(7), '|',
      String(c.dailyBudgetAmount?.amount || '—').padStart(5), ' |',
      c.totalBudgetAmount?.amount || '—'
    );
  }
}

async function pauseCampaign(id) {
  await api(`/campaigns/${id}`, { method: 'PUT', data: { status: 'PAUSED' } });
  console.log(`Paused campaign ${id}`);
}

async function resumeCampaign(id) {
  await api(`/campaigns/${id}`, { method: 'PUT', data: { status: 'ENABLED' } });
  console.log(`Resumed campaign ${id}`);
}

async function setBudget(id, usd) {
  const usdMicro = Math.round(parseFloat(usd) * 1_000_000); // micro-amounts per Apple convention
  await api(`/campaigns/${id}`, {
    method: 'PUT',
    data: {
      dailyBudgetAmount: { amount: String(usdMicro / 1_000_000), currency: 'USD' },
    },
  });
  console.log(`Updated campaign ${id} daily budget → $${usd}/day`);
}

async function createSearchCampaign(country, dailyBudgetUsd, defaultBidUsd) {
  // Brand-keyword search campaign template — matches the historical
  // "MGRS Search" campaign that ran at $3.29 CPA / 62.5% CR in the US.
  const adamId = 6759629554; // Red Grid MGRS Apple ID
  const c = country.toUpperCase();
  const name = `Red Grid MGRS — ${c} Search ${new Date().toISOString().slice(0,10)}`;
  const data = {
    orgId: cfg.org_id,
    name,
    adamId,
    budgetAmount: { amount: String(parseFloat(dailyBudgetUsd) * 30), currency: 'USD' },
    dailyBudgetAmount: { amount: String(dailyBudgetUsd), currency: 'USD' },
    countriesOrRegions: [c],
    supplySources: ['APPSTORE_SEARCH_RESULTS'],
    adChannelType: 'SEARCH',
    billingEvent: 'TAPS',
  };
  const created = await api('/campaigns', { method: 'POST', data });
  console.log(`Created campaign: id=${created.data.id}, name="${name}"`);
  console.log(`Default bid for new keywords: $${defaultBidUsd}`);
  console.log('Next: add keywords via /campaigns/{id}/adgroups + /adgroups/{id}/targetingkeywords');
  console.log('See https://developer.apple.com/documentation/apple_search_ads for keyword API.');
  return created.data;
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'list':           return listCampaigns();
    case 'pause':          return pauseCampaign(process.argv[3]);
    case 'resume':         return resumeCampaign(process.argv[3]);
    case 'budget':         return setBudget(process.argv[3], process.argv[4]);
    case 'create-search':  return createSearchCampaign(process.argv[3], process.argv[4], process.argv[5]);
    default:
      console.log('Usage: node scripts/asa-campaigns.js <list|pause|resume|budget|create-search> [args]');
      process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(99); });
