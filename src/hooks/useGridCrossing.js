/**
 * useGridCrossing — Haptic alerts when crossing MGRS grid boundaries.
 *
 * Monitors the live MGRS string and fires haptic feedback when:
 *   - 1km grid square changes (heavy haptic + notification)
 *   - 100m grid line crossed (medium haptic)
 *
 * Pro-only feature. Configurable via settings toggle.
 *
 * Detection compares truncated MGRS strings between position updates.
 * In a 5-digit easting/northing, digit 1 = 10km, digit 2 = 1km, digit 3 = 100m:
 *   - 1km boundary  = first 2 digits of easting/northing
 *   - 100m boundary = first 3 digits of easting/northing
 *
 * HARDENING:
 *   - Skips first position (no false trigger on app open)
 *   - Null/malformed MGRS strings handled gracefully
 *   - Never throws
 */
import { useEffect, useRef } from 'react';
import { tapHeavy, tapMedium, notifySuccess } from '../utils/haptics';

/**
 * Extract grid components from formatted MGRS string.
 * Input:  "18S UJ 23456 78901"
 * Output: { gzd: "18S", sq: "UJ", easting: "23456", northing: "78901" }
 */
function parseMGRSParts(mgrs) {
  if (!mgrs || typeof mgrs !== 'string') return null;
  const parts = mgrs.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return {
    gzd: parts[0],
    sq: parts[1],
    easting: parts[2],
    northing: parts[3],
  };
}

export function useGridCrossing(mgrsFormatted, enabled) {
  const prevParts = useRef(null);
  const isFirstUpdate = useRef(true);

  useEffect(() => {
    if (!enabled || !mgrsFormatted) return;

    const current = parseMGRSParts(mgrsFormatted);
    if (!current) return;

    // Skip first position update to avoid false trigger on app launch
    if (isFirstUpdate.current) {
      isFirstUpdate.current = false;
      prevParts.current = current;
      return;
    }

    const prev = prevParts.current;
    if (!prev) {
      prevParts.current = current;
      return;
    }

    try {
      // Check 1km boundary: compare first 2 digits of easting/northing
      // (digit 1 = 10km, digit 2 = 1km in a 5-digit value)
      const prevE_1km = prev.easting.slice(0, 2);
      const prevN_1km = prev.northing.slice(0, 2);
      const curE_1km  = current.easting.slice(0, 2);
      const curN_1km  = current.northing.slice(0, 2);

      const crossed1km = (
        prev.gzd !== current.gzd ||
        prev.sq !== current.sq ||
        prevE_1km !== curE_1km ||
        prevN_1km !== curN_1km
      );

      if (crossed1km) {
        // Major grid crossing — strong feedback
        tapHeavy();
        setTimeout(() => notifySuccess(), 150);
        prevParts.current = current;
        return;
      }

      // Check 100m boundary: compare first 3 digits (digit 3 = 100m)
      const prevE_100m = prev.easting.slice(0, 3);
      const prevN_100m = prev.northing.slice(0, 3);
      const curE_100m  = current.easting.slice(0, 3);
      const curN_100m  = current.northing.slice(0, 3);

      const crossed100m = (
        prevE_100m !== curE_100m ||
        prevN_100m !== curN_100m
      );

      if (crossed100m) {
        // Minor grid crossing — medium feedback
        tapMedium();
      }
    } catch {
      // Silent — never disrupt navigation for haptic tracking
    }

    prevParts.current = current;
  }, [mgrsFormatted, enabled]);

  // Reset on disable/re-enable
  useEffect(() => {
    if (!enabled) {
      prevParts.current = null;
      isFirstUpdate.current = true;
    }
  }, [enabled]);
}
