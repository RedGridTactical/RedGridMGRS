# HN Submission — Ready to Post

## Title (80 char limit)
How I built a military-grade GPS app with React Native — zero cloud, zero tracking

## URL
[Link to your Dev.to article once published]

## Text (if submitting as "Ask HN" / "Show HN" instead of link post)
Leave blank if linking to the Dev.to article — let the article speak for itself.

If you want a text-only "Show HN" post instead, use:

---

Show HN: Red Grid MGRS — open-source DAGR-class land navigation for iOS

I'm a paratrooper in an airborne division. I use the DAGR and ATAK on almost every field problem. The DAGR (AN/PSN-13) costs $2,500, weighs a pound, and has a UI from 2003. I rebuilt its core land nav functionality as a free phone app.

What I built:

- DMA algorithm for MGRS conversion (same reference impl as the DAGR firmware)
- Vincenty geodetic formulas for bearing/distance on WGS84
- WMM 2025 magnetic model for auto-declination
- Magnetometer-based wayfinder arrow with accumulated rotation to avoid 359→1° snap
- 8 tactical tools: dead reckoning, two-point resection, pace count, back azimuth
- 6 radio report templates (SALUTE, 9-Line MEDEVAC, SPOT) pre-formatted for voice transmission

The privacy architecture might be more interesting than the nav math: the app makes zero network requests during operation. No analytics, no crash reporting, no third-party SDKs. GPS coordinates never leave the device. For a tactical tool, that's an OPSEC feature, not just a privacy policy.

ATAK proved a phone app can become mission-critical military kit. But there's still a gap for the bread-and-butter land nav that every soldier learns in basic — plot a grid, shoot an azimuth, pace count to an OBJ, call in a MEDEVAC. That's the gap this fills.

Built with React Native 0.76 / Expo SDK 52 / JavaScript only. ~15k lines. No native code. Open source.

App Store: https://apps.apple.com/app/id6759629554
GitHub: https://github.com/RedGridTactical/RedGridMGRS

---

## Timing Notes
- Best posting times for HN: weekday mornings US Eastern (9-11 AM ET, Tuesday-Thursday)
- Wait until your account has more karma before posting Show HN
- Alternative: post the Dev.to link as a regular submission (no Show HN restrictions)
