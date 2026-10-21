/** Tactical display stays red-only, including the status colours used by coverage and preflight. */
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const fs = require('fs');
const path = require('path');
const { THEMES } = require('../src/hooks/useTheme');

const isRedOnly = value => /^#[0-9a-f]{6}$/i.test(value) && value.slice(3).toLowerCase() === '0000';

test('every Tactical palette colour has no green or blue component', () => {
  for (const [token, value] of Object.entries(THEMES.red.colors)) expect([token, isRedOnly(value)]).toEqual([token, true]);
});

test('Tactical defines the warn and danger tokens that status surfaces read', () => {
  expect(THEMES.red.colors.warn).toBeDefined();
  expect(THEMES.red.colors.danger).toBeDefined();
});

test('status surfaces take warn and danger from the palette before any fallback', () => {
  for (const file of ['src/components/RouteCoveragePanel.js', 'src/components/PreflightStatusRow.js', 'src/screens/PreflightScreen.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const literals = source.match(/'#(?:d99a3a|cc4444)'/g) || [];
    const guarded = source.match(/colors\.(?:warn|danger) \|\| '#(?:d99a3a|cc4444)'/g) || [];
    expect([file, guarded.length]).toEqual([file, literals.length]);
  }
});

test('Standard keeps its existing palette (no status tokens were added to it)', () => {
  expect(THEMES.standard.colors.warn).toBeUndefined();
  expect(THEMES.standard.colors.danger).toBeUndefined();
});
