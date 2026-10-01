jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('react-native', () => ({ Share: { share: jest.fn(), sharedAction: 'sharedAction', dismissedAction: 'dismissedAction' } }));
const Storage = require('@react-native-async-storage/async-storage');
const { Share } = require('react-native');
const { mintShareToken, verifyShareToken, redeemShareToken, mintShareLink, shareTrialLink, getTrialStatus, extractTokenFromUrl } = require('../src/utils/referral');
let data;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T12:00:00Z')); jest.resetAllMocks(); data = new Map();
  Storage.getItem.mockImplementation(async key => data.get(key) ?? null);
  Storage.setItem.mockImplementation(async (key, value) => { data.set(key, value); });
  Share.share.mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => { jest.useRealTimers(); });

test('redemption is durable before granting and survives a module-style status reload', async () => {
  const result = await redeemShareToken(await mintShareToken());
  expect(result).toMatchObject({ ok: true, granted: true });
  expect(JSON.parse(data.get('rg_trial_redemption_v2'))).toMatchObject({ received: true, expiresAt: result.expiresAt });
  expect(await getTrialStatus()).toMatchObject({ active: true, received: true, daysLeft: 7 });
  expect(await redeemShareToken(await mintShareToken())).toMatchObject({ ok: false, reason: 'already_received' });
});
test('a failed redemption write never consumes permission or claims a grant', async () => {
  const token = await mintShareToken();
  Storage.setItem.mockRejectedValueOnce(new Error('disk full'));
  expect(await redeemShareToken(token)).toEqual({ ok: false, reason: 'storage' });
  expect(await getTrialStatus()).toMatchObject({ active: false, received: false });
  expect(await redeemShareToken(token)).toMatchObject({ ok: true, granted: true });
});
test('unreadable storage cannot mint or redeem another gift', async () => {
  const token = await mintShareToken(); Storage.getItem.mockRejectedValue(new Error('unavailable'));
  expect(await redeemShareToken(token)).toEqual({ ok: false, reason: 'storage' });
  expect(await mintShareLink()).toEqual({ ok: false, reason: 'storage' });
});
test('concurrent deep-link deliveries grant once and never extend the expiry', async () => {
  const token = await mintShareToken(); const results = await Promise.all([redeemShareToken(token), redeemShareToken(token)]);
  expect(results.filter(r => r.granted)).toHaveLength(1);
  expect(results[1]).toEqual({ ok: false, reason: 'already_received' });
});
test('legacy trials retain their exact expiry; corrupt dates never activate', async () => {
  data.set('rg_trial_received_v1', 'true'); data.set('rg_trial_expires_v1', new Date(Date.now() + 5000).toISOString());
  expect(await getTrialStatus()).toMatchObject({ active: true, daysLeft: 1 });
  jest.advanceTimersByTime(5000); expect(await getTrialStatus()).toMatchObject({ active: false, received: true, daysLeft: 0 });
  data.set('rg_trial_expires_v1', 'invalid');
  expect(await getTrialStatus()).toMatchObject({ active: false, received: true, daysLeft: 0, expiresAt: null });
});
test('cancel then share reuses the exact saved gift URL without success on dismissal', async () => {
  Share.share.mockResolvedValueOnce({ action: Share.dismissedAction });
  expect(await shareTrialLink(url => url)).toEqual({ ok: true, shared: false });
  jest.advanceTimersByTime(10000);
  expect(await shareTrialLink(url => url)).toEqual({ ok: true, shared: true });
  expect(Share.share.mock.calls[0][0].url).toBe(Share.share.mock.calls[1][0].url);
  expect(Storage.setItem.mock.calls.filter(([key]) => key === 'rg_trial_share_token_v2')).toHaveLength(1);
});
test('a rejected share sheet preserves the gift for retry; failed storage never opens a sheet', async () => {
  Share.share.mockRejectedValueOnce(new Error('sheet unavailable'));
  expect(await shareTrialLink(url => url)).toEqual({ ok: false, reason: 'share' });
  expect(await shareTrialLink(url => url)).toEqual({ ok: true, shared: true });
  expect(Share.share.mock.calls[0][0].url).toBe(Share.share.mock.calls[1][0].url);
  data.clear(); Share.share.mockClear();
  Storage.setItem.mockImplementation(async key => { if (key === 'rg_trial_share_token_v2') throw new Error('full'); });
  expect(await shareTrialLink(url => url)).toEqual({ ok: false, reason: 'storage' });
  expect(Share.share).not.toHaveBeenCalled();
});
test('concurrent mint requests return the same token, and expired gifts cannot be regenerated', async () => {
  const links = await Promise.all([mintShareLink(), mintShareLink()]);
  expect(links[0].token).toBe(links[1].token);
  jest.advanceTimersByTime(14 * 86400000);
  expect(verifyShareToken(links[0].token)).toMatchObject({ ok: false, reason: 'expired' });
  expect(await mintShareLink()).toMatchObject({ ok: false, reason: 'expired' });
});
test('legacy spent gifts remain spent, without manufacturing a replacement', async () => {
  data.set('rg_trial_shared_v1', 'true');
  expect(await mintShareLink()).toEqual({ ok: false, reason: 'already_shared' });
});
test('only exact app and HTTPS gift URLs are accepted', () => {
  expect(extractTokenFromUrl('redgrid://share/RG1.a.b')).toBe('RG1.a.b');
  expect(extractTokenFromUrl('https://redgridtactical.com/trial#RG1.a.b')).toBe('RG1.a.b');
  for (const url of ['https://notredgridtactical.com/trial#RG1.a.b', 'https://redgridtactical.com/trial-other#RG1.a.b', 'http://redgridtactical.com/trial#RG1.a.b']) {
    expect(extractTokenFromUrl(url)).toBeNull();
  }
});
