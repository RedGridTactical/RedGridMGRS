# Reddit Posts — Red Grid MGRS Launch Day

Copy-paste these into each subreddit. Each is tailored to the audience.

---

## 1. r/reactnative

**Title:** I built a DAGR-class GPS navigator with React Native + Expo — 15k lines of JS, zero network calls, free on the App Store

**Body:**

I'm a paratrooper in an Airborne Division. The military's standard GPS navigator (the DAGR) costs $2,500 and has a UI from 2003. I rebuilt its core land navigation features as a React Native app.

**Stack:** React Native 0.76, Expo SDK 52, pure JavaScript (~15,000 lines), hooks-based, zero class components, AsyncStorage for persistence.

**The interesting technical bits:**

- MGRS coordinate conversion using the DMA (Defense Mapping Agency) algorithm — transverse Mercator projection on the WGS84 ellipsoid, with the full chain: lat/long -> UTM -> MGRS and inverse
- Vincenty formula for bearing/distance (not haversine — sub-mm accuracy on the ellipsoid)
- WMM 2025 magnetic declination model (same model the DoD uses)
- Compass-relative wayfinder arrow using magnetometer heading + accumulated rotation deltas to avoid the 359/1 degree snap problem
- Zero-network architecture: the app makes zero HTTP requests during normal operation. GPS coordinates exist in memory only, never written to disk or transmitted. Even IAP is a one-shot event that persists locally.

The entire app works identically in airplane mode. The only external input is GPS satellites.

Full technical writeup: https://dev.to/redgridtactical/how-i-built-a-military-grade-gps-app-with-react-native-zero-cloud-zero-tracking-399-2klf

Source code (MIT + Commons Clause): https://github.com/RedGridTactical/RedGridMGRS

App Store: https://apps.apple.com/app/id6759629554

Happy to answer questions about the MGRS math, the offline-first architecture, or shipping a niche Expo app on the App Store.

---

## 2. r/army

**Title:** I got tired of signing for a DAGR just to get a grid, so I built a free app that does the same thing

**Body:**

I'm in an Airborne unit. Between the DAGR and ATAK, I've used both enough to know what works and where they fall short for day-to-day land nav.

The DAGR gives you an MGRS grid, magnetic declination, bearing/distance to waypoints, and speed/heading. That's 90% of what we use it for. The SAASM module matters downrange, but for training, JRTCs, STXs, and anything in a permissive GPS environment — your phone's GPS chip works fine.

So I built Red Grid MGRS. It does:

- Live 10-digit MGRS (1-meter precision)
- WMM 2025 magnetic declination (auto or manual)
- Waypoint storage with bearing/distance and a wayfinder arrow
- Back azimuth, dead reckoning, two-point resection
- Pace count tracker
- SALUTE, 9-Line MEDEVAC, SPOT, CASEVAC, CFF report templates — fill and copy
- Works completely offline, no account, no data collection

Free to download, affordable one-time Pro upgrade for unlimited waypoints, all report templates, NATO voice readout, and extra display themes (red lens, NVG green, etc.)

No subscription. No tracking. Your position data never leaves your phone.

I built this for the E-2 who's tired of fighting the DAGR's button interface and the team leader who wants to plot waypoints before a ruck without signing for anything at the arms room.

App Store: https://apps.apple.com/app/id6759629554
Source code: https://github.com/RedGridTactical/RedGridMGRS

Android coming soon — iOS first while I polish it.

---

## 3. r/military

**Title:** The DAGR costs $2,500 and weighs a pound. I rebuilt its core land nav features as a free phone app.

**Body:**

I'm a paratrooper. I've used the DAGR (AN/PSN-13) and ATAK on enough field problems to know that 90% of DAGR usage is in scenarios where civilian GPS works fine — training, domestic ops, permissive environments.

The DAGR's software side isn't complex. The algorithms are public domain. The sensor hardware exists in every modern smartphone. So I built it.

Red Grid MGRS gives you:

- Live MGRS coordinates (4/6/8/10-digit)
- Magnetic declination (WMM 2025, same model DoD uses)
- Waypoints with bearing, distance, and a compass-relative wayfinder arrow
- 8 tactical tools: back azimuth, dead reckoning, resection, pace count, time-distance-speed, sun/moon data
- 6 report templates: SALUTE, 9-Line MEDEVAC, SPOT, CASEVAC, ICS 201, CFF

Zero network calls. Your GPS coordinates exist in memory only — never stored, never transmitted. It works in airplane mode, in a Faraday cage, on a mountain with no cell service.

Free with an affordable one-time Pro upgrade. No subscription.

I'm not trying to replace the DAGR — SAASM matters in contested environments. But for the other 90% of the time, this does the job without the arms room hassle.

Open source: https://github.com/RedGridTactical/RedGridMGRS
App Store: https://apps.apple.com/app/id6759629554

---

## 4. r/privacy

**Title:** I built a GPS navigation app with zero-network architecture — no analytics, no tracking, no accounts, no data collection. Here's how.

**Body:**

