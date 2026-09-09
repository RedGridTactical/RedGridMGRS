// Deterministic state/effect harness for bounded native-bridge regressions.
module.exports = function createHookHarness() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  return {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!equal(previous?.deps, deps)) pending.push(() => {
        previous?.cleanup?.();
        slots[i] = { deps, effect, cleanup: effect() };
      });
    },
    __render(hook) { cursor = 0; return hook(); },
    __effects() { const effects = pending; pending = []; effects.forEach(effect => effect()); },
    __unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    __replayEffects() {
      slots.forEach(slot => slot?.cleanup?.());
      slots.forEach(slot => { if (slot?.effect) slot.cleanup = slot.effect(); });
    },
    __reset() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; cursor = 0; pending = []; },
  };
};
