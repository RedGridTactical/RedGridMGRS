---
title: How I Built a Military-Grade GPS App with React Native — Zero Cloud, Zero Tracking, Free
published: false
description: I'm a paratrooper in an Airborne Division. I rebuilt the DAGR's core functionality as an open-source phone app. Here's the technical deep dive.
tags: reactnative, opensource, mobile, gps
---

I'm a paratrooper in an Airborne Division. I've used the DAGR and ATAK on many field problems. The military's standard GPS navigator costs $2,500. I rebuilt its core functionality as an open-source phone app. Here's the technical deep dive into MGRS math, the zero-network privacy architecture, and what this says about the defense industry's relationship with software.

## Part 1: The $2,500 Problem

I've spent more time than I'd like to admit staring at a DAGR screen trying to understand how to make it work. The AN/PSN-13 Defense Advanced GPS Receiver, manufactured by Rockwell Collins (now L3Harris), costs the Department of Defense approximately $2,500 per unit. It weighs a pound. Its interface looks like a graphing calculator from 2003. And every time I sign one out from the arms room, I think about how the phone in my pocket has a better GPS chip, a better screen, and a better processor — but no app that speaks MGRS.

Between the DAGR for grid coordinates and ATAK (Android Team Awareness Kit or Android Tactical Assault Kit) for situational awareness, I've used these tools enough to know exactly what I need in the field and exactly where they fall short. The DAGR gives you an MGRS grid, magnetic declination, bearing and distance to waypoints, and speed/heading. That's it for 90% of use cases.

I'm not knocking the DAGR — it has SAASM (Selective Availability Anti-Spoofing Module) for GPS-denied and spoofed environments, which is a genuine military necessity that civilian devices can't replicate. But the vast majority of DAGR usage I see — in training, domestic ops, JRTCs, and permissive environments — is in scenarios where civilian L1/L5 GPS works just fine.

The software side of what a DAGR does is not complex. The math is public domain. The algorithms are well-documented. The sensor hardware exists in every modern smartphone. So I built it.

**Red Grid MGRS** — open source, free to download, ships the same core land navigation capabilities as a device that costs $2,500.

## Part 2: The Technical Deep Dive

### Stack

* React Native 0.76 + Expo SDK 52
* JavaScript only — no TypeScript, ~15,000 lines
* Hooks-based architecture, zero class components
* State management: React hooks + AsyncStorage
* Location: expo-location (GPS + magnetometer for compass heading)
* In-app purchases: expo-iap
* Zero native code — pure Expo managed workflow

### The Interesting Math: MGRS Conversion

The Military Grid Reference System is the most technically interesting piece. MGRS is how NATO forces communicate positions — a grid like 18S UJ 12345 67890 encodes a position to 1-meter precision anywhere on Earth.

Breaking that down:

* **18S** — Grid Zone Designation (UTM zone number + latitude band letter)
* **UJ** — 100km square identifier within that zone
* **12345 67890** — easting and northing within the 100km square

Converting from GPS (lat/long in WGS84) to MGRS requires a three-step chain:

#### Step 1: Lat/Long → UTM

This is a transverse Mercator projection on the WGS84 ellipsoid. The implementation uses the DMA (Defense Mapping Agency) algorithm — the same reference implementation the actual DAGR firmware uses. The key computations involve:

* Meridional arc length (distance along a meridian from the equator)
* Radius of curvature in the prime vertical
* A series expansion of the projection equations using the ellipsoid's eccentricity

The DMA algorithm handles edge cases like zone boundary overlaps and the special zones at high latitudes (Svalbard, Norway).

#### Step 2: UTM → MGRS

Once you have UTM easting/northing, the 100km square identifier is computed via a lookup table. The column letter pattern repeats every 6 UTM zones, and the row letter pattern repeats every 2,000,000 meters of northing. Then truncate the easting/northing to the desired precision (1m, 10m, 100m, 1km, or 10km).

#### Step 3: Inverse — MGRS → Lat/Long

The waypoint system needs this. When a user enters a grid coordinate, we reverse the entire chain to get lat/long, then compute bearing and distance from the user's current position. The inverse UTM→Lat/Long conversion uses an iterative approach starting from the footpoint latitude.

### Geodetic Calculations

The bearing/distance engine uses the Vincenty formula on the WGS84 ellipsoid — not the simplified haversine (which assumes a sphere). Vincenty is accurate to sub-millimeter precision at any distance, which matters when you're navigating with 1-meter grid precision.

Two tools showcase this:

**Dead Reckoning:** Given a known starting grid, a magnetic bearing, and a distance — compute the estimated new position. Uses the Vincenty direct formula, with magnetic declination applied to convert the magnetic bearing to true before computation.

**Two-Point Resection:** Given magnetic bearings to two known grid coordinates, compute your position at the intersection. Classic land navigation technique, automated.

### Compass Heading for the Wayfinder Arrow

The wayfinder arrow was the trickiest UI problem. It needs to point toward a saved waypoint relative to the direction the user is facing — not just show an absolute compass bearing.

The math: `arrowAngle = ((trueBearing - deviceHeading) + 360) % 360`

Where `trueBearing` is the geodetic bearing to the waypoint (from Vincenty), and `deviceHeading` comes from the magnetometer via `Location.watchHeadingAsync()`. The arrow uses `Animated.timing` with accumulated rotation deltas to avoid the 359°→1° snap problem — the interpolation uses shortest-path rotation with `extrapolate: 'extend'` so accumulated values beyond ±360° still render correctly (CSS rotation wraps naturally).

### The WMM Magnetic Model

