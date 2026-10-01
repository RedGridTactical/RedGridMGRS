/**
 * routeCard.js — pure helpers for the Route Card feature.
 * No React, no native modules, no network, no storage — safe to unit-test.
 */
import { getRouteLegs, estimateTime, formatTime } from './routePlanner';
import { formatDistance } from './mgrs';
import { formatBearing } from './tactical';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Tactical date-time group in Zulu: DDHHMMZMONYY (e.g. "211430ZJUN26"). */
export function buildDTG(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}Z` +
    `${MONTHS[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
}

/**
 * Compute the route legs + total distance for a waypoint list.
 * @param {{waypoints: Array<{label?: string, lat: number, lon: number, mgrs?: string}>}} list
 * @returns {{ legs: Array, totalDistance: number }}
 */
export function buildRouteSummary(list) {
  if (!list || !Array.isArray(list.waypoints) || list.waypoints.length < 2) {
    return { legs: [], totalDistance: 0 };
  }
  const legs = getRouteLegs(list.waypoints);
  const totalDistance = legs.reduce((s, l) => s + l.distance, 0);
  return { legs, totalDistance };
}

export function formatRouteTime(value) {
  const date = new Date(value);
  return Number.isFinite(value) && value > 0 && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—';
}

export function pointProvenanceText(point, t) {
  const labels = { gps: ['sourceGPS', 'GPS fix'], map: ['sourceMap', 'Map selection'], manual: ['sourceManual', 'Manual grid'], import: ['sourceImport', 'Imported file'], estimated: ['estimateHint', 'ESTIMATE · not a GPS fix. Check heading, distance and terrain against independent references.'] };
  const [key, fallback] = labels[point?.source] || ['sourceUnknown', 'Source not recorded'];
  const label = (name, text) => t ? t(`workflow.${name}`) : text;
  const parts = [label(key, fallback)];
  if (Number.isFinite(point?.recordedAt)) parts.push(`${label('pointRecorded', 'RECORDED')}: ${formatRouteTime(point.recordedAt)}`);
  if (point?.source === 'gps' && Number.isFinite(point.accuracyM) && point.accuracyM >= 0) parts.push(`${label('recordedAccuracy', 'FIX ACCURACY')}: ±${point.accuracyM}m`);
  if (point?.provenance?.kind === 'dead-reckoning') {
    if (point.source !== 'estimated') parts.push(label('estimateHint', 'ESTIMATE · not a GPS fix. Check heading, distance and terrain against independent references.'));
    const provenance = point.provenance;
    const origin = provenance.origin;
    if (origin?.mgrs) parts.push(`${label('drOrigin', 'PINNED ORIGIN')}: ${origin.mgrs}`);
    if (Number.isFinite(origin?.pinnedAt)) parts.push(t ? t('workflow.pinnedAt', { time: formatRouteTime(origin.pinnedAt) }) : `PINNED: ${formatRouteTime(origin.pinnedAt)}`);
    parts.push(`${formatBearing(provenance.gridBearing, 'grid')} / ${Number.isFinite(provenance.distanceMeters) ? provenance.distanceMeters : '—'}m`);
  }
  return parts.join(' · ');
}

/** Plan values and deliberate button confirmations, never an inferred GPS track. */
export function buildRouteProvenance(list) {
  const pace = Number.isFinite(list?.paceMinPerKm) && list.paceMinPerKm >= 1 && list.paceMinPerKm <= 120
    ? list.paceMinPerKm : null;
  const { totalDistance } = buildRouteSummary(list);
  const isRecord = ['completed', 'stopped'].includes(list?.status);
  return {
    pace, isRecord, plannedMinutes: pace == null ? null : estimateTime(totalDistance, pace),
    confirmations: isRecord && Array.isArray(list.confirmed) ? list.confirmed.flatMap(entry => {
      const point = list.waypoints[entry.index];
      return point && Number.isFinite(entry.confirmedAt) ? [{ ...entry, label: point.label, mgrs: point.mgrs }] : [];
    }) : [],
  };
}

/** Printable text version of a route card (share fallback / copy). */
export function buildRouteCardText(list, legs, totalDistance, dtg, t) {
  const label = (key, fallback) => t ? t(`workflow.${key}`) : fallback;
  const provenance = buildRouteProvenance(list);
  const lines = [];
  lines.push(`${t ? t('routeCard.title') : 'ROUTE CARD'} — ${list.name}`);
  lines.push(`${label('generated', 'GENERATED')} DTG ${dtg}`);
  lines.push(`${legs.length} ${t ? t('routeCard.legs') : `LEG${legs.length === 1 ? '' : 'S'}`} · ${formatDistance(totalDistance)} ${t ? t('routeCard.total') : 'TOTAL'}`);
  lines.push(label('planBasis', 'Planned straight-line legs · bearings use true north (°T). Terrain, delays and travel are not recorded.'));
  lines.push(`${label('planSaved', 'PLAN SAVED')}: ${formatRouteTime(list.updatedAt || list.createdAt)}`);
  lines.push(`${label('plannedStart', 'PLANNED START (UTC)')}: ${formatRouteTime(list.plannedStartAt)}`);
  if (provenance.pace != null) lines.push(`${label('pace', 'PLANNED PACE (min/km)')}: ${provenance.pace} · ${label('estimatedDuration', 'ESTIMATED DURATION')}: ${formatTime(provenance.plannedMinutes)}`);
  if (list.notes) lines.push(`${label('planNotes', 'PLAN NOTES')}: ${list.notes}`);
  lines.push('');
  const first = list.waypoints[0];
  if (first) {
    lines.push(`${t ? t('routeCard.start') : 'START'}  ${first.label}  ${first.mgrs}`);
    lines.push(`  ${pointProvenanceText(first, t)}`);
    if (first.note) lines.push(`  ${label('pointNote', 'POINT / INCOMING LEG NOTE')}: ${first.note}`);
  }
  legs.forEach((leg, i) => {
    const brg = formatBearing(leg.bearing, 'true', true);
    lines.push(`${String(i + 1).padStart(2, '0')}  ${leg.to.name || 'WP'}  ${brg} / ${leg.distanceFormatted}  ${leg.mgrs}`);
    lines.push(`  ${pointProvenanceText(list.waypoints[i + 1], t)}`);
    if (leg.to.note) lines.push(`  ${label('pointNote', 'POINT / INCOMING LEG NOTE')}: ${leg.to.note}`);
  });
  if (provenance.isRecord) {
    lines.push('', label('manualRecord', 'MANUAL CONFIRMATION RECORD'));
    lines.push(label('recordBasis', 'Confirmation times record button presses against planned points. They do not prove arrival or record a travelled path.'));
    lines.push(`${label('navigationStarted', 'NAVIGATION STARTED')}: ${formatRouteTime(list.startedAt)}`);
    lines.push(`${label('navigationEnded', 'NAVIGATION ENDED')}: ${formatRouteTime(list.endedAt)}`);
    provenance.confirmations.forEach(entry => lines.push(`${entry.index + 1}. ${entry.label} · ${formatRouteTime(entry.confirmedAt)} · ${entry.mgrs}`));
    if (!provenance.confirmations.length) lines.push(label('noConfirmations', 'No points manually confirmed.'));
    if (list.reviewNotes) lines.push(`${label('reviewNotes', 'REVIEW NOTES')}: ${list.reviewNotes}`);
  }
  lines.push('');
  lines.push(t ? t('routeCard.footer') : 'Red Grid MGRS · straight-line route plan');
  return lines.join('\n');
}
