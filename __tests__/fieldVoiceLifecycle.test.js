jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('expo-sensors', () => ({ Accelerometer: { setUpdateInterval: jest.fn(), addListener: jest.fn() } }));
jest.mock('../src/utils/haptics', () => ({ tapMedium: jest.fn() }));
jest.mock('expo-speech', () => ({ stop: jest.fn(async () => {}), speak: jest.fn() }));
const React = require('react');
const { AppState } = require('react-native');
const { Accelerometer } = require('expo-sensors');
const speech = require('expo-speech');
const { useFieldVoice } = require('../src/hooks/useFieldVoice');
const { stopSpeaking } = require('../src/utils/voice');
let listener, sensor;
const grid = '18S UJ 23456 78901';
const options = { enabled: true, shakeEnabled: true, tacticalMode: false, tacticalSound: false };
const render = (mgrs = grid, args = options) => React.__render(() => useFieldVoice(mgrs, args));
const flush = async () => { for (let i=0;i<50;i++) await Promise.resolve(); };
beforeEach(async () => {
  React.__reset(); await stopSpeaking(); jest.clearAllMocks();
  AppState.currentState = 'active';
  AppState.addEventListener.mockImplementation((_, fn) => { listener = fn; return { remove: jest.fn() }; });
  Accelerometer.addListener.mockImplementation(fn => { sensor = fn; return { remove: jest.fn() }; });
});
afterEach(async () => { React.__unmount(); await stopSpeaking(); });
test('background blocks an already captured speech action before React re-renders', async () => {
  render(); React.__effects(); await flush(); const hook = render();
  listener('background');
  expect(await hook.toggleSpeech()).toBe(false); expect(speech.speak).not.toHaveBeenCalled();
});
test('Tactical mute blocks manual speech and a late sensor callback from the previous subscription', async () => {
  render(); React.__effects(); await flush(); const oldSensor = sensor;
  const hook = render(grid, { ...options, tacticalMode: true });
  expect(await hook.toggleSpeech()).toBe(false);
  oldSensor({ x: 4, y: 0, z: 0 }); oldSensor({ x: 4, y: 0, z: 0 }); oldSensor({ x: 4, y: 0, z: 0 });
  await flush(); expect(speech.speak).not.toHaveBeenCalled();
});
test('losing the current grid stops an active readout', async () => {
  render(); React.__effects(); await flush(); await render().toggleSpeech();
  expect(speech.speak).toHaveBeenCalledTimes(1);
  render(null); React.__effects(); await flush();
  expect(render(null).speaking).toBe(false);
});
