import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutWithElk } from './elk-layout.ts';
import { parseCanvas, serializeCanvas } from './canvas.ts';
import type { CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { isGeneratedEdgeRouting, readEdgeRouting } from './edge-routing.ts';
import { buildConnectionPath } from './connection-path.ts';

const node = (id: string, width = 180, height = 100): CanvasNode => ({ id, type: 'text', text: id,
  x: -500, y: -300, width, height, vendor: { retained: [id] } });
const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('ELK maps complete geometry while retaining original data, array order and compact shared textboxes', async () => {
  const source: JSONCanvasDocument = {
    vendor: { graph: 'kept' }, paperstreamLayout: 'vertical',
    nodes: [node('z'), node('a', 220, 140), { ...node('shared', 96, 44), paperstreamCard: { kind: 'relation', custom: true } }, node('b')],
    edges: [
      { id: 'z-shared', fromNode: 'z', toNode: 'shared', label: '', fromEnd: 'arrow', toEnd: 'none', custom: [1],
        paperstreamStyle: { strokeWidth: 3, arrowShape: 'diamond', labelPosition: { x: -999, y: -998 }, waypoints: [{ x: -900, y: -800 }], future: { retained: true } },
        paperstreamRelation: { type: 'inheritance', evidence: '原文依据' } },
      { id: 'a-shared', fromNode: 'a', toNode: 'shared', label: '共同问题' },
      { id: 'shared-b', fromNode: 'shared', toNode: 'b', label: '方法扩展' },
    ],
  };
  const before = serializeCanvas(source), output = await layoutWithElk(source);
  assert.equal(serializeCanvas(source), before);
  assert.deepEqual(output.nodes.map(n => n.id), source.nodes.map(n => n.id));
  assert.deepEqual(output.edges.map(e => e.id), source.edges.map(e => e.id));
  assert.equal(output.paperstreamLayout, 'manual');
  assert.ok(output.edges.every(isGeneratedEdgeRouting));
  assert.deepEqual(output.vendor, source.vendor);
  for (let i = 0; i < output.nodes.length; i++) {
    const { x: _x, y: _y, ...data } = output.nodes[i];
    const { x: _oldX, y: _oldY, ...oldData } = source.nodes[i];
    assert.deepEqual(data, oldData);
    for (const other of output.nodes.slice(i + 1)) assert.equal(intersects(output.nodes[i], other), false);
  }
  const first = output.edges[0];
  assert.equal(first.fromEnd, 'arrow'); assert.equal(first.toEnd, 'none');
  assert.deepEqual(first.paperstreamRelation, source.edges[0].paperstreamRelation);
  assert.deepEqual(first.custom, [1]);
  assert.deepEqual((first.paperstreamStyle as Record<string, unknown>).future, { retained: true });
  assert.equal((first.paperstreamStyle as Record<string, unknown>).strokeWidth, 3);
  assert.equal(readEdgeRouting(first).labelPosition, undefined);
  assert.deepEqual(parseCanvas(serializeCanvas(output)), output);
  assert.deepEqual(await layoutWithElk(source), output, 'same graph produces a deterministic layout');
});

test('measured multiline labels reserve space on the route outside card bounds', async () => {
  const source: JSONCanvasDocument = { nodes: [node('a'), node('b')],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: '一行\n二行\n三行',
      paperstreamStyle: { labelPosition: { x: 1, y: 2, vendor: 'kept' } } }] };
  const width = 236, height = 90;
  const result = await layoutWithElk(source, { labelMeasurements: new Map([['e', { text: source.edges[0].label!, width, height }]]) });
  const position = readEdgeRouting(result.edges[0]).labelPosition!;
  const label = { x: position.x - width / 2, y: position.y - height / 2, width, height };
  for (const card of result.nodes) assert.equal(intersects(label, card), false);
  assert.equal(position.x, result.nodes[0].x + result.nodes[0].width / 2, 'inline label is centered on the vertical line');
  assert.equal((result.edges[0].paperstreamStyle as { labelPosition: { vendor: string } }).labelPosition.vendor, 'kept');
  const stale = await layoutWithElk(source, { labelMeasurements: new Map([['e', { text: 'old', width: 9000, height: 9000 }]]) });
  assert.deepEqual(stale, await layoutWithElk(source), 'stale measurements do not affect layout');
});

test('cycles, self-loops and parallel connections get finite orthogonal routes without changing arrows', async () => {
  const source: JSONCanvasDocument = { nodes: [node('a'), node('b'), node('c')], edges: [
    { id: 'ab', fromNode: 'a', toNode: 'b', label: 'first', fromEnd: 'arrow', toEnd: 'arrow' },
    { id: 'ab2', fromNode: 'a', toNode: 'b', label: 'parallel' },
    { id: 'bc', fromNode: 'b', toNode: 'c', label: '' },
    { id: 'ca', fromNode: 'c', toNode: 'a', label: 'cycle' },
    { id: 'self', fromNode: 'c', toNode: 'c', label: 'self' },
  ] };
  const result = await layoutWithElk(source), byId = new Map(result.nodes.map(node => [node.id, node]));
  for (const edge of result.edges) {
    assert.equal(edge.fromSide, 'bottom'); assert.equal(edge.toSide, 'top');
    const source = byId.get(edge.fromNode)!, target = byId.get(edge.toNode)!;
    const points = [{ x: source.x + source.width / 2, y: source.y + source.height }, ...readEdgeRouting(edge).waypoints,
      { x: target.x + target.width / 2, y: target.y }];
    for (let index = 1; index < points.length; index++) {
      assert.ok(points[index].x === points[index - 1].x || points[index].y === points[index - 1].y, `${edge.id} has no diagonal segment`);
      assert.ok(Number.isFinite(points[index].x) && Number.isFinite(points[index].y));
    }
  }
  assert.equal(result.edges[0].fromEnd, 'arrow'); assert.equal(result.edges[0].toEnd, 'arrow');
  assert.notDeepEqual(readEdgeRouting(result.edges[0]), readEdgeRouting(result.edges[1]));
  assert.ok(readEdgeRouting(result.edges.at(-1)!).waypoints.length >= 2);
});

