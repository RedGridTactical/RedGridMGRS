#!/usr/bin/env node
/**
 * asc-upload-screenshots.js — Replace 6.7" iPhone screenshots on the active
 * ASC app version with the freshly-rendered set in screenshots/output/ios.
 *
 * Uploads to the en-US localization only — ASC applies the display-family
 * screenshots (APP_IPHONE_67) to all locales unless overridden per-locale,
 * so a single en-US upload propagates.
 *
 * Usage:
 *   node scripts/asc-upload-screenshots.js [version]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function requireOrHint(mod) {
  try { return require(mod); }
  catch {
    console.error(`Missing dep "${mod}". Install with: npm install ${mod}`);
    process.exit(1);
  }
}

const jwt = requireOrHint('jsonwebtoken');
const axios = requireOrHint('axios');

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD';
const ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f';
const APP_ID = '6759629554';
const SCREENSHOT_DIR = path.join(ROOT, 'screenshots/output/ios');
const DISPLAY_TYPE = 'APP_IPHONE_67';

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

async function getVersion(api, version) {
  const res = await api.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=${version}&filter[platform]=IOS&limit=5`);
  const data = res.data.data || [];
  if (!data.length) throw new Error(`Version ${version} not found`);
  return data[0].id;
}

async function getEnUsLocalization(api, versionId) {
  const res = await api.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=200`);
  const locs = res.data.data || [];
  const en = locs.find(l => l.attributes.locale === 'en-US');
  if (!en) throw new Error('en-US localization missing');
  return en.id;
}

async function getOrCreateScreenshotSet(api, locId, displayType) {
  const res = await api.get(`/appStoreVersionLocalizations/${locId}/appScreenshotSets?limit=50`);
  const sets = res.data.data || [];
  const existing = sets.find(s => s.attributes.screenshotDisplayType === displayType);
  if (existing) return existing.id;

  const createRes = await api.post('/appScreenshotSets', {
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

async function listScreenshots(api, setId) {
  const res = await api.get(`/appScreenshotSets/${setId}/appScreenshots?limit=50`);
  return res.data.data || [];
}

async function deleteScreenshot(api, id) {
  await api.delete(`/appScreenshots/${id}`);
}

async function createScreenshotReservation(api, setId, fileName, fileSize) {
  const res = await api.post('/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize },
      relationships: {
        appScreenshotSet: {
          data: { type: 'appScreenshotSets', id: setId },
        },
      },
    },
  });
  return res.data.data;
}

async function uploadOperations(uploadOps, fileBuffer, token) {
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

async function commitScreenshot(api, id, checksum) {
  await api.patch(`/appScreenshots/${id}`, {
    data: {
      id,
      type: 'appScreenshots',
      attributes: {
        uploaded: true,
        sourceFileChecksum: checksum,
      },
    },
  });
}

async function reorderScreenshots(api, setId, orderedIds) {
  await api.patch(`/appScreenshotSets/${setId}/relationships/appScreenshots`, {
    data: orderedIds.map(id => ({ type: 'appScreenshots', id })),
  });
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = process.argv[2] || pkg.version;

  console.log(`Target version: ${version}`);
  console.log(`Source dir:     ${SCREENSHOT_DIR}`);

  const files = fs.readdirSync(SCREENSHOT_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();
  if (!files.length) {
    console.error('No PNGs found in screenshots/output/ios');
    process.exit(2);
  }
  console.log(`Found ${files.length} screenshots:`, files);

  const token = makeToken();
  const api = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60000,
  });

  const versionId = await getVersion(api, version);
  console.log(`Version id: ${versionId}`);

  const locId = await getEnUsLocalization(api, versionId);
  console.log(`en-US loc id: ${locId}`);

  const setId = await getOrCreateScreenshotSet(api, locId, DISPLAY_TYPE);
  console.log(`Screenshot set id: ${setId}`);

  console.log('\nClearing existing screenshots...');
  const existing = await listScreenshots(api, setId);
  for (const s of existing) {
    await deleteScreenshot(api, s.id);
    console.log(`  – deleted ${s.attributes?.fileName || s.id}`);
  }

  console.log('\nUploading new screenshots...');
  const uploadedIds = [];
  for (const file of files) {
    const fullPath = path.join(SCREENSHOT_DIR, file);
    const buffer = fs.readFileSync(fullPath);
    const checksum = md5(buffer);

    const reservation = await createScreenshotReservation(api, setId, file, buffer.length);
    const ops = reservation.attributes.uploadOperations;
    await uploadOperations(ops, buffer, token);
    await commitScreenshot(api, reservation.id, checksum);
    uploadedIds.push(reservation.id);
    console.log(`  ✓ ${file} (${(buffer.length/1024).toFixed(0)} KB)`);
  }

  console.log('\nReordering screenshots...');
  await reorderScreenshots(api, setId, uploadedIds);
  console.log(`Done — ${uploadedIds.length} screenshots uploaded in order.`);
}

main().catch(err => {
  console.error('Fatal:', err.response?.data?.errors || err.message || err);
  process.exit(99);
});
