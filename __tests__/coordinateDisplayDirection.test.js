jest.mock('react', () => ({ ...jest.requireActual('react'), useMemo: factory => factory() }));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value },
  useWindowDimensions: () => ({ fontScale: mockFontScale }),
}));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ text: '#fff', text2: '#aaa' }) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { data: { writingDirection: 'ltr' }, label: {} } }));
jest.mock('../src/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key, options) => options?.value || key }),
}));

const { MGRSDisplay } = require('../src/components/MGRSDisplay');
const { CoordFormatsScreen } = require('../src/screens/CoordFormatsScreen');
const { formatMGRS, formatPosition } = require('../src/utils/mgrs');
let mockFontScale = 1;
const children = value => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(children);
  return [value, ...children(value.props?.children)];
};
const visibleCoordinates = tree => children(tree).filter(node =>
  node.type === 'Text' && typeof node.props.children === 'string' && node.props.children.includes('\u2066'));
const withoutIsolates = value => value.replace(/[\u2066\u2069]/g, '');
const textContent = value => typeof value === 'string' ? value
  : Array.isArray(value) ? value.map(textContent).join('')
    : value?.type === 'Text' ? textContent(value.props.children) : '';

beforeEach(() => { mockFontScale = 1; });

describe('coordinate presentation stays left to right without changing canonical data', () => {
  test.each([false, true])('MGRS preserves easting before northing and leading zeros, compact=%s', compact => {
    const raw = '18SUJ2347806483';
    const mgrs = formatMGRS(raw);
    const props = { mgrs, compact };
    const tree = MGRSDisplay.type(props);
    const rows = visibleCoordinates(tree);
    expect(rows).toHaveLength(1);
    expect(rows[0].props.children).toBe('\u206623478 06483\u2069');
    expect(rows[0].props.importantForAccessibility).toBe('no');
    expect(tree.props.accessibilityLabel).toBe('18S UJ 23478 06483');
    expect(props.mgrs).toBe(mgrs);
    expect(formatMGRS(raw)).toBe('18S UJ 23478 06483');
  });

  test.each([false, true])('large text isolates each line in order, compact=%s', compact => {
    mockFontScale = 2;
    const tree = MGRSDisplay.type({ mgrs: '18S UJ 00001 90000', compact });
    const row = visibleCoordinates(tree)[0];
    expect(row.props.numberOfLines).toBe(2);
    expect(row.props.children.split('\n')).toEqual(['\u206600001\u2069', '\u206690000\u2069']);
    expect(tree.props.accessibilityLabel).toBe('18S UJ 00001\n90000');
  });

  test.each([1, 2])('compact zone and square form one LTR text run at fontScale=%s', fontScale => {
    mockFontScale = fontScale;
    const tree = MGRSDisplay.type({ mgrs: '18S UJ 23478 06483', compact: true });
    const zone = children(tree).find(node => textContent(node) === '\u206618S\u00a0UJ\u2069');
    expect(zone).toBeDefined();
    expect(zone.props.importantForAccessibility).toBe('no');
    expect(tree.props.accessibilityLabel).toBe(fontScale > 1.2 ? '18S UJ 23478\n06483' : '18S UJ 23478 06483');
    expect(tree.props.accessibilityLabel).not.toMatch(/[\u2066\u2069\u00a0]/);
  });

  test.each([
    ['dd', '-33.865143\n151.209900'],
    ['dms', '33°51′54.5″S\n151°12′35.6″E'],
    ['utm', '56H 334900 6252288'],
  ])('%s keeps signs and coordinate order in both layouts', (coordFormat, altDisplay) => {
    for (const compact of [false, true]) {
      const tree = MGRSDisplay.type({ mgrs: '56H LH 34900 52288', coordFormat, altDisplay, compact });
      const row = visibleCoordinates(tree)[0];
      expect(withoutIsolates(row.props.children)).toBe(altDisplay);
      for (const line of row.props.children.split('\n')) {
        expect(line.startsWith('\u2066')).toBe(true);
        expect(line.endsWith('\u2069')).toBe(true);
      }
      expect(tree.props.accessibilityLabel).toContain(altDisplay.replace(/\n/g, ', '));
      expect(tree.props.accessibilityLabel).not.toMatch(/[\u2066\u2069]/);
    }
  });

  test('missing position remains a no-signal state', () => {
    const tree = MGRSDisplay.type({ mgrs: null });
    expect(visibleCoordinates(tree)).toHaveLength(0);
    expect(tree.props.accessibilityLabel).toBe('gps.noSignal');
  });
});

