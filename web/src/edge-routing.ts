/** User-controlled relation geometry, stored separately from relation text. */
import { CanvasError } from './canvas.ts';
import type { CanvasEdge } from './canvas.ts';
import type { Point } from './edge-label-layout.ts';

export interface EdgeRouting { labelPosition?: Point; waypoints: Point[] }
export interface EdgeRoutingUpdate { labelPosition?: Point | null; waypoints?: readonly Point[] | null }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isPoint(value: unknown): value is Point {
  return record(value) && typeof value.x === 'number' && typeof value.y === 'number'
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && Math.abs(value.x) <= Number.MAX_SAFE_INTEGER && Math.abs(value.y) <= Number.MAX_SAFE_INTEGER;
}
function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y; }

/** Unsupported metadata remains untouched; drawing falls back to auto layout. */
export function readEdgeRouting(edge: CanvasEdge): EdgeRouting {
  const style = record(edge.paperstreamStyle) ? edge.paperstreamStyle : {};
  return {
    ...(isPoint(style.labelPosition) ? { labelPosition: { ...style.labelPosition } } : {}),
    waypoints: Array.isArray(style.waypoints) && style.waypoints.length <= 100 && style.waypoints.every(isPoint)
      ? style.waypoints.map(point => ({ ...point })) : [],
  };
}

/** Returns a patch without id; all unrelated appearance and extension keys survive. */
export function edgeRoutingPatch(edge: CanvasEdge, update: EdgeRoutingUpdate): Partial<CanvasEdge> {
  const labelChanged = Object.hasOwn(update, 'labelPosition');
  const routeChanged = Object.hasOwn(update, 'waypoints');
  if (!labelChanged && !routeChanged) return {};
  if (Object.hasOwn(edge, 'paperstreamStyle') && !record(edge.paperstreamStyle)) {
    throw new CanvasError('现有连线外观不是有效对象，无法调整路径；原数据已保留。');
  }
  const style = { ...(record(edge.paperstreamStyle) ? edge.paperstreamStyle : {}) };
  if (labelChanged) {
    if (update.labelPosition === null) delete style.labelPosition;
    else {
      if (!isPoint(update.labelPosition)) throw new CanvasError('关系文字位置必须是有效坐标。');
      style.labelPosition = { ...(record(style.labelPosition) ? style.labelPosition : {}), ...update.labelPosition };
    }
  }
  if (routeChanged) {
    if (update.waypoints === null || update.waypoints?.length === 0) delete style.waypoints;
    else {
      if (!Array.isArray(update.waypoints) || update.waypoints.length > 100 || !update.waypoints.every(isPoint)) {
        throw new CanvasError('连线折点必须是有效坐标，且不能超过 100 个。');
      }
      style.waypoints = update.waypoints.map(point => ({ ...point }));
    }
  }
  return { paperstreamStyle: style };
}

export function polylineRoute(source: Point, target: Point, waypoints: readonly Point[] = []): Point[] {
  const result: Point[] = [];
  for (const point of [source, ...waypoints, target]) {
    if (!isPoint(point)) throw new CanvasError('连线路径包含无效坐标。');
    if (!result.length || !samePoint(result[result.length - 1], point)) result.push({ ...point });
  }
  return result;
}

export function defaultRoutePoints(source: Point, target: Point, side: CanvasEdge['fromSide'] = 'bottom'): Point[] {
  const controls = side === 'left' || side === 'right'
    ? [{ x: (source.x + target.x) / 2, y: source.y }, { x: (source.x + target.x) / 2, y: target.y }]
    : [{ x: source.x, y: (source.y + target.y) / 2 }, { x: target.x, y: (source.y + target.y) / 2 }];
  return polylineRoute(source, target, controls);
}

export function polylinePath(points: readonly Point[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

export function routeMidpoint(points: readonly Point[]): Point {
  if (!points.length) throw new CanvasError('连线路径为空。');
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] && lengths[index] > 0) {
      const ratio = remaining / lengths[index];
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    remaining -= lengths[index];
  }
  return { ...points[0] };
}

/** Insert at the nearest segment; returned controls omit both endpoint anchors. */
export function insertWaypoint(points: readonly Point[], point: Point): Point[] {
  if (points.length < 2 || !isPoint(point)) throw new CanvasError('无法在无效路径中添加折点。');
  let closest = 0, best = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1], dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const ratio = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    const distance = Math.hypot(point.x - a.x - ratio * dx, point.y - a.y - ratio * dy);
    if (distance < best) { best = distance; closest = index; }
  }
  return [...points.slice(1, closest + 1).map(value => ({ ...value })), { ...point },
    ...points.slice(closest + 1, -1).map(value => ({ ...value }))];
}
