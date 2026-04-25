#!/usr/bin/env node
/**
 * asc-upload-screenshots.js — Replace iPhone-6.7" screenshots on the active
 * ASC app version, per locale.
 *
 * Reads from: screenshots/output/ios/{locale}/*.png  (1290x2796)
 *
 * For each locale dir present, this script:
 *   1. Finds (or creates) the appStoreVersionLocalization for that locale
 *   2. Finds (or creates) the APP_IPHONE_67 screenshot set on that loc
 *   3. Deletes existing screenshots in the set
 *   4. Uploads the new ones in alphanumeric filename order
 *   5. Reorders to match upload order
 *
 * Usage:
 *   node scripts/asc-upload-screenshots.js [version]
 *     version defaults to app.json expo.version
 *
 *   LOCALES=en-US,fr-FR node scripts/asc-upload-screenshots.js  # subset
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function requireOrHint(mod) {
  try { return require(mod); }
  catch { console.error(`Missing dep "${mod}". Install with: npm install ${mod}`); process.exit(1); }
}

const jwt = requireOrHint('jsonwebtoken');
const axios = requireOrHint('axios');

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD';
const ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f';
const APP_ID = '6759629554';
const SCREENSHOT_ROOT = path.join(ROOT, 'screenshots/output/ios');
const DISPLAY_TYPE = 'APP_IPHONE_67';

// Map our render-locale dir name → ASC locale code.
// ASC has 26 locales but our render only has 7. We push to the matching ASC
// locale; if none of the locale's variants exist on ASC, skip cleanly.
const LOCALE_DIR_TO_ASC = {
  'en':    'en-US',
  'fr':    'fr-FR',
  'de':    'de-DE',
  'es':    'es-ES',  // Apple uses es-ES; consider also es-MX in future
  'ja':    'ja',
  'ko':    'ko',
  'it':    'it',
};

function makeToken() {
  const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
  return jwt.sign({
    iss: ISSUER_ID,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    aud: 'appstoreconnect-v1',
  }, privateKey, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' },
  });
}

function md5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function api(token) {
  return axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60000,
  });
}

async function getVersion(http, version) {
  const res = await http.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=${version}&filter[platform]=IOS&limit=5`);
  const data = res.data.data || [];
  if (!data.length) throw new Error(`Version ${version} not found`);
  return data[0].id;
}

async function getLocalizationByLocale(http, versionId, ascLocale) {
  const res = await http.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=200`);
  const locs = res.data.data || [];
  return locs.find(l => l.attributes.locale === ascLocale);
}

async function getOrCreateScreenshotSet(http, locId, displayType) {
  const res = await http.get(`/appStoreVersionLocalizations/${locId}/appScreenshotSets?limit=50`);
  const sets = res.data.data || [];
  const existing = sets.find(s => s.attributes.screenshotDisplayType === displayType);
  if (existing) return existing.id;
  const createRes = await http.post('/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: 'appStoreVersionLocalizations', id: locId },
        },
      },
    },
  });
  return createRes.data.data.id;
}

async function listScreenshots(http, setId) {
  const res = await http.get(`/appScreenshotSets/${setId}/appScreenshots?limit=50`);
  return res.data.data || [];
}

async function deleteScreenshot(http, id) {
  await http.delete(`/appScreenshots/${id}`);
}

async function createScreenshotReservation(http, setId, fileName, fileSize) {
  const res = await http.post('/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize },
      relationships: {
        appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } },
      },
    },
  });
  return res.data.data;
}

async function uploadOperations(uploadOps, fileBuffer) {
  for (const op of uploadOps) {
    const { method, url, requestHeaders, length, offset } = op;
    const chunk = fileBuffer.slice(offset, offset + length);
    const headers = {};
    for (const h of (requestHeaders || [])) headers[h.name] = h.value;
    await axios({
      method: method.toLowerCase(),
      url,
      data: chunk,
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }
}

async function commitScreenshot(http, id, checksum) {
  await http.patch(`/appScreenshots/${id}`, {
    data: { id, type: 'appScreenshots', attributes: { uploaded: true, sourceFileChecksum: checksum } },
  });
}

async function reorderScreenshots(http, setId, orderedIds) {
  await http.patch(`/appScreenshotSets/${setId}/relationships/appScreenshots`, {
    data: orderedIds.map(id => ({ type: 'appScreenshots', id })),
  });
}

async function uploadLocale(http, versionId, dirLocale, ascLocale) {
  const dir = path.join(SCREENSHOT_ROOT, dirLocale);
  if (!fs.existsSync(dir)) { console.log(`  (no dir) ${dirLocale} → ${ascLocale}: SKIP`); return { uploaded: 0, skipped: true }; }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  if (!files.length) { console.log(`  ${ascLocale}: no PNGs in ${dir}`); return { uploaded: 0, skipped: true }; }

  const loc = await getLocalizationByLocale(http, versionId, ascLocale);
  if (!loc) { console.log(`  ${ascLocale}: localization not found on this version, SKIP`); return { uploaded: 0, skipped: true }; }

  const setId = await getOrCreateScreenshotSet(http, loc.id, DISPLAY_TYPE);

  // Clear existing screenshots
  const existing = await listScreenshots(http, setId);
  for (const s of existing) await deleteScreenshot(http, s.id);

  // Upload each
  const uploadedIds = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const buffer = fs.readFileSync(fullPath);
    const checksum = md5(buffer);
    const reservation = await createScreenshotReservation(http, setId, file, buffer.length);
    await uploadOperations(reservation.attributes.uploadOperations, buffer);
    await commitScreenshot(http, reservation.id, checksum);
    uploadedIds.push(reservation.id);
  }

  // Reorder
  await reorderScreenshots(http, setId, uploadedIds);

  console.log(`  ✓ ${ascLocale}: ${uploadedIds.length} screenshots uploaded`);
  return { uploaded: uploadedIds.length, skipped: false };
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const version = process.argv[2] || pkg.expo.version;

  console.log(`Target version: ${version}`);
  console.log(`Source root:    ${SCREENSHOT_ROOT}`);
  console.log(`Display type:   ${DISPLAY_TYPE} (1290x2796)`);

  const filterLocales = (process.env.LOCALES || '').split(',').filter(Boolean);

  const token = makeToken();
  const http = await api(token);

  const versionId = await getVersion(http, version);
  console.log(`Version id:     ${versionId}\n`);

  console.log('Uploading per-locale...');
  let total = 0, succeeded = 0;
  for (const [dirLocale, ascLocale] of Object.entries(LOCALE_DIR_TO_ASC)) {
    if (filterLocales.length && !filterLocales.includes(ascLocale)) continue;
    try {
      const result = await uploadLocale(http, versionId, dirLocale, ascLocale);
      total += result.uploaded;
      if (!result.skipped) succeeded++;
    } catch (e) {
      console.error(`  ✗ ${ascLocale}:`, e.response?.data?.errors?.[0]?.detail || e.message);
    }
  }

  console.log(`\nDone — ${total} screenshots uploaded across ${succeeded} locales.`);
}

main().catch(err => {
  console.error('Fatal:', err.response?.data?.errors || err.message || err);
  process.exit(99);
});
