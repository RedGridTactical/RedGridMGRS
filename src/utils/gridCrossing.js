// Require distinct, stable fixes inside a new cell. No alert for first fix,
// reacquisition, duplicate timestamps, or jitter along an uncertain boundary.
export function observeGridCrossing(state, mgrs, position) {
  const match = typeof mgrs === 'string' && mgrs.match(/^(\d{1,2}[C-HJ-NP-X])\s+([A-HJ-NP-Z]{2})\s+(\d{5})\s+(\d{5})$/);
  if (!match || !Number.isFinite(position?.timestamp)) return { state: null, alert: null };
  const [, zone, square, e, n] = match;
  const cell = `${zone}${square}:${e.slice(0, 3)}:${n.slice(0, 3)}`;
  const major = `${zone}${square}:${e.slice(0, 2)}:${n.slice(0, 2)}`;
  const base = { cell, major, timestamp: position.timestamp, pending: null };
  if (!state || position.timestamp < state.timestamp || position.timestamp - state.timestamp > 30000) return { state: base, alert: null };
  if (position.timestamp === state.timestamp) return { state, alert: null };
  const next = { ...state, timestamp: position.timestamp };
  if (cell === state.cell) return { state: { ...next, pending: null }, alert: null };
  const accuracy = Number.isFinite(position.accuracy) ? Math.max(0, position.accuracy) : 10;
  const margin = Math.max(5, accuracy);
  const inset = Math.min(Number(e) % 100, 100 - Number(e) % 100, Number(n) % 100, 100 - Number(n) % 100);
  if (inset < margin) return { state: { ...next, pending: null }, alert: null };
  const pending = state.pending?.cell === cell ? { ...state.pending, count: state.pending.count + 1 } : { cell, count: 1, since: position.timestamp };
  if (pending.count < 3 || position.timestamp - pending.since < 2000) return { state: { ...next, pending }, alert: null };
  return { state: base, alert: major !== state.major ? 'major' : 'minor' };
}
