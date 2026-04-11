#!/bin/bash
# Restore exec bits and bypass macOS Gatekeeper on node_modules binaries.
# Runs automatically after `npm install` via the postinstall hook.
#
# Why this is needed:
# - node_modules was originally migrated from Windows; .sh files and Mach-O
#   binaries arrived without Unix exec bits.
# - macOS Gatekeeper quarantines unsigned binaries extracted from tarballs;
#   the first run of hermesc gets killed (exit 137) and the binary is
#   relocated. Ad-hoc code signing with the local signing identity makes
#   Gatekeeper trust it on this machine.
#
# Safe to re-run. Exits 0 even if nothing needs fixing.

set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d node_modules ]; then
  echo "fix-native-binaries: node_modules not present, skipping."
  exit 0
fi

# 1. Restore exec bits on every shell script inside node_modules.
find node_modules -type f \( -name "*.sh" -o -name "*.bash" \) \
  -exec chmod +x {} + 2>/dev/null || true

# 2. Restore exec bits on everything in .bin directories.
find node_modules -type d -name ".bin" -print0 | while IFS= read -r -d '' d; do
  chmod +x "$d"/* 2>/dev/null || true
done

# 3. hermesc (bundled Mach-O binary) — chmod + strip quarantine + ad-hoc sign.
HERMESC="node_modules/react-native/sdks/hermesc/osx-bin/hermesc"
if [ -f "$HERMESC" ]; then
  chmod +x "$HERMESC" \
    node_modules/react-native/sdks/hermesc/osx-bin/hermes \
    node_modules/react-native/sdks/hermesc/osx-bin/hermes-lit 2>/dev/null || true
  xattr -cr node_modules/react-native/sdks/hermesc/ 2>/dev/null || true
  if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign - "$HERMESC" 2>/dev/null || true
  fi
fi

echo "fix-native-binaries: ok"
