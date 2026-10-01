const { observeGridCrossing } = require('../src/utils/gridCrossing');
let state;
const observe = (digits, timestamp, accuracy = 5) => {
  const result = observeGridCrossing(state, digits && `18S UJ ${digits} 23550`, { timestamp, accuracy });
  state = result.state; return result.alert;
};
beforeEach(() => { state = null; });
test('jitter at a boundary does not repeatedly alert', () => {
  expect(observe('23490', 1000)).toBeNull();
  for (let i = 2; i < 20; i++) expect(observe(i % 2 ? '23502' : '23498', i * 1000)).toBeNull();
});
test('three distinct fixes over two seconds inside a new cell alert once', () => {
  observe('23450', 1000);
  expect(observe('23530', 2000)).toBeNull();
  expect(observe('23530', 2000)).toBeNull();
  expect(observe('23531', 3000)).toBeNull();
  expect(observe('23532', 4000)).toBe('minor');
  expect(observe('23533', 5000)).toBeNull();
});
test('uncertainty and reacquisition reset rather than produce a crossing', () => {
  observe('23450', 1000);
  for (let i = 2; i <= 5; i++) expect(observe('23530', i * 1000, 80)).toBeNull();
  expect(observe(null, 6000)).toBeNull();
  expect(observe('24550', 7000)).toBeNull();
});
test('stable kilometre change gets one major alert', () => {
  observe('23950', 1000); observe('24030', 2000); observe('24031', 3000);
  expect(observe('24032', 4000)).toBe('major');
});
