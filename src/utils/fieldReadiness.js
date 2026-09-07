/** Readiness is scoped to the activity selected by the operator. */
export function navigationReadiness({ gps, permissions, device, mesh, mode = 'solo', mapStatuses = [] }) {
  const required = [gps, permissions, device, ...mapStatuses];
  if (mode === 'team') required.push(mesh);
  if (required.includes('fail')) return 'NOT_READY';
  // Unknown or still-loading required checks must never produce READY.
  if (required.some(status => status !== 'ok')) return 'CAUTION';
  return 'READY';
}

export function locationPermissionReadiness(permission) {
  if (permission === 'denied' || permission === 'unavailable') return 'fail';
  return permission === 'granted' ? 'ok' : 'warn';
}