Magnetic declination — the offset between true north and magnetic north — varies by location and changes over time. The app uses the World Magnetic Model (WMM 2025), the same model used by the U.S. Department of Defense and NATO. It provides auto-calculated declination based on your GPS position, or lets you enter a manual offset for areas where the model may be less accurate.

## Part 3: Zero-Network Architecture — A Privacy Case Study

Most apps treat privacy as a policy document. Red Grid MGRS treats it as an architecture constraint. The rule is simple: the app makes zero network requests during normal operation.

Your GPS coordinates and compass heading exist in memory only while the app is running — they're never written to disk and never transmitted anywhere. Free-tier waypoints live in memory and are cleared when you close the app. Pro waypoint lists and user settings (theme, pace length, declination) are persisted on-device via AsyncStorage but never leave the phone. Device identifiers are never collected. There are no usage analytics and no crash reports — the app has no mechanism to send data anywhere, period.

### Why This Matters Beyond Privacy

For a tactical navigation tool, zero-network isn't just a privacy feature — it's an operational security (OPSEC) feature. A position-aware app that phones home is a liability. Your GPS coordinates, movement patterns, and waypoints are sensitive data in any field context — military, law enforcement, SAR, or wildland fire.

But the zero-network constraint also simplified everything from an engineering standpoint:

* **No auth system.** No accounts, no passwords, no OAuth flows, no token refresh.
* **No backend.** No servers, no databases, no API versioning, no rate limiting.
* **No sync conflicts.** Data lives on one device. No merge logic.
* **No loading states (for network).** Everything renders immediately from local data.
* **No error handling for connectivity.** The app doesn't know or care about network status.
* **No GDPR/CCPA compliance burden.** You can't violate data regulations if you never collect data.

The entire app is a self-contained bundle. It works identically in airplane mode, in a Faraday cage, or on a mountain with no cell service. The only external input is GPS satellites.

### The IAP Architecture

The one place where a network call is unavoidable is in-app purchases. The solution: treat IAP as a one-shot event that persists locally.

1. User initiates purchase → StoreKit handles the transaction with Apple
2. On success, write `rg_pro_unlocked = true` to AsyncStorage
3. On every app launch, check AsyncStorage — if true, unlock Pro features
4. Restore purchases reads from StoreKit receipt and re-writes to AsyncStorage

The app never validates receipts against a server. A determined user could spoof the AsyncStorage flag — and that's an acceptable tradeoff for maintaining zero-network operation. The app is free. Server-side receipt validation would cost more to maintain than the revenue it would protect.

## Part 4: The Business Reality

### What You Get

**Free:** Live MGRS display, 1 display theme, all 8 tactical tools, 3 report templates (SALUTE, 9-Line MEDEVAC, SPOT), 1 waypoint.

**Pro:** Unlimited waypoint lists, all 6 report templates, NATO voice readout, coordinate format selector (UTM/DD/DMS), 4 display themes (red lens, NVG green, day white, blue force), offline maps, Meshtastic mesh, external GPS, mission planning, and more. Monthly, annual, or lifetime options available.

### The Pricing Philosophy

I could have charged $19.99 or $29.99 and it would still be 99% cheaper than a DAGR. But I'm building this for the guys I serve with — the E-2 who's tired of signing for a DAGR at the arms room just to get a grid during land nav, the team leader who wants to plot waypoints before a ruck without fighting the DAGR's button interface, and the SAR volunteer who needs real grid coordinates but doesn't have a $2,500 budget.

The app is free. The Pro upgrade costs less than a month of most app subscriptions, with monthly, annual, and lifetime options.

### Why Open Source

The codebase is **MIT + Commons Clause** — free for personal non-commercial use. The math shouldn't be locked up. If someone wants to learn how MGRS conversion works, or how to build an offline-first location app with React Native, the code is there.

Pro features still require a valid App Store purchase, so the revenue model is intact even with the source available.

### What This Says About Defense Tech

The DAGR costs $2,500 not because the software is complex — it costs $2,500 because of SAASM hardware, MIL-SPEC ruggedization, ITAR export compliance, and a defense procurement pipeline that doesn't optimize for cost. The software side of what a DAGR does can be replicated by one developer in a few weeks using free, public-domain algorithms.

That's not a criticism of the DAGR — SAASM is genuinely critical for contested environments. But it raises a question: how many other military tools have a software component that could be rebuilt as a phone app?

ATAK proved that a phone app can become a mission-critical military tool — it started as a research project and is now standard kit across SOF and conventional units. But ATAK is situational awareness. There's still a gap for the bread-and-butter land nav tools that every soldier learns in basic: plot a grid, shoot an azimuth, pace count to an objective, call in a MEDEVAC, SALUTE report, etc. That's the gap Red Grid MGRS fills.

The military is full of outdated, overpriced systems where the software portion is trivial compared to the hardware and compliance overhead. The algorithms are public. The sensor hardware is in every phone. The frameworks are mature. As someone who uses these tools in the field, my hope is that this project sparks some genuine innovation — not to replace SAASM-capable hardware, but to give warfighters better tools for the 90% of scenarios where they don't need it. The guys carrying these tools downrange deserve better than a UI from 2003.

## Try It

* **iOS App Store:** Free with optional Pro upgrade
* **Source Code:** [github.com/RedGridTactical/RedGridMGRS](https://github.com/RedGridTactical/RedGridMGRS)
* **Android:** Coming soon — codebase is cross-platform, iOS-first for now

If you've ever stared at a DAGR and wished it cost less than a pair of jump boots, or if you do any kind of land navigation and want real grid coordinates instead of a blue dot on a map — give it a look.
