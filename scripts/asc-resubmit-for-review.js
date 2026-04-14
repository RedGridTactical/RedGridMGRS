const fs = require('fs'), path = require('path'), jwt = require('jsonwebtoken'), axios = require('axios');
const KEY_PATH = path.join(__dirname, '..', 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD', ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f', APP_ID = '6759629554';
const token = jwt.sign({ iss: ISSUER_ID, exp: Math.floor(Date.now()/1000)+15*60, aud: 'appstoreconnect-v1' }, fs.readFileSync(KEY_PATH, 'utf8'), { algorithm: 'ES256', header: { alg:'ES256', kid:KEY_ID, typ:'JWT' } });
const api = axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token}` } });

(async () => {
  const targetVersion = process.argv[2] || '3.3.2';
  const v = await api.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=${targetVersion}&filter[platform]=IOS`);
  const ver = v.data.data[0];
  if (!ver) { console.error(`Version ${targetVersion} not found`); process.exit(2); }
  const versionId = ver.id;
  console.log(`Version ${targetVersion} id: ${versionId} state: ${ver.attributes.appStoreState}`);

  // If rejected, first transition state back to PREPARE_FOR_SUBMISSION by patching
  // Actually for DEVELOPER_REJECTED we can go straight to creating a review submission
  // Check for pending submissions (state IN_REVIEW/READY_FOR_REVIEW/WAITING_FOR_REVIEW)
  const existingSubs = await api.get(`/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=10`);
  console.log(`Existing submissions: ${existingSubs.data.data.length}`);
  existingSubs.data.data.forEach(s => console.log(`  ${s.id} state=${s.attributes.state} submittedDate=${s.attributes.submittedDate || 'null'}`));

  // Find or create a review submission in READY_FOR_REVIEW state
  let submission = existingSubs.data.data.find(s =>
    ['READY_FOR_REVIEW', 'WAITING_FOR_REVIEW'].includes(s.attributes.state)
  );

  if (!submission) {
    console.log('Creating new review submission...');
    const createRes = await api.post('/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
        },
      },
    });
    submission = createRes.data.data;
    console.log(`Created submission ${submission.id}`);
  }

  // Add the app version as an item to the submission
  console.log(`Adding v${targetVersion} to submission...`);
  try {
    const itemRes = await api.post('/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
    console.log(`Added item ${itemRes.data.data.id}`);
  } catch (e) {
    const detail = e.response?.data?.errors?.[0]?.detail || e.message;
    if (/already.*associated|already.*submitted|conflict/i.test(detail)) {
      console.log(`  (item already attached — ${detail})`);
    } else throw e;
  }

  // Submit the review submission
  console.log('Submitting for review...');
  await api.patch(`/reviewSubmissions/${submission.id}`, {
    data: {
      id: submission.id,
      type: 'reviewSubmissions',
      attributes: { submitted: true },
    },
  });
  console.log(`Submitted! Submission id: ${submission.id}`);
})().catch(e => {
  console.error('Fatal:', e.response?.status, e.response?.data?.errors || e.message);
  process.exit(99);
});
