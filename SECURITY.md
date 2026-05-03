# Security & Privacy

## What this app does with your data

| Data Type | Collected | Stored | Transmitted |
|-----------|-----------|--------|-------------|
| GPS coordinates | In-memory only | ❌ Never | ❌ Never |
| Waypoints (free tier) | In-memory only, cleared on exit | ❌ Never | ❌ Never |
| Waypoint lists (Pro) | On device only | ✅ Local only | ❌ Never |
| Settings (declination, pace count, theme) | On device only | ✅ Local only | ❌ Never |
| Device identifiers | ❌ Never | ❌ Never | ❌ Never |
| Payment details | ❌ Never — handled by Apple/Google | ❌ Never | ❌ Never |

## Permissions requested

| Permission | Why | When |
|------------|-----|------|
| `ACCESS_FINE_LOCATION` (Android) | Display MGRS grid | Foreground only |
| `NSLocationWhenInUseUsageDescription` (iOS) | Display MGRS grid | When app is open |

**No background location is requested or used.**

## Network activity

No analytics SDK, no crash reporting service, no ad network, no attribution SDK, no update check, no account, no cloud sync. The application contains no third-party identifiers and never transmits location, settings, or waypoint data anywhere.

The only network calls the app makes are:

- **Map tile downloads** — only when you tap "Download tiles for offline" or interact with the map online. Tiles are fetched from public OpenStreetMap-style endpoints (OpenStreetMap, CARTO, OpenTopoMap). Tile requests look identical to any other map app: your IP and the requested tile coordinates are visible to the tile server. No personal data is sent.
- **In-app purchases** — Apple StoreKit (iOS) and Google Play Billing (Android) handle purchase flows directly with the operating system; no third-party purchase SDK is bundled and the app never sees your payment details.

You can verify this by inspecting the source code or using a network monitor while running the app.

## Data lifecycle

GPS data:
```
Device GPS → expo-location → React state → Display → Garbage collected on exit
```

Free tier waypoints:
```
User input → React state → Display → Garbage collected on exit
```

Pro waypoint lists:
```
User input → AsyncStorage (device only) → Display
           → Permanently deleted when user clears the list
```

## Reporting vulnerabilities

Email: support@redgridtactical.com
GitHub: https://github.com/RedGridTactical/RedGridMGRS/issues

Please do not publicly disclose security issues before they are addressed.
