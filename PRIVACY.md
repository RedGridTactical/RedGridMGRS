# Privacy Policy

**Last updated: 2025**

Red Grid MGRS is a free, open-source application. This policy describes exactly what data the app accesses and what it does with it.

---

## Location Data

Red Grid MGRS requests access to your device's GPS location **while the app is open** (foreground only). This location data is used solely to calculate and display your current MGRS coordinates on screen.

- Location data is **never written to disk**
- Location data is **never transmitted** over any network
- Location data is **never shared** with any third party
- When you close the app, all location data is discarded from memory

## Stored Data

The following data is saved locally on your device:

**All users:**
- **Magnetic declination offset** — a single number you configure (default: 0)
- **Pace count calibration** — a single number you configure (default: 62)

**Red Grid Pro users (optional one-time purchase):**
- **Saved waypoint lists** — named lists of waypoints you choose to save, stored locally on your device only
- **Display theme preference** — your selected colour theme
- **Coordinate format preference** — your selected coordinate display format

All stored data lives **on your device only**. None of it is ever transmitted anywhere.

## Network Activity

Red Grid MGRS makes **no analytics, no tracking, no telemetry, no account, and no cloud sync** network calls. There is no:

- Analytics or usage tracking SDK
- Crash reporting service
- Advertising network or attribution SDK (no third-party IDs are collected or transmitted)
- Account system or cloud sync
- Update check or telemetry "phone home"

The app does make these network calls, all of which are either user-initiated or required by the operating system itself:

- **Map tile downloads** — only when you explicitly tap "Download tiles for offline" or pan an online map. Tiles are fetched from public OpenStreetMap-style tile servers (OpenStreetMap, CARTO, OpenTopoMap). Your device's IP and the tile coordinates you request are visible to those tile servers, the same as they would be for any other map app. No personal data is sent.
- **In-app purchases** — when you buy or restore Red Grid Pro, the request goes to Apple StoreKit (iOS) or Google Play Billing (Android). Red Grid MGRS never sees your payment details and never proxies them through any server.

You can verify these claims by reviewing the source code or monitoring network traffic while using the app.

## Permissions

| Permission | Purpose | Scope |
|------------|---------|-------|
| Location (While Using App) | Display MGRS coordinates | Foreground only — never background |

No other permissions are requested.

## Third Parties

Red Grid MGRS contains no third-party SDKs that collect data. It is built on the Expo runtime framework. In-app purchases use native Apple StoreKit and Google Play Billing APIs — no third-party purchase SDK is included.

## Children

This app does not knowingly collect any data from anyone, including children.

## Changes

Any changes to this policy will be reflected in the GitHub repository with an updated date.

## Contact

For questions: support@redgridtactical.com
GitHub issues: https://github.com/RedGridTactical/RedGridMGRS/issues
