![RedGrid Tactical](docs/images/banner.png)

# RedGrid Tactical

[![Download on App Store](https://img.shields.io/badge/App%20Store-Coming%20Soon-8B0000?logo=apple)](https://github.com/RedGridTactical/RedGridMGRS/releases/latest)
[![Download APK](https://img.shields.io/github/v/release/RedGridTactical/RedGridMGRS?label=Android%20APK&color=CC0000&logo=android)](https://github.com/RedGridTactical/RedGridMGRS/releases/latest)
[![License](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-8B0000)](LICENSE)
[![No Tracking](https://img.shields.io/badge/Tracking-None-CC0000)](PRIVACY.md)
[![Support](https://img.shields.io/badge/Support-Buy%20Me%20a%20Coffee-CC0000?logo=buymeacoffee)](https://buymeacoffee.com/redgridtac0)

**A tactical land navigation utility for iOS and Android.**

Red-light display. MGRS coordinates. Wayfinder. 8 field tools. 3 radio report templates.
Zero network. Zero tracking. Open source.

---

| Grid & Wayfinder | Tools | Reports | Landscape |
|:---:|:---:|:---:|:---:|
| ![Grid tab](docs/images/screenshot_1_grid.png) | ![Tools tab](docs/images/screenshot_2_tools.png) | ![Reports tab](docs/images/screenshot_3_report.png) | ![Landscape](docs/images/screenshot_4_landscape.png) |

---

## Free Features

- **Real-time MGRS** — live position to 1-meter precision
- **Wayfinder arrow** — bearing and distance to any waypoint, declination-corrected
- **8 tactical tools** — Dead Reckoning, Resection, Back Azimuth, Pace Count, Declination, TDS, Solar/Lunar, MGRS Precision
- **3 radio report templates** — SALUTE, 9-Line MEDEVAC, SPOT — grid auto-filled
- **Red-light mode** — red-on-black display, no white light emission
- **Landscape support** — two-column layout

## RedGrid Pro — $4.99 one-time

- 📍 **Saved Waypoint Lists** — save named patrol routes, OBJs, rally points — persisted locally on device
- 📋 **Additional Report Templates** — ICS 201 Incident Command, CASEVAC
- 🎨 **Display Themes** — NVG green, day white, blue-force colour schemes
- 🌐 **Coordinate Formats** — switch between MGRS, UTM, Decimal Degrees, DMS

No subscription. No recurring charges. One purchase, permanent unlock. All future Pro features included.

---

## Install

### iOS — App Store *(Coming Soon)*
A paid one-time App Store version is in development. No subscription. No ads.

**Free sideload via AltStore:**
1. Install AltStore from [altstore.io](https://altstore.io) on your Mac or PC
2. Connect iPhone → install AltStore via desktop app
3. Download `RedGrid-Tactical.ipa` from [Releases](https://github.com/RedGridTactical/RedGridMGRS/releases/latest)
4. Open AltStore → **+** → select the `.ipa`
5. AltStore re-signs every 7 days automatically on same Wi-Fi

### Android — Direct APK
1. Download `RedGrid-Tactical.apk` from [Releases](https://github.com/RedGridTactical/RedGridMGRS/releases/latest)
2. Open the file → tap **Settings** if prompted → enable **Install from this source**
3. Tap **Install** → grant **"While using the app"** location permission

---

## Organizational & Commercial Use

Organizations deploying RedGrid Tactical across multiple devices or integrating it into a paid product require a commercial license.

**Contact:** redgridtactical@gmail.com

Individual personal use is always free.

---

## Support the Project

☕ [**Buy Me a Coffee**](https://buymeacoffee.com/redgridtac0)
💛 [**GitHub Sponsors**](https://github.com/sponsors/RedGridTactical)

---

## Privacy

| Data | Collected | Stored | Transmitted |
|------|-----------|--------|-------------|
| GPS location | In memory only | ❌ Never | ❌ Never |
| Waypoints (free) | In memory only, cleared on exit | ❌ Never | ❌ Never |
| Waypoint lists (Pro) | On device only | ✅ Local only | ❌ Never |
| Pace count / Declination / Theme | On device only | ✅ Local only | ❌ Never |
| Device identifiers | ❌ Never | ❌ Never | ❌ Never |

No ad networks. No analytics. No crash reporting. No third-party SDKs.
In-app purchases are processed by Apple or Google — RedGrid Tactical never sees your payment details.
Full details in [PRIVACY.md](PRIVACY.md).

---

## Build from Source

```bash
git clone https://github.com/RedGridTactical/RedGridMGRS.git
cd RedGridMGRS
npm install
npx expo start
```

All free features work immediately from source. Pro features require a valid purchase through Apple or Google.

---

## License

[MIT + Commons Clause](LICENSE) — free for personal non-commercial use. Commercial use requires written permission.
Contact: redgridtactical@gmail.com

---

*Built for the field. No frills. No tracking. Open source.*