test('empty graphs and invalid extension failures preserve inputs; async layout uses a snapshot', async () => {
  const empty: JSONCanvasDocument = { nodes: [], edges: [], vendor: true };
  assert.equal(await layoutWithElk(empty), empty);
  const malformed: JSONCanvasDocument = { nodes: [node('a'), node('b')],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', paperstreamStyle: ['unknown'] }] };
  const before = serializeCanvas(malformed);
  await assert.rejects(layoutWithElk(malformed), /无法调整路径/);
  assert.equal(serializeCanvas(malformed), before);
  const source: JSONCanvasDocument = { nodes: [node('a')], edges: [] };
  const pending = layoutWithElk(source);
  source.nodes[0].text = 'changed during calculation';
  const result = await pending;
  assert.equal(result.nodes[0].text, 'a');
  assert.equal(source.nodes[0].text, 'changed during calculation');
});

test('odd card sizes and fractional measured labels serialize and render around branching graph obstacles', async () => {
  const source: JSONCanvasDocument = { nodes: [node('root', 181, 101), node('e0', 223, 143),
    node('n0', 179, 97), node('leaf', 201, 121), node('n0-in', 157, 95)], edges: [
    { id: 'root', fromNode: 'root', toNode: 'e0', label: 'first branch' },
    { id: 'n0', fromNode: 'root', toNode: 'n0', label: 'second branch' },
    { id: 'e0', fromNode: 'e0', toNode: 'leaf', label: 'continue' },
    { id: 'join', fromNode: 'n0', toNode: 'leaf', label: 'join' },
    { id: 'parallel', fromNode: 'n0', toNode: 'leaf', label: 'another relation' },
    { id: 'last', fromNode: 'leaf', toNode: 'n0-in', label: 'last' },
  ] };
  const measurements = new Map(source.edges.map((edge, index) => [edge.id,
    { text: edge.label!, width: 145.5 + index * 2, height: 49.5 + index * 2 }]));
  const result = await layoutWithElk(source, { labelMeasurements: measurements });
  assert.deepEqual(parseCanvas(serializeCanvas(result)), result);
  assert.ok(result.nodes.every(card => Number.isSafeInteger(card.x) && Number.isSafeInteger(card.y)));
  const byId = new Map(result.nodes.map(card => [card.id, card]));
  const labelRects = result.edges.map(edge => {
    const position = readEdgeRouting(edge).labelPosition!, size = measurements.get(edge.id)!;
    return { x: position.x - size.width / 2, y: position.y - size.height / 2, width: size.width, height: size.height };
  });
  assert.ok(result.edges.some(edge => {
    const position = readEdgeRouting(edge).labelPosition!;
    return !Number.isInteger(position.x) || !Number.isInteger(position.y);
  }), 'label coordinates keep subpixel precision');
  for (let index = 0; index < labelRects.length; index++) {
    for (const card of result.nodes) assert.equal(intersects(labelRects[index], card), false, `${result.edges[index].id} label avoids ${card.id}`);
    for (const other of labelRects.slice(index + 1)) assert.equal(intersects(labelRects[index], other), false, 'labels remain disjoint');
  }
  for (const edge of result.edges) {
    const from = byId.get(edge.fromNode)!, to = byId.get(edge.toNode)!, routing = readEdgeRouting(edge);
    const path = buildConnectionPath({ source: { x: from.x + from.width / 2, y: from.y + from.height },
      target: { x: to.x + to.width / 2, y: to.y }, sourceSide: 'bottom', targetSide: 'top',
      waypoints: routing.waypoints, labelPosition: routing.labelPosition, style: 'orthogonal' });
    const base = buildConnectionPath({ source: { x: from.x + from.width / 2, y: from.y + from.height },
      target: { x: to.x + to.width / 2, y: to.y }, sourceSide: 'bottom', targetSide: 'top',
      waypoints: routing.waypoints, style: 'orthogonal' });
    const center = routing.labelPosition!;
    const nearest = Math.min(...base.points.slice(1).map((b, index) => {
      const a = base.points[index], dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
      const t = squared ? Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / squared)) : 0;
      return Math.hypot(center.x - a.x - t * dx, center.y - a.y - t * dy);
    }));
    // ELK rounds some internal label/port geometry; integer Canvas positions
    // add at most another half pixel. Neither needs a substantive label detour.
    assert.ok(nearest <= 1, `${edge.id} label lies on the existing route within subpixel rounding tolerance (${nearest})`);
    assert.ok(!/NaN|Infinity/.test(path.path));
    for (let index = 1; index < path.points.length; index++) {
      const a = path.points[index - 1], b = path.points[index];
      assert.ok(a.x === b.x || a.y === b.y);
      for (const card of result.nodes.filter(card => card.id !== edge.fromNode && card.id !== edge.toNode)) {
        const crosses = a.x === b.x
          ? a.x > card.x && a.x < card.x + card.width && Math.max(a.y, b.y) > card.y && Math.min(a.y, b.y) < card.y + card.height
          : a.y > card.y && a.y < card.y + card.height && Math.max(a.x, b.x) > card.x && Math.min(a.x, b.x) < card.x + card.width;
        assert.equal(crosses, false, `${edge.id} rendered path avoids unrelated ${card.id}`);
      }
    }
  }
});
