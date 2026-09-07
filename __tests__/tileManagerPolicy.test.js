jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///local/',
  getInfoAsync: jest.fn(async path => ({ exists: !path.includes('map_tiles_previous') })),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));
const fs = require('expo-file-system');
const manager = require('../src/utils/tileManager');

describe('Offline provider permission and cache preservation', () => {
  beforeEach(() => jest.clearAllMocks());
  test.each(['standard', 'dark', 'topo', 'unknown'])('blocks %s before any file or network mutation', async style => {
    const progress = jest.fn();
    const result = await manager.downloadTilesForRegion(null, [19], progress, { style });
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/permission|permit/);
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(fs.deleteAsync).not.toHaveBeenCalled();
    expect(fs.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });
  test('retains access to previously cached tiles after a blocked download', async () => {
    await manager.downloadTilesForRegion(null);
    expect(await manager.getTileUri(12, 655, 1582)).toBe('file:///local/map_tiles/12/655/1582.png');
    expect(manager.getLocalTilePathTemplate()).toBe('/local/map_tiles/{z}/{x}/{y}.png');
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });
});
