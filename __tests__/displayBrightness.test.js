const { createBrightnessSession, nightLevel } = require('../src/utils/displayBrightness');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(platform = 'ios', level = 0.7) {
  const api = { getBrightnessAsync: jest.fn().mockResolvedValue(level), setBrightnessAsync: jest.fn().mockResolvedValue(), isUsingSystemBrightnessAsync: jest.fn().mockResolvedValue(true), restoreSystemBrightnessAsync: jest.fn().mockResolvedValue() };
  return { api, session: createBrightnessSession(api, platform) };
}
test('night entry never raises a display already dimmer than the selected level', async () => {
  const { api, session } = setup('ios', 0.02);
  await session.apply(0.06);
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.02);
});
test('leaving night restores the original brightness after several intensity changes', async () => {
  const { api, session } = setup();
  await session.apply(0.06); await session.apply(0.01); await session.restore();
  expect(api.getBrightnessAsync).toHaveBeenCalledTimes(1);
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.7);
});
test('Android restores automatic/system brightness instead of leaving a manual override', async () => {
  const { api, session } = setup('android');
  await session.apply(0.06); await session.restore();
  expect(api.restoreSystemBrightnessAsync).toHaveBeenCalledTimes(1);
});
test('Android preserves an existing app brightness override', async () => {
  const { api, session } = setup('android');
  api.isUsingSystemBrightnessAsync.mockResolvedValue(false);
  await session.apply(0.06); await session.restore();
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.7);
  expect(api.restoreSystemBrightnessAsync).not.toHaveBeenCalled();
});
test('background restore waits for an in-flight dim operation', async () => {
  const { api, session } = setup(); let finish;
  api.setBrightnessAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const dim = session.apply(0.06); await flush();
  const restore = session.restore(); await flush();
  expect(api.setBrightnessAsync).toHaveBeenCalledTimes(1);
  finish(); await Promise.all([dim, restore]);
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.7);
});
test('resume captures the current user brightness and restores that new level', async () => {
  const { api, session } = setup();
  await session.apply(0.06); await session.restore();
  api.getBrightnessAsync.mockResolvedValue(0.4);
  await session.apply(0.06); await session.restore();
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.4);
});
test('a failed write does not prevent restoration or the next entry', async () => {
  const { api, session } = setup();
  api.setBrightnessAsync.mockRejectedValueOnce(new Error('unavailable'));
  await expect(session.apply(0.06)).rejects.toThrow();
  await session.restore(); await session.apply(0.03);
  expect(api.setBrightnessAsync).toHaveBeenLastCalledWith(0.03);
});
test.each([null, NaN, Infinity, -1, 1])('invalid saved intensity %s uses the dim default', value => expect(nightLevel(value)).toBe(0.06));

test.each([-1, 1.2, NaN, Infinity])('invalid native brightness %s does not cause a display write', async value => {
  const { api, session } = setup('ios', value);
  await expect(session.apply(0.06)).rejects.toThrow('Brightness unavailable');
  expect(api.setBrightnessAsync).not.toHaveBeenCalled();
});

function navigationApi(visibility = 'visible') {
  return { getVisibilityAsync: jest.fn().mockResolvedValue(visibility), setVisibilityAsync: jest.fn().mockResolvedValue() };
}
test('Android hides navigation only after capturing its initial state and restores it on exit', async () => {
  const { api } = setup('android'); const navigation = navigationApi();
  const session = createBrightnessSession(api, 'android', navigation);
  await session.apply(0.06); await session.apply(0.03);
  expect(navigation.getVisibilityAsync).toHaveBeenCalledTimes(1);
  expect(navigation.setVisibilityAsync).toHaveBeenLastCalledWith('hidden');
  await session.restore();
  expect(navigation.setVisibilityAsync).toHaveBeenLastCalledWith('visible');
});
test('Android preserves an already hidden navigation bar', async () => {
  const { api } = setup('android'); const navigation = navigationApi('hidden');
  const session = createBrightnessSession(api, 'android', navigation);
  await session.apply(0.06); await session.restore();
  expect(navigation.setVisibilityAsync).toHaveBeenLastCalledWith('hidden');
});
test('navigation restoration still runs after a failed brightness restoration, then retries', async () => {
  const { api } = setup('android'); const navigation = navigationApi();
  const session = createBrightnessSession(api, 'android', navigation);
  await session.apply(0.06);
  api.restoreSystemBrightnessAsync.mockRejectedValueOnce(new Error('brightness failure'));
  await expect(session.restore()).rejects.toThrow('brightness failure');
  expect(navigation.setVisibilityAsync).toHaveBeenLastCalledWith('visible');
  await session.restore();
  expect(api.restoreSystemBrightnessAsync).toHaveBeenCalledTimes(2);
});
test('failed navigation restoration retains the original visibility for a later retry', async () => {
  const { api } = setup('android'); const navigation = navigationApi();
  const session = createBrightnessSession(api, 'android', navigation);
  await session.apply(0.06);
  navigation.setVisibilityAsync.mockRejectedValueOnce(new Error('navigation failure'));
  await expect(session.restore()).rejects.toThrow('navigation failure');
  await session.restore();
  expect(navigation.setVisibilityAsync).toHaveBeenLastCalledWith('visible');
  expect(navigation.getVisibilityAsync).toHaveBeenCalledTimes(1);
});
test('iOS does not call Android navigation APIs', async () => {
  const { api } = setup(); const navigation = navigationApi();
  const session = createBrightnessSession(api, 'ios', navigation);
  await session.apply(0.06); await session.restore();
  expect(navigation.getVisibilityAsync).not.toHaveBeenCalled();
  expect(navigation.setVisibilityAsync).not.toHaveBeenCalled();
});
