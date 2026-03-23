![Red Grid MGRS](docs/images/banner.png)

# Red Grid MGRS

**DAGR-Class MGRS Navigator**

[![App Store](https://img.shields.io/badge/App%20Store-Download-8B0000?logo=apple)](https://apps.apple.com/app/id6759629554)
[![Google Play](https://img.shields.io/badge/Google%20Play-Coming%20Soon-555555?logo=googleplay)](#android)
[![License](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-8B0000)](LICENSE)
[![No Tracking](https://img.shields.io/badge/Tracking-None-CC0000)](PRIVACY.md)
[![GitHub stars](https://img.shields.io/github/stars/RedGridTactical/RedGridMGRS)](https://github.com/RedGridTactical/RedGridMGRS/stargazers)

> ⭐ If you find this useful, consider [starring the repo](https://github.com/RedGridTactical/RedGridMGRS) — it helps others discover it.

The military's DAGR (AN/PSN-13) costs $2,500 and weighs a pound. Red Grid MGRS puts the same core land navigation capabilities in your pocket — live 10-digit MGRS, magnetic declination, waypoints, bearing and distance — for free. No network required. No data collected. Open source.

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

## Beyond the DAGR — 9 Tactical Tools

The DAGR hardware doesn't include these. Red Grid MGRS does.

- Back Azimuth calculator
- Dead Reckoning plotter
- Two-point Resection
- Pace Count tracker
- Magnetic Declination reference
- Time-Distance-Speed solver
- Sun & Moon position data
- MGRS Precision selector (1m to 100km)
- Photo Geostamp — burn MGRS + DTG onto any photo (Pro)

## 6 Radio-Ready Report Templates

Generate formatted reports ready to transmit over any net:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-Line MEDEVAC request
- SPOT report
- ICS 201 incident briefing
- CASEVAC request
- ANGUS/CFF fire mission

## Pricing

### Free
Live MGRS display, 1 theme, 8 tactical tools, 3 report templates (SALUTE, 9-Line MEDEVAC, SPOT), 1 waypoint.

### Pro Upgrade — $9.99 (one-time in-app purchase)
- **Saved Waypoint Lists** — patrol routes, OBJs, rally points, persisted on device
- **All 6 Report Templates** — Standard includes SALUTE, MEDEVAC, SPOT
- **NATO Voice Readout** — hands-free grid calls using phonetic alphabet
- **Shake to Speak** — shake device for hands-free NATO grid readout
- **HUD Mode** — full-screen tactical display with compass and wayfinder
- **Photo Geostamp** — burn MGRS grid + DTG onto any photo, saved to camera roll
- **Grid Crossing Alerts** — haptic feedback at 1km and 100m boundaries
- **Coordinate Formats** — UTM, decimal degrees, DMS on the main grid display
- **4 Display Themes** — red lens, NVG green, day white, blue force
- **Unlimited Waypoints** — no storage limits

No subscription. No recurring charges. One purchase, permanent unlock.

---

## Install

### iOS
[App Store](https://apps.apple.com/app/id6759629554) — Free with optional $9.99 Pro upgrade.

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

## Need Team Tracking?

**[Red Grid Link](https://github.com/RedGridTactical/RedGridLink)** adds encrypted peer-to-peer team sync to the same MGRS engine. Your whole team shows up on the map over Bluetooth. No servers, no cell service. Team roles, boundary alerts, waypoint sharing, NATO voice callouts. Free on [iOS](https://apps.apple.com/app/red-grid-link/id6760084718).

> Red Grid MGRS = solo navigator. Red Grid Link = team coordinator. Same engine, same precision.

---

## Built For

Military personnel, search and rescue teams, law enforcement, wildland firefighters, first responders, hunters, and backcountry navigators who depend on accurate grid coordinates in austere environments. Whether you trained on a DAGR or a lensatic compass, Red Grid MGRS speaks your language.

---

## Roadmap

> **iOS-first.** We're shipping and polishing on iOS first. Android is cross-platform ready and will launch once the iOS feature set matures.

### v2.1 — Polish ✅ (Shipped March 2026)
- ~~OLED true black display mode~~ ✅
- ~~Typography refinement (SF Pro)~~ ✅
- ~~Refreshed app icon~~ ✅
- ~~ProGate upsell modal~~ ✅
- ~~6-tab bottom navigation~~ ✅
- ~~Coordinate format selector (UTM/DD/DMS)~~ ✅
- ~~Wayfinder arrow compass heading~~ ✅

### v2.5 — Pro Features ✅ (March 2026)
- ~~HUD mode — full-screen tactical display~~ ✅
- ~~Photo geostamp (MGRS/DTG burned into image)~~ ✅
- ~~Haptic grid crossing alerts (1km / 100m boundaries)~~ ✅
- ~~Shake-to-speak voice readout~~ ✅

### v3.0 — Tactical (Fall/Winter 2026)
- MGRS grid overlay map (MapKit)
- Mission planning (waypoints on map, route plotting)
- Photo geostamp map inset (topo layer via MapKit snapshot)
- GPX/KML import and export
- External GPS support (Garmin GLO, Bad Elf via BLE)

### v3.5+ — Platform Ecosystem (2027)
- **iOS:** Live Activity + Dynamic Island, Apple Watch companion, Siri Shortcuts, Widgets
- **Android launch** — full Play Store release with all features from iOS track

---

## Support

- [Report an issue](https://github.com/RedGridTactical/RedGridMGRS/issues)
- [Support page](https://redgridtactical.github.io/RedGridMGRS/support.html)
- Email: support@redgridtactical.com

---

## Red Grid Tactical Ecosystem

| App | Purpose | Platform | Link |
|-----|---------|----------|------|
| **Red Grid MGRS** | Solo MGRS navigator (DAGR-class) | iOS | [GitHub](https://github.com/RedGridTactical/RedGridMGRS) · [App Store](https://apps.apple.com/app/id6759629554) |
| **Red Grid Link** | Team coordination + encrypted sync | iOS | [GitHub](https://github.com/RedGridTactical/RedGridLink) · [App Store](https://apps.apple.com/app/red-grid-link/id6760084718) |

Website: [redgridtactical.com](https://redgridtactical.com)

---

## License

[MIT + Commons Clause](LICENSE) — free for personal non-commercial use. Commercial use requires written permission.

---

*Your phone. DAGR capability. No frills. No tracking. Open source.*
