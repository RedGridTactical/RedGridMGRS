#!/usr/bin/env node
/**
 * asc-submit-for-review.js — End-to-end: link latest build to an App Store version
 * and submit that version for App Review.
 *
 * Assumes:
 *   - The App Store version record already exists (see asc-update-whats-new.js)
 *   - The target build has been uploaded via fastlane/altool
 *   - Release notes are populated for all localizations
 *
 * Flow (one pass):
 *   1. Look up the target appStoreVersion by versionString
 *   2. Force releaseType = AFTER_APPROVAL so the build goes live the moment
 *      Apple approves — no manual click required. Set RELEASE_TYPE=MANUAL env
 *      var to override for a gated launch.
 *   3. Wait for the matching build (by version number) to appear in ASC
 *   4. Wait for the build's processingState to reach VALID
 *   5. PATCH the appStoreVersion to point at the build (build relationship)
 *   6. Create a reviewSubmission + reviewSubmissionItem for the version,
 *      then PATCH it with submitted=true to finalize (modern API; the legacy
 *      appStoreVersionSubmissions CREATE returns 403 on new submissions).
 *
 * Usage:
 *   node scripts/asc-submit-for-review.js [version] [buildNumber]
 *     version      defaults to app.json expo.version
 *     buildNumber  defaults to app.json expo.ios.buildNumber
 *
 *   RELEASE_TYPE=MANUAL node scripts/asc-submit-for-review.js ...
 *     override auto-release for a gated launch.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

const versionString = process.argv[2] || appJson.expo.version;
const buildNumber   = String(process.argv[3] || appJson.expo.ios.buildNumber);
// Default to AFTER_APPROVAL so versions go live the moment Apple approves.
// Set RELEASE_TYPE=MANUAL in the env for a gated launch where you want to
// click "Release" yourself at a planned time.
const RELEASE_TYPE  = (process.env.RELEASE_TYPE || 'AFTER_APPROVAL').toUpperCase();
if (!['AFTER_APPROVAL', 'MANUAL', 'SCHEDULED'].includes(RELEASE_TYPE)) {
  console.error(`Invalid RELEASE_TYPE "${RELEASE_TYPE}" — must be AFTER_APPROVAL, MANUAL, or SCHEDULED.`);
  process.exit(1);
}

function newToken() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
  );
}

function api() {
  return axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${newToken()}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Target: v${versionString}, build ${buildNumber}\n`);

  // 1. Look up App Store version
  let a = api();
  const vRes = await a.get(`/apps/${cfg.app_id}/appStoreVersions`, {
    params: { 'filter[versionString]': versionString, 'filter[platform]': 'IOS', limit: 1 },
  });
  if (vRes.status >= 400 || vRes.data.data.length === 0) {
    console.error(`No v${versionString} App Store version found. Create it first.`);
    process.exit(2);
  }
  const version = vRes.data.data[0];
  const versionId = version.id;
  console.log(`App Store version: ${versionId} (state=${version.attributes.appStoreState}, releaseType=${version.attributes.releaseType})`);

  if (version.attributes.appStoreState !== 'PREPARE_FOR_SUBMISSION' &&
      version.attributes.appStoreState !== 'DEVELOPER_REJECTED' &&
      version.attributes.appStoreState !== 'REJECTED' &&
      version.attributes.appStoreState !== 'METADATA_REJECTED') {
    console.warn(`WARNING: version is in state "${version.attributes.appStoreState}" — submission may fail.`);
  }

  // 2. Force releaseType to the desired value (default AFTER_APPROVAL) so the
  //    version goes live the moment Apple approves it.
  if (version.attributes.releaseType !== RELEASE_TYPE) {
    console.log(`\nFlipping releaseType: ${version.attributes.releaseType} → ${RELEASE_TYPE}`);
    a = api();
    const rt = await a.patch(`/appStoreVersions/${versionId}`, {
      data: { type: 'appStoreVersions', id: versionId, attributes: { releaseType: RELEASE_TYPE } },
    });
    if (rt.status >= 400) {
      console.error(`releaseType PATCH failed: ${rt.status}`, JSON.stringify(rt.data).substring(0, 400));
      process.exit(2);
    }
    console.log(`  ✓ releaseType = ${rt.data.data.attributes.releaseType}`);
  }

  // 3. Wait for the build to appear
  console.log(`\nLooking for build ${buildNumber}...`);
  let build = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    a = api();
    const bRes = await a.get('/builds', {
      params: {
        'filter[app]': cfg.app_id,
        'filter[version]': buildNumber,
        limit: 5,
        'fields[builds]': 'version,uploadedDate,expirationDate,processingState',
      },
    });
    if (bRes.status === 200 && bRes.data.data.length > 0) {
      build = bRes.data.data[0];
      console.log(`  build ${buildNumber} found: ${build.id} (state=${build.attributes.processingState})`);
      break;
    }
    process.stdout.write('.');
    await sleep(15000);
  }
  if (!build) {
    console.error(`\nBuild ${buildNumber} did not appear after 10 minutes. Check TestFlight upload.`);
    process.exit(3);
  }

  // 3. Wait for build to process
  console.log(`\nWaiting for build ${buildNumber} to reach VALID state...`);
  while (build.attributes.processingState !== 'VALID') {
    if (build.attributes.processingState === 'INVALID' || build.attributes.processingState === 'FAILED') {
      console.error(`Build processing failed: state=${build.attributes.processingState}`);
      process.exit(4);
    }
    process.stdout.write('.');
    await sleep(30000);
    a = api();
    const bRes = await a.get(`/builds/${build.id}`, { params: { 'fields[builds]': 'processingState' } });
    if (bRes.status === 200) build = bRes.data.data;
  }
  console.log(` VALID`);

  // 4. Link build to version
  console.log(`\nLinking build ${build.id} → App Store version ${versionId}...`);
  a = api();
  const linkRes = await a.patch(`/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });
  if (linkRes.status >= 400) {
    console.error(`Link failed: ${linkRes.status}`, JSON.stringify(linkRes.data).substring(0, 500));
    process.exit(5);
  }
  console.log('  ✓ linked');

  // 5. Submit for review via the modern reviewSubmissions API
  //    (appStoreVersionSubmissions CREATE was deprecated in favor of this flow).
  //
  //    Flow:
  //      (a) Create a reviewSubmission for the app
  //      (b) Add a reviewSubmissionItem linking to the appStoreVersion
  //      (c) PATCH the reviewSubmission with submitted=true to finalize
  console.log(`\nCreating review submission for v${versionString}...`);
  a = api();
  const subRes = await a.post('/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: cfg.app_id } } },
    },
  });
  if (subRes.status >= 400) {
    console.error(`Review submission create failed: ${subRes.status}`, JSON.stringify(subRes.data).substring(0, 800));
    process.exit(6);
  }
  const subId = subRes.data.data.id;
  console.log(`  ✓ reviewSubmission created: ${subId}`);

  console.log(`\nAdding appStoreVersion ${versionId} as a submission item...`);
  a = api();
  const itemRes = await a.post('/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: subId } },
        appStoreVersion:  { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  });
  if (itemRes.status >= 400) {
    console.error(`Add item failed: ${itemRes.status}`, JSON.stringify(itemRes.data).substring(0, 800));
    process.exit(7);
  }
  console.log(`  ✓ item attached: ${itemRes.data.data.id}`);

  console.log(`\nFinalizing submission (submitted=true)...`);
  a = api();
  const finalRes = await a.patch(`/reviewSubmissions/${subId}`, {
    data: {
      type: 'reviewSubmissions',
      id: subId,
      attributes: { submitted: true },
    },
  });
  if (finalRes.status >= 400) {
    console.error(`Finalize failed: ${finalRes.status}`, JSON.stringify(finalRes.data).substring(0, 800));
    process.exit(8);
  }
  console.log(`  ✓ submitted to Apple`);
  console.log(`\nv${versionString} is now in review queue. Apple typically reviews within 24h.`);
  console.log(`    reviewSubmission id: ${subId}`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(99);
});
