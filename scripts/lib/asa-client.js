/**
 * Apple Search Ads API client (reusable).
 *
 * Extracted from scripts/asa-campaigns.js. Reuses the same one-time UI setup
 * (creds at secrets/asa-creds.json + secrets/asa-private-key.pem). When the
 * creds aren't configured, every exported function returns null instead of
 * throwing — callers can safely call this from daily cron without crashing.
 *
 * Auth flow:
 *   1. Sign a client-assertion JWT with the ECDSA P-256 .pem
 *   2. Exchange for an OAuth2 access token at appleid.apple.com
 *   3. Cache the access token until 30s before expiry
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const KEY_PATH = path.join(ROOT, 'secrets/asa-private-key.pem');
const CREDS_PATH = path.join(ROOT, 'secrets/asa-creds.json');
const BASE_URL = 'https://api.searchads.apple.com/api/v5';
const TOKEN_URL = 'https://appleid.apple.com/auth/oauth2/token';

let cachedAccessToken = null;
let cachedAccessTokenExp = 0;
let cachedCfg = null;
let cachedPrivateKey = null;

function isConfigured() {
  return fs.existsSync(KEY_PATH) && fs.existsSync(CREDS_PATH);
}

function loadCreds() {
  if (cachedCfg) return cachedCfg;
  cachedCfg = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  cachedPrivateKey = fs.readFileSync(KEY_PATH, 'utf8');
  return cachedCfg;
}

async function getAccessToken() {
  if (!isConfigured()) return null;
  const cfg = loadCreds();
  if (cachedAccessToken && Date.now() < cachedAccessTokenExp - 30_000) return cachedAccessToken;

  const jwt = require('jsonwebtoken');
  const axios = require('axios');
  const now = Math.floor(Date.now() / 1000);
  const clientAssertion = jwt.sign(
    {
      iss: cfg.team_id,
      sub: cfg.client_id,
      aud: 'https://appleid.apple.com',
      iat: now,
      exp: now + 60 * 60,
    },
    cachedPrivateKey,
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
  if (!isConfigured()) return null;
  const cfg = loadCreds();
  const token = await getAccessToken();
  const axios = require('axios');
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
    throw new Error(`ASA API ${pathPart} → ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
  }
  return res.data;
}

/**
 * Pull a campaign-level performance report for the given date range.
 * Returns rows with spend, taps, impressions, installs, conversions,
 * avgCPA per campaign. Null if ASA isn't configured or report fetch fails.
 *
 * Apple's report endpoint accepts POST /campaigns/report with body:
 *   {
 *     startTime: 'YYYY-MM-DD',
 *     endTime:   'YYYY-MM-DD',
 *     selector:  { orderBy: [{field:'spend',sortOrder:'DESCENDING'}] },
 *     groupBy:   ['countryCode'] (optional),
 *     timeZone:  'UTC',
 *     returnRecordsWithNoMetrics: false,
 *     returnRowTotals: true,
 *     returnGrandTotals: true
 *   }
 */
async function getCampaignsReport(startDate, endDate) {
  if (!isConfigured()) return null;
  try {
    const data = await api('/reports/campaigns', {
      method: 'POST',
      data: {
        startTime: startDate,
        endTime: endDate,
        selector: { orderBy: [{ field: 'spend', sortOrder: 'DESCENDING' }] },
        timeZone: 'UTC',
        returnRecordsWithNoMetrics: false,
        returnRowTotals: true,
        returnGrandTotals: true,
      },
    });
    return data?.data || null;
  } catch (e) {
    return { error: e.message };
  }
}

/** List campaigns + their status + daily budget (for context, no metrics). */
async function listCampaigns() {
  if (!isConfigured()) return null;
  try {
    const data = await api('/campaigns?limit=200');
    return data?.data || null;
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  isConfigured,
  getCampaignsReport,
  listCampaigns,
};
