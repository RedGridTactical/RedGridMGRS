jest.mock('react', () => require('./helpers/hookHarness')());
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('../src/utils/meshtastic', () => ({
  CONNECTION_STATES: { CONNECTED: 'connected', DISCONNECTED: 'disconnected' },
  scanForDevices: jest.fn(), connectToDevice: jest.fn(), disconnect: jest.fn(), sendPosition: jest.fn(),
  onPositionReceived: jest.fn(() => () => {}), onStateChange: jest.fn(),
  getConnectionState: jest.fn(() => 'connected'), getConnectedDevice: jest.fn(() => ({ id: 'radio' })),
}));
const React = require('react');
const { AppState } = require('react-native');
const mesh = require('../src/utils/meshtastic');
const { useMeshtastic } = require('../src/hooks/useMeshtastic');
let stateListener, appListener;
const render = () => React.__render(useMeshtastic);
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
beforeEach(() => {
  React.__reset(); jest.clearAllMocks();
  AppState.currentState='active'; mesh.getConnectionState.mockReturnValue('connected'); mesh.sendPosition.mockResolvedValue(undefined);
  mesh.onStateChange.mockImplementation(fn => { stateListener=fn; return () => {}; });
  AppState.addEventListener.mockImplementation((_,fn) => { appListener=fn; return { remove: jest.fn() }; });
});
afterEach(() => React.__unmount());
test('fresh radio write acknowledges the radio only, then native failure becomes failed', async () => {
  render(); React.__effects(); const hook=render();
  expect(await hook.sharePosition(0,0,0,Date.now())).toBe(true);
  expect(render().lastSend.status).toBe('radioAccepted');
  mesh.sendPosition.mockRejectedValueOnce(new Error('BLE failed'));
  expect(await hook.sharePosition(0,0,0,Date.now())).toBe(false);
  expect(render().lastSend.status).toBe('failed');
});
test('duplicate sends, stale fixes and immediate background transition do not start extra writes', async () => {
  render(); React.__effects(); const hook=render(); let release;
  mesh.sendPosition.mockImplementationOnce(() => new Promise(resolve => { release=resolve; }));
  const first=hook.sharePosition(0,0,0,Date.now());
  expect(await hook.sharePosition(0,0,0,Date.now())).toBe(false);
  release(); await first;
  expect(await hook.sharePosition(0,0,0,Date.now()-31000)).toBe(false);
  appListener('background'); expect(await hook.sharePosition(0,0,0,Date.now())).toBe(false);
  expect(mesh.sendPosition).toHaveBeenCalledTimes(1);
});
test('a late result from the old connection cannot acknowledge a newly connected radio', async () => {
  render(); React.__effects(); const hook=render(); let release;
  mesh.sendPosition.mockImplementationOnce(() => new Promise(resolve => { release=resolve; }));
  const first=hook.sharePosition(0,0,0,Date.now());
  stateListener('disconnected'); stateListener('connected'); release();
  expect(await first).toBe(false); expect(render().lastSend).toBeNull();
});

test('entitlement expiry blocks an already captured send and clears session auto-share before a new render effect', async () => {
  const renderWithAccess = enabled => React.__render(() => useMeshtastic(enabled));
  renderWithAccess(true); React.__effects();
  const old = renderWithAccess(true); old.setLastPosition(0,0,0,Date.now()); old.toggleAutoShare();
  renderWithAccess(true); React.__effects(); await flush();
  expect(mesh.sendPosition).toHaveBeenCalledTimes(1);
  renderWithAccess(false);
  expect(await old.sharePosition(0,0,0,Date.now())).toBe(false);
  React.__effects(); await flush();
  expect(renderWithAccess(false).autoShare).toBe(false);
  expect(mesh.sendPosition).toHaveBeenCalledTimes(1);
  old.toggleAutoShare(); expect(renderWithAccess(false).autoShare).toBe(false);
});
