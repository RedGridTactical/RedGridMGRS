/**
 * Turns a route coverage snapshot into the words and status shown to the user.
 * Kept separate from the screens so every surface says the same thing.
 */
const REASON_KEYS = {
  budget_exceeded: 'routeCoverage.reason.budget',
  too_many_points: 'routeCoverage.reason.budget',
  map_inventory_unverified: 'routeCoverage.reason.inventory',
  map_changing: 'routeCoverage.reason.changing',
  map_unavailable: 'routeCoverage.reason.failed',
  check_failed: 'routeCoverage.reason.failed',
  cancelled: 'routeCoverage.cancelled',
};
const LEG_STATE = {
  complete: ['ok', 'routeCoverage.legComplete'],
  partial: ['fail', 'routeCoverage.legPartial'],
  missing: ['fail', 'routeCoverage.legMissing'],
};
const pointName = (point, index) => point?.label || point?.name || `WP ${index + 1}`;

/**
 * @param {{ status: string, result: object|null, progress: object|null }} snapshot
 * @param {Array<object>} waypoints the route the snapshot belongs to
 * @param {function} t translator
 * @returns {{ status: 'ok'|'warn'|'fail', summary: string, detail: string, legs: Array<{ key: string, label: string, state: string, status: string }> }}
 */
export function describeRouteCoverage(snapshot, waypoints, t) {
  const none = { detail: '', legs: [] };
  const status = snapshot?.status || 'idle';
  if (status === 'idle') return { ...none, status: 'warn', summary: t('routeCoverage.notChecked') };
  if (status === 'stale') return { ...none, status: 'warn', summary: t('routeCoverage.stale') };
  if (status === 'checking') {
    const progress = snapshot.progress;
    return { ...none, status: 'warn', summary: progress?.total
      ? t('routeCoverage.checking', { done: progress.done, total: progress.total }) : t('routeCoverage.starting') };
  }
  const result = snapshot.result || {};
  if (result.state === 'unknown') {
    const number = Number.isInteger(result.index) ? result.index + 1 : null;
    const pointReason = ['invalid_point', 'outside_map_projection'].includes(result.reason) && number
      ? t('routeCoverage.reason.point', { number }) : null;
    const legReason = result.reason === 'ambiguous_leg' && number ? t('routeCoverage.reason.leg', { number }) : null;
    const reason = pointReason || legReason || (REASON_KEYS[result.reason] ? t(REASON_KEYS[result.reason]) : '');
    const summary = result.reason === 'cancelled' ? reason : [t('routeCoverage.unknown'), reason].filter(Boolean).join(' ');
    return { ...none, status: 'warn', summary };
  }
  if (result.state === 'missing' && result.reason === 'no_map') return { ...none, status: 'warn', summary: t('routeCoverage.noMap') };

  const points = Array.isArray(waypoints) ? waypoints : [];
  const legs = (result.legs || []).map(leg => {
    const [legStatus, key] = LEG_STATE[leg.state] || ['warn', 'routeCoverage.legUnknown'];
    const label = points.length < 2
      ? `1 · ${pointName(points[0], 0)}`
      : `${leg.index + 1} → ${leg.index + 2} · ${pointName(points[leg.index + 1], leg.index + 1)}`;
    return { key: String(leg.index), label, state: t(key), status: legStatus };
  });
  const detail = result.zoomLevels?.length ? t('routeCoverage.detail', { zooms: result.zoomLevels.join(', ') }) : '';
  if (result.state === 'complete') return { status: 'ok', summary: t('routeCoverage.complete', { count: result.total }), detail, legs };
  if (result.state === 'partial') return { status: 'fail', summary: t('routeCoverage.partial', { missing: result.missing, total: result.total }), detail, legs };
  return { status: 'fail', summary: t('routeCoverage.missing'), detail, legs };
}
