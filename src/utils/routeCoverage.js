/**
 * routeCoverage.js — Which imported map tiles a route needs, and whether the
 * imported package has them.
 *
 * Reads local files only. No downloads, no network. A "complete" result means
 * the tile files under the planned route line exist in the imported package at
 * the package's zoom levels. It says nothing about terrain, map accuracy or
 * whether the route is safe or passable.
 *
 * The route is modelled the way the map draws it: straight segments on the
 * Web-Mercator map between consecutive points. It does not verify a geodesic
 * path or a path through terrain; callers must supply the actual planned points.
 */
import {
  CHECK_TILE_CAP, getOfflineMapMetadata, getTileCacheState, importedTileExists, recoverOfflineTileCache,
} from './tileManager';

const MAX_MERCATOR_LAT = 85.05112878;
const MIN_ZOOM = 0;
const MAX_ZOOM = 19;

export const ROUTE_COVERAGE_LIMITS = {
  maxTiles: CHECK_TILE_CAP,
  maxWaypoints: 500,
  // Traversal work allowed per planned tile; retraced legs revisit tiles.
  workFactor: 8,
  maxCorridorTiles: 3,
};

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const key = (z, x, y) => `${z}/${x}/${y}`;

/** Validate route points. Accepts `{ lat, lon }`; rejects anything non-numeric or out of range. */
export function validateRoutePoints(waypoints, { maxWaypoints = ROUTE_COVERAGE_LIMITS.maxWaypoints } = {}) {
  if (!Number.isInteger(maxWaypoints) || maxWaypoints < 1 || maxWaypoints > ROUTE_COVERAGE_LIMITS.maxWaypoints) return fail('invalid_options');
  if (!Array.isArray(waypoints) || waypoints.length === 0) return fail('no_route');
  if (waypoints.length > maxWaypoints) return fail('too_many_points', { count: waypoints.length });
  const points = [];
  for (let i = 0; i < waypoints.length; i++) {
    const lat = waypoints[i]?.lat;
    const lon = waypoints[i]?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail('invalid_point', { index: i });
    if (Math.abs(lat) > MAX_MERCATOR_LAT) return fail('outside_map_projection', { index: i });
    points.push({ lat, lon });
  }
  return { ok: true, points };
}

// Fractional tile coordinates; floor() matches tileManager.latLonToTile.
function tileFraction(lat, lon, zoom) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const top = n - 1e-9;
  return { x: Math.min(Math.max(x, 0), top), y: Math.min(Math.max(y, 0), top) };
}

// Shortest signed longitude difference; null when the two directions tie.
function lonDelta(from, to) {
  let d = to - from;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return Math.abs(Math.abs(d) - 180) < 1e-9 ? null : d;
}

function normalizeZooms(zoomLevels) {
  if (!Array.isArray(zoomLevels) || zoomLevels.length === 0 || zoomLevels.length > MAX_ZOOM + 1) return null;
  if (!zoomLevels.every(z => Number.isInteger(z) && z >= MIN_ZOOM && z <= MAX_ZOOM)) return null;
  return [...new Set(zoomLevels)].sort((a, b) => a - b);
}

/**
 * Plan the unique tiles a route crosses at the given zoom levels.
 *
 * @param {Array<{lat:number, lon:number}>} waypoints  one point checks that point's tile
 * @param {number[]} zoomLevels  integers 0..19
 * @param {{ corridorTiles?: number, maxTiles?: number, maxWaypoints?: number }} [options]
 *   corridorTiles: extra tiles kept on each side of the line (default 0)
 *   maxTiles: budget on unique tiles across all zooms (default CHECK_TILE_CAP)
 * @returns {{ ok: true, tiles: Array<{z,x,y}>, total: number, byZoom: object, legs: Array<{index:number, tileKeys:string[]}> }
 *          | { ok: false, reason: string }}
 */
