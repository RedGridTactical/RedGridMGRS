# Red Grid MGRS - Standout Feature Roadmap

Research date: 2026-05-03  
Scope: feature strategy, competitor research, monetization fit, and cross-reference against the existing README/store/audit roadmap and current codebase.

## Strategic Thesis

Red Grid MGRS should not try to become a full TAK clone, a general hiking app, a cloud mapping platform, or the team-coordination app in the Red Grid family. The standout lane is narrower and stronger:

> The private, offline-first solo navigator for field operators who need MGRS, mission packaging, mesh/off-grid awareness, and interoperability without accounts or tracking.

Competitors tend to cluster in three lanes:

- Heavy team awareness: iTAK/TAK, ATAK, TAK Server workflows.
- Professional offline mapping/data import: Avenza, CalTopo, Gaia, onX.
- Military/MGRS utility apps: Tactical NAV, MilGPS, Land Nav, MGRS & UTM Map.

Red Grid can stand out by combining a low-friction MGRS field UI with Meshtastic-adjacent position awareness, report packaging, file-based interoperability, and trust-first privacy. That combination is rare.

## Product Boundary: MGRS vs Link

Red Grid MGRS and Red Grid Link should remain clearly separate products.

| Belongs In Red Grid MGRS | Belongs In Red Grid Link |
| --- | --- |
| Solo navigation | Team awareness and coordination |
| Current grid, bearing, distance, route card | Shared team map |
| Offline AO preflight for one operator | Team mission setup and synchronized shared operating picture |
| Local waypoint lists and route planning | Shared waypoints, tasking, roles, permissions |
| Export/import via GPX/KML/KMZ/CoT/files | Live collaboration, sync, messaging, AAR |
| Meshtastic device connection and nearby node awareness for the solo operator | Managed team tracking, group sessions, team comms |
| Reports filled by one user and exported/handoff-ready | Multi-user incident/team workflow |
| Watch/widget/shortcut companion for one user | Coordinator dashboard and team state |

Rule of thumb:

- MGRS helps one person know where they are, where they are going, what they have observed, and how to hand that data off.
- Link helps multiple people know where everyone is, coordinate tasks, communicate, and review what happened.

This roadmap uses "mesh" and "sharing" only in the MGRS sense: local device/radio awareness, explicit one-way export, or handoff. It should not become a persistent shared team session inside MGRS.

## Research Signals

| Source | What They Do Well | Signal For Red Grid |
| --- | --- | --- |
| Tactical NAV | Offline mapping, tactical drawing, waypoint plotting, photo-on-map, Apple Watch, Go to Grid, night mode. | These are now table stakes for tactical GPS. Red Grid needs mesh, reports, privacy, and mission packaging to be more than a cheaper alternate. |
| Land Nav | Offline maps, compass/inclinometer, sun/moon, magnetic declination, GPX import/export, UTM/MGRS/mils, iCloud sync, one-time purchase. | Route/import/export and clean planning UX are expected. Red Grid should avoid cloud sync but match file interoperability. |
| iTAK | Offline/online maps, blue-force tracking, collaborative mapping, KML/KMZ/GeoPDF overlays, photo tagging, chat/file sharing, emergency beacons, TAK ecosystem compatibility. | Do not clone TAK. Add lightweight CoT/KML/KMZ export/import so Red Grid can hand data to TAK without becoming a team server app. |
| onX Hunt | Session-based live sharing, last-known timestamps, paid location sharing, offline nearby sharing of waypoints/routes/lines/tracks. | Do not copy live group sessions into MGRS. Borrow only the solo/handoff ideas: last-seen timestamps, offline object transfer, and clear privacy framing. Team sessions belong in Link. |
| Avenza | Offline map store, user-imported GeoPDF/GeoTIFF, track recording, placemarks with notes/photos, shapefile import/export for Pro. | Professional users pay for field data collection and map/package import, not only a coordinate display. |
| CalTopo | Offline mode that forces downloaded layers and avoids weak-signal lag; SAR users are explicitly discussed. | Red Grid should add a mission preflight/offline health check so users know the map will work before stepping off. |
| Meshtastic | Low-cost, encrypted, no-infrastructure LoRa mesh with official iOS/Android apps and protocol docs. | Red Grid should become the best MGRS/tactical front-end for Meshtastic position awareness, not a replacement for the Meshtastic app. |

## Existing Roadmap Cross-Reference

### Already Built Or In Current Worktree

