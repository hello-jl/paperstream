/** Place measured relation labels without changing the underlying Canvas nodes. */
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface LabelRequest {
  id: string;
  width: number;
  height: number;
  anchor: Point;
  pathPoints?: readonly Point[];
}

const GAP = 8;

function checkPoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Label layout coordinates must be finite.');
  }
}

function checkSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Label layout dimensions must be positive and finite.');
  }
}

/** Bounds for fitting both cards and relation labels into the viewport. */
export function getContentBounds(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const rect of rects) {
    checkPoint(rect);
    checkSize(rect.width, rect.height);
    const end = { x: rect.x + rect.width, y: rect.y + rect.height };
    checkPoint(end);
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, end.x);
    bottom = Math.max(bottom, end.y);
  }
  const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
  checkSize(width, height);
  return { x: left, y: top, width, height };
}

function rectangle(label: LabelRequest, center: Point): Rect {
  return { x: center.x - label.width / 2, y: center.y - label.height / 2,
    width: label.width, height: label.height };
}

function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return start;
  const fraction = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return { x: start.x + fraction * dx, y: start.y + fraction * dy };
}

function pathDistance(point: Point, path: readonly Point[]): number {
  if (path.length === 1) return distance(point, path[0]);
  let minimum = Infinity;
  for (let index = 1; index < path.length; index++) {
    minimum = Math.min(minimum, distance(point, nearestOnSegment(point, path[index - 1], path[index])));
  }
  return minimum;
}

function comparePoints(a: Point, b: Point): number {
  return a.x - b.x || a.y - b.y;
}

/**
 * Returns label centers in graph coordinates, with at least 8px between each
 * label and every obstacle or preceding label. IDs determine placement order,
 * so caller array order does not cause labels to jump between renders.
 *
 * Nearby candidates follow the connection and obstacle boundaries. The outer
 * bounds supply a finite fallback even when cards overlap or cover the path.
 */
export function layoutEdgeLabels(
  labels: readonly LabelRequest[], obstacles: readonly Rect[],
): Map<string, Point> {
  const occupied: Rect[] = obstacles.map(obstacle => {
    checkPoint(obstacle);
    checkSize(obstacle.width, obstacle.height);
    return { ...obstacle };
  });
  const requests = [...labels].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const positions = new Map<string, Point>();

  for (const label of requests) {
    if (positions.has(label.id)) throw new Error(`Duplicate relation label ID: ${label.id}`);
    checkPoint(label.anchor);
    checkSize(label.width, label.height);
    const path = label.pathPoints?.length ? label.pathPoints : [label.anchor];
    path.forEach(checkPoint);
    const fits = (point: Point) => {
      const bounds = rectangle(label, point);
      return occupied.every(obstacle => !collides(bounds, obstacle));
    };
    let center = { ...label.anchor };

    if (!fits(center)) {
      const seeds = [label.anchor, ...path];
      for (let index = 1; index < path.length; index++) {
        const start = path[index - 1], end = path[index];
        seeds.push(nearestOnSegment(label.anchor, start, end));
        seeds.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
      }
      // Very detailed paths need not multiply the obstacle search without bound.
      const nearbySeeds = seeds.sort((a, b) => distance(a, label.anchor) - distance(b, label.anchor)
        || comparePoints(a, b)).slice(0, 24);
      // A fitting seed gives a valid upper bound on the winning score. The
      // score always includes anchor distance, so a more distant candidate
      // cannot win. Keep equality: equally good points use coordinate ties.
      // Extreme finite coordinates can overflow segment projections; retain
      // the original unpruned search there rather than change its behavior.
      const safeExtent = Math.sqrt(Number.MAX_VALUE) / 16;
      const safe = (value: number) => Math.abs(value) <= safeExtent;
      const canPrune = safe(label.width) && safe(label.height)
        && nearbySeeds.every(point => safe(point.x) && safe(point.y))
        && occupied.every(rect => safe(rect.x) && safe(rect.y) && safe(rect.width) && safe(rect.height))
        && path.every(point => safe(point.x) && safe(point.y));
      let maximumDistance = Infinity;
      if (canPrune) {
        for (const point of nearbySeeds) {
          if (fits(point)) maximumDistance = Math.min(maximumDistance,
            distance(point, label.anchor) + pathDistance(point, path) * 2);
        }
      }
      const candidates = new Map<string, Point>();
      const add = (point: Point) => {
        if (Number.isFinite(point.x) && Number.isFinite(point.y)
          && (maximumDistance === Infinity || distance(point, label.anchor) <= maximumDistance)) candidates.set(`${point.x},${point.y}`, point);
      };
      nearbySeeds.forEach(add);
      const halfWidth = label.width / 2, halfHeight = label.height / 2;
      for (const obstacle of occupied) {
        const left = obstacle.x - GAP - halfWidth;
        const right = obstacle.x + obstacle.width + GAP + halfWidth;
        const top = obstacle.y - GAP - halfHeight;
        const bottom = obstacle.y + obstacle.height + GAP + halfHeight;
        for (const seed of nearbySeeds) {
          add({ x: left, y: seed.y });
          add({ x: right, y: seed.y });
          add({ x: seed.x, y: top });
          add({ x: seed.x, y: bottom });
        }
        add({ x: left, y: top });
        add({ x: left, y: bottom });
        add({ x: right, y: top });
        add({ x: right, y: bottom });
      }
      // Each of these lies entirely outside every occupied rectangle on one
      // axis. No iterative search radius or maximum-size assumption is needed.
      if (occupied.length) {
        const left = Math.min(...occupied.map(rect => rect.x));
        const right = Math.max(...occupied.map(rect => rect.x + rect.width));
        const top = Math.min(...occupied.map(rect => rect.y));
        const bottom = Math.max(...occupied.map(rect => rect.y + rect.height));
        add({ x: left - GAP - halfWidth, y: label.anchor.y });
        add({ x: right + GAP + halfWidth, y: label.anchor.y });
        add({ x: label.anchor.x, y: top - GAP - halfHeight });
        add({ x: label.anchor.x, y: bottom + GAP + halfHeight });
      }
      const ranked = [...candidates.values()].map(point => ({ point,
        score: distance(point, label.anchor) + pathDistance(point, path) * 2,
      })).sort((a, b) => a.score - b.score || comparePoints(a.point, b.point));
      const choice = ranked.find(candidate => fits(candidate.point));
      if (!choice) throw new RangeError('Relation labels exceed the available coordinate range.');
      center = choice.point;
    }
    positions.set(label.id, center);
    occupied.push(rectangle(label, center));
  }
  return positions;
}
