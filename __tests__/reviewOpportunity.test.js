jest.mock('react', () => require('./helpers/hookHarness')());
const mockEvents = {};
const mockRN = {
  AppState: { currentState: 'active', addEventListener: jest.fn((event, fn) => { mockEvents.app = fn; return { remove: jest.fn() }; }) },
  Keyboard: { isVisible: jest.fn(() => false), addListener: jest.fn((event, fn) => { mockEvents[event] = fn; return { remove: jest.fn() }; }) },
};
jest.mock('react-native', () => mockRN);
const React = require('react');
const { useReviewOpportunity, REVIEW_IDLE_MS } = require('../src/hooks/useReviewOpportunity');
const { setReviewBlocker, noteReviewDismissal, isReviewPresentationIdle, REVIEW_SETTLE_MS } = require('../src/utils/reviewPresentation');
let options;
let clock = 1800000000000;
const render = () => React.__render(() => useReviewOpportunity(options));
beforeEach(() => {
  React.__reset(); jest.useFakeTimers(); jest.setSystemTime(clock += 3600000);
  mockRN.AppState.currentState = 'active'; mockRN.Keyboard.isVisible.mockReturnValue(false);
  options = { requestReviewIfEligible: jest.fn().mockResolvedValue('attempted'), canQueue: () => true, isContextStable: () => true, contextKey: 'grid' };
});
afterEach(() => { React.__unmount(); setReviewBlocker('test-modal', false); jest.useRealTimers(); });

test('launch never asks; a completed task waits for the full quiet pause', () => {
  const hook = render(); React.__effects(); jest.advanceTimersByTime(REVIEW_IDLE_MS * 2);
  expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  expect(hook.queueReview()).toBe(true); jest.advanceTimersByTime(REVIEW_IDLE_MS - 1);
  expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1); expect(options.requestReviewIfEligible).toHaveBeenCalledTimes(1);
});
test('another touch cancels rather than rescheduling', () => {
  const hook = render(); React.__effects(); hook.queueReview(); hook.cancelReview();
  jest.advanceTimersByTime(REVIEW_IDLE_MS * 3); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
});
test('Tactical, navigation or emergency context cannot queue or become eligible while waiting', () => {
  const hook = render(); React.__effects(); hook.queueReview();
  options = { ...options, canQueue: () => false }; const blocked = render();
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  expect(blocked.queueReview()).toBe(false);
});
test('tab change cancels even if the user comes back', () => {
  const hook = render(); React.__effects(); hook.queueReview();
  options = { ...options, contextKey: 'map' }; render(); React.__effects();
  options = { ...options, contextKey: 'grid' }; render(); React.__effects();
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
});
test('background then resume never resurrects a queued request', () => {
  const hook = render(); React.__effects(); hook.queueReview();
  mockRN.AppState.currentState = 'background'; mockEvents.app('background');
  mockRN.AppState.currentState = 'active'; mockEvents.app('active');
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
});
test('keyboard use cancels, and an already visible keyboard blocks presentation', () => {
  const hook = render(); React.__effects(); hook.queueReview(); mockEvents.keyboardDidShow();
  mockEvents.keyboardDidHide(); jest.advanceTimersByTime(REVIEW_IDLE_MS);
  expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  hook.queueReview(); mockRN.Keyboard.isVisible.mockReturnValue(true);
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
});
test('modal and actual dismissal grace both block the request', () => {
  const hook = render(); React.__effects(); hook.queueReview(); setReviewBlocker('test-modal', true);
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  hook.queueReview(); jest.advanceTimersByTime(REVIEW_IDLE_MS - 1000); setReviewBlocker('test-modal', false);
  jest.advanceTimersByTime(1000); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
  hook.queueReview(); jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).toHaveBeenCalledTimes(1);
  noteReviewDismissal(); expect(isReviewPresentationIdle()).toBe(false);
  jest.advanceTimersByTime(REVIEW_SETTLE_MS); expect(isReviewPresentationIdle()).toBe(true);
});
test('touch cancellation invalidates the guard during an async native check', () => {
  const hook = render(); React.__effects(); hook.queueReview(); jest.advanceTimersByTime(REVIEW_IDLE_MS);
  const guard = options.requestReviewIfEligible.mock.calls[0][0].isContextStable;
  expect(guard()).toBe(true); hook.cancelReview(); expect(guard()).toBe(false);
});
test('unmount cancels and invalidates pending work', () => {
  const hook = render(); React.__effects(); hook.queueReview(); React.__unmount();
  jest.advanceTimersByTime(REVIEW_IDLE_MS); expect(options.requestReviewIfEligible).not.toHaveBeenCalled();
});
