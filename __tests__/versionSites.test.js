/**
 * Version-site consistency guard.
 *
 * WHY THIS EXISTS: cutting 4.0.2 bumped app.json's `expo.version`,
 * ios/RedGridMGRS/Info.plist and android/app/build.gradle by hand, but missed
 * `expo.ios.buildNumber`. The fastlane `ios build` lane treats **app.json as
 * the single source of truth** and re-pins Info.plist from it, so it silently
 * rewrote CFBundleVersion back to the previous build number and produced an
 * IPA Apple would reject (build numbers must increase).
 *
 * The trap is that Info.plist looks authoritative but is derived. These tests
 * assert every site agrees, so a half-finished bump fails here instead of at
 * upload time.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = JSON.parse(read('app.json')).expo;
const plist = read('ios/RedGridMGRS/Info.plist');
const gradle = read('android/app/build.gradle');

function plistString(key) {
  const m = plist.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)
  );
  expect(m).not.toBeNull();
  return m[1].trim();
}

describe('version sites agree', () => {
  test('marketing version: app.json === Info.plist === build.gradle', () => {
    const v = app.version;
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(plistString('CFBundleShortVersionString')).toBe(v);
    const gv = gradle.match(/versionName\s+"([^"]+)"/);
    expect(gv).not.toBeNull();
    expect(gv[1]).toBe(v);
  });

  test('iOS build number: app.json.ios.buildNumber === Info.plist CFBundleVersion', () => {
    // app.json is what fastlane pins from. If these disagree the lane wins and
    // the IPA ships the app.json value, which is how build 74 was rebuilt.
    const bn = String(app.ios.buildNumber);
    expect(bn).toMatch(/^\d+$/);
    expect(plistString('CFBundleVersion')).toBe(bn);
  });

  test('Android version code: app.json.android.versionCode === build.gradle', () => {
    const vc = Number(app.android.versionCode);
    expect(Number.isInteger(vc)).toBe(true);
    const gc = gradle.match(/versionCode\s+(\d+)/);
    expect(gc).not.toBeNull();
    expect(Number(gc[1])).toBe(vc);
  });
});

/**
 * The build files were not the only version sites, and the others were NOT
 * covered here — so they drifted. Shipping 4.0.2 left `APP_VERSION` in
 * SupportScreen and `currentVersion` on WhatsNewModal both pinned at '4.0.1'.
 * Every 4.0.2 user saw "Red Grid MGRS v4.0.1" on the support screen, and the
 * What's New modal looked up FEATURES_BY_VERSION['4.0.1'], found nothing, and
 * silently never rendered.
 *
 * These are user-visible strings, so they belong in the same guard.
 */
describe('user-facing version strings track app.json', () => {
  const support = read('src/screens/SupportScreen.js');
  const appJs = read('App.js');

  test('SupportScreen APP_VERSION === app.json version', () => {
    const m = support.match(/APP_VERSION\s*=\s*'([^']+)'/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(app.version);
  });

  test('WhatsNewModal currentVersion === app.json version', () => {
    const m = appJs.match(/currentVersion="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(app.version);
  });

  test('a version with no What\'s New entry renders no modal rather than an empty one', () => {
    // WhatsNewModal bails when FEATURES_BY_VERSION has no entry for the running
    // version. That is correct for maintenance releases, but it means adding a
    // FEATURES entry is a deliberate act — assert the early return still exists
    // so a future edit cannot start showing an empty modal.
    const modal = read('src/components/WhatsNewModal.js');
    expect(modal).toMatch(/if \(!currentVersion \|\| !features\.length\) return;/);
  });
});
