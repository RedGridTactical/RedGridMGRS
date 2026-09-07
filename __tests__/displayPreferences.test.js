/** Display preferences preserve a user's palette across Tactical toggles and upgrades. */
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(),
  setItem: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const {
  loadSettings,
  normalizeDisplayPreferences,
  effectiveDisplayTheme,
  updateDisplayPreferences,
  saveDisplayPreferences,
} = require('../src/utils/storage');

const KEY = 'rg_display_preferences';
const standard = { theme: 'standard', tacticalMode: false };
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.multiGet.mockResolvedValue([]);
});

afterEach(async () => {
  await flush();
});

test('new installations start in Standard without creating unrelated settings', async () => {
  const settings = await loadSettings();
  expect(settings.displayPreferences).toEqual(standard);
  expect(settings.theme).toBe('standard');
  expect(settings.tacticalMode).toBe(false);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each(['red', 'green', 'white', 'blue'])('migrates legacy %s without changing its effective palette', async legacy => {
  AsyncStorage.multiGet.mockResolvedValue([['rg_theme', legacy]]);
  const settings = await loadSettings();
  await flush();
  expect(settings.theme).toBe(legacy);
  expect(settings.displayPreferences).toEqual({
    theme: legacy === 'red' ? 'standard' : legacy,
    tacticalMode: legacy === 'red',
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY, JSON.stringify(settings.displayPreferences));
});

test('a saved display preference supersedes the legacy theme and preserves unrelated settings', async () => {
  AsyncStorage.multiGet.mockResolvedValue([
    [KEY, JSON.stringify({ theme: 'white', tacticalMode: true })],
    ['rg_theme', 'green'], ['rg_declination', '-12.5'], ['rg_pace_count', '70'],
    ['rg_coord_format', 'utm'], ['rg_shake_to_speak', 'false'],
    ['rg_grid_crossing', 'false'], ['rg_grid_scale', '1.3'],
  ]);
  const settings = await loadSettings();
  expect(settings).toMatchObject({
    theme: 'red', tacticalMode: true,
    displayPreferences: { theme: 'white', tacticalMode: true },
    declination: -12.5, paceCount: 70, coordFormat: 'utm',
    shakeToSpeak: false, gridCrossing: false, gridScale: 1.3,
  });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each(['{broken', '{"theme":"unknown","tacticalMode":true}', '{"theme":"blue","tacticalMode":"false"}'])('corrupt saved values fall back to a valid legacy theme: %s', async raw => {
  AsyncStorage.multiGet.mockResolvedValue([[KEY, raw], ['rg_theme', 'blue']]);
  const settings = await loadSettings();
  expect(settings.displayPreferences).toEqual({ theme: 'blue', tacticalMode: false });
});

test('invalid theme identifiers cannot become an effective palette', () => {
  expect(normalizeDisplayPreferences({ theme: '__proto__', tacticalMode: false }, 'constructor')).toEqual(standard);
  expect(updateDisplayPreferences(standard, { theme: 'unknown' })).toBe(standard);
  expect(updateDisplayPreferences(standard, { tacticalMode: 'false' })).toBe(standard);
});

test.each(['standard', 'green', 'white', 'blue'])('Tactical off restores the preceding %s palette, including after relaunch', async theme => {
  let preferences = { theme, tacticalMode: false };
  preferences = updateDisplayPreferences(preferences, { tacticalMode: true });
  expect(effectiveDisplayTheme(preferences)).toBe('red');
  await saveDisplayPreferences(preferences);
  const saved = AsyncStorage.setItem.mock.calls.at(-1)[1];
  AsyncStorage.multiGet.mockResolvedValue([[KEY, saved]]);
  const loaded = await loadSettings();
  preferences = updateDisplayPreferences(loaded.displayPreferences, { tacticalMode: false });
  expect(effectiveDisplayTheme(preferences)).toBe(theme);
});

test('selecting red preserves the previous palette; selecting another palette exits Tactical', () => {
  let preferences = { theme: 'green', tacticalMode: false };
  preferences = updateDisplayPreferences(preferences, { theme: 'red' });
  expect(preferences).toEqual({ theme: 'green', tacticalMode: true });
  preferences = updateDisplayPreferences(preferences, { theme: 'blue' });
  expect(preferences).toEqual({ theme: 'blue', tacticalMode: false });
});

test('rapid changes persist atomically in selection order', async () => {
  let finishFirst;
  AsyncStorage.setItem.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
  const first = saveDisplayPreferences({ theme: 'white', tacticalMode: true });
  const second = saveDisplayPreferences({ theme: 'white', tacticalMode: false });
  await flush();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  finishFirst();
  await Promise.all([first, second]);
  expect(AsyncStorage.setItem.mock.calls).toEqual([
    [KEY, JSON.stringify({ theme: 'white', tacticalMode: true })],
    [KEY, JSON.stringify({ theme: 'white', tacticalMode: false })],
  ]);
});

test('a failed native write does not prevent a later selection being saved', async () => {
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage busy'));
  const first = saveDisplayPreferences({ theme: 'green', tacticalMode: true });
  const second = saveDisplayPreferences({ theme: 'green', tacticalMode: false });
  await Promise.all([first, second]);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(KEY, JSON.stringify({ theme: 'green', tacticalMode: false }));
});

test('a late migration read cannot overwrite a preference selected while loading', async () => {
  let finishRead;
  AsyncStorage.multiGet.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  const loading = loadSettings();
  await flush();
  await saveDisplayPreferences(standard);
  finishRead([['rg_theme', 'red']]);
  await loading;
  await flush();
  expect(AsyncStorage.setItem.mock.calls).toEqual([[KEY, JSON.stringify(standard)]]);
});

test('invalid preference writes leave existing storage intact', async () => {
  await saveDisplayPreferences({ theme: 'red', tacticalMode: true });
  await saveDisplayPreferences({ theme: 'standard', tacticalMode: null });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});


test('a settings remount waits for the preceding display write before migrating', async () => {
  let finishWrite;
  let saved;
  AsyncStorage.setItem.mockImplementationOnce((key, value) => new Promise(resolve => {
    finishWrite = () => { saved = value; resolve(); };
  }));
  AsyncStorage.multiGet.mockImplementation(async () => [
    ['rg_theme', 'red'], [KEY, saved],
  ]);
  const writing = saveDisplayPreferences({ theme: 'white', tacticalMode: false });
  const reading = loadSettings();
  await flush();
  expect(AsyncStorage.multiGet).not.toHaveBeenCalled();
  finishWrite();
  await writing;
  expect((await reading).theme).toBe('white');
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