describe('coordinate format previews keep canonical signed values accessible', () => {
  test.each(['mgrs', 'utm', 'dd', 'dms', 'fixphrase'])('%s isolates visible lines only', coordFormat => {
    const location = { lat: -33.865143, lon: -70.669265 };
    const canonical = formatPosition(location.lat, location.lon, coordFormat);
    const setCoordFormat = jest.fn();
    const tree = CoordFormatsScreen({ location, coordFormat, setCoordFormat });
    const previews = visibleCoordinates(tree);
    expect(previews).toHaveLength(1);
    expect(previews[0].props.children).toBe(canonical.split('\n').map(line => `\u2066${line}\u2069`).join('\n'));
    expect(previews[0].props.accessibilityLabel).toBe(canonical);
    expect(previews[0].props.accessibilityLabel).not.toMatch(/[\u2066\u2069]/);
    expect(formatPosition(location.lat, location.lon, coordFormat)).toBe(canonical);
    const activeCard = children(tree).find(node => node.type === 'TouchableOpacity' && node.key === coordFormat);
    activeCard.props.onPress();
    expect(setCoordFormat).toHaveBeenCalledWith(coordFormat);
  });
});

describe('GPS fix details preserve the complete accuracy measurement', () => {
  // Render the actual local component without loading unrelated native app services.
  const appSource = require('fs').readFileSync(require('path').join(__dirname, '../App.js'), 'utf8');
  const component = appSource.slice(appSource.indexOf('function FixDetails('), appSource.indexOf('function HeadingUnavailable('));
  const compiled = require('@babel/core').transformSync(component, {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const FixDetails = new Function('React', 'View', 'Text', 'useColors', 'useTranslation', 'staticStyles',
    `${compiled}; return FixDetails;`)(require('react'), 'View', 'Text', () => ({ text3: '#aaa' }),
      () => ({ t: (key, options) => key === 'gps.sourcePhone' ? 'الهاتف GPS' : key === 'gps.observedAge' ? 'رصد قبل 0 ث' : options.defaultValue }), {});

  test.each([0, 3, 12.5])('accuracy %s keeps its sign and unit in one visible run without changing spoken data', accuracy => {
    const fix = { source: 'phone', accuracy };
    const tree = FixDetails({ positionStatus: { fix, ageSeconds: 0 } });
    const line = children(tree).find(node => node.type === 'Text');
    expect(textContent(line)).toBe(`الهاتف GPS · رصد قبل 0 ث · \u2066±${accuracy}m\u2069`);
    expect(line.props.accessibilityLabel).toBe(`الهاتف GPS · رصد قبل 0 ث · ±${accuracy}m`);
    expect(line.props.accessibilityLabel).not.toMatch(/[\u2066\u2069]/);
    expect(fix).toEqual({ source: 'phone', accuracy });
  });

  test('unknown accuracy remains localized plain text', () => {
    const tree = FixDetails({ positionStatus: { fix: { source: 'phone', accuracy: null }, ageSeconds: 0 } });
    const line = children(tree).find(node => node.type === 'Text');
    expect(textContent(line)).toContain('Accuracy unknown');
    expect(textContent(line)).not.toMatch(/[\u2066\u2069]/);
  });
});
