const mockNativeAlert = jest.fn();
jest.mock('react-native', () => ({ Alert: { alert: (...args) => mockNativeAlert(...args) } }));
jest.mock('../src/i18n', () => ({ t: key => key }));
const { Alert, registerAlertHost } = require('../src/utils/fieldAlert');
const { isReviewPresentationIdle, REVIEW_SETTLE_MS } = require('../src/utils/reviewPresentation');
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(1800000000000); mockNativeAlert.mockReset(); });
afterEach(() => jest.useRealTimers());
test('native alert blocks until its button and dismissal grace finish', () => {
  const action = jest.fn(); Alert.alert('Test', 'Body', [{ text: 'Keep', onPress: action }]);
  expect(isReviewPresentationIdle()).toBe(false);
  mockNativeAlert.mock.calls[0][2][0].onPress(); expect(action).toHaveBeenCalledTimes(1);
  expect(isReviewPresentationIdle()).toBe(false); jest.advanceTimersByTime(REVIEW_SETTLE_MS);
  expect(isReviewPresentationIdle()).toBe(true);
});
test('default button and Android back dismissals release the blocker', () => {
  const dismissed = jest.fn(); Alert.alert('Test', '', undefined, { cancelable: true, onDismiss: dismissed });
  mockNativeAlert.mock.calls[0][3].onDismiss(); expect(dismissed).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(REVIEW_SETTLE_MS); expect(isReviewPresentationIdle()).toBe(true);
  Alert.alert('Again'); mockNativeAlert.mock.calls[1][2][0].onPress();
  jest.advanceTimersByTime(REVIEW_SETTLE_MS); expect(isReviewPresentationIdle()).toBe(true);
});
test('queued app alerts each retain their own blocker', () => {
  const items = []; const unregister = registerAlertHost(item => items.push(item));
  Alert.alert('First'); Alert.alert('Second'); items[0].buttons[0].onPress();
  jest.advanceTimersByTime(REVIEW_SETTLE_MS); expect(isReviewPresentationIdle()).toBe(false);
  items[1].buttons[0].onPress(); jest.advanceTimersByTime(REVIEW_SETTLE_MS);
  expect(isReviewPresentationIdle()).toBe(true); unregister();
});
