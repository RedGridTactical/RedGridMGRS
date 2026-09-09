jest.mock('react', () => {
  const hooks = require('./helpers/hookHarness')();
  return { ...jest.requireActual('react'), ...hooks,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useMemo: (fn, deps) => { const ref = hooks.useRef(null); if (!ref.current || deps.some((v, i) => v !== ref.current.deps[i])) ref.current = { deps, value: fn() }; return ref.current.value; },
  };
});
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  Image: Object.assign(function Image() { return null; }, { getSize: jest.fn() }), useWindowDimensions: () => ({ width: 375, height: 800 }),
  StyleSheet: { create: value => value, absoluteFill: {} }, Platform: { OS: 'ios', select: value => value.ios },
  UIManager: {}, LayoutAnimation: { configureNext: jest.fn(), Types: { easeInEaseOut: '', spring: '' }, Properties: { opacity: '' } },
  AccessibilityInfo: { announceForAccessibility: jest.fn() },
}));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ bg: '#000', card: '#222', text: '#fff', text2: '#ddd', text3: '#aaa', border: '#333' }) }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key, values) => key + (values?.time ? ':' + values.time : '') }) }));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../src/utils/typography', () => ({ TYPE: { body: {}, label: {}, heading: {}, data: {} } }));
jest.mock('../src/components/FieldInput', () => ({ TextInput: 'TextInput' }));
jest.mock('../src/utils/haptics', () => ({ tapLight: jest.fn(), tapMedium: jest.fn(), notifySuccess: jest.fn(), notifyWarning: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
const React = require('react');
const { Image } = require('react-native');
const { Alert } = require('../src/utils/fieldAlert');
const { sessionDrafts } = require('../src/utils/sessionDrafts');
const { notifySuccess } = require('../src/utils/haptics');
const Clipboard = require('expo-clipboard');
const Picker = require('expo-image-picker');
const Library = require('expo-media-library');
const ViewShot = require('react-native-view-shot');
const { ReportScreen } = require('../src/screens/ReportScreen');
const { DeadReckoningTool } = require('../src/components/tools/DeadReckoningTool');
const { GeostampTool } = require('../src/components/tools/GeostampTool');
const { BackAzimuthTool } = require('../src/components/tools/BackAzimuthTool');
const { ElevationTool } = require('../src/components/tools/ElevationTool');
const { DeclinationTool } = require('../src/components/tools/DeclinationTool');
const { ToolResult, ToolInput } = require('../src/components/tools/ToolShared');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function nodes(v) { if (!v || typeof v !== 'object') return []; if (Array.isArray(v)) return v.flatMap(nodes); return [v, ...nodes(v.props?.children)]; }
function text(v) { if (typeof v === 'string') return v; if (Array.isArray(v)) return v.map(text).join(''); return v?.props ? text(v.props.children) : ''; }
const button = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && (n.props.accessibilityLabel === label || text(n) === label));
const input = (tree, label) => nodes(tree).find(n => (n.type === ToolInput && n.props.label === label) || (n.type === 'TextInput' && n.props.accessibilityLabel === label));
const results = tree => nodes(tree).filter(n => n.type === ToolResult).map(n => n.props);
const fix = () => ({ lat: 38.9, lon: -77, timestamp: Date.now() - 1000, accuracy: 8, altitude: 0 });
beforeEach(() => { React.__reset(); sessionDrafts.clearPrefix(''); jest.clearAllMocks(); global.requestAnimationFrame = fn => { fn(); return 1; }; });

function reportHarness(id = 'spot') {
  const screen = React.__render(() => ReportScreen({ location: fix(), isPro: true }));
  const card = nodes(screen).find(n => n.type?.name === 'ReportCard' && n.props.report.id === id);
  React.__reset(); let location = fix();
  return { render: () => React.__render(() => card.type({ ...card.props, location })), setLocation: v => { location = v; } };
}
it('report fields start blank; explicit references and typed text survive tab unmount with no GPS overwrite', () => {
  const h = reportHarness(); button(h.render(), 'reports.spotReport report. reports.spotReportSub').props.onPress();
  expect(input(h.render(), 'WHERE').props.value).toBe(''); expect(input(h.render(), 'WHEN').props.value).toBe('');
  input(h.render(), 'WHAT').props.onChangeText('Keep this observation');
  button(h.render(), 'workflow.insertDevicePosition').props.onPress();
  const inserted = input(h.render(), 'WHERE').props.value; expect(inserted).toContain('18S');
  h.setLocation({ ...fix(), lat: 40 }); expect(input(h.render(), 'WHERE').props.value).toBe(inserted);
  React.__reset(); expect(input(h.render(), 'WHAT').props.value).toBe('Keep this observation');
  expect(input(h.render(), 'WHERE').props.value).toBe(inserted);
  input(h.render(), 'WHERE').props.onChangeText('Manually observed location');
  expect(sessionDrafts.read('report:spot:draft').sources.where).toBeNull();
  button(h.render(), 'reports.clear').props.onPress();
  Alert.alert.mock.calls.at(-1)[2].find(b => b.style === 'destructive').onPress();
  expect(input(h.render(), 'WHERE').props.value).toBe(''); expect(input(h.render(), 'WHEN').props.value).toBe('');
});
it('report copy waits for a confirmed native write and failure never produces success', async () => {
  const h = reportHarness(); button(h.render(), 'reports.spotReport report. reports.spotReportSub').props.onPress();
  const write = deferred(); Clipboard.setStringAsync.mockReturnValueOnce(write.promise);
  const promise = button(h.render(), 'reports.copyReport').props.onPress();
  expect(notifySuccess).not.toHaveBeenCalled(); write.resolve(false); await promise;
  expect(notifySuccess).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenLastCalledWith('workflow.copyFailed');
  Clipboard.setStringAsync.mockResolvedValueOnce(true);
  await button(h.render(), 'reports.copyReport').props.onPress(); expect(notifySuccess).toHaveBeenCalledTimes(1);
});
it('tappable calculator results copy zero and reject false native success', async () => {
  Clipboard.setStringAsync.mockResolvedValueOnce(false);
  let tree = React.__render(() => ToolResult({ label: 'ZERO', value: 0 }));
  expect(tree.props.accessibilityRole).toBe('button'); await tree.props.onPress();
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('0'); expect(notifySuccess).not.toHaveBeenCalled();
  expect(text(React.__render(() => ToolResult({ label: 'ZERO', value: 0 })))).toContain('workflow.copyFailed');
});
it('calculator input survives accordion remount; explicit clear removes it and invalid prefixes show no result', () => {
  const render = () => React.__render(() => BackAzimuthTool({ declination: 0, location: fix() }));
  input(render(), 'toolLabels.magneticBearing').props.onChangeText('0');
  React.__reset(); expect(input(render(), 'toolLabels.magneticBearing').props.value).toBe('0');
  expect(results(render())[0].value).toBe('180°M');
  input(render(), 'toolLabels.magneticBearing').props.onChangeText('12m'); expect(results(render())).toHaveLength(0);
  sessionDrafts.clearPrefix('tool:backaz:'); expect(input(render(), 'toolLabels.magneticBearing').props.value).toBe('');
});
it('declination drafts persist but a changed grid/true reference invalidates the previous entry', () => {
  let location = fix(); const render = () => React.__render(() => DeclinationTool({ declination: 0, setDeclination: jest.fn(), location }));
  input(render(), 'toolLabels.magneticBearingInput').props.onChangeText('90'); React.__effects();
  React.__reset(); expect(input(render(), 'toolLabels.magneticBearingInput').props.value).toBe('90');
  location = null; expect(input(render(), 'toolLabels.magneticBearingInput').props.value).toBe(''); React.__effects();
  expect(results(render())).toHaveLength(0);
});
it('equator/prime-meridian slope coordinates and zero altitude are valid; nonfinite/prefix values are rejected', () => {
  const render = () => React.__render(() => ElevationTool({ location: { ...fix(), lat: 0, lon: 0, altitude: 0, accuracy: 0 } }));
  input(render(), 'workflow.waypointLatitude').props.onChangeText('0.01');
  input(render(), 'workflow.waypointLongitude').props.onChangeText('0');
  input(render(), 'workflow.waypointAltitude').props.onChangeText('0');
  expect(results(render()).some(row => row.value === '0.0°')).toBe(true);
  input(render(), 'workflow.waypointLatitude').props.onChangeText('0.01north');
  expect(results(render()).some(row => row.value === '0.0°')).toBe(false);
});
it('DR requires a deliberate pin, stays fixed across live updates/unmount, and saves only on explicit press', async () => {
  let location = fix(); const write = deferred(); const save = jest.fn(() => write.promise);
  const render = () => React.__render(() => DeadReckoningTool({ location, onSaveEstimatedPoint: save }));
  input(render(), 'toolLabels.headingGridNorth').props.onChangeText('90'); input(render(), 'toolLabels.distanceMetres').props.onChangeText('100');
  expect(results(render())).toHaveLength(0); expect(save).not.toHaveBeenCalled();
  button(render(), 'workflow.pinCurrent').props.onPress(); const oldResult = results(render()).find(r => r.primary).value;
  location = { ...fix(), lat: 42 }; expect(results(render()).find(r => r.primary).value).toBe(oldResult);
  React.__reset(); expect(results(render()).find(r => r.primary).value).toBe(oldResult);
  const action = button(render(), 'workflow.saveEstimate').props.onPress();
  expect(save).toHaveBeenCalledTimes(1); expect(notifySuccess).not.toHaveBeenCalled();
  write.reject(new Error('full')); await action; expect(notifySuccess).not.toHaveBeenCalled();
  expect(results(render()).find(r => r.primary).value).toBe(oldResult);
  expect(save.mock.calls[0][0].provenance.origin.lat).toBe(38.9);
});
it('DR manual origin works without a current or last-known device fix', () => {
  const render = () => React.__render(() => DeadReckoningTool({}));
  button(render(), 'workflow.enterManual').props.onPress(); button(render(), 'LAT / LON').props.onPress();
  input(render(), 'workflow.manualLatitude').props.onChangeText('0'); input(render(), 'workflow.manualLongitude').props.onChangeText('0');
  button(render(), 'workflow.pinManual').props.onPress();
  input(render(), 'toolLabels.headingGridNorth').props.onChangeText('0'); input(render(), 'toolLabels.distanceMetres').props.onChangeText('100');
  expect(results(render()).some(r => r.primary)).toBe(true);
  expect(sessionDrafts.read('tool:dr:origin')).toMatchObject({ lat: 0, lon: 0, source: 'manual' });
});
it('library import requires explanation, annotation is explicit/frozen, and export reports actual dimensions', async () => {
  let location = fix(); const render = () => React.__render(() => GeostampTool({ location }));
  Picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://original.jpg' }] });
  Image.getSize.mockImplementation((uri, yes) => yes(...(uri.includes('output') ? [1536, 2048] : [3024, 4032])));
  Library.requestPermissionsAsync.mockResolvedValue({ status: 'granted' }); Library.saveToLibraryAsync.mockResolvedValue();
  ViewShot.captureRef.mockResolvedValue('file://output.jpg');
  button(render(), 'toolLabels.fromLibrary').props.onPress(); expect(Picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  await Alert.alert.mock.calls.at(-1)[2][1].onPress();
  expect(sessionDrafts.read('tool:geostamp:draft').annotation).toBeNull();
  const image = nodes(render()).find(n => n.props?.source?.uri === 'file://original.jpg'); image.props.onLoad();
  expect(button(render(), 'toolLabels.saveToPhotos').props.disabled).toBe(true);
  button(render(), 'workflow.pinAnnotation').props.onPress(); const frozen = sessionDrafts.read('tool:geostamp:draft').annotation;
  location = null; React.__reset(); React.__effects();
  const remountedImage = nodes(render()).find(n => n.props?.source?.uri === 'file://original.jpg'); remountedImage.props.onLoad(); React.__effects();
  expect(sessionDrafts.read('tool:geostamp:draft').annotation).toBe(frozen);
  await button(render(), 'toolLabels.saveToPhotos').props.onPress();
  expect(ViewShot.captureRef.mock.calls[0][1]).toMatchObject({ width: 1536, height: 2048 });
  expect(Library.saveToLibraryAsync).toHaveBeenCalledWith('file://output.jpg');
  expect(text(render())).toContain('workflow.exportActual');
});
