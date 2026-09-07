import { Alert as NativeAlert } from 'react-native';
import i18n from '../i18n';

let host = null;
let displayGuard = null;
let systemDisplayPending = false;
export function registerDisplayGuard(guard) {
  displayGuard = guard;
  return () => { if (displayGuard === guard) displayGuard = null; };
}

/** Deliberate escape before native store/share/file-picker screens that cannot be recolored. */
export async function allowSystemDisplay() {
  if (systemDisplayPending) return false;
  if (!displayGuard?.tacticalMode) return true;
  const guard = displayGuard;
  systemDisplayPending = true;
  return new Promise(resolve => {
    const finish = result => { systemDisplayPending = false; resolve(result); };
    Alert.alert(i18n.t('nightDisplay.externalTitle'), i18n.t('nightDisplay.externalBody'), [
    { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => finish(false) },
    { text: i18n.t('nightDisplay.exit'), onPress: async () => {
      try {
        await guard.exit();
        // Let the app-owned dialog dismiss before presenting an OS sheet.
        setTimeout(() => finish(true), 350);
      } catch { finish(false); }
    } },
  ]);
  });
}
export function registerAlertHost(listener) {
  host = listener;
  return () => { if (host === listener) host = null; };
}

/** App-owned dialogs follow the current palette; OS purchase/permission sheets remain native. */
export const Alert = {
  alert(title, message, buttons, options) {
    if (host) host({ title, message, buttons, options });
    else NativeAlert.alert(title, message, buttons, options);
  },
};
