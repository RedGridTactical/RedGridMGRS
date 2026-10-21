// Exercise rendered actions, including programmatic taps of disabled controls.
jest.mock('react', () => ({
  ...jest.requireActual('react'), ...require('./helpers/hookHarness')(),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios' },
  Linking: { openURL: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../src/components/FieldModal', () => ({ Modal: 'Modal' }));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ bg: '#000', text: '#f00', card: '#111' }) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { heading: {}, body: {}, label: {}, data: {} } }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../src/utils/haptics', () => ({
  tapLight: jest.fn(), tapMedium: jest.fn(), notifySuccess: jest.fn(), notifyError: jest.fn(),
}));
jest.mock('../src/utils/fieldAlert', () => ({
  Alert: { alert: jest.fn() }, allowSystemDisplay: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/utils/referral', () => ({ shareTrialLink: jest.fn(), shareApp: jest.fn() }));
const mockRefreshTrial = jest.fn();
jest.mock('../src/hooks/useReferralTrial', () => ({
  useReferralTrial: () => ({ active: false, refresh: mockRefreshTrial }),
}));

const React = require('react');
const { Linking, Platform } = require('react-native');
const { Alert, allowSystemDisplay } = require('../src/utils/fieldAlert');
const { SupportScreen } = require('../src/screens/SupportScreen');
const { ProGate } = require('../src/components/ProGate');
const { canPurchaseTier } = require('../src/utils/proManagement');
const nodes = value => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value, ...nodes(value.props?.children)];
};
const byLabel = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);
const content = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(content).join(' ') : content(value?.props?.children || '');
const gate = tree => nodes(tree).find(node => node.type === ProGate);
let props;
const support = () => React.__render(() => SupportScreen(props));
const paywall = () => React.__render(() => ProGate(props));
const radios = tree => nodes(tree).filter(node => node.props?.accessibilityRole === 'radio');
const checkout = tree => nodes(tree).find(node => node.props?.accessibilityLabel?.startsWith('proGate.unlockButton ') || node.props?.accessibilityLabel?.startsWith('managePro.buyLifetime '));
beforeEach(() => {
  React.__reset();
  jest.clearAllMocks();
  Platform.OS = 'ios';
  Linking.openURL.mockResolvedValue(undefined);
  allowSystemDisplay.mockResolvedValue(true);
  props = {
    visible: true, ownedPlan: 'free', ownedPlanSource: 'store',
    onClose: jest.fn(), onRestore: jest.fn(), onPurchase: jest.fn(),
    onSelectTier: jest.fn(), selectedTier: 'lifetime',
    products: { monthly: { displayPrice: '$5' }, lifetime: { displayPrice: '$50' } },
  };
});

describe('Help → Manage Pro', () => {
  test.each([
    ['free', 'managePro.planFree', 'managePro.viewOptions'],
    ['monthly', 'managePro.planMonthly', 'managePro.viewLifetime'],
    ['annual', 'managePro.planAnnual', 'managePro.viewLifetime'],
    ['lifetime', 'managePro.planLifetime', null],
    ['unknown', 'managePro.planUnknown', null],
    ['loading', 'managePro.planLoading', null],
  ])('%s shows the actual plan and only its permitted offer', (plan, label, offer) => {
    props.ownedPlan = plan;
    const tree = support();
    expect(content(tree)).toContain(label);
    expect(!!byLabel(tree, 'managePro.viewOptions')).toBe(offer === 'managePro.viewOptions');
    expect(!!byLabel(tree, 'managePro.viewLifetime')).toBe(offer === 'managePro.viewLifetime');
    expect(byLabel(tree, 'proGate.restore').props.disabled).toBe(false);
    byLabel(tree, 'proGate.restore').props.onPress();
    expect(props.onRestore).toHaveBeenCalledTimes(1);
    if (plan === 'loading') expect(content(tree)).not.toContain('managePro.unknownBody');
    if (plan === 'lifetime') expect(content(tree)).toContain('proGate.lifetimePromise');
    if (['monthly', 'annual', 'lifetime'].includes(plan)) expect(content(tree)).toContain('managePro.subscriptionNotice');
  });

  test('gift access is separate from paid ownership and retains the ordinary two-choice path', () => {
    props.giftActive = true;
    const tree = support();
    expect(content(tree)).toContain('managePro.planFree');
    expect(content(tree)).toContain('managePro.giftActive');
    expect(content(tree)).not.toContain('managePro.planLifetime');
    byLabel(tree, 'managePro.viewOptions').props.onPress();
    const nested = gate(support());
    expect(nested.props.visible).toBe(true);
    expect(nested.props.ownedPlan).toBe('free');
    React.__reset();
    expect(radios(React.__render(() => ProGate(nested.props)))).toHaveLength(2);
  });

  test('cached ownership is labelled; a gift cannot turn unknown ownership into a purchase offer', () => {
    props.ownedPlan = 'unknown'; props.ownedPlanSource = 'cache'; props.giftActive = true;
    const tree = support();
    expect(content(tree)).toContain('managePro.cached');
    expect(content(tree)).toContain('managePro.unknownBody');
    expect(byLabel(tree, 'managePro.viewOptions')).toBeUndefined();
  });

  test('chooser stays inside Help, closes after Lifetime is verified, and never closes Help', () => {
    props.ownedPlan = 'monthly';
    let tree = support(); React.__effects();
    byLabel(tree, 'managePro.viewLifetime').props.onPress();
    tree = support();
    expect(tree.type).toBe('Modal');
    expect(tree.props.visible).toBe(true);
    expect(gate(tree).props.visible).toBe(true);
    props.ownedPlan = 'lifetime';
    support(); React.__effects();
    expect(gate(support()).props.visible).toBe(false);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test('closing Help resets its nested chooser for the next opening', () => {
    support(); React.__effects();
    byLabel(support(), 'managePro.viewOptions').props.onPress();
    expect(gate(support()).props.visible).toBe(true);
    props.visible = false; support(); React.__effects();
    props.visible = true;
    expect(gate(support()).props.visible).toBe(false);
  });

  test('busy restore disables both purchase entry and restore, including direct handler calls', () => {
    props.isRestoring = true;
    const tree = support();
    byLabel(tree, 'managePro.viewOptions').props.onPress();
    byLabel(tree, 'proGate.restore').props.onPress();
    expect(gate(support()).props.visible).toBe(false);
    expect(props.onRestore).not.toHaveBeenCalled();
  });
});

describe('store subscription management', () => {
  test.each([
    ['ios', 'https://apps.apple.com/account/subscriptions'],
    ['android', 'https://play.google.com/store/account/subscriptions'],
  ])('%s opens only the official account-management URL after the display guard', async (platform, url) => {
    Platform.OS = platform; props.ownedPlan = 'lifetime';
    await byLabel(support(), 'managePro.manageSubscriptions').props.onPress();
    expect(allowSystemDisplay).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
    expect(props.onPurchase).not.toHaveBeenCalled();
    expect(props.onRestore).not.toHaveBeenCalled();
  });

  test('declining the display transition opens no URL', async () => {
    allowSystemDisplay.mockResolvedValue(false);
    await byLabel(support(), 'managePro.manageSubscriptions').props.onPress();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('a failed store link gives visible recovery and permits retry', async () => {
    Linking.openURL.mockRejectedValueOnce(new Error('unavailable'));
    await byLabel(support(), 'managePro.manageSubscriptions').props.onPress();
    expect(Alert.alert).toHaveBeenCalledWith('managePro.linkFailedTitle', 'managePro.linkFailedBody');
    await byLabel(support(), 'managePro.manageSubscriptions').props.onPress();
    expect(Linking.openURL).toHaveBeenCalledTimes(2);
  });

  test('a rapid second tap does not open another store window', async () => {
    let finish;
    Linking.openURL.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const action = byLabel(support(), 'managePro.manageSubscriptions').props.onPress;
    const first = action();
    await Promise.resolve();
    await action();
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    finish(); await first;
  });
});

describe('checkout uses owned plan, never the mere Pro boolean', () => {
  test.each(['monthly', 'annual'])('%s can select and buy only Lifetime, with cancellation warning', plan => {
    props.ownedPlan = plan; props.selectedTier = 'monthly';
    const tree = paywall();
    expect(radios(tree)).toHaveLength(1);
    expect(radios(tree)[0].props.accessibilityLabel).toBe('proGate.tierLifetime $50');
    expect(content(tree)).toContain('managePro.subscriptionNotice');
    checkout(tree).props.onPress();
    expect(props.onPurchase).toHaveBeenCalledWith('lifetime');
    expect(canPurchaseTier(plan, 'monthly')).toBe(false);
  });

  test.each(['lifetime', 'unknown', 'loading', undefined, 'unexpected'])('%s has no checkout or purchasable tiers', plan => {
    props.ownedPlan = plan;
    const tree = paywall();
    expect(radios(tree)).toHaveLength(0);
    expect(checkout(tree)).toBeUndefined();
    if (plan === 'loading') {
      expect(content(tree)).toContain('managePro.planLoading');
      expect(content(tree)).not.toContain('managePro.unknownBody');
    }
    expect(canPurchaseTier(plan, 'monthly')).toBe(false);
    expect(canPurchaseTier(plan, 'lifetime')).toBe(false);
    byLabel(tree, 'proGate.restore').props.onPress();
    expect(props.onRestore).toHaveBeenCalledTimes(1);
    expect(props.onPurchase).not.toHaveBeenCalled();
  });

  test.each(['monthly', 'lifetime'])('Free can buy the selected %s product at its own price', tier => {
    props.selectedTier = tier;
    const tree = paywall();
    expect(radios(tree)).toHaveLength(2);
    checkout(tree).props.onPress();
    expect(props.onPurchase).toHaveBeenCalledWith(tier);
  });

  test('the selected price must be present even if the other product loaded', () => {
    props.selectedTier = 'monthly'; delete props.products.monthly;
    const button = checkout(paywall());
    expect(button.props.disabled).toBe(true);
    button.props.onPress();
    expect(props.onPurchase).not.toHaveBeenCalled();
  });

  test('busy purchase suppresses checkout and restore handlers', () => {
    props.isPurchasing = true;
    const tree = paywall();
    checkout(tree).props.onPress();
    byLabel(tree, 'proGate.restore').props.onPress();
    expect(props.onPurchase).not.toHaveBeenCalled();
    expect(props.onRestore).not.toHaveBeenCalled();
  });
});
