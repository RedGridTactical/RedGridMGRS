/** Serializes app brightness changes so a late native call cannot undo restoration. */
export const NIGHT_LEVELS = [0.01, 0.03, 0.06, 0.1, 0.16, 0.25];
export const DEFAULT_NIGHT_LEVEL = 0.06;

export function nightLevel(value) {
  return NIGHT_LEVELS.includes(value) ? value : DEFAULT_NIGHT_LEVEL;
}

export function createBrightnessSession(api, platform, navigation = null) {
  let saved = null;
  let queue = Promise.resolve();
  function enqueue(work) {
    const operation = queue.then(work);
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    apply(level) {
      return enqueue(async () => {
        if (!saved) {
          const brightness = await api.getBrightnessAsync();
          if (!Number.isFinite(brightness) || brightness < 0 || brightness > 1) throw new Error('Brightness unavailable');
          const system = platform === 'android' ? await api.isUsingSystemBrightnessAsync() : false;
          const navigationVisibility = platform === 'android' && navigation ? await navigation.getVisibilityAsync() : null;
          if (navigationVisibility !== null && !['visible', 'hidden'].includes(navigationVisibility)) throw new Error('Navigation visibility unavailable');
          saved = { brightness, system, navigationVisibility };
        }
        await api.setBrightnessAsync(Math.min(saved.brightness, nightLevel(level)));
        if (saved.navigationVisibility !== null) await navigation.setVisibilityAsync('hidden');
      });
    },
    restore() {
      return enqueue(async () => {
        if (!saved) return;
        let failure = null;
        try {
          if (platform === 'android' && saved.system) await api.restoreSystemBrightnessAsync();
          else await api.setBrightnessAsync(saved.brightness);
        } catch (error) { failure = error; }
        // Attempt both restorations even if one native API fails, and retain
        // the original snapshot for a later retry until both have succeeded.
        try {
          if (saved.navigationVisibility !== null) await navigation.setVisibilityAsync(saved.navigationVisibility);
        } catch (error) { if (!failure) failure = error; }
        if (failure) throw failure;
        saved = null;
      });
    },
  };
}
