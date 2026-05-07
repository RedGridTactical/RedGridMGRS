#!/usr/bin/env node
/**
 * asc-update-whats-new.js — Push "What's New" text to all ASC locales.
 *
 * Uses App Store Connect API with the .p8 key at secrets/AuthKey_77HSQA4SZD.p8
 * to update the "releaseNotes" field on the target app version across every
 * locale in one run. Defaults to app.json version if no arg is passed.
 *
 * Prereqs: run `npm install jsonwebtoken axios` once.
 *
 * Usage:
 *   node scripts/asc-update-whats-new.js [version]
 *
 * Default version is read from app.json.
 */

const fs = require('fs');
const path = require('path');

// Lazy-require so running --help without deps still works
function requireOrHint(mod) {
  try { return require(mod); }
  catch {
    console.error(`Missing dep "${mod}". Install with: npm install ${mod}`);
    process.exit(1);
  }
}

const ROOT = path.resolve(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'secrets/AuthKey_77HSQA4SZD.p8');
const KEY_ID = '77HSQA4SZD';
const ISSUER_ID = 'fd037358-c176-4ca0-a466-ceb23180250f';
const APP_ID = '6759629554'; // Red Grid MGRS

// Release notes per locale. Copy the English version for locales we don't
// have a translation for — ASC requires ALL localizations to be populated.
const RELEASE_NOTES = {
  'en-US': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'fr-FR': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'de-DE': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'es-ES': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'es-MX': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ja': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ko': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'it': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'nl-NL': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'pt-BR': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'pt-PT': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ru': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'uk': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'pl': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'cs': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'sk': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'hr': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'hu': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ro': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'tr': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'sv': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'no': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'da': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'fi': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'el': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'zh-Hans': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'zh-Hant': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'vi': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'th': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'id': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ms': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'he': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ar-SA': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,

  'ca': `v3.3.6 — Startup fix

- Fixes a startup issue that could leave the app on a black screen for some users after the v3.3.5 update. The app now launches reliably on iOS 15 and later.
- No privacy, network, or data changes. Red Grid MGRS still requires no account, runs offline-first, and never transmits your location.`,
};

// Any ASC-required locales not listed in RELEASE_NOTES fall back to English.
// With v3.3.4+ we carry native translations for all 26 ASC locales currently
// live on our listing, so this list is short — kept only for regional English
// variants Apple may request.
const ENGLISH_FALLBACK_LOCALES = [
  'en-GB', 'en-AU', 'en-CA', 'en-SG',
];

async function main() {
  const jwt = requireOrHint('jsonwebtoken');
  const axios = requireOrHint('axios');

  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Missing ASC .p8 key at ${KEY_PATH}`);
    process.exit(1);
  }

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const targetVersion = process.argv[2] || appJson.expo.version;
  console.log(`Target version: ${targetVersion}`);

  const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '20m',
    audience: 'appstoreconnect-v1',
    issuer: ISSUER_ID,
    header: { kid: KEY_ID, typ: 'JWT' },
  });

  const api = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
  });

  // 1. Find the app version matching our target
  console.log('Fetching app versions...');
  const versionsRes = await api.get(`/apps/${APP_ID}/appStoreVersions?filter[versionString]=${targetVersion}&filter[platform]=IOS&limit=5`);
  const versions = versionsRes.data.data || [];
  if (!versions.length) {
    console.error(`No app version ${targetVersion} found. Create it in App Store Connect first.`);
    process.exit(2);
  }
  const versionId = versions[0].id;
  console.log(`Found version ${targetVersion} → id ${versionId}`);

  // 2. Fetch all localizations
  const locRes = await api.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=200`);
  const locs = locRes.data.data || [];
  console.log(`Version has ${locs.length} localizations`);

  // 3. Build the full set of release notes (English + translated + fallbacks)
  const allNotes = { ...RELEASE_NOTES };
  for (const loc of ENGLISH_FALLBACK_LOCALES) allNotes[loc] = RELEASE_NOTES['en-US'];

  // 4. Update each
  let updated = 0, skipped = 0, failed = 0;
  for (const loc of locs) {
    const locale = loc.attributes.locale;
    const text = allNotes[locale];
    if (!text) {
      console.warn(`  ? Skipping ${locale} (no translation defined)`);
      skipped++;
      continue;
    }
    try {
      await api.patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          id: loc.id,
          type: 'appStoreVersionLocalizations',
          attributes: { whatsNew: text },
        },
      });
      console.log(`  ✓ ${locale}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${locale}: ${err.response?.status} ${err.response?.data?.errors?.[0]?.detail || err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  process.exit(failed ? 3 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(99);
});
