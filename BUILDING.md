# Building Red Grid MGRS

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g eas-cli`
- Expo account with EAS access
- Apple Developer account (iOS builds)
- Google Play Developer account (Android builds)

## Setup

```bash
git clone https://github.com/RedGridTactical/RedGridMGRS.git
cd RedGridMGRS
npm install
```

## Running Locally

```bash
npx expo start
```

Scan the QR code with Expo Go on your device, or press `i` for iOS Simulator / `a` for Android Emulator.

## Running Tests

```bash
npx jest --no-cache --verbose
```

## Building for Production

### iOS

```bash
npx eas build --platform ios --profile production --non-interactive
```

This produces an IPA signed for App Store distribution. Build numbers auto-increment via `eas.json` (`autoIncrement: true`, `appVersionSource: "remote"`).

### Android

```bash
npx eas build --platform android --profile production --non-interactive
```

This produces an AAB (Android App Bundle) signed with the production keystore stored on EAS servers.

## Submitting to Stores

### App Store Connect

```bash
npx eas submit --platform ios --profile production --non-interactive --latest
```

Or with a specific IPA URL:

```bash
npx eas submit --platform ios --profile production --non-interactive --url <IPA_URL>
```

### Google Play Console

Upload the AAB manually to the Play Console closed testing track. The Google Play Developer API is not yet configured for automated submissions (blocked on org account conversion).

## Localization

### In-App (6 languages)

Locale files are in `src/i18n/`: en.js, fr.js, de.js, es.js, ja.js, ko.js.

### App Store Connect (26 locales)

Use the ASC batch updater script:

```bash
cd ~/App/asc-updater
node update-mgrs-whats-new.js
```

This updates What's New for all 26 ASC locales via the App Store Connect API. Edit the `whatsNewEN` constant and `TARGET_VERSION` in the script before running.

## Project Structure

```
RedGridMGRS/
├── App.js                    # Root: ThemeProvider, tabs, main grid display
├── app.json                  # Expo config (version, bundle ID, permissions)
├── eas.json                  # EAS build/submit config
├── src/
│   ├── hooks/                # useLocation, useIAP, useSettings, useTheme, etc.
│   ├── screens/              # Tools, Report, WaypointLists, Theme, CoordFormats, Support
│   ├── components/
│   │   ├── tools/            # Tactical tool components
│   │   └── ProGate.js        # 3-tier paywall
│   ├── utils/                # mgrs.js, tactical.js, fixphrase.js, storage.js, etc.
│   └── i18n/                 # Localization files
├── docs/                     # GitHub Pages site
├── packages/mgrs/            # @redgrid/mgrs standalone npm package
└── __tests__/                # Jest test files
```

## Versioning

- `app.json` version = App Store / Play Store visible version
- Build numbers auto-increment on EAS
- ASC requires monotonically increasing CFBundleShortVersionString per binary upload
- Version must match the roadmap milestone (see roadmap.md)

## Privacy

Zero-network architecture. The app makes no network calls. Location data is held in memory only and never persisted or transmitted. No analytics, no tracking, no telemetry.
