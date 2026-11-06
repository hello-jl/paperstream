/** Shared, framework-free connection geometry for the editor and exports. */
import type { Point, Rect } from './edge-label-layout.ts';
import { insertWaypoint, polylineRoute, routeMidpoint } from './edge-routing.ts';

export type ConnectionStyle = 'orthogonal' | 'rounded' | 'curved';
type Side = 'top' | 'right' | 'bottom' | 'left';
export type PathCommand = { kind: 'M' | 'L'; point: Point }
  | { kind: 'Q'; control: Point; point: Point }
  | { kind: 'C'; control1: Point; control2: Point; point: Point };
export interface ConnectionPath { points: Point[]; commands: PathCommand[]; path: string; bounds: Rect; }
export interface ConnectionPathOptions {
  source: Point; target: Point; sourceSide?: Side; targetSide?: Side;
  waypoints?: readonly Point[]; labelPosition?: Point; style?: ConnectionStyle;
}
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const interpolate = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const direction = (side: Side): Point => ({ top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } })[side];
const shifted = (p: Point, vector: Point, amount: number): Point => ({ x: p.x + vector.x * amount, y: p.y + vector.y * amount });
const unit = (a: Point, b: Point): Point => { const size = distance(a, b); return size ? { x: (b.x - a.x) / size, y: (b.y - a.y) / size } : { x: 0, y: 0 }; };

function orthogonalPoints(source: Point, target: Point, controls: readonly Point[], sourceSide: Side, targetSide: Side): Point[] {
  const gap = distance(source, target) || (controls.length ? 96 : 0);
  const sourceStub = Math.min(24, gap / 4, controls.length ? distance(source, controls[0]) / 2 : Infinity);
  const targetStub = Math.min(24, gap / 4, controls.length ? distance(target, controls.at(-1)!) / 2 : Infinity);
  const first = shifted(source, direction(sourceSide), sourceStub), last = shifted(target, direction(targetSide), targetStub);
  const knots = polylineRoute(first, last, controls);
  const result: Point[] = [source, first];
  const reversal = (a: Point, b: Point, c: Point) => {
    const dx = b.x - a.x, dy = b.y - a.y, ex = c.x - b.x, ey = c.y - b.y;
    return Math.abs(dx * ey - dy * ex) < 1e-7 && dx * ex + dy * ey < 0 ? 10000 : 0;
  };
  for (let index = 1; index < knots.length; index++) {
    const a = knots[index - 1], b = knots[index];
    const previous = result.at(-2) ?? source, after = knots[index + 1] ?? target;
    if (a.x !== b.x && a.y !== b.y) {
      const vertical = [{ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }];
      const horizontal = [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }];
      const candidates = controls.length ? [
        [{ x: a.x, y: b.y }], [{ x: b.x, y: a.y }], vertical, horizontal,
      ] : sourceSide === 'left' || sourceSide === 'right' ? [horizontal, vertical] : [vertical, horizontal];
      const turn = (one: Point, two: Point, three: Point) => Math.abs((two.x - one.x) * (three.y - two.y) - (two.y - one.y) * (three.x - two.x)) > 1e-7 ? 1 : 0;
      const score = (candidate: Point[]) => candidate.length + reversal(previous, a, candidate[0])
        + reversal(candidate.at(-1)!, b, after) + turn(previous, a, candidate[0]) + turn(candidate.at(-1)!, b, after);
      candidates.sort((one, two) => score(one) - score(two));
      result.push(...candidates[0]);
    } else if (reversal(previous, a, b) || reversal(a, b, after)) {
      // Same-axis handles facing away need a small side corridor; retracing the
      // center line would hide the arrow and create overlapping hairpins.
      const offset = 24;
      if (a.x === b.x) result.push({ x: a.x + offset, y: a.y }, { x: b.x + offset, y: b.y });
      else result.push({ x: a.x, y: a.y + offset }, { x: b.x, y: b.y + offset });
    }
    result.push(b);
  }
  result.push(target);
  // Drop redundant straight-through points, retaining user controls and the
  // endpoint stubs. This prevents zero-length commands and repeated corners.
  const unique = polylineRoute(result[0], result.at(-1)!, result.slice(1, -1));
  return unique.filter((point, index) => {
    if (!index || index === unique.length - 1 || controls.some(control => same(point, control))) return true;
    const previous = unique[index - 1], next = unique[index + 1];
    const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
    const dot = (point.x - previous.x) * (next.x - point.x) + (point.y - previous.y) * (next.y - point.y);
    return cross !== 0 || dot < 0;
  });
}