These are either shipped according to README/store copy or present in current source. Some may be uncommitted or not live yet, so verify before release language.

| Capability | Current Evidence | Status | Roadmap Implication |
| --- | --- | --- | --- |
| Offline map tiles and offline toggle | `src/utils/tileManager.js`, `src/screens/MapScreen.js` | Built | Build "mission preflight" on top of it. |
| Standard/dark/topo map styles | `MapScreen.js`, README v3.2.2 | Built | Add saved AO packages per style/zoom. |
| Route mode and route overlay | `MapScreen.js:150-153`, `MapScreen.js:452-520`, `MapScreen.js:620-623` | Built/partial | Upgrade into route cards, route export, and elevation profile. |
| GPX/KML import/export | `WaypointListsScreen.js:164-268`, `gpxExport.js`, `gpxImport.js` | Built | Add route export, KMZ, CoT, and mission package export. |
| External GPS app-wide source | `App.js:129-134` | Current worktree | Add visible GPS source/confidence UI and tests. |
| Mesh auto-share location feed | `App.js:207-214` | Current worktree | Add node roster, last-seen, send-grid, and mesh health. |
| Six report templates | `ReportScreen.js:97-104` | Built | Expand to ICS field pack and PDF/export workflow. |
| Referral trial kill switch | `referral.js:63-67` | Current worktree | Replace with official store offers later. |
| Free waypoint cap | `MapScreen.js:31-33`, `MapScreen.js:325-337` | Current worktree | Keep free tier clear and fair. |

### Already Planned In README / Store Copy

| Planned Item | Existing Roadmap Location | Keep, Change, Or Defer | Notes |
| --- | --- | --- | --- |
| External GPS app-wide | README v3.3.5, Store Listing v3.3.5 | Keep/ship | Appears implemented in current worktree. Needs release verification. |
| Mesh auto-share active position | README v3.3.5, Store Listing v3.3.5 | Keep/ship | Appears implemented in current worktree. Needs hardware QA. |
| Remove attribution / privacy reset | README v3.3.5, Store Listing v3.3.5 | Keep | Critical for trust positioning. Verify package/module removal before claiming. |
| Map tile style dependency fix | README v3.3.5, Store Listing v3.3.5 | Keep/ship | Appears implemented in current worktree. |
| Camera-based target acquisition | README v3.5 | Defer to R&D | High technical risk; needs compass/camera calibration and clear safety disclaimers. |
| Encrypted Meshtastic channels from app | README v3.5 | Keep, but after mesh health | Valuable, but channel config is sensitive. Start with read-only/current-channel display and setup checklist. |
| Background position broadcast | README v3.5 | Change | Make it session-based, explicit, battery-aware, and Pro. Avoid always-on default. |
| CoT export / ATAK interop | README v3.5 | Pull forward | High differentiation. Start with file/share export before live TAK server support. |
| Apple Watch companion | README v3.5 and v5.0 | Keep scoped | First version should be grid + bearing + mark position only. |
| Route planning with elevation profile | README v3.5 | Pull forward | Route mode already exists. Add elevation/route card before more exotic features. |
| T-Mobile Starlink optimization | README v3.5 | Defer | Too carrier/platform dependent. Keep as research note. |
| Offline voice commands | README v4.0 | Defer | Expo Speech is output only. Offline speech recognition likely needs native work. |
| Inertial navigation fallback | README v4.0 | Defer/R&D | Begin with GPS confidence and track smoothing before claiming GPS-denied nav. |
| Satellite position reporting | README v4.0 | Defer | Platform APIs and carrier support are unstable. |
| Custom report templates | README v4.0 | Keep | Better near-term value than satellite/inertial work. |
| Sensor fusion | README v4.0/v5.0 | Reframe | Start with source confidence, stale-fix warnings, HDOP/satellites, barometer display. Full fusion later. |
| Live Activity, widgets, Siri Shortcuts | README v5.0 | Keep scoped | Good retention features after field workflows mature. |
| Third-party integration API | README v5.0 | Defer | File/export interoperability comes first. |

## Standout Feature Bets

Scoring: 5 is strongest. Effort is S/M/L/XL.

