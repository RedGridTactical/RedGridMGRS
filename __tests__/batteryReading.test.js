const { normalizePowerState } = require('../src/utils/batteryReading');

const BatteryState = { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 };

describe('normalizePowerState — no fabricated charge from unsupported or inconsistent hosts', () => {
  test('Mac host reading FULL with a 1% level is unknown, not 100% and not 1%', () => {
    const r = normalizePowerState({ batteryLevel: 0.01, batteryState: BatteryState.FULL, lowPowerMode: false }, BatteryState);
    expect(r).toEqual({ level: null, state: 'unknown', lowPowerMode: false });
  });

  test('unsupported platform is unknown even when values look plausible', () => {
    const r = normalizePowerState({ batteryLevel: 0.8, batteryState: BatteryState.UNPLUGGED }, BatteryState, { supported: false });
    expect(r.level).toBeNull();
    expect(r.state).toBe('unknown');
  });

  test.each([-1, 1.5, NaN, undefined, '0.5'])('out-of-range or non-numeric level %p is unknown', level => {
    const r = normalizePowerState({ batteryLevel: level, batteryState: BatteryState.UNPLUGGED }, BatteryState);
    expect(r.level).toBeNull();
  });

  test('real unplugged reading passes through unchanged', () => {
    const r = normalizePowerState({ batteryLevel: 0.42, batteryState: BatteryState.UNPLUGGED, lowPowerMode: true }, BatteryState);
    expect(r).toEqual({ level: 0.42, state: 'unplugged', lowPowerMode: true });
  });

  test('coherent full reading is reported as full', () => {
    const r = normalizePowerState({ batteryLevel: 1, batteryState: BatteryState.FULL }, BatteryState);
    expect(r).toEqual({ level: 1, state: 'full', lowPowerMode: false });
  });

  test('low power mode survives an unknown reading so the warning still shows', () => {
    const r = normalizePowerState({ batteryLevel: -1, batteryState: BatteryState.UNKNOWN, lowPowerMode: true }, BatteryState);
    expect(r).toEqual({ level: null, state: 'unknown', lowPowerMode: true });
  });

  test('null power or missing enum is unknown without throwing', () => {
    expect(normalizePowerState(null, BatteryState).level).toBeNull();
    expect(normalizePowerState({ batteryLevel: 0.5, batteryState: 1 }, null).state).toBe('unknown');
  });
});
