import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, createEdge, createPaperNode, addNode, addEdge, patchEdge, parseCanvas, serializeCanvas } from './canvas.ts';
import { defaultRoutePoints, edgeRoutingPatch, insertWaypoint, polylinePath, polylineRoute, readEdgeRouting, routeMidpoint } from './edge-routing.ts';

test('manual relation geometry round-trips without changing semantics, styles or unknown metadata', () => {
  const a = createPaperNode({ alias: 'A', takeaway: 'a' }), b = createPaperNode({ alias: 'B', takeaway: 'b' });
  const edge = { ...createEdge(a.id, b.id, '关系'), paperstreamStyle: { strokeWidth: 3, custom: { retain: true }, labelPosition: { x: -4, y: 5, plugin: 'extra' } }, vendor: [1, 2] };
  const before = structuredClone(edge);
  const graph = addEdge(addNode(addNode(createCanvas(), a), b), edge);
  const next = patchEdge(graph, edge.id, edgeRoutingPatch(edge, { labelPosition: { x: -120.5, y: 300 }, waypoints: [{ x: -30, y: 55 }, { x: 90, y: 55 }] }));
  const saved = parseCanvas(serializeCanvas(next)).edges[0];
  assert.deepEqual(readEdgeRouting(saved), { labelPosition: { x: -120.5, y: 300, plugin: 'extra' }, waypoints: [{ x: -30, y: 55 }, { x: 90, y: 55 }] });
  assert.equal(saved.label, '关系'); assert.deepEqual(saved.vendor, [1, 2]);
  assert.deepEqual((saved.paperstreamStyle as Record<string, unknown>).custom, { retain: true });
  assert.equal((saved.paperstreamStyle as Record<string, unknown>).strokeWidth, 3);
  assert.deepEqual(edge, before);
});

test('reset removes only manually edited geometry and rejects invalid writes', () => {
  const edge = { ...createEdge('a', 'b', ''), paperstreamStyle: { labelPosition: { x: 0, y: 1 }, waypoints: [{ x: 2, y: 3 }], colorRule: 'keep' } };
  assert.deepEqual(edgeRoutingPatch(edge, { labelPosition: null }), { paperstreamStyle: { waypoints: [{ x: 2, y: 3 }], colorRule: 'keep' } });
  assert.deepEqual(edgeRoutingPatch(edge, { waypoints: [] }), { paperstreamStyle: { labelPosition: { x: 0, y: 1 }, colorRule: 'keep' } });
  assert.throws(() => edgeRoutingPatch(edge, { waypoints: [{ x: Infinity, y: 0 }] }));
  assert.throws(() => edgeRoutingPatch({ ...edge, paperstreamStyle: 'unknown format' }, { labelPosition: null }));
  assert.deepEqual(readEdgeRouting({ ...edge, paperstreamStyle: { labelPosition: { x: NaN, y: 0 }, waypoints: [null] } }), { waypoints: [] });
});

test('waypoint order and graph-space midpoint follow the drawn path rather than the bounding box', () => {
  const points = polylineRoute({ x: 0, y: 0 }, { x: 200, y: 0 }, [{ x: 0, y: 100 }, { x: 200, y: 100 }]);
  assert.deepEqual(routeMidpoint(points), { x: 100, y: 100 });
  assert.equal(polylinePath(points), 'M 0 0 L 0 100 L 200 100 L 200 0');
  assert.deepEqual(insertWaypoint(points, { x: 80, y: 90 }), [{ x: 0, y: 100 }, { x: 80, y: 90 }, { x: 200, y: 100 }]);
  assert.deepEqual(defaultRoutePoints({ x: -10, y: -20 }, { x: -10, y: 80 }), [{ x: -10, y: -20 }, { x: -10, y: 30 }, { x: -10, y: 80 }]);
  assert.deepEqual(routeMidpoint([{ x: 1, y: 2 }, { x: 1, y: 2 }]), { x: 1, y: 2 });
});
