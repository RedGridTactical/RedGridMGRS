# Red Grid MGRS — Local Build & Release Runbook

Local macOS build pipeline. As of April 2026, builds are no longer run on EAS — everything happens on this MacBook via Xcode + Gradle + fastlane.

## One-time machine setup

These are already done on the primary build MacBook. Keeping here for disaster recovery.

```bash
# Homebrew toolchain
brew install node watchman cocoapods gh fastlane
brew install openjdk@17
brew install --cask android-commandlinetools

# Persist env (already in ~/.zprofile)
# - brew shellenv
# - LANG=en_US.UTF-8
# - JAVA_HOME=/opt/homebrew/opt/openjdk@17
# - ANDROID_HOME=/opt/homebrew/share/android-commandlinetools

# Android SDK components
sdkmanager --licenses      # accept
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## Secrets (gitignored, `secrets/` directory)

| File | Purpose |
|---|---|
| `AuthKey_77HSQA4SZD.p8` | Apple ASC API private key (team `79PGQG73FG`, issuer `fd037358-...`) |
| `asc_api_key.json` | fastlane-format wrapper over the `.p8` |
| `Developer Distribution Certificate.p12` | Legacy Apple distribution cert (not currently used — keychain has `Apple Distribution: Gianlorenzo Ranieri` already) |
| `upload-keystore.jks` | Android Play Store upload keystore (SHA1 `27:95:22:...`, SHA256 `D3:CA:2B:...`) |
| `keystore.properties` | Android keystore password + alias (loaded by `android/app/build.gradle`) |
| `play_service_account.json` | *(not yet created)* Google Play Developer API service account — needed for Play Store uploads via fastlane |

**Losing `upload-keystore.jks` or its password means you can't update the Android app** (unless Google grants an upload key reset, which takes days). Back up `secrets/` to an encrypted external drive or password manager.

## Release workflow — iOS

### Version bump

Edit `app.json`:

```json
"ios": {
  "buildNumber": "59"   // must increment monotonically; Apple rejects duplicates
},
"version": "3.3.1"       // semver when features change
```

Then propagate to the native project:

```bash
npx expo prebuild --platform ios    # regenerates Info.plist values
cd ios && pod install
```

### Build & upload to TestFlight

```bash
cd "Red Grid MGRS"
fastlane ios beta
```

This does: archive → export .ipa → upload to TestFlight via ASC API key. No manual steps.

### Submit for review

```bash
fastlane ios release
```

### If signing fails

The Xcode project uses **automatic signing** with team `79PGQG73FG`. First-time runs on a fresh machine may require you to sign in to Apple ID in Xcode → Settings → Accounts, then re-run. `xcodebuild -allowProvisioningUpdates` will fetch/create the App Store distribution profile automatically.

Existing signing identity in keychain: `Apple Distribution: Gianlorenzo Ranieri (79PGQG73FG)`.

## Release workflow — Android

### Version bump

Edit `app.json`:

```json
"android": {
  "versionCode": 14      // monotonic integer; Play rejects duplicates
},
"version": "3.3.1"
```

Then:

```bash
npx expo prebuild --platform android
```

### Build signed AAB

```bash
fastlane android build
# or, without fastlane:
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Upload to Play Console

Until `secrets/play_service_account.json` is created, the AAB must be uploaded manually via the Play Console web UI. Once the service account is in place:

```bash
fastlane android beta         # → internal testing track
fastlane android release      # → production
```

## Reproducibility notes — the "why we patched things" file

The project path contains a **space** (`Red Grid MGRS`), which trips up a half-dozen upstream scripts in RN 0.76.5 / Expo SDK 52. Patches live in `patches/` and are auto-applied by `patch-package` on every `npm install` via the `postinstall` hook:

- `react-native+0.76.5.patch` — three fixes (hermes tar quoting, `script_phases.rb` `bin/sh -c` wrapper, `with-environment.sh` `$1` quoting)
- `expo-constants+17.0.8.patch` — `EXConstants.podspec` `bash -l -c` inner quoting
- `expo-localization+16.0.1.patch` — iOS 26 SDK `@unknown default` in Calendar identifier switch

There is **one patch that lives directly in the committed pbxproj** (not in `patches/`): the main target's "Bundle React Native code and images" script phase uses explicit `/bin/sh "$(...)"` quoting instead of the broken backtick-substitution template. If you re-run `expo prebuild --clean` the pbxproj will be regenerated and this fix will be lost — you'll need to re-apply. The fix replaces:

```
`"$NODE_BINARY" --print "require('path')..."`
```

with:

```
/bin/sh "$("$NODE_BINARY" --print "require('path')...")"
```

## node_modules fragility — macOS Gatekeeper + exec bits

On a fresh `npm install`, some node_modules binaries may be missing exec bits or get killed by Gatekeeper (macOS quarantine). Symptoms:

- `hermesc` exits with code 137 during Android build → **killed by Gatekeeper**
- Scripts report "Permission denied" → **exec bit missing**

Fix (run once after any `npm install`):

```bash
find node_modules -type f \( -name "*.sh" -o -name "*.bash" \) -exec chmod +x {} \;
chmod +x node_modules/.bin/*
chmod +x node_modules/react-native/sdks/hermesc/osx-bin/hermesc
xattr -cr node_modules/react-native/sdks/hermesc/
codesign --force --deep --sign - node_modules/react-native/sdks/hermesc/osx-bin/hermesc
```

This is captured in `scripts/fix-native-binaries.sh` (if created).

## Team IDs / accounts / identifiers reference

| | |
|---|---|
| **iOS bundle ID** | `com.redgrid.redgridtactical` |
| **Android package** | `com.redgrid.redgridtactical` |
| **Apple Developer Team ID** | `79PGQG73FG` |
| **Apple ID (signing/ASC)** | `gianlorenzo.ranieri@gmail.com` |
| **ASC API Key ID** | `77HSQA4SZD` |
| **ASC API Issuer ID** | `fd037358-c176-4ca0-a466-ceb23180250f` |
| **Signing identity in keychain** | `Apple Distribution: Gianlorenzo Ranieri (79PGQG73FG)` |
| **Android upload key SHA256** | `D3:CA:2B:3B:78:C5:A8:60:B8:B2:5C:B6:D0:97:C7:7C:FA:DA:99:42:6E:60:B0:9A:43:0C:FC:8C:8A:46:6F:BD` |
