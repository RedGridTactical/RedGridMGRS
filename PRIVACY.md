# Privacy Policy

**Last updated: 2025**

RedGrid Tactical is a free, open-source application. This policy describes exactly what data the app accesses and what it does with it.

---

## Location Data

RedGrid Tactical requests access to your device's GPS location **while the app is open** (foreground only). This location data is used solely to calculate and display your current MGRS (Military Grid Reference System) coordinates on screen.

- Location data is **never written to disk**
- Location data is **never transmitted** over any network
- Location data is **never shared** with any third party
- When you close the app, all location data is discarded from memory

## Stored Data

The only data RedGrid Tactical saves to your device is:

- **Magnetic declination offset** — a single number you configure (default: 0)
- **Pace count calibration** — a single number you configure (default: 62)

These two values are stored locally on your device using the standard system storage API. They are never transmitted anywhere.

## Network Activity

RedGrid Tactical makes **zero network requests**. There is no:

- Analytics or usage tracking
- Crash reporting
- Advertising network
- Account system or cloud sync
- Update check or telemetry

You can verify this by reviewing the source code or monitoring network traffic while using the app.

## Permissions

| Permission | Purpose | Scope |
|------------|---------|-------|
| Location (While Using App) | Display MGRS coordinates | Foreground only — never background |

No other permissions are requested.

## Third Parties

RedGrid Tactical contains no third-party SDKs that collect data. It is built on the Expo runtime framework, which handles the underlying platform APIs.

## Children

This app does not knowingly collect any data from anyone, including children.

## Changes

Any changes to this policy will be reflected in the GitHub repository with an updated date.

## Contact

For questions or concerns, open an issue at:
https://github.com/RedGridTactical/RedGridMGRS/issues
