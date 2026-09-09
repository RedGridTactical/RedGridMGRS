/** Process-session memory only. No persistence, timers, sensors or network work. */
export function createSessionDraftStore() {
  const values = new Map();
  const listeners = new Map();
  const notify = key => listeners.get(key)?.forEach(listener => listener());
  return {
    read(key, initial) {
      return values.has(key) ? values.get(key) : initial;
    },
    write(key, value, initial) {
      const next = typeof value === 'function' ? value(this.read(key, initial)) : value;
      values.set(key, next);
      notify(key);
      return next;
    },
    subscribe(key, listener) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => {
        const set = listeners.get(key);
        set?.delete(listener);
        if (!set?.size) listeners.delete(key);
      };
    },
    clearPrefix(prefix) {
      const keys = new Set([...values.keys(), ...listeners.keys()]);
      keys.forEach(key => { if (key.startsWith(prefix)) { values.delete(key); notify(key); } });
    },
  };
}
export const sessionDrafts = createSessionDraftStore();
