---
title: Land Navigation Is a Dying Skill — And GPS Won't Save You When It Matters
published: false
description: GPS dependence is a national security liability. The Army still teaches map and compass for a reason. Here's what happens when the satellites go dark.
tags: military, gps, security, technology
---

At some point in the last twenty years, the U.S. military developed a collective dependency on GPS that would have horrified the generation that fought without it. During a recent training cycle, I watched soldiers who call in a 10-digit grid from a DAGR stare blankly at a 1:50,000 topographic map when asked to plot their position. Same concept, different language. The skill is atrophying, and the technology we've replaced it with has a single point of failure that our adversaries are actively working to exploit.

## What Land Navigation Actually Is

Land navigation — "land nav" — is the ability to determine where you are and move to where you need to be using a map, a compass, and your brain. At its core, it involves:

**Map reading:** Understanding contour lines, interpreting terrain features (ridgelines, saddles, draws, spurs, depressions), measuring distance with a scale, and orienting the map to the ground.

**Compass work:** Shooting azimuths (bearings) to known terrain features, converting between magnetic and grid north using declination, and following a bearing through terrain where you can't see your destination.

**Dead reckoning:** Tracking your movement by combining a compass bearing with a measured distance (usually via pace count — counting your steps and converting to meters). This is how you navigate through dense vegetation or at night when you can't see terrain features.

**Terrain association:** The advanced skill. Looking at the ground around you, comparing it to the map, and continuously confirming your position based on what the terrain is doing — not what a screen says. An experienced navigator maintains a running mental model of where they are relative to the map without ever looking at a GPS.

The Army teaches all of this in Basic and continues testing it throughout a soldier's career. It is a non-negotiable in some military communities, as they treat land nav as a gateway skill.

## The GPS Dependency Problem

GPS works until it doesn't. And the scenarios where it doesn't work are exactly the scenarios where knowing your position matters most.

**Jamming:** GPS signals are weak. Drowning them out doesn't require sophisticated equipment. Russia has demonstrated large-scale GPS jamming in Syria, Ukraine, and the Baltic region. China has developed and fielded GPS denial capabilities. Even non-state actors can buy commercial jammers for a few hundred dollars.

**Spoofing:** More insidious than jamming. Instead of blocking GPS signals, spoofing feeds false signals to your receiver, making it report a position that is wrong — but looks right. Your device shows a confident fix with good accuracy, and you navigate confidently in the wrong direction. Iran reportedly used GPS spoofing to capture a U.S. RQ-170 drone in 2011 by feeding it false landing coordinates.

**Denied environments:** Urban canyons, dense triple-canopy jungle, deep valleys, underground — all environments where GPS signals are degraded or unavailable. These are also environments where tactical operations frequently occur.

**Battery dependency:** A DAGR runs on AA batteries. A phone runs on a lithium cell. Both die. When your navigation capability is entirely electronic, a dead battery isn't an inconvenience — it's a mission failure.

**EMP/HEMP:** An electromagnetic pulse from a nuclear detonation at altitude would disable unshielded electronics across a wide area. This is not a theoretical concern — it's a defined threat in military planning documents.

The military's answer to all of these scenarios is the same: you fall back to map, compass, protractor, and good old map markers. Except that "fall back" only works if you maintained proficiency. A skill you haven't practiced in months or years doesn't magically return under stress.

## How We Got Here

The erosion happened gradually and for understandable reasons. GPS is faster, easier, and more precise than manual navigation. A DAGR gives you a 10-digit grid — 1-meter precision — instantly. Deriving the same precision from a map takes training and practice with a protractor and scale. User error can put you off course by tens, if not hundreds, of meters. 

Training time is finite. Commanders have to prioritize what their soldiers practice, and when GPS provides a faster, more reliable solution for 95% of training scenarios, the incentive to drill manual navigation decreases. The 5% of scenarios where GPS fails don't get trained because they don't come up in training.

This creates a vicious cycle: less practice leads to lower proficiency, which makes GPS even more essential by comparison, which further reduces the motivation to practice.

The problem isn't GPS itself. GPS is a remarkable tool and its advantages are real. The problem is treating GPS as a replacement for the skill rather than an enhancement of it.

## What a Good Navigator Looks Like

The best navigators I've worked with use every tool available — GPS, map, compass, terrain, pace count — in combination. They don't rely on any single source. They constantly cross-check.

A good navigator glances at the GPS for a grid, then confirms it makes sense by looking at the terrain. They shoot a compass bearing to a hilltop, check that it agrees with what the map predicts, and note if the GPS heading matches. When they move, they maintain a pace count as a backup distance measurement even though GPS is tracking.

This redundant approach means that when any single source fails — GPS goes down, the compass gives a bad reading because of nearby metal, the pace count gets thrown off by difficult terrain — they still have multiple independent data points to work from.

Contrast this with the soldier who stares at a screen, walks toward the waypoint arrow, and has no idea what the terrain should look like if they're on the right track. That soldier is one dead battery away from being lost.

## Beyond the Military

This isn't just a military problem. Civilian search-and-rescue teams report increasing numbers of hikers who are completely disoriented when their phone dies. Wildland firefighters have documented cases where GPS-guided crews navigated into dangerous positions because they trusted the device over what the terrain was telling them. Pilots have followed GPS guidance into terrain because they prioritized the screen over visual confirmation.

The broader principle: **any navigation system that you don't understand well enough to recognize when it's wrong is a system that can get you killed.**

GPS doesn't tell you when it's giving you a bad fix. It doesn't tell you when it's being spoofed. It shows a dot on a map with a confidence circle, and most users accept that at face value. A trained navigator knows what the answer should be before they look at the device, and they notice when the device disagrees with reality.

## The Path Forward

The solution isn't to abandon GPS. That would be absurd. Why wouldn't you use the tools at your disposal? The solution is to treat map and compass as a primary skill that GPS enhances, not a backup skill that GPS replaces.

Concretely, this means:

**Train without GPS first.** Learn to navigate with a map and compass until it's automatic. Then add GPS as an additional data source. Not the other way around.

**Practice terrain association.** Every time you're outdoors with a map, practice relating what you see to what the map shows. This skill degrades without use and improves rapidly with practice.

**Carry a map and compass.** Even if you navigate primarily with GPS, having analog backup means a dead battery or jammed signal is an inconvenience, not an emergency.

**Cross-check constantly.** If the GPS says you're on a ridgeline and you're standing in a draw, trust the ground, not the screen. Develop the habit of confirming electronic navigation against physical reality.

**Understand the math.** Know what MGRS coordinates mean, how bearing and distance relate to your map, and what magnetic declination is. When you understand the system, you can troubleshoot it. When you just follow the arrow, you can't.

The soldiers and outdoorsmen who will perform best in a GPS-denied future are the ones who never stopped practicing the skills that existed before GPS. The technology should make a good navigator faster and more precise. It should never be the only thing standing between a navigator and being lost.

---

*I built [Red Grid MGRS](https://github.com/RedGridTactical/RedGridMGRS) as a bridge between these worlds — a GPS app that speaks the language of manual navigation. It displays MGRS grids, calculates magnetic declination, computes bearing and distance, and includes dead reckoning and resection tools. The goal isn't to replace the map and compass. It's to give navigators a tool that complements the skills they already have. Open source, [free on the App Store](https://apps.apple.com/app/red-grid-mgrs/id6759629554).*
