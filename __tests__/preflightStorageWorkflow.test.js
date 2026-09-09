jest.mock('react', () => {
  const hooks = require('./helpers/hookHarness')();
  return { ...jest.requireActual('react'), ...hooks, useMemo: (fn, deps) => hooks.useCallback(fn, deps)() };
});
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Platform: { OS: 'ios' }, StyleSheet: { create: value => value } }));
jest.mock('../src/components/FieldInput', () => ({ TextInput: 'TextInput' }));
jest.mock('../src/components/FieldModal', () => ({ Modal: 'Modal' }));
jest.mock('../src/utils/fieldAlert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../src/utils/ThemeContext', () => ({ useColors: () => ({ text: '#fff', text2: '#ddd', text3: '#aaa' }) }));
jest.mock('../src/utils/typography', () => ({ TYPE: { body: {}, label: {}, heading: {}, data: {} } }));
jest.mock('../src/hooks/useTranslation', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../src/utils/haptics', () => ({ tapLight: jest.fn(), tapMedium: jest.fn(), notifySuccess: jest.fn() }));
jest.mock('../src/hooks/useAOPackages', () => ({ useAOPackages: jest.fn(), FREE_AO_LIMIT: 1 }));
jest.mock('../src/utils/tileManager', () => ({ checkImportedMapCoverage: jest.fn().mockResolvedValue({ state: 'no-map', zoomLevels: [] }) }));
const React = require('react');
const { useAOPackages } = require('../src/hooks/useAOPackages');
const { PreflightScreen } = require('../src/screens/PreflightScreen');
const { notifySuccess } = require('../src/utils/haptics');
const { Alert } = require('../src/utils/fieldAlert');
function nodes(v) { if (!v || typeof v !== 'object') return []; if (Array.isArray(v)) return v.flatMap(nodes); return [v, ...nodes(v.props?.children)]; }
function text(v) { if (typeof v === 'string') return v; if (Array.isArray(v)) return v.map(text).join(''); return v?.props ? text(v.props.children) : ''; }
const button = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && (n.props.accessibilityLabel === label || text(n) === label));
const region = { latitude: 38.9, longitude: -77, latitudeDelta: 0.1, longitudeDelta: 0.1 };
let state;
const render = () => React.__render(() => PreflightScreen({ visible: true, mapRegion: region, isPro: true }));
beforeEach(() => {
  React.__reset(); jest.clearAllMocks();
  state = { aoPackages: [], loaded: true, isLoading: false, isSaving: false, loadError: null, saveError: null,
    addAOPackage: jest.fn(), deleteAOPackage: jest.fn(), canSaveMore: () => true, retryLoad: jest.fn().mockResolvedValue(), retrySave: jest.fn().mockResolvedValue() };
  useAOPackages.mockImplementation(() => state);
});
it('failed load does not show an empty inventory or enable destructive replacement; retry is actionable', async () => {
  state.loaded = false; state.loadError = new Error('read failed');
  const tree = render(); expect(text(tree)).not.toContain('preflight.aos.empty');
  expect(button(tree, 'preflight.aos.saveCurrent').props.disabled).toBe(true);
  await button(tree, 'workflow.retry').props.onPress(); expect(state.retryLoad).toHaveBeenCalledTimes(1);
  expect(state.addAOPackage).not.toHaveBeenCalled();
});
it('failed AO save keeps the name and prompt; retry acknowledges success only after durable confirmation', async () => {
  state.addAOPackage.mockRejectedValue(new Error('disk full'));
  button(render(), 'preflight.aos.saveCurrent').props.onPress();
  nodes(render()).find(n => n.type === 'TextInput').props.onChangeText('FIELD AREA');
  await button(render(), 'common.save').props.onPress();
  expect(notifySuccess).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenLastCalledWith('workflow.saveFailed');
  expect(nodes(render()).find(n => n.type === 'TextInput').props.value).toBe('FIELD AREA');
  state.saveError = new Error('pending write');
  const retryButtons = nodes(render()).filter(n => n.type === 'TouchableOpacity' && text(n) === 'workflow.retry');
  await retryButtons.at(-1).props.onPress();
  expect(state.retrySave).toHaveBeenCalledTimes(1); expect(notifySuccess).toHaveBeenCalledTimes(1);
  expect(nodes(render()).some(n => n.type === 'TextInput')).toBe(false);
});
