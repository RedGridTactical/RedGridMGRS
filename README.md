![Red Grid MGRS](docs/images/banner.png)

# Red Grid MGRS

**DAGR-Class MGRS Navigator**

[![App Store](https://img.shields.io/badge/App%20Store-Download-8B0000?logo=apple)](https://apps.apple.com/app/id6759629554)
[![Google Play](https://img.shields.io/badge/Google%20Play-Coming%20Soon-555555?logo=googleplay)](#android)
[![License](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-8B0000)](LICENSE)
[![No Tracking](https://img.shields.io/badge/Tracking-None-CC0000)](PRIVACY.md)

The military's DAGR (AN/PSN-13) costs $2,500 and weighs a pound. Red Grid MGRS puts the same core land navigation capabilities in your pocket — live 10-digit MGRS, magnetic declination, waypoints, bearing and distance — for $3.99. No network required. No data collected. Open source.

---

| Grid & Wayfinder | Tools | Reports | Landscape |
|:---:|:---:|:---:|:---:|
| ![Grid tab](docs/images/screenshot_1_grid.png) | ![Tools tab](docs/images/screenshot_2_tools.png) | ![Reports tab](docs/images/screenshot_3_report.png) | ![Landscape](docs/images/screenshot_4_landscape.png) |

---

## DAGR-Equivalent Features

- **Live MGRS coordinates** — 4/6/8/10-digit precision, 1-meter resolution
- **Magnetic declination** — WMM model, auto or manual offset
- **Waypoint storage** — bearing and distance to any saved position
- **Back azimuth and dead reckoning** — plot movement from a known point
- **Speed, elevation, heading** — real-time sensor display
- **Full offline operation** — zero cloud dependency

## Beyond the DAGR — 8 Tactical Tools

The DAGR hardware doesn't include these. Red Grid MGRS does.

- Back Azimuth calculator
- Dead Reckoning plotter
- Two-point Resection
- Pace Count tracker
- Magnetic Declination reference
- Time-Distance-Speed solver
- Sun & Moon position data
- MGRS Precision selector (1m to 100km)

## 6 Radio-Ready Report Templates

Generate formatted reports ready to transmit over any net:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-Line MEDEVAC request
- SPOT report
- ICS 201 incident briefing
- CASEVAC request
- ANGUS/CFF fire mission

## Pricing

### Standard — $3.99
Live MGRS display, 1 theme, 8 tactical tools, 3 report templates (SALUTE, 9-Line MEDEVAC, SPOT), 1 waypoint.

### Pro Upgrade — $9.99 (one-time in-app purchase)
- **Saved Waypoint Lists** — patrol routes, OBJs, rally points, persisted on device
- **All 6 Report Templates** — Standard includes SALUTE, MEDEVAC, SPOT
- **NATO Voice Readout** — hands-free grid calls using phonetic alphabet
- **4 Display Themes** — red lens, NVG green, day white, blue force
- **Unlimited Waypoints** — no storage limits

No subscription. No recurring charges. One purchase, permanent unlock.

---

## Install

### iOS
[App Store](https://apps.apple.com/app/id6759629554) — $3.99 with optional $9.99 Pro upgrade.

### Android
Coming soon. The codebase is cross-platform (React Native / Expo), and Android builds are functional — we're focusing on iOS polish first, with Android launching once the feature set matures. [Watch this repo](https://github.com/RedGridTactical/RedGridMGRS) or check back for updates.

### Build from Source

```bash
git clone https://github.com/RedGridTactical/RedGridMGRS.git
cd RedGridMGRS
npm install
npx expo start
```

Standard features work from source. Pro features require a valid purchase through Apple or Google.

---

## Privacy

| Data | Collected | Stored | Transmitted |
|------|-----------|--------|-------------|
| GPS location | In memory only | Never | Never |
| Waypoints (Standard) | In memory, cleared on exit | Never | Never |
| Waypoint lists (Pro) | On device only | Local only | Never |
| Settings (pace/declination/theme) | On device only | Local only | Never |
| Device identifiers | Never | Never | Never |

No ad networks. No analytics. No crash reporting. No third-party SDKs.
In-app purchases are processed by Apple — Red Grid MGRS never sees your payment details.

Full policy: [Privacy Policy](https://redgridtactical.github.io/RedGridMGRS/privacy.html) | [PRIVACY.md](PRIVACY.md)

---

## Built For

Military personnel, search and rescue teams, law enforcement, wildland firefighters, first responders, hunters, and backcountry navigators who depend on accurate grid coordinates in austere environments. Whether you trained on a DAGR or a lensatic compass, Red Grid MGRS speaks your language.

---

## Roadmap

> **iOS-first.** We're shipping and polishing on iOS first. Android is cross-platform ready and will launch once the iOS feature set matures.

### v2.1 — Polish (Spring 2026)
- OLED true black display mode
- Typography refinement (SF Pro)
- Refreshed app icon
- ProGate upsell modal fix
- One-hand usability audit
- Smooth tab transitions

### v2.5 — Pro Features (Summer 2026)
- StandBy / HUD mode (iOS StandBy API)
- Photo geostamp (MGRS/DTG burned into image)
- Haptic grid crossing alerts (1km / 100m boundaries)
- Enhanced voice readout (shake or tap trigger)

### v3.0 — Tactical (Fall/Winter 2026)
- MGRS grid overlay map (MapKit)
- Mission planning (waypoints on map, route plotting)
- GPX/KML import and export
- External GPS support (Garmin GLO, Bad Elf via BLE)

### v3.5+ — Platform Ecosystem (2027)
- **iOS:** Live Activity + Dynamic Island, Apple Watch companion, Siri Shortcuts, Widgets
- **Android launch** — full Play Store release with all features from iOS track

---

## Support

- [Report an issue](https://github.com/RedGridTactical/RedGridMGRS/issues)
- [Support page](https://redgridtactical.github.io/RedGridMGRS/support.html)
- Email: redgridtactical@gmail.com

---

## License

[MIT + Commons Clause](LICENSE) — free for personal non-commercial use. Commercial use requires written permission.

---

*Your phone. DAGR capability. No frills. No tracking. Open source.*
