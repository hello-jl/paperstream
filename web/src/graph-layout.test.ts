import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutVertical, layoutVerticalWithRelations } from './graph-layout.ts';
import { parseCanvas, serializeCanvas } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';

function graph(edges: Array<[string, string]>, extra: string[] = []): JSONCanvasDocument {
  return { custom: { keep: true }, nodes: [...new Set([...edges.flat(), ...extra])].map((id, i) => ({
    id, type: 'text', text: id, x: i * 100, y: -10, width: 360, height: 170, future: [id] })),
    edges: edges.map(([fromNode, toNode], i) => ({ id: `e${i}`, fromNode, toNode, label: '关联说明', custom: [i] })) };
}
test('chains are vertical with enough room for relation labels and preserve all other fields', () => {
  const source = graph([['a', 'b'], ['b', 'c']]);
  source.edges[0].label = '长说明'.repeat(80);
  const before = serializeCanvas(source), next = layoutVertical(source);
  const [a, b, c] = next.nodes;
  assert.equal(a.x, b.x); assert.equal(b.x, c.x);
  assert.ok(a.y + a.height + 200 < b.y); assert.ok(b.y + b.height < c.y);
  assert.equal(serializeCanvas(source), before);
  assert.deepEqual(next.custom, source.custom);
  assert.deepEqual(next.nodes.map(n => n.id), source.nodes.map(n => n.id));
  assert.deepEqual(next.edges.map(e => e.custom), source.edges.map(e => e.custom));
  assert.deepEqual(parseCanvas(serializeCanvas(next)), next);
});
test('cycles, merges, disconnected nodes and input order have stable non-overlapping positions', () => {
  const source = graph([['a', 'b'], ['b', 'a'], ['a', 'c'], ['b', 'c']], ['z']);
  const next = layoutVertical(source), shuffled = layoutVertical({ ...source, nodes: [...source.nodes].reverse(), edges: [...source.edges].reverse() });
  const positions = (d: JSONCanvasDocument) => Object.fromEntries(d.nodes.map(n => [n.id, [n.x, n.y]]));
  assert.deepEqual(positions(next), positions(shuffled));
  for (let i = 0; i < next.nodes.length; i++) for (const b of next.nodes.slice(i + 1)) {
    const a = next.nodes[i];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  assert.deepEqual(layoutVertical(next), next);
  assert.throws(() => layoutVertical(source, { rowGap: -1 }));
  assert.deepEqual(layoutVertical({ nodes: [], edges: [] }), { nodes: [], edges: [] });
});

test('explicit vertical layout resets absolute relation geometry while preserving annotations and styles', () => {
  const source = graph([['a', 'b']]);
  source.edges[0].paperstreamStyle = { strokeWidth: 4, labelPosition: { x: -100, y: 20 }, waypoints: [{ x: 30, y: 50 }], unknown: { keep: true } };
  source.edges[0].paperstreamRelation = { evidence: 'Section 4', type: 'comparison' };
  const before = serializeCanvas(source), result = layoutVerticalWithRelations(source);
  assert.deepEqual(result.edges[0].paperstreamStyle, { strokeWidth: 4, unknown: { keep: true } });
  assert.deepEqual(result.edges[0].paperstreamRelation, source.edges[0].paperstreamRelation);
  assert.equal(result.paperstreamLayout, 'vertical');
  assert.equal(serializeCanvas(source), before);
  assert.deepEqual(result.nodes, layoutVertical(source).nodes);
});
