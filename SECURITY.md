# Security & Privacy

## What this app does with your data

| Data Type | Collected | Stored | Transmitted |
|-----------|-----------|--------|-------------|
| GPS coordinates | In-memory only | ❌ Never | ❌ Never |
| Waypoints | In-memory only | ❌ Never | ❌ Never |
| Device identifiers | ❌ Never | ❌ Never | ❌ Never |

## Permissions requested

| Permission | Why | When |
|------------|-----|------|
| `ACCESS_FINE_LOCATION` (Android) | Display MGRS grid | Foreground only |
| `NSLocationWhenInUseUsageDescription` (iOS) | Display MGRS grid | When app is open |

**No background location is requested or used.**

## Network activity

Zero. This application makes no network requests of any kind. There is no analytics SDK, no crash reporting service, no ad network, and no update check. You can verify this by inspecting the source code or using a network monitor while running the app.

## Data lifecycle

GPS data flows:
```
Device GPS → expo-location → React state → Display → Garbage collected
```

When you close the app, all data is gone. When you clear a waypoint, it is gone. Nothing is written anywhere.

## Reporting vulnerabilities

Open an issue on GitHub or contact the maintainer directly. Please do not publicly disclose security issues before they are addressed.
