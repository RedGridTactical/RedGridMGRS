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

## Beyond the DAGR — 10 Tactical Tools

The DAGR hardware doesn't include these. Red Grid MGRS does.

- Back Azimuth calculator
- Dead Reckoning plotter
- Two-point Resection
- Pace Count tracker
- Magnetic Declination reference
- Time-Distance-Speed solver
- Sun & Moon position data
- MGRS Precision selector (1m to 100km)
- Elevation & Slope calculator
- Photo Geostamp — burn MGRS + DTG onto any photo (Pro)

## Offline Tactical Maps

Download OpenStreetMap tiles for your area of operations. Dark tactical tiles for low-vis environments. Toggle offline mode to use cached tiles with zero network. Works completely disconnected from any infrastructure. Pro feature.

## Meshtastic Mesh Networking

Share your grid position over LoRa mesh via BLE. See other mesh users in real time. No cell service, no internet, no infrastructure needed — just Meshtastic radios and phones. Pro feature.

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
Live 10-digit MGRS display, 1 theme, 3 tools (Back Azimuth, Pace Count, Declination), 3 report templates (SALUTE, 9-Line MEDEVAC, SPOT), 1 waypoint.

### Pro — 3 tiers
| Tier | Price |
|------|-------|
| Monthly | $3.99/mo |
| Annual | $29.99/yr (best value) |
| Lifetime | $149.99 one-time |

All Pro tiers unlock:
- **10-digit MGRS** — full 1-meter precision for all users
- **All 10 Tactical Tools** — free includes Back Azimuth, Pace Count, Declination
- **All 6 Report Templates** — free includes SALUTE, MEDEVAC, SPOT
- **Offline Tactical Maps** — download OpenStreetMap tiles, dark tactical tiles, zero-network map use
- **Meshtastic Mesh Networking** — share position over LoRa mesh via BLE, see other nodes
- **External GPS** — Garmin GLO, Bad Elf via BLE for enhanced accuracy
- **Mission Planning** — route overlay, leg distances, nearest-neighbor optimization
- **GPX/KML Import & Export** — document picker import, Share sheet export
- **NATO Voice Readout** — hands-free grid calls using phonetic alphabet
- **Shake to Speak** — shake device for hands-free NATO grid readout
- **HUD Mode** — full-screen tactical display with compass and wayfinder
- **Photo Geostamp** — burn MGRS grid + DTG onto any photo, saved to camera roll
- **Grid Crossing Alerts** — haptic feedback at 1km and 100m boundaries
- **Coordinate Formats** — UTM, decimal degrees, DMS on the main grid display
- **FixPhrase** — open-source What3Words alternative
- **4 Display Themes** — red lens, NVG green, day white, blue force
- **Unlimited Waypoints** — saved lists, patrol routes, OBJs, rally points
- **Adjustable Grid Scale** — 0.7x–1.5x MGRS font size
- **6 Languages** — EN, FR, DE, ES, JA, KO

---

## Install

### iOS
[App Store](https://apps.apple.com/app/id6759629554) — Free with optional Pro upgrade ($3.99/mo, $29.99/yr, or $149.99 lifetime).

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

> **iOS live, Android in closed testing.** Cross-platform (React Native/Expo). Full roadmap at [redgridtactical.com/roadmap](https://redgridtactical.com/roadmap.html).

### v1.0 — Foundation ✅ (2026)
- Real-time MGRS coordinates (1m precision), wayfinder arrow, 8 tactical tools, 3 report templates, red-on-black display, zero-network architecture

### v2.0 — Pro Launch ✅ (2026)
- Pro IAP, 4 themes, 6 reports, unlimited waypoints, coordinate formats, magnetic declination, haptics, accessibility

### v2.1 — Polish ✅ (2026)
- Custom grid input, compass heading, waypoint coordinate editing, copy-to-clipboard

### v2.2 — Pro Features ✅ (2026)
- HUD mode, photo geostamp, shake-to-speak, grid crossing alerts, in-app support

### v2.3 — Global Expansion ✅ (2026)
- 3-tier subscriptions, 6-language i18n, 26-locale ASC listings, Android closed testing, startup crash fix

### v2.5 — Interoperability ✅ (2026)
- FixPhrase integration (open-source, patent-free What3Words alternative)
- GPX/KML waypoint export via Share sheet
- Elevation and slope calculator tool (10th tactical tool)
- OLED true black themes (pure #000000)
- [MGRS Tactical Toolkit](https://redgridtactical.github.io/RedGridMGRS/tools.html) — web-based converter, single HTML file, zero dependencies

### v2.6 — Open Source Library ✅ (2026)
- `@redgrid/mgrs` npm package — DMA TM 8358.1 compliant MGRS library
- Standalone conversion, bearing, distance, dead reckoning, FixPhrase
- Zero dependencies, ~15 KB

### v3.0 — Tactical Map ✅ (2026)
- Offline OpenStreetMap tiles (no API key, fully local)
- MGRS grid overlay on map
- Mission planning (waypoints on map, route plotting, nearest-neighbor optimization)
- GPX/KML import
- External GPS support (Garmin GLO, Bad Elf via BLE)
- Meshtastic/LoRa off-grid position sharing

### v3.2 — Polish & Scale ✅ (2026)
- Adjustable grid display scale

### v3.2.1 — Offline Tile Download ✅ (2026)
- Download map tiles for offline use from the map screen
- Toggle offline mode to use cached tiles with zero network
- Dark tile support matching current tactical theme
- Cache indicator and tile count in bottom bar
- Fixed subscription metadata for monthly and annual plans

### v3.2.2 — Free 10-Digit MGRS, Topo Maps ✅ (2026)
- Free tier now includes full 10-digit MGRS (1-meter precision for all users)
- Topographic map layer with contour lines and terrain features (OpenTopoMap)
- Map style toggle: Standard, Dark Tactical, Topographic
- Themed waypoint creation menu (light discipline — no white popups)
- Navigate-to-waypoint from map
- Fixed button overflow in waypoint lists

### v3.5+ — Platform Ecosystem (2027)
- Android public release on Google Play
- iOS Live Activity + Dynamic Island, StandBy mode, Apple Watch, Widgets, Siri Shortcuts

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