| Rank | Feature Bet | Revenue | Differentiation | Trust/Retention | Effort | Cross-Reference |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | Mission Preflight and Offline Readiness | 5 | 4 | 5 | M | New, built on offline maps/GPS/mesh |
| 2 | Solo Mesh Awareness Dashboard | 5 | 5 | 4 | M/L | Extends planned Meshtastic work without becoming Link |
| 3 | Route Card + Elevation Profile + Export | 5 | 4 | 4 | M | Pulls forward planned route elevation |
| 4 | CoT/TAK/KMZ Interoperability Pack | 5 | 5 | 4 | M/L | Pulls forward planned CoT export |
| 5 | ICS/SAR Field Package | 4 | 5 | 4 | M | Extends existing report templates |
| 6 | Offline Handoff / QR Mission Transfer | 4 | 4 | 4 | M | New; one-way handoff only, not team sync |
| 7 | GPS Confidence Layer | 4 | 4 | 5 | S/M | Extends external GPS and sensor fusion plans |
| 8 | Land Nav Training Mode | 4 | 4 | 3 | M | New; strong acquisition persona |
| 9 | Apple Watch Field Companion | 3 | 4 | 4 | L | Already planned |
| 10 | Camera Target Acquisition | 3 | 5 | 2 | XL | Already planned, high risk |
| 11 | Inertial/GPS-Denied Mode | 4 | 5 | 2 | XL | Already planned, high risk |
| 12 | Satellite Position Reporting | 3 | 4 | 2 | XL | Already planned, platform-dependent |

## Recommended Roadmap

### v3.3.5 - Reliability And Privacy Reset

Goal: make the live product match its promises.

- Ship app-wide external GPS and visible GPS source.
- Ship mesh auto-share active-location feed.
- Remove/verify removal of Apple Search Ads attribution.
- Sync app/native/package/store versions.
- Fix map tile style dependency.
- Tighten privacy docs and native permission copy.
- Hardware QA:
  - Garmin GLO / Bad Elf or equivalent BLE GPS.
  - One Meshtastic radio connect/send/receive loop.
  - Airplane mode/offline map path.

Why first: no standout roadmap matters if the trust layer is shaky.

### v3.4 - Mission Preflight

Goal: make Red Grid feel field-ready before the user leaves coverage.

Core features:
- "AO Preflight" panel:
  - current GPS source and accuracy,
  - external GPS connected/disconnected,
  - mesh radio connected/disconnected,
  - offline tiles present for current AO,
  - missing zoom levels,
  - estimated tile count/size,
  - battery/network/airplane-mode hints,
  - permissions health.
- Save named AO packages:
  - "Range 23",
  - "Patrol Base",
  - "SAR Segment A",
  - map style + zooms + tile count + last refreshed.
- One-tap "field check" before entering offline mode.

Pro value:
- Free users can see the checklist.
- Pro users can save multiple AO packages and download/refresh them.

Why it stands out:
- CalTopo added explicit offline mode because weak-signal behavior matters. Red Grid can go further by turning offline readiness into a tactical preflight.

### v3.5 - Route Card And Field Export

Goal: turn the existing route mode into a paid mission artifact.

Core features:
- Route card:
  - route name,
  - ordered waypoints,
  - leg distance,
  - leg bearing,
  - total distance,
  - estimated time,
  - start DTG,
  - notes.
- Route export:
  - GPX route/tracks, not just waypoint list,
  - KML/KMZ,
  - text route card for radio/clipboard/share sheet.
- Elevation profile:
  - start with known waypoint altitude and device/external GPS altitude,
  - add downloaded/elevation data later if feasible.
- Route templates:
  - patrol route,
  - SAR sweep,
  - rally/OBJ set,
  - land-nav course.

Cross-reference:
- Replaces the vague README v3.5 "Route planning with elevation profile" with a practical route product.
- Builds on `MapScreen` route mode and `routePlanner.js`.

### v3.6 - Solo Mesh Awareness Dashboard

Goal: make Red Grid the best solo tactical UI for Meshtastic position awareness without turning MGRS into the team-coordination product.

Core features:
- Node roster:
  - node ID/name,
  - MGRS,
  - bearing/distance,
  - last seen,
  - stale status,
  - source/channel if available.
- Mesh map improvements:
  - selected node card,
  - "navigate to node",
  - node breadcrumb for current session,
  - hide stale nodes,
  - export node snapshot.
- Send grid:
  - send current grid as short text,
  - send selected waypoint/route summary,
  - send report text over mesh if packet size permits.
- Mesh setup checklist:
  - Meshtastic app closed,
  - BLE permission,
  - radio discovered,
  - channel readiness.

