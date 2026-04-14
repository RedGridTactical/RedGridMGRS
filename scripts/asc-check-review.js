const fs = require('fs'), path = require('path'), jwt = require('jsonwebtoken'), axios = require('axios');
const KEY_PATH = path.join(__dirname, '..', 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD', ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f', APP_ID = '6759629554';
const token = jwt.sign({ iss: ISSUER_ID, exp: Math.floor(Date.now()/1000)+15*60, aud: 'appstoreconnect-v1' }, fs.readFileSync(KEY_PATH, 'utf8'), { algorithm: 'ES256', header: { alg:'ES256', kid:KEY_ID, typ:'JWT' } });
const api = axios.create({ baseURL: 'https://api.appstoreconnect.apple.com/v1', headers: { Authorization: `Bearer ${token}` } });
(async () => {
  const v = await api.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=3.3.2&filter[platform]=IOS`);
  const ver = v.data.data[0];
  console.log('Version 3.3.2:', ver.id);
  console.log('  appStoreState:', ver.attributes.appStoreState);
  console.log('  releaseType:', ver.attributes.releaseType);
  console.log('  versionString:', ver.attributes.versionString);
  // Check review submissions
  const subs = await api.get(`/apps/${APP_ID}/reviewSubmissions?limit=5&sort=-createdDate`);
  if (subs.data.data.length) {
    subs.data.data.forEach(s => console.log('  submission', s.id, s.attributes.state, 'submittedDate', s.attributes.submittedDate));
  } else console.log('  no review submissions');
})().catch(e => console.error('Err:', e.response?.data?.errors || e.message));