export function planRouteTiles(waypoints, zoomLevels, options = {}) {
  if (!options || typeof options !== 'object') return fail('invalid_options');
  const maxTiles = options.maxTiles ?? ROUTE_COVERAGE_LIMITS.maxTiles;
  const corridor = options.corridorTiles ?? 0;
  if (!Number.isInteger(maxTiles) || maxTiles < 1 || maxTiles > ROUTE_COVERAGE_LIMITS.maxTiles) return fail('invalid_options');
  if (!Number.isInteger(corridor) || corridor < 0 || corridor > ROUTE_COVERAGE_LIMITS.maxCorridorTiles) return fail('invalid_options');
  const zooms = normalizeZooms(zoomLevels);
  if (!zooms) return fail('invalid_zoom_levels');
  const valid = validateRoutePoints(waypoints, options);
  if (!valid.ok) return valid;
  const { points } = valid;

  // Describe every leg first so the budget is decided by arithmetic, before
  // any tile is enumerated. A single point is a zero-length leg.
  const segments = [];
  const pairs = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, i) => [points[i], p]);
  let work = 0;
  for (let index = 0; index < pairs.length; index++) {
    const [a, b] = pairs[index];
    const dLon = lonDelta(a.lon, b.lon);
    if (dLon == null) return fail('ambiguous_leg', { index });
    for (const zoom of zooms) {
      const n = 2 ** zoom;
      const start = tileFraction(a.lat, a.lon, zoom);
      const end = { x: start.x + (dLon / 360) * n, y: tileFraction(b.lat, b.lon, zoom).y };
      const width = corridor;
      const steps = Math.abs(Math.floor(end.x) - Math.floor(start.x)) + Math.abs(Math.floor(end.y) - Math.floor(start.y));
      work += (steps + 1) * (2 * width + 1) ** 2;
      if (work > maxTiles * ROUTE_COVERAGE_LIMITS.workFactor) return fail('budget_exceeded', { maxTiles });
      segments.push({ index, zoom, n, start, end, width, steps });
    }
  }

  const unique = new Set();
  const byZoom = Object.fromEntries(zooms.map(z => [z, 0]));
  const legSets = pairs.map(() => new Set());
  let overBudget = false;
  const add = (seg, cx, cy) => {
    for (let ox = -seg.width; ox <= seg.width; ox++) {
      for (let oy = -seg.width; oy <= seg.width; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= seg.n) continue;
        const x = (((cx + ox) % seg.n) + seg.n) % seg.n;
        const k = key(seg.zoom, x, y);
        legSets[seg.index].add(k);
        if (!unique.has(k)) {
          if (unique.size >= maxTiles) { overBudget = true; return; }
          unique.add(k);
          byZoom[seg.zoom]++;
        }
      }
    }
  };

  for (const seg of segments) {
    // Grid traversal: visit every tile the segment passes through.
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    let cx = Math.floor(seg.start.x);
    let cy = Math.floor(seg.start.y);
    const tDeltaX = dx ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx ? (stepX > 0 ? cx + 1 - seg.start.x : seg.start.x - cx) * tDeltaX : Infinity;
    let tMaxY = dy ? (stepY > 0 ? cy + 1 - seg.start.y : seg.start.y - cy) * tDeltaY : Infinity;
    add(seg, cx, cy);
    for (let i = 0; i < seg.steps && !overBudget; i++) {
      if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; }
      else if (tMaxY < tMaxX) { cy += stepY; tMaxY += tDeltaY; }
      else {
        // Exactly through a tile corner: keep both neighbours.
        add(seg, cx + stepX, cy); add(seg, cx, cy + stepY);
        cx += stepX; cy += stepY; tMaxX += tDeltaX; tMaxY += tDeltaY; i++;
      }
      add(seg, cx, cy);
    }
    add(seg, Math.floor(seg.end.x), Math.floor(seg.end.y));
    if (overBudget) return fail('budget_exceeded', { maxTiles });
  }

  const tiles = [...unique].map(k => { const [z, x, y] = k.split('/').map(Number); return { z, x, y }; });
  return {
    ok: true, tiles, total: tiles.length, byZoom, zoomLevels: zooms,
    legs: legSets.map((set, index) => ({ index, tileKeys: [...set] })),
  };
}