Cross-reference:
- Extends README v3.5 "encrypted Meshtastic channels" and "background position broadcast."
- Do dashboard and send-grid before channel write/admin controls.
- Any persistent team roster, team roles, shared channels as a mission concept, messaging UI, or coordinator view belongs in Red Grid Link.

Privacy/safety:
- Position broadcast must be explicit, session-based, and visibly active.
- Default interval should be conservative and battery-aware.

### v3.7 - Interoperability Pack

Goal: make Red Grid useful next to TAK/iTAK, CalTopo, Avenza, and paper planning without becoming a cloud platform.

Core features:
- CoT XML export for own position, waypoints, and route objects.
- KML/KMZ mission package export:
  - waypoints,
  - route,
  - reports,
  - geostamped photo references where possible.
- Import improvements:
  - KML folders as waypoint lists,
  - preserve names/descriptions,
  - support route LineString parsing.
- "Copy as":
  - MGRS,
  - lat/lon,
  - CoT XML,
  - radio report.

Cross-reference:
- Pulls README v3.5 "CoT export" forward because it is high-value and bounded.
- Avoids full TAK server/client work until file interoperability is polished.

### v3.8 - Solo SAR / ICS Field Pack

Goal: make reports operational for the individual field user, then export or hand off the packet. Multi-user incident coordination belongs in Link.

Core features:
- Expand templates using FEMA/NIMS common forms:
  - ICS 201 already exists; add 202, 204, 205, 206, 213, 214 as scoped mobile forms.
- Incident folder:
  - incident name,
  - operational period,
  - map waypoints/routes,
  - reports,
  - photos.
- PDF/text export:
  - shareable packet,
  - radio-friendly plain text,
  - local-only storage.
- SAR segment helper:
  - segment ID,
  - assignment,
  - hazards,
  - comms,
  - start/end grids.

Cross-reference:
- Extends existing `ReportScreen.js` templates and README v4.0 "custom report templates."
- Keep this local-first: one operator creates a packet. Link can later ingest/share/team-manage the packet.

Monetization:
- This is a strong annual subscription feature for SAR/wildland/volunteer field users and agencies, without moving multi-user coordination into MGRS.

### v3.9 - Land Nav Training Mode

Goal: create an acquisition funnel with training value.

Core features:
- Course mode:
  - create/import checkpoint list,
  - hide next grid until clue unlocked,
  - score time/distance/error,
  - after-action summary.
- Pace/azimuth drills:
  - back azimuth prompts,
  - pace count calibration,
  - dead-reckoning exercise.
- Instructor export:
  - printable course card,
  - student result summary.

Cross-reference:
- New feature. Fits solo navigator positioning and avoids team-feature overlap with Red Grid Link.

### v4.0 - Glanceable Field Companion

Goal: make core field use faster without bloating the app.

Core features:
- Apple Watch first slice:
  - current MGRS,
  - bearing/distance to active waypoint,
  - mark position,
  - mesh broadcast status indicator if phone is connected.
- Widgets / Live Activity:
  - current grid,
  - active waypoint distance/bearing,
  - offline AO status.
- Siri/App Shortcuts:
  - "Mark position",
  - "Copy grid",
  - "Start preflight".

Cross-reference:
- Splits README v3.5 Apple Watch and v5.0 widgets/Siri into a realistic first slice.

### v4.x R&D Track - High-Risk Standout Work

These are attractive, but should not block the paid workflow roadmap.

- Camera target acquisition:
  - needs calibrated heading, pitch, distance estimation, and careful disclaimers.
  - Start as "bearing capture + estimated line" before claiming target grid.
- Inertial navigation fallback:
  - start with dead-reckoning assist and confidence decay, not "GPS-denied nav."
  - Use accelerometer/gyroscope/barometer only after sensor calibration UI exists.
- Satellite position reporting:
  - keep research-only until platform APIs and carrier support are stable and review-safe.
- Full TAK server integration:
  - only after file-based CoT/KML/KMZ export is mature.

## Product Principles

- No account required.
- No analytics or tracking.
- Network use should be explicit and user-initiated.
- Free tier must remain genuinely useful.
- Pro should sell confidence, interoperability, and mission packaging.
- MGRS app remains the solo navigator. Red Grid Link remains the team awareness and coordination product.
- Prefer file/share/mesh interoperability over cloud sync.
- Do not market a capability until it is surfaced in the app and hardware-tested.

## Monetization Plan

### Pro Positioning

Rename the paid value in copy from "more features" to "field-ready workflows."

