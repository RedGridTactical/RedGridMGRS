#!/bin/bash
# capture-screenshots.sh — Automated App Store screenshot capture via iOS simulator.
#
# Usage:
#   ./scripts/capture-screenshots.sh [sim_udid]
#
# If no UDID is given, auto-selects the first iPhone 17 Pro Max simulator.
#
# What it does:
#   1. Boots the simulator (if not running)
#   2. Overrides the status bar to 9:41, full signal, 100% battery
#   3. Opens Simulator.app (the GUI is required for some interactions)
#   4. Walks through the screens by launching the app and manually noting
#      which screens you want captured
#
# You MUST have already:
#   - Built the app for iOS Simulator (`Debug-iphonesimulator`) at least once
#   - Installed the resulting .app bundle on the target simulator
#
# Quickstart to install the built app onto the simulator:
#   eval "$(/opt/homebrew/bin/brew shellenv)"
#   cd "Red Grid MGRS/ios"
#   xcodebuild -workspace RedGridMGRS.xcworkspace -scheme RedGridMGRS \
#     -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
#     -derivedDataPath /tmp/rg-sim-derived build
#   xcrun simctl install <UDID> /tmp/rg-sim-derived/Build/Products/Debug-iphonesimulator/RedGridMGRS.app

set -e

UDID="${1:-}"
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl list devices available | grep -m1 "iPhone 17 Pro Max" | grep -o "[A-F0-9-]\{36\}")
  if [ -z "$UDID" ]; then
    echo "ERROR: No iPhone 17 Pro Max simulator found." >&2
    exit 1
  fi
  echo "Auto-selected iPhone 17 Pro Max: $UDID"
fi

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/fastlane/screenshots/en-US"
mkdir -p "$OUT_DIR"
echo "Output: $OUT_DIR"

# Boot simulator if needed
STATE=$(xcrun simctl list devices | grep "$UDID" | grep -oE "(Booted|Shutdown)")
if [ "$STATE" != "Booted" ]; then
  echo "Booting simulator..."
  xcrun simctl boot "$UDID"
  sleep 5
fi

# Force marketing-quality status bar (Apple's convention)
xcrun simctl status_bar "$UDID" override \
  --time "9:41" \
  --dataNetwork 5g \
  --wifiMode active \
  --wifiBars 3 \
  --cellularMode active \
  --cellularBars 4 \
  --batteryState charged \
  --batteryLevel 100

# Set simulated location — downtown DC (matches the demo waypoint data)
xcrun simctl location "$UDID" set 38.8895,-77.0353

# Launch the app (or relaunch to a known state)
xcrun simctl terminate "$UDID" com.redgrid.redgridtactical 2>/dev/null || true
sleep 1
xcrun simctl launch "$UDID" com.redgrid.redgridtactical
sleep 4

echo ""
echo "Simulator is ready. Walk through the following screens and capture each:"
echo ""

capture() {
  local name="$1"
  local file="$OUT_DIR/${name}.png"
  xcrun simctl io "$UDID" screenshot --type=png --mask=black "$file"
  echo "  ✓ Saved: ${name}.png"
}

# Automated capture of the currently-visible screen every 3 seconds as you navigate.
# For a one-shot, uncomment the capture calls below and tap through manually
# between each.

echo "Capturing GRID tab..."
capture "01_grid"
sleep 2

echo ""
echo "MANUAL STEPS:"
echo "  Navigate to each screen in the simulator, then press ENTER here to capture."
echo ""

read -p "  [1/7] On MAP tab? Press ENTER to capture..." _
capture "02_map"
read -p "  [2/7] On TOOLS tab? Press ENTER to capture..." _
capture "03_tools"
read -p "  [3/7] On REPORTS tab? Press ENTER to capture..." _
capture "04_reports"
read -p "  [4/7] On LISTS tab? Press ENTER to capture..." _
capture "05_lists"
read -p "  [5/7] On THEME tab? Press ENTER to capture..." _
capture "06_themes"
read -p "  [6/7] Open ProGate (tap a locked feature)? Press ENTER to capture..." _
capture "07_progate"
read -p "  [7/7] HUD mode? Press ENTER to capture..." _
capture "08_hud"

echo ""
echo "Done. Captured 8 screenshots → $OUT_DIR"
echo ""
echo "Next steps:"
echo "  - Review the files in $OUT_DIR"
echo "  - Frame them via fastlane 'frameit' or manually in Keynote/Figma"
echo "  - Upload to ASC via 'fastlane deliver'"

# Clear the status bar override so the simulator returns to real state
xcrun simctl status_bar "$UDID" clear