export function pathCommandsToSvg(commands: readonly PathCommand[]): string {
  const point = (p: Point) => `${p.x} ${p.y}`;
  return commands.map(command => command.kind === 'Q' ? `Q ${point(command.control)} ${point(command.point)}`
    : command.kind === 'C' ? `C ${point(command.control1)} ${point(command.control2)} ${point(command.point)}`
    : `${command.kind} ${point(command.point)}`).join(' ');
}
function evaluate(start: Point, command: PathCommand, t: number): Point {
  if (command.kind === 'Q') return interpolate(interpolate(start, command.control, t), interpolate(command.control, command.point, t), t);
  if (command.kind === 'C') return interpolate(
    interpolate(interpolate(start, command.control1, t), interpolate(command.control1, command.control2, t), t),
    interpolate(interpolate(command.control1, command.control2, t), interpolate(command.control2, command.point, t), t), t);
  return interpolate(start, command.point, t);
}
/** Exact extrema (including Bezier derivatives), never just endpoint bounds. */
export function pathBounds(commands: readonly PathCommand[]): Rect {
  const extrema: Point[] = [];
  let previous = commands[0]?.point ?? { x: 0, y: 0 };
  for (const command of commands) {
    extrema.push(command.point);
    for (const axis of ['x', 'y'] as const) {
      let roots: number[] = [];
      if (command.kind === 'Q') {
        const denominator = previous[axis] - 2 * command.control[axis] + command.point[axis];
        if (denominator) roots = [(previous[axis] - command.control[axis]) / denominator];
      } else if (command.kind === 'C') {
        const a = -previous[axis] + 3 * command.control1[axis] - 3 * command.control2[axis] + command.point[axis];
        const b = 2 * (previous[axis] - 2 * command.control1[axis] + command.control2[axis]);
        const c = command.control1[axis] - previous[axis], discriminant = b * b - 4 * a * c;
        if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots = [-c / b]; }
        else if (discriminant >= 0) roots = [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)];
      }
      for (const t of roots) if (t > 0 && t < 1) extrema.push(evaluate(previous, command, t));
    }
    previous = command.point;
  }
  const x = Math.min(...extrema.map(point => point.x)), y = Math.min(...extrema.map(point => point.y));
  return { x, y, width: Math.max(...extrema.map(point => point.x)) - x, height: Math.max(...extrema.map(point => point.y)) - y };
}

export function sampleConnectionPath(connection: ConnectionPath): Point[] {
  const points: Point[] = [];
  let previous = connection.commands[0].point;
  for (const command of connection.commands) {
    const steps = command.kind === 'C' || command.kind === 'Q' ? 12 : 1;
    for (let step = 1; step <= steps; step++) points.push(evaluate(previous, command, step / steps));
    previous = command.point;
  }
  return points;
}
export function connectionMidpoint(connection: ConnectionPath): Point { return routeMidpoint(sampleConnectionPath(connection)); }

export function buildConnectionPath(options: ConnectionPathOptions): ConnectionPath {
  const { source, target, sourceSide = 'bottom', targetSide = 'top', style = 'rounded', labelPosition } = options;
  let controls = polylineRoute(source, target, options.waypoints).slice(1, -1);
  const directCurve = style === 'curved' && !controls.length;
  if (labelPosition && ![source, ...controls, target].some(point => same(point, labelPosition))) {
    // Insert only into the ordered user anchors. Generated elbows from the base
    // path are not copied into the detour, avoiding doubled-back default bends.
    controls = insertWaypoint([source, ...controls, target], labelPosition);
  }
  const points = directCurve ? polylineRoute(source, target, controls)
    : orthogonalPoints(source, target, controls, sourceSide, targetSide);
  const commands: PathCommand[] = [{ kind: 'M', point: points[0] }];
  if (directCurve) {
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index], segmentLength = distance(a, b);
      const incoming = index === 1 ? direction(sourceSide) : unit(points[index - 2], b);
      const outgoing = index === points.length - 1 ? shifted({ x: 0, y: 0 }, direction(targetSide), -1) : unit(a, points[index + 1]);
      const before = index === 1 ? segmentLength : Math.min(segmentLength, distance(points[index - 2], a));
      const after = index === points.length - 1 ? segmentLength : Math.min(segmentLength, distance(b, points[index + 1]));
      commands.push({ kind: 'C', control1: shifted(a, incoming, before / 3), control2: shifted(b, outgoing, -after / 3), point: b });
    }
  } else {
    for (let index = 1; index < points.length; index++) {
      const point = points[index], previous = points[index - 1], next = points[index + 1];
      const preserve = labelPosition && same(labelPosition, point);
      if (style !== 'orthogonal' && next && !preserve) {
        const radius = Math.min(style === 'curved' ? 40 : 14, distance(previous, point) / 2, distance(point, next) / 2);
        const enter = interpolate(point, previous, radius / distance(previous, point));
        const leave = interpolate(point, next, radius / distance(point, next));
        commands.push({ kind: 'L', point: enter });
        // Routed controls define a corridor, not Catmull interpolation knots.
        // Large corner fillets stay within adjacent segments' convex hull;
        // a short port segment therefore cannot overshoot into a reverse hook.
        if (style === 'curved') commands.push({ kind: 'C',
          control1: interpolate(enter, point, 2 / 3), control2: interpolate(leave, point, 2 / 3), point: leave });
        else commands.push({ kind: 'Q', control: point, point: leave });
      } else commands.push({ kind: 'L', point });
    }
  }
  return { points, commands, path: pathCommandsToSvg(commands), bounds: pathBounds(commands) };
}
