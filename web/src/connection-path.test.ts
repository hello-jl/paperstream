import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConnectionPath, pathBounds, sampleConnectionPath } from './connection-path.ts';
import type { ConnectionStyle, PathCommand } from './connection-path.ts';

const styles: ConnectionStyle[] = ['orthogonal', 'rounded', 'curved'];
const source = { x: -100, y: -80 }, target = { x: 280, y: 250 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('styles preserve endpoint locations and departure/arrival directions with distinct geometry', () => {
  const paths = styles.map(style => buildConnectionPath({ source, target, sourceSide: 'right', targetSide: 'top', style }));
  assert.equal(new Set(paths.map(path => path.path)).size, 3);
  for (const path of paths) {
    assert.deepEqual(path.commands[0].point, source);
    assert.deepEqual(path.commands.at(-1)!.point, target);
    const first = path.commands[1], last = path.commands.at(-1)!;
    const firstControl = first.kind === 'C' ? first.control1 : first.point;
    const lastControl = last.kind === 'C' ? last.control2 : path.commands.at(-2)!.point;
    close(firstControl.y, source.y); assert.ok(firstControl.x > source.x);
    close(lastControl.x, target.x); assert.ok(lastControl.y < target.y);
    assert.ok(!/NaN|Infinity/.test(path.path));
  }
  assert.ok(paths[0].commands.every(command => command.kind === 'M' || command.kind === 'L'));
  assert.ok(paths[1].commands.some(command => command.kind === 'Q'));
  assert.ok(paths[2].commands.some(command => command.kind === 'C'));
});

test('both automatically placed and manually displaced labels are integral route anchors', () => {
  for (const labelPosition of [{ x: 90, y: 85 }, { x: 470, y: -240 }]) for (const style of styles) {
    const route = buildConnectionPath({ source, target, labelPosition, style });
    assert.ok(route.commands.some(command => command.point.x === labelPosition.x && command.point.y === labelPosition.y));
    if (style === 'orthogonal') for (let i = 1; i < route.points.length; i++) {
      assert.ok(route.points[i].x === route.points[i - 1].x || route.points[i].y === route.points[i - 1].y);
    }
  }
});

test('manual controls stay ordered and unchanged, including repeated adjacent controls', () => {
  const waypoints = [{ x: 10, y: 20, extension: 'preserve' }, { x: 10, y: 20 }, { x: 250, y: 20 }, { x: 250, y: 180 }];
  const before = JSON.stringify(waypoints);
  for (const style of styles) {
    const route = buildConnectionPath({ source, target, waypoints, labelPosition: { x: 250, y: 20 }, style });
    const unique = waypoints.filter((point, index) => !index || point.x !== waypoints[index - 1].x || point.y !== waypoints[index - 1].y);
    let index = 0;
    for (const point of route.points) if (point.x === unique[index]?.x && point.y === unique[index]?.y) index++;
    assert.equal(index, unique.length);
    for (let part = 1; part < route.points.length; part++) assert.notDeepEqual(route.points[part], route.points[part - 1]);
    assert.equal(route.commands.filter(command => command.point.x === 250 && command.point.y === 20).length, 1);
    assert.ok(!/NaN|Infinity/.test(route.path));
  }
  assert.equal(JSON.stringify(waypoints), before);
});

test('a centered label does not produce repeated turns or double back on an ordinary route', () => {
  const route = buildConnectionPath({ source: { x: 0, y: 0 }, target: { x: 200, y: 200 },
    labelPosition: { x: 100, y: 100 }, style: 'orthogonal' });
  assert.deepEqual(route.points, [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);
});

test('exact Bezier bounds include interior extrema and bound sampled curves', () => {
  const commands: PathCommand[] = [{ kind: 'M', point: { x: 0, y: 0 } },
    { kind: 'C', control1: { x: 0, y: -100 }, control2: { x: 100, y: -100 }, point: { x: 100, y: 0 } }];
  assert.deepEqual(pathBounds(commands), { x: 0, y: -75, width: 100, height: 75 });
  for (const style of styles) {
    const path = buildConnectionPath({ source, target, labelPosition: { x: 800, y: -400 }, style }), b = path.bounds;
    for (const point of sampleConnectionPath(path)) {
      assert.ok(point.x >= b.x - 1e-7 && point.x <= b.x + b.width + 1e-7);
      assert.ok(point.y >= b.y - 1e-7 && point.y <= b.y + b.height + 1e-7);
    }
  }
});

test('coincident endpoints and redundant endpoint controls remain finite', () => {
  for (const style of styles) {
    const path = buildConnectionPath({ source, target: source, waypoints: [source, source], style });
    assert.ok(!/NaN|Infinity/.test(path.path));
    assert.deepEqual(path.bounds, { ...source, width: 0, height: 0 });
  }
});

test('same-axis ports facing away use a side corridor instead of overlapping hairpins', () => {
  for (const sourceSide of ['top', 'bottom'] as const) for (const targetSide of ['top', 'bottom'] as const) {
    const path = buildConnectionPath({ source: { x: 0, y: 0 }, target: { x: 0, y: 200 }, sourceSide, targetSide, style: 'orthogonal' });
    for (let index = 1; index < path.points.length - 1; index++) {
      const a = path.points[index - 1], b = path.points[index], c = path.points[index + 1];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      assert.ok(cross !== 0 || dot >= 0, `${sourceSide}/${targetSide}: no retraced segment`);
    }
    assert.equal(Math.sign(path.points[1].y), sourceSide === 'top' ? -1 : 1);
    assert.equal(Math.sign(path.points.at(-2)!.y - 200), targetSide === 'top' ? -1 : 1);
  }
});

test('curved ELK routes round short port segments within the corridor without reverse hooks', () => {
  const waypoints = [{ x: 0, y: 24 }, { x: 400, y: 24 }, { x: 400, y: 120 }];
  const before = JSON.stringify(waypoints);
  for (const labelPosition of [undefined, { x: 200, y: 24 }, { x: 400, y: 24 }]) {
    const route = buildConnectionPath({ source: { x: 0, y: 0 }, target: { x: 400, y: 140 },
      sourceSide: 'bottom', targetSide: 'top', waypoints, labelPosition, style: 'curved' });
    assert.deepEqual(route.bounds, { x: 0, y: 0, width: 400, height: 140 });
    const samples = sampleConnectionPath(route);
    for (let index = 0; index < samples.length; index++) {
      const point = samples[index];
      assert.ok(point.x >= 0 && point.x <= 400 && point.y >= 0 && point.y <= 140);
      if (index) {
        assert.ok(point.x >= samples[index - 1].x - 1e-7, 'never reverse horizontally');
        assert.ok(point.y >= samples[index - 1].y - 1e-7, 'never reverse vertically');
      }
    }
    assert.ok(route.commands.some(command => command.kind === 'C'));
    for (const waypoint of waypoints) assert.ok(route.points.some(point => point.x === waypoint.x && point.y === waypoint.y));
    if (labelPosition) assert.ok(route.commands.some(command => command.point.x === labelPosition.x && command.point.y === labelPosition.y));
  }
  assert.equal(JSON.stringify(waypoints), before);
});