Recommended Pro pillars:
- Offline AO packs.
- Solo Mesh Awareness.
- Route cards and exports.
- ICS/SAR field packets.
- GPX/KML/KMZ/CoT interoperability.
- External GPS confidence.
- Watch/glance companion when ready.

### Paywall Triggers

Use intent moments:
- User tries to save second waypoint.
- User opens route mode.
- User starts AO preflight download.
- User connects mesh radio and opens Solo Mesh Awareness.
- User exports route/mission package.
- User opens SAR/ICS pack.

### Offers

- Keep annual as the default economic path.
- Use official Apple/Google subscription offers for trials/discounts.
- Keep lifetime as an anchor, not the main call to action.
- Sell non-digital value separately: training, setup guides, procurement packets, hardware setup help, and agency onboarding. Team-awareness service value belongs with Red Grid Link.

Platform note:
- In-app digital feature unlocks must stay in IAP. External services/training/hardware can be sold separately when consumed outside the app.

## Store And Growth Plan

Use custom product pages/listings by persona:

- Military land-nav:
  - MGRS, route card, night theme, reports, DAGR comparison.
- SAR/wildland:
  - ICS pack, SAR segments, offline AO, team handoff export.
- Meshtastic/off-grid:
  - solo mesh awareness, auto-share, last seen, no infrastructure.
- Hunting/backcountry:
  - offline topo, waypoints, route card, photo geostamp.
- Privacy/open-source:
  - no account, no tracking, local data, file export.

Deep links:
- Product pages should deep link into the relevant tab when possible:
  - map/offline preflight,
  - mesh,
  - reports,
  - route mode.

Metrics to watch:
- Product page conversion by persona page.
- Paywall opens by trigger.
- Annual vs monthly selection rate.
- Offline AO downloads completed.
- Mesh connects completed.
- Route exports completed.
- Report exports completed.
- Review prompt conversion after successful field actions.

## What Not To Build Yet

- Cloud accounts and cloud sync inside MGRS.
- Live team awareness, shared sessions, team chat, roles, permissions, geofencing, tasking, and AAR inside MGRS; keep that in Red Grid Link.
- A "team map" inside MGRS. Nearby mesh/node awareness is fine; coordinated team operations belong in Link.
- Full TAK client or TAK Server replacement.
- Live video.
- Custom online map store.
- Ballistics, targeting, or weapon-effects tooling.
- Always-on background tracking by default.
- Any analytics/tracking SDK.

## Implementation Order Summary

1. Ship the reliability/privacy reset.
2. Add GPS/mesh/offline confidence UI.
3. Build mission preflight and saved AO packs.
4. Finish route cards, elevation profile, and route export.
5. Build Solo Mesh Awareness dashboard.
6. Add CoT/KMZ mission package export.
7. Expand reports into SAR/ICS field packets.
8. Add land-nav training mode.
9. Add Watch/widgets/shortcuts.
10. Run camera target acquisition and inertial fallback as R&D, not core roadmap blockers.

## Sources

- Tactical NAV App Store listing: https://apps.apple.com/us/app/tactical-nav/id412650650
- Land Nav official site: https://landnav.app/
- iTAK App Store listing: https://apps.apple.com/us/app/itak/id1561656396
- Avenza Maps official site: https://www.avenza.com/avenza-maps/
- CalTopo Offline Mode: https://blog.caltopo.com/2025/08/25/new-feature-offline-mode/
- onX Hunt Location Sharing: https://www.onxmaps.com/hunt/app/features/location-sharing
- onX Hunt Offline Sharing: https://support.onxmaps.com/hc/en-us/articles/25423411446669-Sending-Markups-without-cell-service
- Meshtastic official site: https://meshtastic.org/
- Bluetooth Location and Navigation Service: https://www.bluetooth.com/specifications/specs/location-and-navigation-service-1-0/
- FEMA ICS Forms: https://training.fema.gov/emiweb/is/icsresource/icsforms/
- MITRE Cursor on Target overview: https://www.mitre.org/news-insights/publication/after-action-report-cursor-target-fy14-international-user-group-meeting
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple Subscriptions: https://developer.apple.com/app-store/subscriptions/
- Apple Custom Product Pages: https://developer.apple.com/app-store/custom-product-pages/
- Google Play Billing subscriptions: https://developer.android.com/google/play/billing/subscriptions
- Google Play service fees: https://support.google.com/googleplay/android-developer/answer/112622
