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

Zero. This application makes no network requests of any kind. There is no analytics SDK, no crash reporting service, no ad network, and no update check. In-app purchases use the native Apple StoreKit and Google Play Billing APIs built into the operating system — no third-party purchase SDK is bundled.

You can verify this by inspecting the source code or using a network monitor while running the app.

## Data lifecycle

GPS data flows:
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
           → Deleted when user clears the list
```

## Reporting vulnerabilities

Open an issue on GitHub or contact the maintainer directly at redgridtactical@gmail.com. Please do not publicly disclose security issues before they are addressed.