const UNKNOWN_BASE = { cached: 0, missing: 0, total: 0, byZoom: {}, legs: [], zoomLevels: [], metadata: null };
const unknown = (reason, extra = {}) => ({ ...UNKNOWN_BASE, ...extra, state: 'unknown', reason });
const stateOf = (cached, total) => (cached === total ? 'complete' : cached === 0 ? 'missing' : 'partial');

/**
 * Check a route against the imported map package.
 *
 * States:
 *   complete — every planned tile file exists
 *   partial  — some exist, some do not
 *   missing  — none exist, or no map is imported (reason 'no_map')
 *   unknown  — the check could not be finished or trusted; see `reason`
 *
 * Zoom levels default to every zoom present in the imported package, matching
 * the viewport check. A budget overrun always yields `unknown`, never a guess.
 *
 * @param {Array<{lat:number, lon:number}>} waypoints
 * @param {{ zoomLevels?: number[], corridorTiles?: number, maxTiles?: number }} [options]
 * @param {object} [deps] injected for tests; defaults to tileManager
 */
export async function checkRouteCoverage(waypoints, options = {}, deps = {}) {
  const getMetadata = deps.getMetadata || getOfflineMapMetadata;
  const tileExists = deps.tileExists || importedTileExists;
  const cacheState = deps.cacheState || getTileCacheState;
  const recover = deps.recover || recoverOfflineTileCache;

  if (!options || typeof options !== 'object') return unknown('invalid_options');
  const valid = validateRoutePoints(waypoints, options);
  if (!valid.ok) return unknown(valid.reason, valid.index != null ? { index: valid.index } : {});
  try {
    if (!(await recover())) return unknown('map_unavailable');
    const before = cacheState();
    if (before.mutating) return unknown('map_changing');
    const changed = () => { const now = cacheState(); return now.mutating || now.generation !== before.generation; };

    const metadata = await getMetadata();
    if (changed()) return unknown('map_changing');
    if (!metadata) return { ...UNKNOWN_BASE, state: 'missing', reason: 'no_map' };
    if (!Array.isArray(metadata.zoomLevels) || !metadata.zoomLevels.length || metadata.inventoryComplete === false) {
      return unknown('map_inventory_unverified', { metadata });
    }
    const zoomLevels = options.zoomLevels ?? metadata.zoomLevels;
    const plan = planRouteTiles(valid.points, zoomLevels, options);
    if (!plan.ok) return unknown(plan.reason, { metadata, ...(plan.index != null ? { index: plan.index } : {}) });

    const present = new Map();
    const byZoom = Object.fromEntries(plan.zoomLevels.map(z => [z, { cached: 0, missing: 0, total: plan.byZoom[z] }]));
    let cached = 0;
    for (const { z, x, y } of plan.tiles) {
      if (changed()) return unknown('map_changing', { metadata });
      const exists = !!(await tileExists(z, x, y));
      present.set(key(z, x, y), exists);
      if (exists) { cached++; byZoom[z].cached++; } else byZoom[z].missing++;
    }
    if (changed()) return unknown('map_changing', { metadata });

    const legs = plan.legs.map(({ index, tileKeys }) => {
      const legCached = tileKeys.reduce((sum, k) => sum + (present.get(k) ? 1 : 0), 0);
      return { index, cached: legCached, total: tileKeys.length, missing: tileKeys.length - legCached, state: stateOf(legCached, tileKeys.length) };
    });
    return {
      state: stateOf(cached, plan.total), reason: null, metadata, zoomLevels: plan.zoomLevels,
      cached, total: plan.total, missing: plan.total - cached, byZoom, legs,
    };
  } catch {
    return unknown('check_failed');
  }
}
