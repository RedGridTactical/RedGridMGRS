---
title: What a $2,500 Military GPS Can Teach You About Software Bloat
published: false
description: The AN/PSN-13 DAGR costs the DoD $2,500 per unit. Its core software functionality can be replicated in ~15,000 lines of JavaScript. Here's what that says about defense tech and software in general.
tags: programming, opensource, military, gps
---

The AN/PSN-13 Defense Advanced GPS Receiver — the DAGR — is the standard handheld GPS for the U.S. military. It's manufactured by what is now L3Harris (formerly Rockwell Collins). It costs the Department of Defense approximately $2,500 per unit. It weighs about a pound. It runs on AA batteries. And its user interface looks like it was designed by someone who had never held a GPS before and hoped they'd never have to again.

I've used DAGRs extensively in the field. I know exactly what they do, and I know what they cost. When I sat down and actually listed the software features a DAGR provides, I was struck by how short that list is — and how that simplicity is buried under decades of procurement overhead.

## What the DAGR Actually Does

Strip away the ruggedized housing, the SAASM crypto module, the MIL-SPEC certifications, and the defense contractor profit margins. The software features of a DAGR are:

1. Display your current position as an MGRS grid coordinate
2. Display your current position as latitude/longitude
3. Calculate and display magnetic declination for your location
4. Store waypoints (grid coordinates you want to navigate to)
5. Calculate bearing and distance from your current position to a stored waypoint
6. Display current speed and heading
7. Display satellite constellation status (number of satellites, signal strength)

That's it. That is the software feature set of a $2,500 device.

There are no maps. No terrain overlays. No route planning. No messaging. No imagery. No network connectivity (by design — that's actually a feature). The DAGR is a coordinate display with a waypoint calculator bolted on.

## The Math Isn't Exotic

The MGRS conversion — translating GPS coordinates to the NATO Military Grid Reference System — is defined in DMA Technical Manual 8358.1. It's a Transverse Mercator projection on the WGS84 ellipsoid, followed by a grid-letter encoding scheme. The algorithm involves some series expansions and a lookup table for 100km square identifiers. It's well-documented, deterministic, and has been public domain since the Defense Mapping Agency published it decades ago.

The bearing and distance calculations use the Vincenty formula — an iterative solution for geodesic distance on an ellipsoid. It was published in 1975. The math is in every geodesy textbook. Vincenty converges in 3-5 iterations for virtually all practical cases.

Magnetic declination comes from the World Magnetic Model, published jointly by NOAA and the British Geological Survey and updated every five years. The current WMM 2025 coefficients are freely available.

None of these algorithms are classified. None are proprietary. None require specialized hardware to execute. A smartphone from 2015 has more than enough processing power to run all of them simultaneously at 60fps.

## So Why Does It Cost $2,500?

The honest answer is that almost none of the cost is software. The DAGR's price tag comes from:

**SAASM (Selective Availability Anti-Spoofing Module):** This is the classified component. SAASM allows the DAGR to receive encrypted military GPS signals (M-code) that are resistant to jamming and spoofing. This is genuinely critical capability that civilian devices cannot replicate. The crypto hardware, key management infrastructure, and security certification process are expensive for good reason.

**MIL-STD-810 environmental qualification:** The DAGR is tested to survive temperature extremes (-31C to +71C), humidity, altitude, shock, vibration, sand, dust, salt fog, and immersion. This testing regime is extensive and expensive, and the hardware design required to pass it adds significant per-unit cost.

**ITAR export control compliance:** As a defense article containing cryptographic components, the DAGR falls under International Traffic in Arms Regulations. The compliance overhead — legal review, export licensing, end-user monitoring — adds cost to every unit.

**Defense procurement pipeline:** Prime contractor margins, subcontractor margins, program management overhead, multi-year sustainment contracts, spare parts provisioning, technical manual development, and training infrastructure. The procurement system itself is a cost multiplier.

**Low production volume:** The military buys thousands of units, not millions. Consumer electronics achieve their price points through volume. Defense hardware doesn't get that advantage.

Every one of these cost drivers is about hardware, compliance, or process — not software. The software is the cheapest part of the entire system.

## What This Actually Teaches Us

The DAGR is an extreme example of a pattern that exists everywhere in software: **the gap between what the software does and what the product costs is filled by everything except the software.**

Enterprise software does this too. A CRM that is fundamentally a database with a form builder costs $300/user/month because of sales teams, support infrastructure, compliance certifications, data center operations, and investor return expectations. The software itself — the part that stores contacts and logs interactions — is straightforward.

Medical device software does this. An infusion pump's firmware is not algorithmically complex, but FDA 510(k) clearance, design history files, risk analysis documentation, and post-market surveillance make the total cost of development enormous.

The lesson isn't "defense contractors are wasteful" (though procurement reform is a real conversation). The lesson is: **when you strip away every cost driver except the software, you discover how little software actually costs to build.**

I replicated the DAGR's core software feature set — MGRS display, waypoints, bearing/distance, magnetic declination, and more — in roughly 15,000 lines of JavaScript running on React Native. It took weeks, not years. It runs on a phone that costs a fraction of a DAGR. And the algorithms are more accurate in some cases because modern smartphones have better GPS chips than what was available when the DAGR was designed.

## The Uncomfortable Question

If the software side of a DAGR can be rebuilt by one developer in weeks, how many other military systems have software components that are similarly straightforward — but are priced as if the software is the hard part?

ATAK — the Android Tactical Assault Kit — already proved that a phone app can become mission-critical military infrastructure. It started as a research project, and today it's standard issue across SOF and conventional units. ATAK handles situational awareness, blue force tracking, and tactical coordination. It runs on commercial Android phones.

The pattern is clear: the algorithms are public, the sensor hardware is commoditized, the development frameworks are mature. The barriers to building military-grade software aren't technical — they're institutional.

This isn't an argument against SAASM or ruggedization. Crypto-hardened GPS is a genuine military necessity in contested electromagnetic environments. Drop-proof hardware matters when you're jumping out of airplanes. But for the 90% of use cases where soldiers are training domestically, navigating in permissive environments, or doing land nav at JRTC — the software running on the phone in their pocket is more than sufficient.

## For Software Engineers

If you take one thing from the DAGR story, let it be this: before you add complexity to your system, ask whether the complexity serves the user or serves the process around the user.

The DAGR's software is simple because it needs to be. A soldier in the field doesn't want a feature-rich navigation suite. They want a grid coordinate, a bearing to their objective, and a declination offset. Every additional feature is a button they have to navigate past under stress, in the dark, with gloves on.

The best software I've seen — military or civilian — shares this quality. It does the thing it's supposed to do, and nothing else. The DAGR's interface is terrible, but its feature scope is exactly right.

Build less. Make it work. Ship it.

---

*I built [Red Grid MGRS](https://github.com/RedGridTactical/RedGridMGRS) to put those same core land nav capabilities on a phone — live MGRS grids, waypoints, bearing and distance, magnetic declination, and 8 tactical tools. Open source, [free on the App Store](https://apps.apple.com/app/red-grid-mgrs/id6759629554), zero tracking.*
