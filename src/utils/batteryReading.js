/**
 * batteryReading.js — Normalize a platform power reading before display.
 *
 * Some hosts (iOS apps running on a Mac, emulators, devices without a battery)
 * return values that do not describe a real charge, for example a "full" state
 * paired with a near-zero level. Those readings are reported as unknown rather
 * than turned into a fabricated percentage.
 */

// A "full" state paired with a level below this is not a coherent reading.
const FULL_MIN_LEVEL = 0.95;

/**
 * @param {{ batteryLevel?: number, batteryState?: number, lowPowerMode?: boolean } | null} power
 * @param {{ CHARGING?: number, FULL?: number, UNPLUGGED?: number, UNKNOWN?: number } | null} BatteryState
 * @param {{ supported?: boolean }} [options]
 * @returns {{ level: number | null, state: 'charging' | 'full' | 'unplugged' | 'unknown', lowPowerMode: boolean }}
 */
export function normalizePowerState(power, BatteryState, { supported = true } = {}) {
  const lowPowerMode = !!power?.lowPowerMode;
  const unknown = { level: null, state: 'unknown', lowPowerMode };
  if (!power || !supported) return unknown;

  const raw = power.batteryLevel;
  const level = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  const state = batteryStateName(power.batteryState, BatteryState);

  if (level == null) return { ...unknown, state: state === 'unknown' ? 'unknown' : state };
  if (state === 'full' && level < FULL_MIN_LEVEL) return unknown;

  return { level, state, lowPowerMode };
}

export function batteryStateName(state, BatteryState) {
  if (state == null || !BatteryState) return 'unknown';
  if (state === BatteryState.CHARGING) return 'charging';
  if (state === BatteryState.FULL) return 'full';
  if (state === BatteryState.UNPLUGGED) return 'unplugged';
  return 'unknown';
}
