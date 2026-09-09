jest.mock('expo-speech', () => ({ stop: jest.fn(() => Promise.resolve()), speak: jest.fn() }));
const speech = require('expo-speech');
const { speakMGRS, stopSpeaking, isSpeaking, onSpeechStateChange } = require('../src/utils/voice');
const grid = '18S UJ 23456 78901';
beforeEach(async () => { await stopSpeaking(); jest.clearAllMocks(); });
test('stopping a queued readout prevents native speech from starting later', async () => {
  let release;
  speech.stop.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const first = speakMGRS(grid);
  await Promise.resolve(); await Promise.resolve();
  const stopped = stopSpeaking();
  release(); await first; await stopped;
  expect(speech.speak).not.toHaveBeenCalled();
  expect(await isSpeaking()).toBe(false);
});
test('newer readout owns completion state; stale callbacks cannot stop its control', async () => {
  const states = []; const unsubscribe = onSpeechStateChange(value => states.push(value));
  await speakMGRS(grid); const oldFinish = speech.speak.mock.calls[0][1].onDone;
  await speakMGRS('18S UJ 23000 78000');
  oldFinish(); expect(await isSpeaking()).toBe(true);
  speech.speak.mock.calls[1][1].onDone(); expect(await isSpeaking()).toBe(false);
  expect(states).toContain(true); unsubscribe();
});
test('native stop failure never starts a competing voice or reports active speech', async () => {
  speech.stop.mockRejectedValueOnce(new Error('native failure'));
  expect(await speakMGRS(grid)).toBe(false);
  expect(speech.speak).not.toHaveBeenCalled();
  expect(await isSpeaking()).toBe(false);
});