Most apps treat privacy as a policy document. I treated it as an architecture constraint.

Red Grid MGRS is a tactical GPS navigator (MGRS coordinates, waypoints, compass bearing). The rule I set from day one: **the app makes zero network requests during normal operation.**

Here's what that means technically:

- GPS coordinates and compass heading exist in memory only while the app is running — never written to disk, never transmitted
- Free-tier waypoints live in memory and are cleared when you close the app
- Pro waypoints and settings are persisted on-device via AsyncStorage but never leave the phone
- Device identifiers are never collected
- No analytics SDK. No crash reporting. No third-party SDKs of any kind.
- No auth system — no accounts, no passwords, no OAuth
- No backend — no servers, no databases, no API calls
- The app doesn't know or care about network status

The only network call that ever happens is the one-shot in-app purchase through Apple's StoreKit. After that, the unlock flag is stored locally and never validated against a server. A determined user could spoof it — that's an acceptable tradeoff for zero-network operation on a free app.

The entire app is a self-contained bundle. It works identically in airplane mode.

This also eliminated entire categories of engineering work: no auth flows, no token refresh, no sync conflicts, no loading states for network, no GDPR/CCPA compliance burden (can't violate data regulations if you never collect data).

For context: the app is a military-grade land navigation tool used by soldiers, SAR teams, and backcountry navigators. For a position-aware app, zero-network isn't just privacy — it's operational security.

Source code (so you can verify the claims): https://github.com/RedGridTactical/RedGridMGRS
App Store: https://apps.apple.com/app/id6759629554
Full technical writeup: https://dev.to/redgridtactical/how-i-built-a-military-grade-gps-app-with-react-native-zero-cloud-zero-tracking-399-2klf

---

## 5. r/SideProject

**Title:** I'm a paratrooper who built a free app that replaces a $2,500 military GPS — live on the App Store

**Body:**

**What:** Red Grid MGRS — a tactical GPS navigator that gives you military grid coordinates (MGRS), magnetic declination, waypoints, and land navigation tools. Think of it as the software side of the military's $2,500 DAGR GPS receiver, rebuilt as a phone app.

**Why:** I'm in an Airborne Division. The DAGR is great hardware, but the software portion is straightforward — public domain algorithms, well-documented math. I got tired of signing one out from the arms room just to get a grid coordinate during training.

**Stack:** React Native + Expo, pure JavaScript, ~15,000 lines. Zero backend, zero analytics, zero tracking. The app makes no network calls during normal operation.

**Business model:** Free to download + affordable one-time Pro upgrade. No subscription. Open source (MIT + Commons Clause).

**Where I'm at today:**
- iOS App Store: live
- Hacker News: front page of /new
- Dev.to: technical writeup published
- Android: cross-platform ready, launching after iOS matures

The niche is small (military, SAR, backcountry nav) but underserved. There's no good MGRS app that actually speaks the military's coordinate language.

Links:
- App Store: https://apps.apple.com/app/id6759629554
- GitHub: https://github.com/RedGridTactical/RedGridMGRS
- Dev.to writeup: https://dev.to/redgridtactical/how-i-built-a-military-grade-gps-app-with-react-native-zero-cloud-zero-tracking-399-2klf

---

## 6. r/indiehackers

**Title:** Launched my first app — free military GPS navigator, zero backend, open source. Here's the full breakdown.

**Body:**

**The product:** Red Grid MGRS — a tactical GPS app that shows Military Grid Reference System coordinates, magnetic declination, waypoints with bearing/distance, and 8 land navigation tools. It's the software equivalent of the military's $2,500 DAGR GPS receiver.

**Background:** I'm a paratrooper. I use the DAGR and ATAK in the field. The DAGR's software is not complex — the algorithms are public domain. I rebuilt it as a phone app.

**The numbers:**
- Free to download
- affordable one-time Pro upgrade (no subscription)
- ~15,000 lines of JavaScript
- Zero monthly costs (no backend, no servers, no analytics)
- Development time: a few weeks of focused work

**Why zero backend matters for the business:**
- $0/month infrastructure cost
- No auth system to maintain
- No data breach liability
- No GDPR/CCPA compliance burden
- Revenue = App Store sales minus Apple's cut. That's it.

The tradeoff: no server-side receipt validation means a determined user could spoof the Pro unlock. But server infrastructure would cost more than the revenue it protects. Rational economics.

**Launch day (today):**
- iOS App Store: live
- Hacker News: submitted the Dev.to technical writeup
- Dev.to: https://dev.to/redgridtactical/how-i-built-a-military-grade-gps-app-with-react-native-zero-cloud-zero-tracking-399-2klf

**Open source:** MIT + Commons Clause — free for personal use, commercial use requires permission. Pro features still require App Store purchase, so the code being public doesn't cannibalize revenue.

App Store: https://apps.apple.com/app/id6759629554
GitHub: https://github.com/RedGridTactical/RedGridMGRS

Happy to share more details on pricing strategy, the zero-backend architecture, or shipping a niche app.
