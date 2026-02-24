# RedGrid Tactical

A simple, open-source, tactical land navigation utility for iOS and Android.

**No data collected. No network calls. No analytics. No ads.**

---

## Features

- 📍 **Real-time MGRS coordinates** — displays your current Military Grid Reference System position to 1-meter precision
- 🧭 **Waypoint wayfinder** — set a destination MGRS grid and see a directional arrow pointing the way
- 📏 **Distance readout** — straight-line distance to your waypoint in meters or kilometers
- 🔴 **Red-light mode** — full red-on-black display to maintain light discipline in tactical environments
- 🔒 **Privacy-first** — location data never leaves your device, never written to storage, never transmitted
- 📴 **Screen discipline** — follows normal OS screen timeout; wake on tap

---

## Screenshots

> Red-on-black display, monospace military typography, zero clutter.

---

## Installation (Sideload)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [EAS CLI](https://docs.expo.dev/eas/) for building APK/IPA
- For Android sideload: Developer mode enabled, USB debugging on
- For iOS sideload: AltStore or similar, or TestFlight via EAS

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/redgrid-tactical.git
cd redgrid-tactical
npm install
```

### Run in Expo Go (development)

```bash
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/client) on your device.

### Build Android APK (sideloadable)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Download the `.apk` from the EAS build dashboard and install it on your Android device.

### Build iOS IPA

```bash
eas build --platform ios --profile preview
```

Install via AltStore, SideStore, or distribute via TestFlight.

---

## Project Structure

```
redgrid-tactical/
├── App.js                          # Root component, main UI
├── app.json                        # Expo config, permissions
├── src/
│   ├── utils/
│   │   └── mgrs.js                 # MGRS/UTM math (pure JS, no deps)
│   ├── hooks/
│   │   └── useLocation.js          # GPS hook (ephemeral, no storage)
│   └── components/
│       ├── MGRSDisplay.js          # Current position display
│       ├── WayfinderArrow.js       # Animated directional arrow
│       └── WaypointModal.js        # Waypoint entry modal
└── README.md
```

---

## Privacy & Security

- **Location permission**: `ACCESS_FINE_LOCATION` (foreground only)
- **No background location**: The app never requests background location access
- **No storage**: No `AsyncStorage`, no `SQLite`, no file writes
- **No network**: Zero outbound connections — verified by the absence of any `fetch()` or network library calls in the codebase
- **Open source**: Audit every line yourself

---

## Technical Notes

### MGRS Conversion
The MGRS conversion is implemented as pure JavaScript mathematics in `src/utils/mgrs.js`, based on the Defense Mapping Agency Technical Manual DMA TM 8358.1 (Datums, Ellipsoids, Grids, and Grid Reference Systems). No external library dependency.

### Accuracy
GPS accuracy is displayed alongside your grid. Typical civilian GPS provides ±3–10m accuracy. The MGRS coordinate is displayed to 5-digit precision (1m) but accuracy depends on your device's GPS hardware and environmental conditions.

### Screen Timeout
The app respects your device's normal screen timeout. This is intentional — it reduces battery drain and light emissions. Wake the screen with a tap or button press to view your coordinates.

---

## Building for Distribution

### eas.json

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

---

## License

MIT License — free to use, modify, and distribute.

---

## Contributing

PRs welcome. Keep it simple. No telemetry. No bloat.

---

*Built for the field. Zero frills.*
