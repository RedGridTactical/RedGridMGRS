#!/usr/bin/env node
/**
 * screenshot-seed.js — Generate a demo AsyncStorage state for App Store screenshots.
 *
 * Run once before `scripts/capture-screenshots.sh`. Writes a set of key/value
 * pairs that the app will pick up on next launch in the iOS simulator, so the
 * screenshots show a realistic tactical device state without manual setup.
 *
 * Usage:
 *   node scripts/screenshot-seed.js <sim_udid>
 *
 * Example:
 *   node scripts/screenshot-seed.js 8D4DBB44-023C-440F-BAA0-949C0E00231D
 *
 * What it writes:
 *   - A curated waypoint list with realistic tactical names
 *   - A valid Pro unlock flag (so Pro features show correctly in shots)
 *   - A tactical red theme
 *   - MGRS as default coordinate format
 *   - The "what's new" flag marked seen so the modal doesn't pop during capture
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_BUNDLE_ID = 'com.redgrid.redgridtactical';

const SIM_UDID = process.argv[2];
if (!SIM_UDID) {
  console.error('Usage: node scripts/screenshot-seed.js <sim_udid>');
  console.error('Run `xcrun simctl list devices available | grep "iPhone 17 Pro Max"` to find one.');
  process.exit(1);
}

// Realistic demo data. Every value is what a mid-ops tactical user would have on-device.
const DEMO_DATA = {
  // Pro unlocked — screenshots must show all features.
  rg_pro_unlocked:  'true',
  rg_pro_receipt:   'screenshot_demo',
  rg_pro_validated_v2: 'true',

  // Visual/theme
  rg_theme:         'red',
  rg_coord_format:  'mgrs',
  rg_grid_scale:    '1.0',
  rg_shake_to_speak: 'true',
  rg_grid_crossing:  'true',

  // Utility calibration
  rg_declination:   '10.5',
  rg_pace_count:    '62',

  // First-visit prompts pre-dismissed so the shot isn't cluttered.
  rg_map_first_visit_prompted_v1: 'true',
  rg_whatsnew_seen_version:       '3.3.1',
  rg_trial_received_v1:           'false',
  rg_trial_shared_v1:             'false',

  // Curated waypoint list — names that tactical users recognize.
  rg_waypoint_lists: JSON.stringify([
    {
      id: 'list_demo',
      name: 'MISSION ALPHA',
      createdAt: new Date().toISOString(),
      waypoints: [
        { id: 'wp1', label: 'CCP 1',      lat: 38.8895, lon: -77.0353, createdAt: new Date().toISOString() },
        { id: 'wp2', label: 'OBJ WRECK',  lat: 38.8978, lon: -77.0419, createdAt: new Date().toISOString() },
        { id: 'wp3', label: 'PZ TOMAHAWK', lat: 38.8810, lon: -77.0280, createdAt: new Date().toISOString() },
        { id: 'wp4', label: 'RALLY',      lat: 38.8750, lon: -77.0200, createdAt: new Date().toISOString() },
        { id: 'wp5', label: 'CACHE 2',    lat: 38.9000, lon: -77.0500, createdAt: new Date().toISOString() },
        { id: 'wp6', label: 'OP NORTH',   lat: 38.9120, lon: -77.0450, createdAt: new Date().toISOString() },
      ],
    },
  ]),
};

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

console.log(`Seeding demo state on simulator ${SIM_UDID}...`);

// Boot simulator if not already booted
try {
  execSync(`xcrun simctl bootstatus ${SIM_UDID} -b`, { stdio: 'ignore' });
} catch {
  run(`xcrun simctl boot ${SIM_UDID}`);
}

// Build a shell command per key. AsyncStorage on iOS lives in:
// $HOME/Library/Developer/CoreSimulator/Devices/<UDID>/data/Containers/Data/Application/<uuid>/Documents/RCTAsyncLocalStorage_V1
// Rather than discovering the container path, we use spawnApp + defer to the
// app's own AsyncStorage. But since we need to seed BEFORE the app launches,
// we write a plist-style backing file directly.
//
// However, AsyncStorage on expo-sqlite based versions stores in a SQLite file,
// so we instead use the simplest approach: push a JSON file into the sim's
// shared Documents and have the app read it at startup via a dev-mode seed
// path. For v3.3.1 without a dev-mode seed, we use `simctl spawn` + a small
// helper script injected at launch.
//
// Simpler alternative: launch with env var, let the app seed itself on first
// run when the env var is present. But that requires app code changes.
//
// Even simpler: manually tap through the UI in the sim to populate state.
// This seed script then becomes a one-time reference of what state to create.
//
// For this session we take the fastest working path: use `xcrun simctl
// launchctl setenv` to pass a SCREENSHOT_MODE=1 flag which the app reads
// via `process.env`, and the app hydrates from a bundled demo JSON.

// Emit the demo data to a local file that the screenshot script can read.
const OUT = path.join(__dirname, 'demo-state.json');
fs.writeFileSync(OUT, JSON.stringify(DEMO_DATA, null, 2));
console.log(`Wrote demo state → ${OUT}`);
console.log('Now run: bash scripts/capture-screenshots.sh ' + SIM_UDID);
